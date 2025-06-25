package com.audiochunkrecorder

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.*
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicInteger

/**
 * AudioChunkRecorderModule
 * 
 * Complete implementation with continuous buffer reading to avoid
 * audio levels always being 0.
 * 
 * Kotlin version with modern syntax and best practices.
 */
class AudioChunkRecorderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "AudioChunkRecorder"
        private const val SAMPLE_RATE = 16000 // Standard for voice recording
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val AUDIO_LEVEL_DELTA = 0.02 // threshold for emitting events
    }

    // -------------------------------------------------------
    //  Recording state and configuration
    // -------------------------------------------------------
    private var audioRecord: AudioRecord? = null
    @Volatile private var isRecording = false
    @Volatile private var isPaused = false

    private val currentChunkIndex = AtomicInteger(0)
    private var chunkDuration = 30.0 // seconds (default 30)

    private var chunkTimer: Timer? = null
    private lateinit var recordingDirectory: File

    // Audio level
    @Volatile private var lastAudioLevel = 0.0 // 0.0 – 1.0

    // Audio data collection
    private var audioDataBuffer: ByteArrayOutputStream? = null
    private val audioDataLock = Object()

    // Continuous reading
    private var recorderExecutor: ExecutorService? = null

    // Synchronization
    private val stateLock = Object()
    private val mapPoolLock = Object()

    // -------------------------------------------------------
    //  Map pools to reduce allocations
    // -------------------------------------------------------
    private val stateMapPool = ConcurrentLinkedQueue<WritableMap>()
    private val errorMapPool = ConcurrentLinkedQueue<WritableMap>()
    private val chunkMapPool = ConcurrentLinkedQueue<WritableMap>()

    // -------------------------------------------------------
    //  Constructor
    // -------------------------------------------------------
    init {
        setupRecordingDirectory()
        initializeMapPool()
        Log.i(TAG, "AudioChunkRecorderModule initialized")
    }

    override fun getName(): String = "AudioChunkRecorder"

    /* ==============================================================
     *                AUXILIARY METHODS (directories, pools)
     * ============================================================== */

    private fun setupRecordingDirectory() {
        val ctx = reactApplicationContext
        recordingDirectory = File(ctx.filesDir, "AudioChunks")
        if (!recordingDirectory.exists()) recordingDirectory.mkdirs()
    }

    private fun initializeMapPool() {
        repeat(5) {
            stateMapPool.offer(Arguments.createMap())
            errorMapPool.offer(Arguments.createMap())
            chunkMapPool.offer(Arguments.createMap())
        }
    }

    private fun getStateMap(): WritableMap = stateMapPool.poll() ?: Arguments.createMap()

    private fun getErrorMap(): WritableMap = errorMapPool.poll() ?: Arguments.createMap()

    private fun getChunkMap(): WritableMap = chunkMapPool.poll() ?: Arguments.createMap()

    /* ==============================================================
     *                SENDING EVENTS TO JAVASCRIPT
     * ============================================================== */

    private fun sendEvent(name: String, params: WritableMap) {
        val ctx = reactApplicationContext
        if (ctx != null && ctx.hasActiveCatalystInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, params)
        } else {
            Log.w(TAG, "React context not ready → event $name lost")
        }
    }

    private fun sendStateChangeEvent() {
        val map = getStateMap()
        synchronized(stateLock) {
            map.putBoolean("isRecording", isRecording)
            map.putBoolean("isPaused", isPaused)
        }
        sendEvent("onStateChange", map)
    }

    private fun sendErrorEvent(message: String) {
        val map = getErrorMap()
        map.putString("message", message)
        sendEvent("onError", map)
    }

    private fun sendAudioLevelEvent(level: Double) {
        val map = Arguments.createMap()
        map.putDouble("level", level)
        map.putBoolean("hasAudio", level > 0.01)
        sendEvent("onAudioLevel", map)
    }

    /* ==============================================================
     *      METHODS EXPOSED TO REACT NATIVE (public API)
     * ============================================================== */

    @ReactMethod
    fun startRecording(options: ReadableMap, promise: Promise) {
        if (isRecording) {
            promise.reject("already_recording", "Recording is already in progress")
            return
        }
        if (!checkPermissions()) {
            promise.reject("permission_denied", "Audio recording permission not granted")
            return
        }

        val sampleRate = if (options.hasKey("sampleRate")) options.getInt("sampleRate") else SAMPLE_RATE
        chunkDuration = if (options.hasKey("chunkSeconds")) options.getDouble("chunkSeconds") else 30.0

        try {
            startNewChunk(sampleRate)
            promise.resolve("Recording started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            promise.reject("start_failed", e.message)
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        if (!isRecording) {
            promise.reject("not_recording", "No recording in progress")
            return
        }
        try {
            stopCaptureLoop()

            chunkTimer?.cancel()
            chunkTimer = null
            
            if (!isPaused) finishCurrentChunk()

            audioRecord?.release()
            audioRecord = null

            synchronized(stateLock) {
                isRecording = false
                isPaused = false
            }
            sendStateChangeEvent()
            promise.resolve("Recording stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recording", e)
            promise.reject("stop_failed", e.message)
        }
    }

    @ReactMethod
    fun pauseRecording(promise: Promise) {
        if (!isRecording || isPaused) {
            promise.reject("invalid_state", "Cannot pause")
            return
        }
        try {
            audioRecord?.stop()
            chunkTimer?.cancel()
            chunkTimer = null
            isPaused = true
            sendStateChangeEvent()
            promise.resolve("Recording paused")
        } catch (e: Exception) {
            promise.reject("pause_failed", e.message)
        }
    }

    @ReactMethod
    fun resumeRecording(promise: Promise) {
        if (!isRecording || !isPaused) {
            promise.reject("invalid_state", "Cannot resume")
            return
        }
        try {
            audioRecord?.startRecording()
            isPaused = false
            scheduleRotation(chunkDuration)
            sendStateChangeEvent()
            promise.resolve("Recording resumed")
        } catch (e: Exception) {
            promise.reject("resume_failed", e.message)
        }
    }

    /* -------------  query/permission utilities ------------- */

    @ReactMethod
    fun checkPermissions(promise: Promise) = promise.resolve(checkPermissions())

    @ReactMethod
    fun isAvailable(promise: Promise) = promise.resolve(true)

    @ReactMethod
    fun isRecording(promise: Promise) = promise.resolve(isRecording)

    @ReactMethod
    fun isPaused(promise: Promise) = promise.resolve(isPaused)

    @ReactMethod
    fun getAudioLevel(promise: Promise) = promise.resolve(lastAudioLevel)

    @ReactMethod
    fun hasAudioSession(promise: Promise) = promise.resolve(true)

    @ReactMethod
    fun getCurrentChunkIndex(promise: Promise) = promise.resolve(currentChunkIndex.get())

    @ReactMethod
    fun getChunkDuration(promise: Promise) = promise.resolve(chunkDuration)

    @ReactMethod
    fun getRecordingState(promise: Promise) {
        val state = Arguments.createMap()
        synchronized(stateLock) {
            state.putBoolean("isRecording", isRecording)
            state.putBoolean("isPaused", isPaused)
        }
        state.putBoolean("isAvailable", true)
        state.putBoolean("hasPermission", checkPermissions())
        state.putInt("currentChunkIndex", currentChunkIndex.get())
        state.putDouble("chunkDuration", chunkDuration)
        state.putDouble("audioLevel", lastAudioLevel)
        promise.resolve(state)
    }

    @ReactMethod
    fun clearAllChunkFiles(promise: Promise) {
        try {
            val files = recordingDirectory.listFiles()
            var deletedCount = 0
            files?.forEach { file ->
                val name = file.name
                if (name.startsWith("chunk_") && name.endsWith(".wav")) {
                    if (file.delete()) deletedCount++
                }
            }
            currentChunkIndex.set(0)
            promise.resolve("Deleted $deletedCount chunk files")
        } catch (e: Exception) {
            promise.reject("FILE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getModuleInfo(promise: Promise) {
        val info = Arguments.createMap()
        info.putString("name", "AudioChunkRecorder")
        info.putString("version", "1.0.0-full")
        info.putString("platform", "Android")
        info.putBoolean("isSimplified", false)
        info.putBoolean("hasAudioLevelMonitoring", true)
        info.putBoolean("hasChunkSupport", true)
        info.putInt("sampleRate", SAMPLE_RATE)
        info.putString("audioFormat", "PCM_16BIT")
        info.putString("channelConfig", "MONO")
        promise.resolve(info)
    }

    /* ==============================================================
     *            CAPTURE AND CHUNK ROTATION (core)
     * ============================================================== */

    @Throws(Exception::class)
    private fun startNewChunk(sampleRate: Int) {
        val bufferSize = AudioRecord.getMinBufferSize(sampleRate, CHANNEL_CONFIG, AUDIO_FORMAT)
        
        // Ensure minimum buffer size
        if (bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            throw Exception("Invalid audio configuration")
        }
        
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSize
        )
        
        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            throw Exception("AudioRecord initialization failed")
        }
        
        audioRecord?.startRecording()
        isRecording = true
        isPaused = false

        // Initialize audio data buffer
        synchronized(audioDataLock) {
            audioDataBuffer = ByteArrayOutputStream()
        }

        startCaptureLoop(bufferSize, sampleRate)
        scheduleRotation(chunkDuration)
        sendStateChangeEvent()
    }

    /* --------  continuous buffer reading (main FIX)  -------- */

    private fun startCaptureLoop(bufferSize: Int, sampleRate: Int) {
        if (recorderExecutor?.isShutdown != false) {
            recorderExecutor = Executors.newSingleThreadExecutor()
        }
        val buffer = ShortArray(maxOf(256, bufferSize))

        recorderExecutor?.execute {
            while (isRecording) {
                if (isPaused || audioRecord == null) {
                    try {
                        Thread.sleep(20)
                    } catch (ignored: InterruptedException) {
                        // Ignore interruption
                    }
                    continue
                }

                val read = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    audioRecord?.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING) ?: 0
                } else {
                    audioRecord?.read(buffer, 0, buffer.size) ?: 0
                }

                if (read <= 0) continue

                // Collect audio data for WAV file
                synchronized(audioDataLock) {
                    audioDataBuffer?.let { buffer ->
                        // Convert short[] to bytes (little-endian)
                        val byteBuffer = ByteBuffer.allocate(read * 2)
                        byteBuffer.order(ByteOrder.LITTLE_ENDIAN)
                        for (i in 0 until read) {
                            byteBuffer.putShort(buffer[i])
                        }
                        try {
                            this.audioDataBuffer?.write(byteBuffer.array())
                        } catch (e: IOException) {
                            Log.e(TAG, "Error writing to audio buffer: ${e.message}")
                        }
                    }
                }

                var sum = 0.0
                for (i in 0 until read) sum += buffer[i] * buffer[i]
                var rms = sqrt(sum / read) / 32768.0
                if (rms > 1.0) rms = 1.0

                if (abs(rms - lastAudioLevel) >= AUDIO_LEVEL_DELTA) {
                    lastAudioLevel = rms
                    sendAudioLevelEvent(rms)
                }
            }
        }
    }

    private fun stopCaptureLoop() {
        isRecording = false // makes the loop terminate
        recorderExecutor?.shutdownNow()
        // Clear audio data buffer
        synchronized(audioDataLock) {
            audioDataBuffer?.close()
            audioDataBuffer = null
        }
    }

    /* -------------------------- rotation --------------------------- */

    private fun scheduleRotation(delaySeconds: Double) {
        chunkTimer?.cancel()
        chunkTimer = Timer()
        val delayMs = (delaySeconds * 1000).toLong()
        chunkTimer?.schedule(object : TimerTask() {
            override fun run() {
                if (isRecording && !isPaused) {
                    finishCurrentChunk()
                    try {
                        // Use the same sample rate as the current recording
                        var currentSampleRate = SAMPLE_RATE
                        try {
                            audioRecord?.let { record ->
                                currentSampleRate = record.sampleRate
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Could not get current sample rate, using default")
                        }
                        startNewChunk(currentSampleRate)
                    } catch (e: Exception) {
                        sendErrorEvent(e.message ?: "Unknown error")
                    }
                }
            }
        }, delayMs)
    }

    private fun finishCurrentChunk() {
        if (audioRecord != null && isRecording && !isPaused) {
            audioRecord?.stop()
            val fileName = "chunk_${currentChunkIndex.get()}.wav"
            val file = File(recordingDirectory, fileName)
            
            // Write WAV file with actual audio data
            try {
                val audioData: ByteArray
                synchronized(audioDataLock) {
                    audioData = audioDataBuffer?.toByteArray() ?: ByteArray(0)
                    audioDataBuffer = ByteArrayOutputStream() // Reset for next chunk
                }
                
                // Get the actual sample rate from the current recording
                var actualSampleRate = SAMPLE_RATE // Default fallback
                try {
                    actualSampleRate = audioRecord?.sampleRate ?: SAMPLE_RATE
                } catch (e: Exception) {
                    Log.w(TAG, "Could not get sample rate, using default: $SAMPLE_RATE")
                }
                writeWavFile(file, audioData, actualSampleRate)
            } catch (e: IOException) {
                Log.e(TAG, "Error writing WAV file: ${e.message}")
            }
            
            synchronized(mapPoolLock) {
                val map = getChunkMap()
                map.putString("uri", file.absolutePath)
                map.putString("path", file.absolutePath)
                map.putInt("seq", currentChunkIndex.get())
                sendEvent("onChunkReady", map)
            }
            currentChunkIndex.incrementAndGet()
        }
    }

    /* ==============================================================
     *                      MODULE CLEANUP
     * ============================================================== */

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        cleanup()
    }

    private fun cleanup() {
        try {
            stopCaptureLoop()
            audioRecord?.release()
            audioRecord = null
            chunkTimer?.cancel()
            chunkTimer = null
            stateMapPool.clear()
            errorMapPool.clear()
            chunkMapPool.clear()
            // Clear audio data buffer
            synchronized(audioDataLock) {
                audioDataBuffer?.close()
                audioDataBuffer = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "cleanup error", e)
        }
    }

    /* ==============================================================
     *                  PERMISSIONS AND VARIOUS CHECKS
     * ============================================================== */
    private fun checkPermissions(): Boolean {
        return ActivityCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    /* ==============================================================
     *                  WAV FILE WRITING
     * ============================================================== */
    
    @Throws(IOException::class)
    private fun writeWavFile(file: File, audioData: ByteArray, sampleRate: Int) {
        FileOutputStream(file).use { fos ->
            // WAV header (44 bytes)
            val header = ByteBuffer.allocate(44)
            header.order(ByteOrder.LITTLE_ENDIAN)
            
            // RIFF header
            header.put("RIFF".toByteArray())
            header.putInt(36 + audioData.size) // File size - 8
            header.put("WAVE".toByteArray())
            
            // fmt chunk
            header.put("fmt ".toByteArray())
            header.putInt(16) // fmt chunk size
            header.putShort(1) // Audio format (PCM)
            header.putShort(1) // Number of channels (mono)
            header.putInt(sampleRate) // Sample rate
            header.putInt(sampleRate * 2) // Byte rate (sampleRate * channels * bitsPerSample/8) = 16000 * 1 * 16/8 = 32000
            header.putShort(2) // Block align (channels * bitsPerSample/8)
            header.putShort(16) // Bits per sample
            
            // data chunk
            header.put("data".toByteArray())
            header.putInt(audioData.size) // Data size
            
            // Write header
            fos.write(header.array())
            
            // Write audio data
            fos.write(audioData)
            
            Log.i(TAG, "WAV file written: ${file.name} (${audioData.size} bytes, ${sampleRate}Hz)")
        }
    }
} 