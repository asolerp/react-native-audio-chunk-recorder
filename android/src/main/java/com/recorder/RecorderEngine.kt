package com.recorder.engine

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.onEach
import java.util.concurrent.atomic.AtomicBoolean

/**
 * RecorderEngine - PERFORMANCE OPTIMIZED
 * --------------------------------------
 * Continuous audio capture with [AudioRecord] and exposes:
 *   • `pcmFlow`  → PCM frames (ShortArray)
 *   • `levelFlow`→ Normalized RMS (0–1) for VU-meter / preview.
 *
 * 🚀 PERFORMANCE: Optimized threading, efficient buffers, no blocking operations
 */
class RecorderEngine(
    private val sampleRate: Int = DEFAULT_SAMPLE_RATE,
    private val channelConfig: Int = AudioFormat.CHANNEL_IN_MONO,
    private val audioFormat: Int = AudioFormat.ENCODING_PCM_16BIT,
    private val frameMillis: Int = 20  // frame size ≈ 20 ms
) {
    private var audioRecord: AudioRecord? = null
    private val recording = AtomicBoolean(false)

    // PERFORMANCE: Use dedicated IO scope for audio processing
    private val audioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // PERFORMANCE: Optimized buffer sizes and flow configurations
    private val _pcmFlow = MutableSharedFlow<ShortArray>(
        extraBufferCapacity = 16, // Increased buffer for better performance
        replay = 0
    )
    val pcmFlow: SharedFlow<ShortArray> = _pcmFlow

    private val _levelFlow = MutableStateFlow(0.0)
    val levelFlow: StateFlow<Double> = _levelFlow

    @Volatile var lastAudioLevel: Double = 0.0; private set

    // PERFORMANCE: Pre-allocated buffers to reduce GC pressure
    private var audioBuffer: ShortArray? = null
    private var tempBuffer: ShortArray? = null

    // ------------------------------------------------------------------------
    /** Starts capture. Idempotent - PERFORMANCE OPTIMIZED */
    fun start() {
        if (recording.get()) return

        try {
            val frameSize = millisToFrameSize(frameMillis, sampleRate)
            val minBufB = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
            val bufferB = maxOf(frameSize * 4, minBufB) // PERFORMANCE: Larger buffer for stability

            // PERFORMANCE: Pre-allocate buffers
            audioBuffer = ShortArray(frameSize)
            tempBuffer = ShortArray(frameSize)

            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate, channelConfig, audioFormat, bufferB
            ).apply {
                if (state != AudioRecord.STATE_INITIALIZED) {
                    throw IllegalStateException("AudioRecord initialization failed: state = $state")
                }
                startRecording()
            }

            recording.set(true)
            
            // PERFORMANCE: Launch audio processing in dedicated coroutine
            audioScope.launch {
                val scratch = audioBuffer ?: ShortArray(frameSize)
                var consecutiveErrors = 0
                val maxErrors = 5
                
                while (isActive && recording.get()) {
                    try {
                        val read = audioRecord?.read(scratch, 0, scratch.size, AudioRecord.READ_BLOCKING) ?: 0
                        if (read > 0) {
                            consecutiveErrors = 0 // Reset error counter on success
                            
                            // PERFORMANCE: Use defensive copy only when necessary
                            val dataToEmit = if (read == scratch.size) scratch else scratch.copyOf(read)
                            
                            // PERFORMANCE: Non-blocking emit with buffer
                            _pcmFlow.tryEmit(dataToEmit)
                            
                            // PERFORMANCE: Compute RMS in same thread to avoid context switching
                            computeRmsOptimized(scratch, read)
                        }
                    } catch (e: Exception) {
                        consecutiveErrors++
                        android.util.Log.e("RecorderEngine", "Audio read error (${consecutiveErrors}/$maxErrors): ${e.message}")
                        
                        if (consecutiveErrors >= maxErrors) {
                            android.util.Log.e("RecorderEngine", "Too many consecutive errors, stopping audio capture")
                            break
                        }
                        
                        // PERFORMANCE: Brief pause to avoid tight error loop
                        kotlinx.coroutines.delay(10)
                    }
                }
            }
        } catch (e: Exception) {
            // Clean up on error
            audioRecord?.release()
            audioRecord = null
            recording.set(false)
            audioBuffer = null
            tempBuffer = null
            throw e
        }
    }

    fun pause() { if (recording.get()) audioRecord?.stop() }
    fun resume() { if (recording.get()) audioRecord?.startRecording() }

    fun stop() {
        if (!recording.getAndSet(false)) return
        
        // PERFORMANCE: Clean up resources efficiently
        audioRecord?.run {
            stop()
            release()
        }
        audioRecord = null
        
        // PERFORMANCE: Clear buffers
        audioBuffer = null
        tempBuffer = null
        
        // PERFORMANCE: Cancel scope
        audioScope.cancel()
    }

    // ------------------------------------------------------------------------
    // PERFORMANCE: Optimized RMS computation with reduced allocations
    private fun computeRmsOptimized(buf: ShortArray, len: Int) {
        var sum = 0.0
        // PERFORMANCE: Use local variable to avoid repeated array access
        for (i in 0 until len) {
            val sample = buf[i].toDouble()
            sum += sample * sample
        }
        val rms = kotlin.math.sqrt(sum / len) / 32768.0
        lastAudioLevel = rms.coerceAtMost(1.0)
        _levelFlow.value = lastAudioLevel
    }

    // Legacy method for compatibility
    private fun computeRms(buf: ShortArray, len: Int) {
        computeRmsOptimized(buf, len)
    }

    companion object {
        const val DEFAULT_SAMPLE_RATE = 16_000
        private fun millisToFrameSize(ms: Int, sr: Int): Int = ((sr / 1000.0) * ms).toInt().coerceAtLeast(256)
    }
}
