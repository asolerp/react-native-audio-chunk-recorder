package com.audiochunkrecorder;

import android.util.Log;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import com.facebook.react.bridge.ReactApplicationContext;

/**
 * FileManager - Handles file operations for audio chunks
 * 
 * Manages the recording directory and WAV file writing operations.
 */
public class FileManager {
    private static final String TAG = "FileManager";
    private final File recordingDirectory;

    public FileManager(ReactApplicationContext reactContext) {
        this.recordingDirectory = new File(reactContext.getFilesDir(), "AudioChunks");
        if (!recordingDirectory.exists()) {
            recordingDirectory.mkdirs();
        }
    }

    /**
     * Get the recording directory
     */
    public File getRecordingDirectory() {
        return recordingDirectory;
    }

    /**
     * Create a new chunk file
     */
    public File createChunkFile(int chunkIndex) {
        String fileName = "chunk_" + chunkIndex + ".wav";
        return new File(recordingDirectory, fileName);
    }

    /**
     * Write WAV file with audio data
     */
    public void writeWavFile(File file, byte[] audioData, int sampleRate) throws IOException {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            // WAV header (44 bytes)
            ByteBuffer header = ByteBuffer.allocate(44);
            header.order(ByteOrder.LITTLE_ENDIAN);
            
            // RIFF header
            header.put("RIFF".getBytes());
            header.putInt(36 + audioData.length); // File size - 8
            header.put("WAVE".getBytes());
            
            // fmt chunk
            header.put("fmt ".getBytes());
            header.putInt(16); // fmt chunk size
            header.putShort((short) 1); // Audio format (PCM)
            header.putShort((short) 1); // Number of channels (mono)
            header.putInt(sampleRate); // Sample rate
            header.putInt(sampleRate * 2); // Byte rate (sampleRate * channels * bitsPerSample/8)
            header.putShort((short) 2); // Block align (channels * bitsPerSample/8)
            header.putShort((short) 16); // Bits per sample
            
            // data chunk
            header.put("data".getBytes());
            header.putInt(audioData.length); // Data size
            
            // Write header
            fos.write(header.array());
            
            // Write audio data
            fos.write(audioData);
            
            Log.i(TAG, "WAV file written: " + file.getName() + " (" + audioData.length + " bytes, " + sampleRate + "Hz)");
        }
    }

    /**
     * Clear all chunk files
     */
    public int clearAllChunkFiles() {
        File[] files = recordingDirectory.listFiles();
        int deletedCount = 0;
        if (files != null) {
            for (File f : files) {
                String n = f.getName();
                if (n.startsWith("chunk_") && n.endsWith(".wav")) {
                    if (f.delete()) deletedCount++;
                }
            }
        }
        return deletedCount;
    }

    /**
     * Get the number of existing chunk files
     */
    public int getChunkFileCount() {
        File[] files = recordingDirectory.listFiles();
        if (files == null) return 0;
        
        int count = 0;
        for (File f : files) {
            String n = f.getName();
            if (n.startsWith("chunk_") && n.endsWith(".wav")) {
                count++;
            }
        }
        return count;
    }
} 