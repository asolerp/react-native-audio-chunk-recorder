package com.audiochunkrecorder;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AudioRecorderManager - Core audio recording functionality
 * 
 * Handles all audio recording operations including:
 * - Audio capture and processing
 * - Chunk rotation and file management
 * - Audio level monitoring
 * - State management
 */
public class AudioRecorderManager {
    private static final String TAG = "AudioRecorderManager";
    
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final double AUDIO_LEVEL_DELTA = 0.02; // threshold for emitting events

    // Core components
    private final EventEmitter eventEmitter;
    private final FileManager fileManager;

    // Recording state
    private AudioRecord audioRecord;
    private volatile boolean isRecording = false;
    private volatile boolean isPaused = false;
    private final AtomicInteger currentChunkIndex = new AtomicInteger(0);
    private double chunkDuration = 30.0; // seconds

    // Audio processing
    private ByteArrayOutputStream audioDataBuffer;
    private final Object audioDataLock = new Object();
    private ExecutorService recorderExecutor;
    private Timer chunkTimer;

    // Audio level
    private volatile double lastAudioLevel = 0.0; // 0.0 – 1.0

    public AudioRecorderManager(EventEmitter eventEmitter, FileManager fileManager) {
        this.eventEmitter = eventEmitter;
        this.fileManager = fileManager;
    }

    /* ==============================================================
     *                PUBLIC API
     * ============================================================== */

    /**
     * Start recording with specified parameters
     */
    public void startRecording(int sampleRate, double chunkDuration) throws Exception {
        if (isRecording) {
            throw new IllegalStateException("Recording is already in progress");
        }

        this.chunkDuration = chunkDuration;
        startNewChunk(sampleRate);
    }

    /**
     * Stop recording
     */
    public void stopRecording() {
        if (!isRecording) {
            return;
        }

        try {
            stopCaptureLoop();

            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            
            if (!isPaused) {
                finishCurrentChunk();
            }

            if (audioRecord != null) {
                audioRecord.release();
                audioRecord = null;
            }

            isRecording = false;
            isPaused = false;
            eventEmitter.sendStateChangeEvent(isRecording, isPaused);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping recording", e);
            eventEmitter.sendErrorEvent("Failed to stop recording: " + e.getMessage());
        }
    }

    /**
     * Pause recording
     */
    public void pauseRecording() {
        if (!isRecording || isPaused) {
            return;
        }

        try {
            if (audioRecord != null) audioRecord.stop();
            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            isPaused = true;
            eventEmitter.sendStateChangeEvent(isRecording, isPaused);
        } catch (Exception e) {
            Log.e(TAG, "Error pausing recording", e);
            eventEmitter.sendErrorEvent("Failed to pause recording: " + e.getMessage());
        }
    }

    /**
     * Resume recording
     */
    public void resumeRecording() {
        if (!isRecording || !isPaused) {
            return;
        }

        try {
            if (audioRecord != null) audioRecord.startRecording();
            isPaused = false;
            scheduleRotation(chunkDuration);
            eventEmitter.sendStateChangeEvent(isRecording, isPaused);
        } catch (Exception e) {
            Log.e(TAG, "Error resuming recording", e);
            eventEmitter.sendErrorEvent("Failed to resume recording: " + e.getMessage());
        }
    }

    /**
     * Clean up resources
     */
    public void cleanup() {
        try {
            stopCaptureLoop();
            if (audioRecord != null) {
                audioRecord.release();
                audioRecord = null;
            }
            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            
            synchronized (audioDataLock) {
                if (audioDataBuffer != null) {
                    try {
                        audioDataBuffer.close();
                    } catch (IOException ignored) {}
                    audioDataBuffer = null;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "cleanup error", e);
        }
    }

    /* ==============================================================
     *                STATE QUERIES
     * ============================================================== */

    public boolean isRecording() { return isRecording; }
    public boolean isPaused() { return isPaused; }
    public double getAudioLevel() { return lastAudioLevel; }
    public int getCurrentChunkIndex() { return currentChunkIndex.get(); }
    public double getChunkDuration() { return chunkDuration; }

    /**
     * Reset chunk index (used when clearing files)
     */
    public void resetChunkIndex() {
        currentChunkIndex.set(0);
    }

    /* ==============================================================
     *                AUDIO LEVEL PREVIEW METHODS
     * ============================================================== */

    /**
     * Start audio level preview (without recording)
     */
    public void startAudioLevelPreview() throws Exception {
        if (isRecording) {
            throw new IllegalStateException("Cannot start preview while recording");
        }

        // Start a minimal audio capture just for level monitoring
        int sampleRate = 16000;
        int bufferSize = AudioRecord.getMinBufferSize(sampleRate, CHANNEL_CONFIG, AUDIO_FORMAT);
        
        if (bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            throw new Exception("Invalid audio configuration");
        }
        
        audioRecord = new AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSize
        );
        
        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            throw new Exception("AudioRecord initialization failed");
        }
        
        audioRecord.startRecording();
        startCaptureLoop(bufferSize, sampleRate);
    }

    /**
     * Stop audio level preview
     */
    public void stopAudioLevelPreview() {
        if (audioRecord != null && !isRecording) {
            stopCaptureLoop();
            audioRecord.release();
            audioRecord = null;
        }
    }

    /* ==============================================================
     *                PRIVATE IMPLEMENTATION
     * ============================================================== */

    private void startNewChunk(int sampleRate) throws Exception {
        int bufferSize = AudioRecord.getMinBufferSize(sampleRate, CHANNEL_CONFIG, AUDIO_FORMAT);
        
        if (bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            throw new Exception("Invalid audio configuration");
        }
        
        audioRecord = new AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSize
        );
        
        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            throw new Exception("AudioRecord initialization failed");
        }
        
        audioRecord.startRecording();
        isRecording = true;
        isPaused = false;

        // Initialize audio data buffer
        synchronized (audioDataLock) {
            audioDataBuffer = new ByteArrayOutputStream();
        }

        startCaptureLoop(bufferSize, sampleRate);
        scheduleRotation(chunkDuration);
        eventEmitter.sendStateChangeEvent(isRecording, isPaused);
    }

    private void startCaptureLoop(int bufferSize, int sampleRate) {
        if (recorderExecutor == null || recorderExecutor.isShutdown()) {
            recorderExecutor = Executors.newSingleThreadExecutor();
        }
        final short[] buffer = new short[Math.max(256, bufferSize)];

        recorderExecutor.execute(() -> {
            while (isRecording) {
                if (isPaused || audioRecord == null) {
                    try {
                        Thread.sleep(20);
                    } catch (InterruptedException ignored) {}
                    continue;
                }

                int read = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M ?
                        audioRecord.read(buffer, 0, buffer.length, AudioRecord.READ_BLOCKING) :
                        audioRecord.read(buffer, 0, buffer.length);

                if (read <= 0) continue;

                // Collect audio data for WAV file
                synchronized (audioDataLock) {
                    if (audioDataBuffer != null) {
                        // Convert short[] to bytes (little-endian)
                        ByteBuffer byteBuffer = ByteBuffer.allocate(read * 2);
                        byteBuffer.order(ByteOrder.LITTLE_ENDIAN);
                        for (int i = 0; i < read; i++) {
                            byteBuffer.putShort(buffer[i]);
                        }
                        try {
                            audioDataBuffer.write(byteBuffer.array());
                        } catch (IOException e) {
                            Log.e(TAG, "Error writing to audio buffer: " + e.getMessage());
                        }
                    }
                }

                // Calculate audio level
                double sum = 0;
                for (int i = 0; i < read; i++) sum += buffer[i] * buffer[i];
                double rms = Math.sqrt(sum / read) / 32768.0;
                if (rms > 1.0) rms = 1.0;

                if (Math.abs(rms - lastAudioLevel) >= AUDIO_LEVEL_DELTA) {
                    lastAudioLevel = rms;
                    eventEmitter.sendAudioLevelEvent(rms);
                }
            }
        });
    }

    private void stopCaptureLoop() {
        isRecording = false; // makes the loop terminate
        if (recorderExecutor != null && !recorderExecutor.isShutdown()) {
            recorderExecutor.shutdownNow();
        }
        
        // Clear audio data buffer
        synchronized (audioDataLock) {
            if (audioDataBuffer != null) {
                try {
                    audioDataBuffer.close();
                } catch (IOException ignored) {}
                audioDataBuffer = null;
            }
        }
    }

    private void scheduleRotation(double delaySeconds) {
        if (chunkTimer != null) chunkTimer.cancel();
        chunkTimer = new Timer();
        long delayMs = (long) (delaySeconds * 1000);
        chunkTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                if (isRecording && !isPaused) {
                    finishCurrentChunk();
                    try {
                        // Use the same sample rate as the current recording
                        int currentSampleRate = 16000; // Default fallback
                        try {
                            if (audioRecord != null) {
                                currentSampleRate = audioRecord.getSampleRate();
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "Could not get current sample rate, using default");
                        }
                        startNewChunk(currentSampleRate);
                    } catch (Exception e) {
                        eventEmitter.sendErrorEvent(e.getMessage());
                    }
                }
            }
        }, delayMs);
    }

    private void finishCurrentChunk() {
        if (audioRecord != null && isRecording && !isPaused) {
            audioRecord.stop();
            File file = fileManager.createChunkFile(currentChunkIndex.get());
            
            // Write WAV file with actual audio data
            try {
                byte[] audioData;
                synchronized (audioDataLock) {
                    audioData = audioDataBuffer != null ? audioDataBuffer.toByteArray() : new byte[0];
                    audioDataBuffer = new ByteArrayOutputStream(); // Reset for next chunk
                }
                
                // Get the actual sample rate from the current recording
                int actualSampleRate = 16000; // Default fallback
                try {
                    actualSampleRate = audioRecord.getSampleRate();
                } catch (Exception e) {
                    Log.w(TAG, "Could not get sample rate, using default: 16000");
                }
                
                fileManager.writeWavFile(file, audioData, actualSampleRate);
                eventEmitter.sendChunkReadyEvent(file.getAbsolutePath(), currentChunkIndex.get());
                currentChunkIndex.incrementAndGet();
            } catch (IOException e) {
                Log.e(TAG, "Error writing WAV file: " + e.getMessage());
                eventEmitter.sendErrorEvent("Failed to write WAV file: " + e.getMessage());
            }
        }
    }
} 