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

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class AudioChunkRecorderModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AudioChunkRecorder";
    private static final int SAMPLE_RATE = 44100;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    
    // Performance constants
    private static final int BUFFER_SIZE = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
    private static final int AUDIO_LEVEL_UPDATE_INTERVAL = 200; // ms - reduced from 100ms
    private static final double AUDIO_LEVEL_THRESHOLD = 0.15;
    private static final double AUDIO_LEVEL_NORMALIZATION_FACTOR = 3000.0;
    
    // Recording state
    private AudioRecord audioRecord;
    private volatile boolean isRecording = false;
    private volatile boolean isPaused = false;
    private AtomicInteger currentChunkIndex = new AtomicInteger(0);
    private Timer chunkTimer;
    private File recordingDirectory;
    private Thread recordingThread;
    private double chunkDuration = 30.0; // Default 30 seconds to match iOS
    
    // Thread safety - using atomic operations where possible
    private final Object stateLock = new Object();
    private AtomicBoolean shouldStopThread = new AtomicBoolean(false);
    
    // Audio level monitoring with performance optimizations
    private Handler audioLevelHandler;
    private Runnable audioLevelRunnable;
    private volatile double currentAudioLevel = 0.0;
    private long lastAudioLevelUpdate = 0;
    
    // Chunk timing
    private volatile long chunkStartTime = 0;
    private volatile double accumulatedRecordingTime = 0.0;
    
    // Performance optimizations - Buffer reuse
    private final byte[] recordingBuffer = new byte[BUFFER_SIZE];
    private final short[] audioLevelBuffer = new short[BUFFER_SIZE / 2]; // 16-bit samples
    private final WritableMap reusableStateMap = Arguments.createMap();
    private final WritableMap reusableAudioLevelMap = Arguments.createMap();
    private final WritableMap reusableChunkMap = Arguments.createMap();
    private final WritableMap reusableErrorMap = Arguments.createMap();
    
    // File I/O optimization
    private BufferedOutputStream currentFileStream;
    
    public AudioChunkRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        setupRecordingDirectory();
        Log.i(TAG, "AudioChunkRecorderModule initialized with performance optimizations");
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
    
    // Optimized event sending with reusable maps
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
    
    // Optimized state change event with reusable map
    private void sendStateChangeEvent() {
        synchronized (reusableStateMap) {
            reusableStateMap.clear();
            reusableStateMap.putBoolean("isRecording", isRecording);
            reusableStateMap.putBoolean("isPaused", isPaused);
            sendEvent("onStateChange", reusableStateMap);
        }
    }
    
    // Optimized error event with reusable map
    private void sendErrorEvent(String message) {
        synchronized (reusableErrorMap) {
            reusableErrorMap.clear();
            reusableErrorMap.putString("message", message);
            sendEvent("onError", reusableErrorMap);
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
            // Signal thread to stop
            shouldStopThread.set(true);
            
            // Cancel chunk timer
            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            
            // Finish current chunk only if not paused
            if (!isPaused) {
                finishCurrentChunk();
            }
            
            // Release AudioRecord
            if (audioRecord != null) {
                audioRecord.release();
                audioRecord = null;
            }
            
            // Wait for recording thread to finish
            if (recordingThread != null && recordingThread.isAlive()) {
                try {
                    recordingThread.join(1000); // Wait up to 1 second
                } catch (InterruptedException e) {
                    Log.w(TAG, "Interrupted while waiting for recording thread");
                }
                recordingThread = null;
            }
            
            // Update state
            isRecording = false;
            isPaused = false;
            
            // Reset thread stop flag
            shouldStopThread.set(false);
            
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
            // Stop AudioRecord
            if (audioRecord != null) {
                audioRecord.stop();
            }
            
            // Cancel chunk timer
            if (chunkTimer != null) {
                chunkTimer.cancel();
                chunkTimer = null;
            }
            
            // Update state
            isPaused = true;
            
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
            // Resume AudioRecord
            if (audioRecord != null) {
                audioRecord.startRecording();
            }
            
            // Update state
            isPaused = false;
            
            // Restart chunk timer
            scheduleRotation(chunkDuration);
            
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
            synchronized (stateLock) {
                promise.resolve(isRecording);
                Log.i(TAG, "isRecording: " + isRecording);
            }
        } catch (Exception e) {
            promise.reject("ERROR", "Error en isRecording: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void isPaused(Promise promise) {
        try {
            synchronized (stateLock) {
                promise.resolve(isPaused);
                Log.i(TAG, "isPaused: " + isPaused);
            }
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
            promise.resolve(currentChunkIndex.get());
            Log.i(TAG, "getCurrentChunkIndex: " + currentChunkIndex.get());
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
            synchronized (stateLock) {
                state.putBoolean("isRecording", isRecording);
                state.putBoolean("isPaused", isPaused);
            }
            state.putBoolean("isAvailable", true);
            state.putBoolean("hasPermission", checkPermissions());
            state.putInt("currentChunkIndex", currentChunkIndex.get());
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
            currentChunkIndex.set(0);
            
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
        
        Log.i(TAG, "Started recording chunk " + currentChunkIndex.get());
    }
    
    private void scheduleRotation(double delaySeconds) {
        if (chunkTimer != null) {
            chunkTimer.cancel();
            chunkTimer = null;
        }
        chunkTimer = new Timer();
        long delayMs = (long) (delaySeconds * 1000);
        Log.i(TAG, "Scheduling chunk rotation in " + delayMs + "ms (" + delaySeconds + "s)");
        chunkTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                Log.i(TAG, "Chunk timer fired - finishing current chunk");
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
    
    private void startChunkTimer() {
        // This method is deprecated, use scheduleRotation instead
        scheduleRotation(chunkDuration);
    }
    
    private void finishCurrentChunk() {
        if (audioRecord != null && isRecording && !isPaused) {
            audioRecord.stop();
            
            String fileName = "chunk_" + currentChunkIndex.get() + ".wav";
            File file = new File(recordingDirectory, fileName);
            
            // Use reusable chunk map for better performance
            synchronized (reusableChunkMap) {
                reusableChunkMap.clear();
                reusableChunkMap.putString("uri", file.getAbsolutePath());
                reusableChunkMap.putString("path", file.getAbsolutePath());
                reusableChunkMap.putInt("seq", currentChunkIndex.get());
                sendEvent("onChunkReady", reusableChunkMap);
            }
            
            currentChunkIndex.incrementAndGet();
            Log.i(TAG, "Finished chunk " + (currentChunkIndex.get() - 1));
        }
    }
    
    // Optimized audio level monitoring with throttling
    private void startAudioLevelMonitoring() {
        try {
            if (audioLevelHandler == null) {
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
                        audioLevelHandler.postDelayed(this, AUDIO_LEVEL_UPDATE_INTERVAL);
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
            synchronized (reusableAudioLevelMap) {
                reusableAudioLevelMap.clear();
                reusableAudioLevelMap.putDouble("level", 0.0);
                reusableAudioLevelMap.putBoolean("hasAudio", false);
                reusableAudioLevelMap.putDouble("averagePower", 0.0);
                sendEvent("onAudioLevel", reusableAudioLevelMap);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error sending final audio level: " + e.getMessage());
        }
    }
    
    // Optimized audio level update with throttling
    private void updateAudioLevel() {
        if (audioRecord == null || audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            return;
        }
        
        // Throttle updates to avoid excessive event emission
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastAudioLevelUpdate < AUDIO_LEVEL_UPDATE_INTERVAL) {
            return;
        }
        lastAudioLevelUpdate = currentTime;
        
        // Read audio data to calculate level using reusable buffer
        int bytesRead = audioRecord.read(audioLevelBuffer, 0, audioLevelBuffer.length);
        
        if (bytesRead > 0) {
            // Calculate RMS (Root Mean Square) for audio level
            long sum = 0;
            for (int i = 0; i < bytesRead; i++) {
                sum += audioLevelBuffer[i] * audioLevelBuffer[i];
            }
            
            double rms = Math.sqrt(sum / (double) bytesRead);
            
            // Convert to normalized level (0.0 to 1.0)
            double normalizedLevel = Math.min(1.0, rms / AUDIO_LEVEL_NORMALIZATION_FACTOR);
            boolean hasAudio = normalizedLevel > AUDIO_LEVEL_THRESHOLD;
            
            currentAudioLevel = normalizedLevel;
            
            // Use reusable map for better performance
            synchronized (reusableAudioLevelMap) {
                reusableAudioLevelMap.clear();
                reusableAudioLevelMap.putDouble("level", normalizedLevel);
                reusableAudioLevelMap.putBoolean("hasAudio", hasAudio);
                reusableAudioLevelMap.putDouble("averagePower", rms);
                sendEvent("onAudioLevel", reusableAudioLevelMap);
            }
        }
    }
    
    // Optimized recording thread with better I/O performance
    private class RecordingRunnable implements Runnable {
        @Override
        public void run() {
            String fileName = "chunk_" + currentChunkIndex.get() + ".wav";
            File file = new File(recordingDirectory, fileName);
            
            try (BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(file), BUFFER_SIZE * 2)) {
                int bytesRead;
                while (!shouldStopThread.get()) {
                    // Check state without synchronization when possible
                    if (!isRecording || shouldStopThread.get()) {
                        break;
                    }
                    
                    if (isPaused) {
                        // Wait a bit when paused to avoid busy waiting
                        try {
                            Thread.sleep(50);
                        } catch (InterruptedException e) {
                            Log.w(TAG, "Recording thread interrupted");
                            break;
                        }
                        continue;
                    }
                    
                    if (audioRecord != null) {
                        bytesRead = audioRecord.read(recordingBuffer, 0, recordingBuffer.length);
                        if (bytesRead > 0) {
                            bos.write(recordingBuffer, 0, bytesRead);
                        }
                    }
                }
                
                // Ensure all data is written
                bos.flush();
            } catch (IOException e) {
                Log.e(TAG, "Error writing audio data", e);
                sendErrorEvent("Error writing audio data: " + e.getMessage());
            }
            
            Log.i(TAG, "Recording thread finished");
        }
    }
    
    // Lifecycle management
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        cleanup();
    }
    
    // Optimized cleanup with better resource management
    private void cleanup() {
        try {
            // Signal thread to stop
            shouldStopThread.set(true);
            
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
            
            // Wait for recording thread to finish
            if (recordingThread != null && recordingThread.isAlive()) {
                try {
                    recordingThread.join(1000); // Wait up to 1 second
                } catch (InterruptedException e) {
                    Log.w(TAG, "Interrupted while waiting for recording thread during cleanup");
                } finally {
                    recordingThread = null;
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
            
            // Reset thread stop flag
            shouldStopThread.set(false);
            
            Log.i(TAG, "Cleanup completed with optimizations");
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        }
    }
} 
} 