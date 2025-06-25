package com.recorder.rotation

import com.recorder.engine.RecorderEngine
import com.recorder.encoding.WavEncoder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * RotationManager
 * ---------------
 * Orchestrates the complete lifecycle of chunk-based recording.
 *
 *   • Manages `RecorderEngine` (PCM capture).
 *   • Creates / closes `WavEncoder` for each chunk.
 *   • Emits state, level and "chunk ready" events to a `RecorderEventSink`.
 *   • Implements pause/resume without extra threads: just cancels/restarts the ticker.
 */
class RotationManager(
    private val eventSink: RecorderEventSink,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
) {
    // ---------------------------------------------
    // Internal state
    // ---------------------------------------------
    private var engine: RecorderEngine? = null
    private var encoder: WavEncoder? = null

    private var tickerJob: Job? = null
    private var collectorJob: Job? = null

    private val isRecording = AtomicBoolean(false)
    private val isPaused    = AtomicBoolean(false)
    private var chunkIndex  = 0
    private var chunkSeconds: Double = DEFAULT_CHUNK_SEC
    private lateinit var outputDir: File

    // ---------------------------------------------
    // Public API (bridge-friendly)
    // ---------------------------------------------
    fun start(
        sampleRate: Int = RecorderEngine.DEFAULT_SAMPLE_RATE,
        chunkDurationSec: Double = DEFAULT_CHUNK_SEC,
        outDir: File
    ) {
        if (isRecording.get()) return

        this.chunkSeconds = chunkDurationSec
        this.outputDir = outDir.also { if (!it.exists()) it.mkdirs() }

        try {
            // 1) Engine
            engine = RecorderEngine(sampleRate).apply { start() }
            // 2) Encoder for first chunk
            encoder = newEncoder()
            // 3) Collect PCM → Encoder
            collectorJob = engine!!.pcmFlow
                .onEach { encoder?.writeSamples(it) }
                .launchIn(scope)
            // 4) Launch rotation ticker
            startTicker()
            isRecording.set(true)
            isPaused.set(false)
            eventSink.onStateChange(true, false)
        } catch (t: Throwable) {
            eventSink.onError(t.message ?: "unknown error")
            stop() // rollback
        }
    }

    fun pause() {
        if (!isRecording.get() || isPaused.get()) return
        engine?.pause()
        tickerJob?.cancel()
        isPaused.set(true)
        eventSink.onStateChange(true, true)
    }

    fun resume() {
        if (!isRecording.get() || !isPaused.get()) return
        engine?.resume()
        startTicker()
        isPaused.set(false)
        eventSink.onStateChange(true, false)
    }

    fun stop() {
        if (!isRecording.getAndSet(false)) return
        tickerJob?.cancel()
        collectorJob?.cancel()
        runCatching { encoder?.close() }
        runCatching { engine?.stop() }
        encoder = null; engine = null
        isPaused.set(false)
        eventSink.onStateChange(false, false)
    }

    fun isRecording(): Boolean = isRecording.get()
    fun isPaused(): Boolean    = isPaused.get()
    fun currentChunkIndex(): Int = chunkIndex
    fun chunkDuration(): Double  = chunkSeconds
    fun audioLevel(): Double     = engine?.lastAudioLevel ?: 0.0

    fun release() { stop(); scope.cancel() }

    // ---------------------------------------------
    // Internals
    // ---------------------------------------------
    private fun startTicker() {
        tickerJob?.cancel()
        val delayMs = (chunkSeconds * 1000).toLong()
        tickerJob = scope.launch {
            while (isActive) {
                delay(delayMs)
                if (isActive && isRecording.get() && !isPaused.get()) {
                    rotateChunk()
                }
            }
        }
    }

    private fun rotateChunk() {
        runCatching { encoder?.close() }
        eventSink.onChunkReady(currentFilePath(chunkIndex), chunkIndex)
        chunkIndex += 1
        encoder = newEncoder()
    }

    private fun newEncoder(): WavEncoder {
        val file = File(outputDir, "chunk_$chunkIndex.wav")
        return WavEncoder(file)
    }

    private fun currentFilePath(idx: Int): String =
        File(outputDir, "chunk_$idx.wav").absolutePath

    companion object {
        private const val DEFAULT_CHUNK_SEC = 30.0
    }
}

/**
 * Minimal interface for event callbacks to RN bridge (or tests).
 */
interface RecorderEventSink {
    fun onStateChange(isRecording: Boolean, isPaused: Boolean)
    fun onChunkReady(path: String, seq: Int)
    fun onAudioLevel(level: Double) { /* optional */ }
    fun onError(message: String)
}
