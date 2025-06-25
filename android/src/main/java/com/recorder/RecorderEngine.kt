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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * RecorderEngine
 * ---------------
 * Continuous audio capture with [AudioRecord] and exposes:
 *   • `pcmFlow`  → PCM frames (ShortArray)
 *   • `levelFlow`→ Normalized RMS (0–1) for VU-meter / preview.
 *
 * No disk I/O or RN bridge knowledge. Long live SRP.
 */
class RecorderEngine(
    private val sampleRate: Int = DEFAULT_SAMPLE_RATE,
    private val channelConfig: Int = AudioFormat.CHANNEL_IN_MONO,
    private val audioFormat: Int = AudioFormat.ENCODING_PCM_16BIT,
    private val frameMillis: Int = 20  // frame size ≈ 20 ms
) {
    private var audioRecord: AudioRecord? = null
    private val recording = AtomicBoolean(false)

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // --- public flows ----------------------------------------------------
    private val _pcmFlow  = kotlinx.coroutines.flow.MutableSharedFlow<ShortArray>(extraBufferCapacity = 8)
    val pcmFlow           = _pcmFlow.asSharedFlow()

    private val _levelFlow = MutableStateFlow(0.0)
    val levelFlow: StateFlow<Double> = _levelFlow

    @Volatile var lastAudioLevel: Double = 0.0; private set

    // ------------------------------------------------------------------------
    /** Starts capture. Idempotent */
    fun start() {
        if (recording.get()) return

        val frameSize = millisToFrameSize(frameMillis, sampleRate)
        val minBufB   = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        val bufferB   = maxOf(frameSize * 2, minBufB)

        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate, channelConfig, audioFormat, bufferB
        ).apply {
            require(state == AudioRecord.STATE_INITIALIZED) { "AudioRecord init failed" }
            startRecording()
        }

        recording.set(true)
        scope.launch {
            val scratch = ShortArray(frameSize)
            while (isActive && recording.get()) {
                val read = audioRecord?.read(scratch, 0, scratch.size, AudioRecord.READ_BLOCKING) ?: 0
                if (read > 0) {
                    // Defensive copy, since scratch is reused
                    _pcmFlow.tryEmit(scratch.copyOf(read))
                    computeRms(scratch, read)
                }
            }
        }
    }

    fun pause() { if (recording.get()) audioRecord?.stop() }
    fun resume() { if (recording.get()) audioRecord?.startRecording() }

    fun stop() {
        if (!recording.getAndSet(false)) return
        audioRecord?.run {
            stop(); release()
        }
        audioRecord = null
        scope.cancel()
    }

    // ------------------------------------------------------------------------
    private fun computeRms(buf: ShortArray, len: Int) {
        var sum = 0.0
        for (i in 0 until len) sum += buf[i] * buf[i]
        val rms = kotlin.math.sqrt(sum / len) / 32768.0
        lastAudioLevel = rms.coerceAtMost(1.0)
        _levelFlow.value = lastAudioLevel
    }

    companion object {
        const val DEFAULT_SAMPLE_RATE = 16_000
        private fun millisToFrameSize(ms: Int, sr: Int): Int = ((sr / 1000.0) * ms).toInt().coerceAtLeast(256)
    }
}
