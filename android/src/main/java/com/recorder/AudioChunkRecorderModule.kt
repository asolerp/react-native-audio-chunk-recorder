package com.recorder

import com.recorder.engine.RecorderEngine
import com.recorder.rotation.RotationManager
import com.recorder.rotation.RecorderEventSink
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.io.File
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

/**
 * AudioChunkRecorderModule (Native Orchestrator) - PERFORMANCE OPTIMIZED
 * ----------------------------------------------------------------
 * 📌 Exposes RN API (<JavaScript>)
 * 📌 Orchestrates Preview (audio level) and Recording (Chunk rotation)
 * 📌 Connects native events ➜ DeviceEventEmitter (JS)
 * 🚀 PERFORMANCE: Shared engine, throttled events, proper thread management, no memory leaks
 */
class AudioChunkRecorderModule(
    private val reactCtx: ReactApplicationContext
) : ReactContextBaseJavaModule(reactCtx), RecorderEventSink {

    // -----------------  Sub-components  -----------------
    private val sharedEngine = RecorderEngine()          // Single shared engine for both preview and recording
    private var rotationMgr: RotationManager? = null      // real recording

    // PERFORMANCE: Use dedicated scope for UI events, IO for heavy work
    private val uiScope: CoroutineScope = CoroutineScope(Dispatchers.Main + Job())
    private val ioScope: CoroutineScope = CoroutineScope(Dispatchers.IO + Job())
    
    // PERFORMANCE: Single job management to prevent multiple subscriptions
    private var levelPreviewJob: Job? = null
    private var isPreviewActive = false
    private var isRecordingActive = false

    // -----------------  React Native name  --------------
    override fun getName(): String = "AudioChunkRecorder"

    // -----------------  Module Availability  ------------
    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            // Check if the module is properly initialized
            val isAvailable = sharedEngine != null && reactCtx != null
            promise.resolve(isAvailable)
        } catch (t: Throwable) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        try {
            val hasPermission = ContextCompat.checkSelfPermission(
                reactCtx,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(hasPermission)
        } catch (t: Throwable) {
            promise.reject("PERMISSION_CHECK_ERROR", t.message)
        }
    }

    @ReactMethod
    fun clearAllChunkFiles(promise: Promise) {
        try {
            val chunksDir = File(reactCtx.filesDir, "AudioChunks")
            if (chunksDir.exists()) {
                val deletedFiles = chunksDir.listFiles()?.filter { it.isFile }?.size ?: 0
                chunksDir.listFiles()?.forEach { file ->
                    if (file.isFile) {
                        file.delete()
                    }
                }
                promise.resolve("Cleared $deletedFiles chunk files")
            } else {
                promise.resolve("No chunk files directory found")
            }
        } catch (t: Throwable) {
            promise.reject("CLEAR_FILES_ERROR", t.message)
        }
    }

    // -----------------  Level Preview  ------------------
    @ReactMethod
    fun startAudioLevelPreview(promise: Promise) {
        // PERFORMANCE: Prevent multiple simultaneous previews
        if (isPreviewActive) {
            android.util.Log.d("AudioChunkRecorder", "Preview already active, skipping")
            promise.resolve(null) // Already active, no need to restart
            return
        }

        try {
            // PERFORMANCE: Cancel any existing subscription first
            levelPreviewJob?.cancel()
            levelPreviewJob = null
            
            // PERFORMANCE: Start engine in IO thread to avoid blocking UI
            ioScope.launch {
                try {
                    android.util.Log.d("AudioChunkRecorder", "Starting shared engine for preview")
                    sharedEngine.start()
                    
                    // PERFORMANCE: Send all audio levels without throttling for debugging
                    levelPreviewJob = sharedEngine.levelFlow
                        .onEach { level ->
                            // DEBUG: Log all levels being sent
                            android.util.Log.d("AudioChunkRecorder", "Sending audio level: $level")
                            sendAudioLevel(level)
                        }
                        .launchIn(uiScope)
                    
                    isPreviewActive = true
                    android.util.Log.d("AudioChunkRecorder", "Preview started successfully")
                    
                    // Resolve promise on UI thread
                    uiScope.launch {
                        promise.resolve(null)
                    }
                } catch (e: Exception) {
                    android.util.Log.e("AudioChunkRecorder", "Error starting preview: ${e.message}")
                    // Clean up on error
                    levelPreviewJob?.cancel()
                    levelPreviewJob = null
                    isPreviewActive = false
                    sharedEngine.stop()
                    
                    uiScope.launch {
                        promise.reject("PREVIEW_ERROR", e.message)
                    }
                }
            }
        } catch (t: Throwable) {
            android.util.Log.e("AudioChunkRecorder", "Error in startAudioLevelPreview: ${t.message}")
            // Clean up on error
            levelPreviewJob?.cancel()
            levelPreviewJob = null
            isPreviewActive = false
            sharedEngine.stop()
            promise.reject("PREVIEW_ERROR", t.message)
        }
    }

    @ReactMethod
    fun stopAudioLevelPreview(promise: Promise) {
        android.util.Log.d("AudioChunkRecorder", "stopAudioLevelPreview called. isPreviewActive: $isPreviewActive")
        
        // PERFORMANCE: Quick return if not active
        if (!isPreviewActive) {
            android.util.Log.d("AudioChunkRecorder", "Preview not active, resolving immediately")
            promise.resolve(null)
            return
        }

        try {
            // PERFORMANCE: Cancel subscription first
            levelPreviewJob?.cancel()
            levelPreviewJob = null
            isPreviewActive = false
            
            android.util.Log.d("AudioChunkRecorder", "Stopping shared engine")
            
            // PERFORMANCE: Stop engine in IO thread
            ioScope.launch {
                try {
                    sharedEngine.stop()
                    android.util.Log.d("AudioChunkRecorder", "Shared engine stopped successfully")
                    uiScope.launch {
                        promise.resolve(null)
                    }
                } catch (e: Exception) {
                    android.util.Log.e("AudioChunkRecorder", "Error stopping engine: ${e.message}")
                    uiScope.launch {
                        promise.reject("STOP_PREVIEW_ERROR", e.message)
                    }
                }
            }
        } catch (t: Throwable) {
            android.util.Log.e("AudioChunkRecorder", "Error in stopAudioLevelPreview: ${t.message}")
            promise.reject("STOP_PREVIEW_ERROR", t.message)
        }
    }

    // -----------------  Chunk Recording  ----------------
    @ReactMethod
    fun startRecording(options: com.facebook.react.bridge.ReadableMap, promise: Promise) {
        // PERFORMANCE: Prevent recording if already active
        if (isRecordingActive) {
            promise.reject("ALREADY_RECORDING", "Already recording")
            return
        }

        try {
            val sampleRate = options.getInt("sampleRate")
            val chunkSec   = options.getDouble("chunkSeconds")
            val dir = File(reactCtx.filesDir, "AudioChunks").apply { if (!exists()) mkdirs() }

            // PERFORMANCE: Use shared engine for recording
            rotationMgr = RotationManager(
                eventSink = this,
                sharedEngine = sharedEngine // Share the same engine
            ).also {
                it.start(sampleRate, chunkSec, dir)
            }
            
            isRecordingActive = true
            android.util.Log.d("AudioChunkRecorder", "Recording started successfully")
            promise.resolve(null)
        } catch (t: Throwable) {
            android.util.Log.e("AudioChunkRecorder", "Error starting recording: ${t.message}")
            promise.reject("START_FAIL", t.message)
        }
    }

    @ReactMethod
    fun pauseRecording(promise: Promise) {
        rotationMgr?.pause()
        promise.resolve(null)
    }

    @ReactMethod
    fun resumeRecording(promise: Promise) {
        rotationMgr?.resume()
        promise.resolve(null)
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        rotationMgr?.stop()
        rotationMgr = null
        isRecordingActive = false
        promise.resolve(null)
    }

    // -----------------  EventSink callbacks  ------------
    override fun onStateChange(isRecording: Boolean, isPaused: Boolean) {
        val m = Arguments.createMap().apply {
            putBoolean("isRecording", isRecording)
            putBoolean("isPaused", isPaused)
        }
        sendEvent("onStateChange", m)
    }

    override fun onChunkReady(path: String, seq: Int) {
        val m = Arguments.createMap().apply {
            putString("path", path)
            putInt("seq", seq)
        }
        sendEvent("onChunkReady", m)
    }

    override fun onAudioLevel(level: Double) {
        sendAudioLevel(level)
    }

    override fun onError(message: String) {
        val m = Arguments.createMap().apply { putString("message", message) }
        sendEvent("onError", m)
    }

    // -----------------  Helpers  -------------------------
    private fun sendAudioLevel(level: Double) {
        val m = Arguments.createMap().apply { putDouble("level", level) }
        sendEvent("onAudioLevel", m)
    }

    private fun sendEvent(name: String, params: com.facebook.react.bridge.WritableMap) {
        reactCtx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, params)
    }

    // -----------------  Cleanup  -------------------------
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        levelPreviewJob?.cancel()
        levelPreviewJob = null
        sharedEngine.stop()
        rotationMgr?.release()
        uiScope.cancel()
        ioScope.cancel()
    }
}
