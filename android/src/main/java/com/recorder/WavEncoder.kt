package com.recorder.encoding

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

/**
 * WavEncoder
 * ----------
 * Minimalist WAV encoder that allows *streaming* writing of PCM audio
 * 16-bit little-endian. Designed to be used with [RecorderEngine]:
 * each captured frame is passed to [writeSamples] and, when finishing the chunk,
 * [close] is called to patch the RIFF header with the real size.
 *
 * Does not maintain large internal *buffers* → memory remains stable
 * regardless of recording duration.
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

    init {
        require(bitsPerSample == 16.toShort()) { "Only PCM 16-bit is supported" }
        if (file.exists()) file.delete()
        channel = RandomAccessFile(file, "rw").channel
        writeHeader(0) // provisional header, updated when closing
    }

    /**
     * Writes a block of PCM samples (little-endian) to the file.
     * @param pcm buffer of 16-bit *Short* with full range amplitude.
     * @param length valid amount (in shorts) within the buffer.
     */
    fun writeSamples(pcm: ShortArray, length: Int = pcm.size) {
        check(!closed) { "Encoder already closed" }
        if (length == 0) return

        val byteBuf = ByteBuffer.allocateDirect(length * 2)
        byteBuf.order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until length) byteBuf.putShort(pcm[i])
        byteBuf.flip()
        while (byteBuf.hasRemaining()) channel.write(byteBuf)
        dataSize += (length * 2)
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

        val hdr = ByteBuffer.allocate(44)
        hdr.order(ByteOrder.LITTLE_ENDIAN)
        hdr.put("RIFF".toByteArray())
        hdr.putInt(totalSize.toInt())
        hdr.put("WAVE".toByteArray())

        // fmt chunk
        hdr.put("fmt ".toByteArray())
        hdr.putInt(16)              // Sub-chunk size
        hdr.putShort(1)             // Audio format = PCM
        hdr.putShort(channels)
        hdr.putInt(sampleRate)
        hdr.putInt(byteRate)
        hdr.putShort(blockAlign.toShort())
        hdr.putShort(bitsPerSample)

        // data chunk
        hdr.put("data".toByteArray())
        hdr.putInt(actualDataSize.toInt())
        hdr.flip()
        while (hdr.hasRemaining()) channel.write(hdr)
    }

    companion object {
        const val DEFAULT_SAMPLE_RATE = 16_000
        const val DEFAULT_CHANNELS: Short = 1
        const val DEFAULT_BITS_PER_SAMPLE: Short = 16
    }
}
