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
import java.io.File

/**
 * AudioChunkRecorderModule (Native Orchestrator)
 * ----------------------------------------------
 * 📌 Exposes RN API (<JavaScript>)
 * 📌 Orchestrates Preview (audio level) and Recording (Chunk rotation)
 * 📌 Connects native events ➜ DeviceEventEmitter (JS)
 */
class AudioChunkRecorderModule(
    private val reactCtx: ReactApplicationContext
) : ReactContextBaseJavaModule(reactCtx), RecorderEventSink {

    // -----------------  Sub-components  -----------------
    private val previewEngine = RecorderEngine()          // level preview only
    private var rotationMgr: RotationManager? = null      // real recording

    private val mainScope: CoroutineScope = MainScope()   // Dispatcher.Main

    // -----------------  React Native name  --------------
    override fun getName(): String = "AudioChunkRecorder"

    // -----------------  Level Preview  ------------------
    @ReactMethod
    fun startAudioLevelPreview(promise: Promise) {
        try {
            previewEngine.start()
            previewEngine.levelFlow
                .onEach { sendAudioLevel(it) }
                .launchIn(mainScope)
            promise.resolve(null)
        } catch (t: Throwable) {
            promise.reject("PREVIEW_ERROR", t.message)
        }
    }

    @ReactMethod
    fun stopAudioLevelPreview(promise: Promise) {
        previewEngine.stop()
        promise.resolve(null)
    }

    // -----------------  Chunk Recording  ----------------
    @ReactMethod
    fun startRecording(options: com.facebook.react.bridge.ReadableMap, promise: Promise) {
        if (rotationMgr?.isRecording() == true) {
            promise.reject("ALREADY_RECORDING", "Already recording")
            return
        }
        try {
            val sampleRate = options.getInt("sampleRate")
            val chunkSec   = options.getDouble("chunkSeconds")
            val dir = File(reactCtx.filesDir, "AudioChunks").apply { if (!exists()) mkdirs() }

            rotationMgr = RotationManager(eventSink = this).also {
                it.start(sampleRate, chunkSec, dir)
            }
            promise.resolve(null)
        } catch (t: Throwable) {
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
        previewEngine.stop()
        rotationMgr?.release()
        mainScope.cancel()
    }
}
