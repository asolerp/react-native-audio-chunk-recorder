package com.recorder.encoding

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

/**
 * WavEncoder - PERFORMANCE OPTIMIZED
 * ----------------------------------
 * Minimalist WAV encoder that allows *streaming* writing of PCM audio
 * 16-bit little-endian. Designed to be used with [RecorderEngine]:
 * each captured frame is passed to [writeSamples] and, when finishing the chunk,
 * [close] is called to patch the RIFF header with the real size.
 *
 * 🚀 PERFORMANCE: Optimized buffering, reduced allocations, efficient I/O
 */
class WavEncoder(
    private val file: File,
    private val sampleRate: Int = DEFAULT_SAMPLE_RATE,
    private val channels: Short = DEFAULT_CHANNELS,
    private val bitsPerSample: Short = DEFAULT_BITS_PER_SAMPLE
) {

    private val channel: FileChannel
    private var dataSize: Long = 0
    private var closed = false
    
    // PERFORMANCE: Pre-allocated buffer to reduce GC pressure
    private val writeBuffer: ByteBuffer
    private val headerBuffer: ByteBuffer

    init {
        require(bitsPerSample == 16.toShort()) { "Only PCM 16-bit is supported" }
        if (file.exists()) file.delete()
        channel = RandomAccessFile(file, "rw").channel
        
        // PERFORMANCE: Pre-allocate buffers
        writeBuffer = ByteBuffer.allocateDirect(8192) // 4KB buffer for efficient writes
        writeBuffer.order(ByteOrder.LITTLE_ENDIAN)
        
        headerBuffer = ByteBuffer.allocate(44) // Fixed header size
        headerBuffer.order(ByteOrder.LITTLE_ENDIAN)
        
        writeHeader(0) // provisional header, updated when closing
    }

    /**
     * Writes a block of PCM samples (little-endian) to the file.
     * PERFORMANCE: Uses pre-allocated buffer for efficient writes
     * @param pcm buffer of 16-bit *Short* with full range amplitude.
     * @param length valid amount (in shorts) within the buffer.
     */
    fun writeSamples(pcm: ShortArray, length: Int = pcm.size) {
        check(!closed) { "Encoder already closed" }
        if (length == 0) return

        // PERFORMANCE: Use pre-allocated buffer instead of creating new ones
        writeBuffer.clear()
        
        // PERFORMANCE: Write in chunks to avoid buffer overflow
        var offset = 0
        while (offset < length) {
            val chunkSize = minOf(length - offset, writeBuffer.remaining() / 2)
            
            for (i in 0 until chunkSize) {
                writeBuffer.putShort(pcm[offset + i])
            }
            
            writeBuffer.flip()
            while (writeBuffer.hasRemaining()) {
                channel.write(writeBuffer)
            }
            writeBuffer.clear()
            
            offset += chunkSize
        }
        
        dataSize += (length * 2L)
    }

    /**
     * Closes the encoder updating the RIFF fields and releasing the channel.
     */
    fun close() {
        if (closed) return
        // Rewrite header with final size
        channel.position(0)
        writeHeader(dataSize)
        channel.force(true)
        channel.close()
        closed = true
    }

    private fun writeHeader(actualDataSize: Long) {
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val totalSize = 36 + actualDataSize

        // PERFORMANCE: Use pre-allocated header buffer
        headerBuffer.clear()
        headerBuffer.put("RIFF".toByteArray())
        headerBuffer.putInt(totalSize.toInt())
        headerBuffer.put("WAVE".toByteArray())

        // fmt chunk
        headerBuffer.put("fmt ".toByteArray())
        headerBuffer.putInt(16)              // Sub-chunk size
        headerBuffer.putShort(1)             // Audio format = PCM
        headerBuffer.putShort(channels)
        headerBuffer.putInt(sampleRate)
        headerBuffer.putInt(byteRate)
        headerBuffer.putShort(blockAlign.toShort())
        headerBuffer.putShort(bitsPerSample)

        // data chunk
        headerBuffer.put("data".toByteArray())
        headerBuffer.putInt(actualDataSize.toInt())
        headerBuffer.flip()
        while (headerBuffer.hasRemaining()) channel.write(headerBuffer)
    }

    companion object {
        const val DEFAULT_SAMPLE_RATE = 16_000
        const val DEFAULT_CHANNELS: Short = 1
        const val DEFAULT_BITS_PER_SAMPLE: Short = 16
    }
}
