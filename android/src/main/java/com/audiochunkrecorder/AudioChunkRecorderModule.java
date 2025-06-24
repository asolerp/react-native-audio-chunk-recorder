package com.audiochunkrecorder;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Timer;
import java.util.TimerTask;

public class AudioChunkRecorderModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AudioChunkRecorder";
    private static final int SAMPLE_RATE = 44100;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    
    // Recording state
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private boolean isPaused = false;
    private int currentChunkIndex = 0;
    private Timer chunkTimer;
    private File recordingDirectory;
    private Thread recordingThread;
    private double chunkDuration = 30.0; // Default 30 seconds (aligned with iOS)
    
    // Audio level monitoring
    private Handler audioLevelHandler;
    private Runnable audioLevelRunnable;
    private double currentAudioLevel = 0.0;
    
    // Add new fields for chunk timing
    private long chunkStartTime = 0; // epoch millis when current chunk started (or resumed)
    private double accumulatedRecordingTime = 0.0; // seconds recorded in current chunk before a pause
    
    public AudioChunkRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        setupRecordingDirectory();
        Log.i(TAG, "AudioChunkRecorderModule initialized");
    }
    
        @Override
    public String getName() {
        return "AudioChunkRecorder";
    }
    
    private void setupRecordingDirectory() {
        Context context = getReactApplicationContext();
        recordingDirectory = new File(context.getFilesDir(), "AudioChunks");
        if (!recordingDirectory.exists()) {
            recordingDirectory.mkdirs();
        }
        Log.i(TAG, "Recording directory: " + recordingDirectory.getAbsolutePath());
    }
    
    private boolean checkPermissions() {
        return ActivityCompat.checkSelfPermission(
            getReactApplicationContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
    }
    
    private void sendEvent(String eventName, WritableMap params) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null && context.hasActiveCatalystInstance()) {
                context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                       .emit(eventName, params);
            } else {
                Log.w(TAG, "Cannot send event " + eventName + " - no active React context");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending event " + eventName + ": " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void startRecording(ReadableMap options, Promise promise) {
        if (isRecording) {
            promise.reject("already_recording", "Recording is already in progress");
            return;
        }
        
        if (!checkPermissions()) {
            promise.reject("permission_denied", "Audio recording permission not granted");
            return;
        }
        
        // Parse options
        int sampleRate = options.hasKey("sampleRate") ? options.getInt("sampleRate") : SAMPLE_RATE;
        double chunkSeconds = options.hasKey("chunkSeconds") ? options.getDouble("chunkSeconds") : 30.0;
        
        this.chunkDuration = chunkSeconds;
        
        try {
            startNewChunk(sampleRate);
            promise.resolve("Recording started");
            Log.i(TAG, "Recording started successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording", e);
            promise.reject("start_failed", e.getMessage());
        }
    }
    
    @ReactMethod
    public void stopRecording(Promise promise) {
        if (!isRecording) {
            promise.reject("not_recording", "No recording in progress");
            return;
        }
        
        try {
            // Cancel chunk timer
            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            
            // Finish current chunk
            finishCurrentChunk();
            
            // Release AudioRecord
            if (audioRecord != null) {
                audioRecord.release();
                audioRecord = null;
            }
            
            // Update state
            isRecording = false;
            isPaused = false;
            
            // Stop audio level monitoring
            stopAudioLevelMonitoring();
            
            // Send state change event
            sendStateChangeEvent();
            
            promise.resolve("Recording stopped");
            Log.i(TAG, "Recording stopped successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping recording", e);
            promise.reject("stop_failed", "Failed to stop recording: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void pauseRecording(Promise promise) {
        if (!isRecording || isPaused) {
            promise.reject("invalid_state", "Cannot pause - not recording or already paused");
            return;
        }
        
        try {
            // Update recorded time BEFORE stopping AudioRecord
            long now = System.currentTimeMillis();
            accumulatedRecordingTime += (now - chunkStartTime) / 1000.0;
            
            // Update state FIRST to stop the recording thread
            isPaused = true;
            
            // Cancel chunk timer
            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            
            // Stop AudioRecord AFTER updating state
            if (audioRecord != null) {
                audioRecord.stop();
            }
            
            // Stop audio level monitoring when paused
            stopAudioLevelMonitoring();
            
            // Send state change event
            sendStateChangeEvent();
            
            promise.resolve("Recording paused");
            Log.i(TAG, "Recording paused successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error pausing recording", e);
            promise.reject("pause_failed", "Failed to pause recording: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void resumeRecording(Promise promise) {
        if (!isRecording || !isPaused) {
            promise.reject("invalid_state", "Cannot resume - not recording or not paused");
            return;
        }
        
        try {
            // Resume AudioRecord FIRST
            if (audioRecord != null) {
                audioRecord.startRecording();
            }
            
            // Update state
            isPaused = false;
            
            // Calculate remaining time
            double remainingTime = chunkDuration - accumulatedRecordingTime;
            if (remainingTime <= 0) {
                // Chunk already complete, finish immediately and start next
                finishCurrentChunk();
                if (isRecording) {
                    try {
                        startNewChunk(SAMPLE_RATE);
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to start new chunk on resume", e);
                        promise.reject("resume_failed", "Failed to start new chunk: " + e.getMessage());
                        return;
                    }
                }
            } else {
                // Schedule rotation for remaining time
                chunkStartTime = System.currentTimeMillis();
                scheduleRotation(remainingTime);
            }
            
            // Restart audio level monitoring when resumed
            startAudioLevelMonitoring();
            
            // Send state change event
            sendStateChangeEvent();
            
            promise.resolve("Recording resumed");
            Log.i(TAG, "Recording resumed successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error resuming recording", e);
            promise.reject("resume_failed", "Failed to resume recording: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void checkPermissions(Promise promise) {
        try {
            boolean hasRecordPermission = ActivityCompat.checkSelfPermission(
                getReactApplicationContext(),
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED;
            
            promise.resolve(hasRecordPermission);
            Log.i(TAG, "checkPermissions: " + hasRecordPermission);
        } catch (Exception e) {
            Log.e(TAG, "Error checking permissions", e);
            promise.reject("PERMISSION_ERROR", "Error checking permissions: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void isAvailable(Promise promise) {
        try {
            promise.resolve(true);
            Log.i(TAG, "isAvailable: true");
        } catch (Exception e) {
            promise.reject("ERROR", "Error en isAvailable: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void isRecording(Promise promise) {
        try {
            promise.resolve(isRecording);
            Log.i(TAG, "isRecording: " + isRecording);
        } catch (Exception e) {
            promise.reject("ERROR", "Error en isRecording: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void isPaused(Promise promise) {
        try {
            promise.resolve(isPaused);
            Log.i(TAG, "isPaused: " + isPaused);
        } catch (Exception e) {
            promise.reject("ERROR", "Error en isPaused: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void getAudioLevel(Promise promise) {
        try {
            promise.resolve(currentAudioLevel);
            Log.i(TAG, "getAudioLevel: " + currentAudioLevel);
        } catch (Exception e) {
            promise.reject("ERROR", "Error en getAudioLevel: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void hasAudioSession(Promise promise) {
        try {
            promise.resolve(true);
            Log.i(TAG, "hasAudioSession: true (mock)");
        } catch (Exception e) {
            promise.reject("ERROR", "Error en hasAudioSession: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void getCurrentChunkIndex(Promise promise) {
        try {
            promise.resolve(currentChunkIndex);
            Log.i(TAG, "getCurrentChunkIndex: " + currentChunkIndex);
        } catch (Exception e) {
            promise.reject("ERROR", "Error en getCurrentChunkIndex: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void getChunkDuration(Promise promise) {
        try {
            promise.resolve(chunkDuration);
            Log.i(TAG, "getChunkDuration: " + chunkDuration);
        } catch (Exception e) {
            promise.reject("ERROR", "Error en getChunkDuration: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void getRecordingState(Promise promise) {
        try {
            WritableMap state = Arguments.createMap();
            state.putBoolean("isRecording", isRecording);
            state.putBoolean("isPaused", isPaused);
            state.putBoolean("isAvailable", true);
            state.putBoolean("hasPermission", checkPermissions());
            state.putInt("currentChunkIndex", currentChunkIndex);
            state.putDouble("chunkDuration", chunkDuration);
            state.putDouble("audioLevel", currentAudioLevel);
            
            promise.resolve(state);
            Log.i(TAG, "getRecordingState called - isRecording: " + isRecording + ", isPaused: " + isPaused);
        } catch (Exception e) {
            promise.reject("STATE_ERROR", "Error getting recording state: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void clearAllChunkFiles(Promise promise) {
        try {
            File[] files = recordingDirectory.listFiles();
            int deletedCount = 0;
            
            if (files != null) {
                for (File file : files) {
                    String fileName = file.getName();
                    // Delete files that start with "chunk_" and end with ".wav"
                    if (fileName.startsWith("chunk_") && fileName.endsWith(".wav")) {
                        if (file.delete()) {
                            deletedCount++;
                        } else {
                            Log.w(TAG, "Failed to delete chunk file: " + fileName);
                        }
                    }
                }
            }
            
            // Reset chunk index
            currentChunkIndex = 0;
            
            String message = "Deleted " + deletedCount + " chunk files";
            promise.resolve(message);
            Log.i(TAG, message);
        } catch (Exception e) {
            Log.e(TAG, "Error clearing chunk files", e);
            promise.reject("FILE_ERROR", "Could not clear chunk files: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void getModuleInfo(Promise promise) {
        try {
            WritableMap info = Arguments.createMap();
            info.putString("name", "AudioChunkRecorder");
            info.putString("version", "1.0.0-full");
            info.putString("platform", "Android");
            info.putBoolean("isSimplified", false);
            info.putBoolean("hasAudioLevelMonitoring", true);
            info.putBoolean("hasChunkSupport", true);
            info.putInt("sampleRate", SAMPLE_RATE);
            info.putString("audioFormat", "PCM_16BIT");
            info.putString("channelConfig", "MONO");
            
            promise.resolve(info);
            Log.i(TAG, "getModuleInfo called successfully - Full implementation");
        } catch (Exception e) {
            promise.reject("INFO_ERROR", "Error en getModuleInfo: " + e.getMessage());
        }
    }
    
    // Private helper methods for recording
    private void startNewChunk(int sampleRate) throws Exception {
        int bufferSize = AudioRecord.getMinBufferSize(sampleRate, CHANNEL_CONFIG, AUDIO_FORMAT);
        
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
        
        // Reset timing for this new chunk
        accumulatedRecordingTime = 0.0;
        chunkStartTime = System.currentTimeMillis();

        // Start recording thread
        recordingThread = new Thread(new RecordingRunnable());
        recordingThread.start();

        // Start timer for this chunk
        scheduleRotation(chunkDuration);
        
        // Start audio level monitoring (safely)
        startAudioLevelMonitoring();
        
        // Send state change event
        sendStateChangeEvent();
        
        Log.i(TAG, "Started recording chunk " + currentChunkIndex);
    }
    
    private void scheduleRotation(double delaySeconds) {
        if (chunkTimer != null) {
            chunkTimer.cancel();
            chunkTimer = null;
        }
        chunkTimer = new Timer();
        long delayMs = (long) (delaySeconds * 1000);
        chunkTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                if (isRecording && !isPaused) {
                    finishCurrentChunk();
                    try {
                        startNewChunk(SAMPLE_RATE);
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to start new chunk", e);
                        sendErrorEvent(e.getMessage());
                    }
                }
            }
        }, delayMs);
    }
    
    private void finishCurrentChunk() {
        if (audioRecord != null && isRecording) {
            audioRecord.stop();
            
            String fileName = "chunk_" + currentChunkIndex + ".wav";
            File file = new File(recordingDirectory, fileName);
            
            WritableMap chunkData = Arguments.createMap();
            chunkData.putString("uri", file.getAbsolutePath());
            chunkData.putString("path", file.getAbsolutePath());
            chunkData.putInt("seq", currentChunkIndex);
            
            sendEvent("onChunkReady", chunkData);
            
            currentChunkIndex++;
            Log.i(TAG, "Finished chunk " + (currentChunkIndex - 1));
        }
    }
    
    private void sendStateChangeEvent() {
        WritableMap params = Arguments.createMap();
        params.putBoolean("isRecording", isRecording);
        params.putBoolean("isPaused", isPaused);
        sendEvent("onStateChange", params);
    }
    
    private void sendErrorEvent(String message) {
        WritableMap params = Arguments.createMap();
        params.putString("message", message);
        sendEvent("onError", params);
    }
    
    // Audio level monitoring with safe Handler initialization
    private void startAudioLevelMonitoring() {
        // Initialize handler safely - avoid the Looper issue
        try {
            if (audioLevelHandler == null) {
                // Use a simpler approach - post to main thread if available
                if (Looper.getMainLooper() != null) {
                    audioLevelHandler = new Handler(Looper.getMainLooper());
                } else {
                    Log.w(TAG, "Main looper not available, skipping audio level monitoring");
                    return;
                }
            }
            
            if (audioLevelRunnable != null) {
                audioLevelHandler.removeCallbacks(audioLevelRunnable);
            }
            
            audioLevelRunnable = new Runnable() {
                @Override
                public void run() {
                    if (isRecording && !isPaused && audioRecord != null && audioLevelHandler != null) {
                        updateAudioLevel();
                        audioLevelHandler.postDelayed(this, 100); // Update every 100ms
                    }
                }
            };
            
            audioLevelHandler.post(audioLevelRunnable);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start audio level monitoring: " + e.getMessage());
        }
    }
    
    private void stopAudioLevelMonitoring() {
        if (audioLevelRunnable != null && audioLevelHandler != null) {
            try {
                audioLevelHandler.removeCallbacks(audioLevelRunnable);
            } catch (Exception e) {
                Log.w(TAG, "Error removing audio level callbacks: " + e.getMessage());
            }
            audioLevelRunnable = null;
        }
        
        // Send zero level when stopping
        try {
            WritableMap params = Arguments.createMap();
            params.putDouble("level", 0.0);
            params.putBoolean("hasAudio", false);
            sendEvent("onAudioLevel", params);
        } catch (Exception e) {
            Log.w(TAG, "Error sending final audio level: " + e.getMessage());
        }
    }
    
    private void updateAudioLevel() {
        if (audioRecord == null || audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            return;
        }
        
        try {
            // Read audio data to calculate level
            int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
            short[] buffer = new short[bufferSize];
            int bytesRead = audioRecord.read(buffer, 0, buffer.length);
            
            if (bytesRead > 0) {
                // Calculate RMS (Root Mean Square) for audio level
                long sum = 0;
                for (int i = 0; i < bytesRead; i++) {
                    sum += buffer[i] * buffer[i];
                }
                
                double rms = Math.sqrt(sum / (double) bytesRead);
                
                // Convert to normalized level (0.0 to 1.0)
                double normalizedLevel = Math.min(1.0, rms / 3000.0); // Adjust threshold based on testing
                boolean hasAudio = normalizedLevel > 0.15; // Lower threshold for Android
                
                currentAudioLevel = normalizedLevel;
                
                WritableMap params = Arguments.createMap();
                params.putDouble("level", normalizedLevel);
                params.putBoolean("hasAudio", hasAudio);
                params.putDouble("averagePower", rms);
                sendEvent("onAudioLevel", params);
            } else if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION) {
                // AudioRecord is not in recording state, stop monitoring
                Log.w(TAG, "AudioRecord not in recording state, stopping audio level monitoring");
                stopAudioLevelMonitoring();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error updating audio level", e);
            // Don't send error event for audio level issues to avoid spam
        }
    }
    
    // Recording thread runnable
    private class RecordingRunnable implements Runnable {
        @Override
        public void run() {
            String fileName = "chunk_" + currentChunkIndex + ".wav";
            File file = new File(recordingDirectory, fileName);
            
            try (FileOutputStream fos = new FileOutputStream(file)) {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                byte[] buffer = new byte[bufferSize];
                
                while (isRecording && !isPaused && audioRecord != null) {
                    // Check if AudioRecord is in recording state
                    if (audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                        // Wait a bit and continue if still recording
                        if (isRecording && !isPaused) {
                            Thread.sleep(10);
                            continue;
                        } else {
                            break;
                        }
                    }
                    
                    int bytesRead = audioRecord.read(buffer, 0, buffer.length);
                    if (bytesRead > 0) {
                        fos.write(buffer, 0, bytesRead);
                    } else if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION) {
                        // AudioRecord is not in recording state, break
                        Log.w(TAG, "AudioRecord not in recording state, stopping thread");
                        break;
                    } else if (bytesRead == AudioRecord.ERROR_BAD_VALUE) {
                        // Invalid parameters, break
                        Log.e(TAG, "AudioRecord read error: ERROR_BAD_VALUE");
                        break;
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "Error writing audio data", e);
                sendErrorEvent("Error writing audio data: " + e.getMessage());
            } catch (InterruptedException e) {
                Log.i(TAG, "Recording thread interrupted");
            } catch (Exception e) {
                Log.e(TAG, "Unexpected error in recording thread", e);
                sendErrorEvent("Unexpected error in recording thread: " + e.getMessage());
            }
        }
    }
    
    // Lifecycle management
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        cleanup();
    }
    
    private void cleanup() {
        try {
            // Stop recording if active
            if (isRecording) {
                try {
                    // Cancel timer
                    if (chunkTimer != null) {
                        chunkTimer.cancel();
                        chunkTimer = null;
                    }
                    
                    // Release AudioRecord
                    if (audioRecord != null) {
                        audioRecord.release();
                        audioRecord = null;
                    }
                    
                    isRecording = false;
                    isPaused = false;
                } catch (Exception e) {
                    Log.e(TAG, "Error stopping recording during cleanup", e);
                }
            }
            
            // Stop audio level monitoring
            stopAudioLevelMonitoring();
            
            // Clean up handlers
            if (audioLevelHandler != null) {
                try {
                    audioLevelHandler.removeCallbacksAndMessages(null);
                } catch (Exception e) {
                    Log.e(TAG, "Error cleaning up audio level handler", e);
                } finally {
                    audioLevelHandler = null;
                }
            }
            
            Log.i(TAG, "Cleanup completed");
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        }
    }
} 