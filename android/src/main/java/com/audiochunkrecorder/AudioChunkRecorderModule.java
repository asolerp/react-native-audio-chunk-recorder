package com.audiochunkrecorder;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.telephony.TelephonyManager;
import android.telephony.PhoneStateListener;
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
    
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private boolean isPaused = false;
    private int currentChunkIndex = 0;
    private Timer chunkTimer;
    private File recordingDirectory;
    private Thread recordingThread;
    private double chunkDuration = 10.0; // Default 10 seconds
    private Handler audioLevelHandler;
    private Runnable audioLevelRunnable;
    private double currentAudioLevel = 0.0;
    private boolean interruptionEventSent = false;
    private long lastInterruptionEndTime = 0;
    private TelephonyManager telephonyManager;
    private PhoneStateListener phoneStateListener;
    
    public AudioChunkRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        setupRecordingDirectory();
        setupPhoneStateListener();
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
    }
    
    private void setupPhoneStateListener() {
        telephonyManager = (TelephonyManager) getReactApplicationContext().getSystemService(Context.TELEPHONY_SERVICE);
        
        phoneStateListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String phoneNumber) {
                handlePhoneStateChange(state);
            }
        };
        
        if (telephonyManager != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
        }
    }
    
    private void handlePhoneStateChange(int state) {
        if (!isRecording) return;
        
        switch (state) {
            case TelephonyManager.CALL_STATE_RINGING:
            case TelephonyManager.CALL_STATE_OFFHOOK:
                // Phone call started - pause recording
                if (!interruptionEventSent && !isPaused) {
                    pauseRecordingForInterruption();
                    
                    WritableMap params = Arguments.createMap();
                    params.putString("type", "began");
                    params.putString("reason", "phone_call");
                    params.putBoolean("wasRecording", true);
                    params.putBoolean("nativePaused", true);
                    sendEvent("onInterruption", params);
                    
                    interruptionEventSent = true;
                    lastInterruptionEndTime = 0;
                }
                break;
                
            case TelephonyManager.CALL_STATE_IDLE:
                // Phone call ended
                long currentTime = System.currentTimeMillis();
                
                // Prevent duplicate events within 1 second
                if (currentTime - lastInterruptionEndTime < 1000) {
                    break;
                }
                
                if (interruptionEventSent) {
                    lastInterruptionEndTime = currentTime;
                    
                    WritableMap params = Arguments.createMap();
                    params.putString("type", "ended");
                    params.putBoolean("shouldResume", false); // Don't auto-resume on Android
                    params.putBoolean("canResume", isRecording && isPaused);
                    sendEvent("onInterruption", params);
                    
                    interruptionEventSent = false;
                }
                break;
        }
    }
    
    private void pauseRecordingForInterruption() {
        if (!isRecording || isPaused) return;
        
        if (audioRecord != null) {
            audioRecord.stop();
        }
        
        if (chunkTimer != null) {
            chunkTimer.cancel();
            chunkTimer = null;
        }
        
        isPaused = true;
        
        // Stop audio level monitoring
        stopAudioLevelMonitoring();
        
        sendStateChangeEvent();
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
        double chunkSeconds = options.hasKey("chunkSeconds") ? options.getDouble("chunkSeconds") : 10.0;
        
        this.chunkDuration = chunkSeconds;
        
        try {
            startNewChunk(sampleRate);
            promise.resolve("Recording started");
        } catch (Exception e) {
            promise.reject("start_failed", e.getMessage());
        }
    }
    
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
        interruptionEventSent = false; // Reset for new recording session
        lastInterruptionEndTime = 0; // Reset for new recording session
        
        // Start recording thread
        recordingThread = new Thread(new RecordingRunnable());
        recordingThread.start();
        
        // Start chunk timer
        startChunkTimer();
        
        // Start audio level monitoring
        startAudioLevelMonitoring();
        
        // Send state change event
        sendStateChangeEvent();
        
        Log.i(TAG, "Started recording chunk " + currentChunkIndex);
    }
    
    private void startChunkTimer() {
        chunkTimer = new Timer();
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
        }, (long)(chunkDuration * 1000), (long)(chunkDuration * 1000));
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
    
    @ReactMethod
    public void stopRecording(Promise promise) {
        if (!isRecording) {
            promise.reject("not_recording", "No recording in progress");
            return;
        }
        
        if (chunkTimer != null) {
            chunkTimer.cancel();
            chunkTimer = null;
        }
        
        finishCurrentChunk();
        
        if (audioRecord != null) {
            audioRecord.release();
            audioRecord = null;
        }
        
        isRecording = false;
        isPaused = false;
        interruptionEventSent = false; // Reset for next recording session
        lastInterruptionEndTime = 0; // Reset for next recording session
        
        // Stop audio level monitoring
        stopAudioLevelMonitoring();
        
        sendStateChangeEvent();
        
        promise.resolve("Recording stopped");
        Log.i(TAG, "Recording stopped");
    }
    
    @ReactMethod
    public void pauseRecording(Promise promise) {
        if (!isRecording || isPaused) {
            promise.reject("invalid_state", "Cannot pause - not recording or already paused");
            return;
        }
        
        if (audioRecord != null) {
            audioRecord.stop();
        }
        
        if (chunkTimer != null) {
            chunkTimer.cancel();
            chunkTimer = null;
        }
        
        isPaused = true;
        
        // Stop audio level monitoring when paused
        stopAudioLevelMonitoring();
        
        sendStateChangeEvent();
        
        promise.resolve("Recording paused");
        Log.i(TAG, "Recording paused");
    }
    
    @ReactMethod
    public void resumeRecording(Promise promise) {
        if (!isRecording || !isPaused) {
            promise.reject("invalid_state", "Cannot resume - not recording or not paused");
            return;
        }
        
        try {
            if (audioRecord != null) {
                audioRecord.startRecording();
            }
            
            isPaused = false;
            startChunkTimer();
            
            // Restart audio level monitoring when resumed
            startAudioLevelMonitoring();
            
            sendStateChangeEvent();
            
            promise.resolve("Recording resumed");
            Log.i(TAG, "Recording resumed");
        } catch (Exception e) {
            promise.reject("resume_failed", e.getMessage());
        }
    }
    
    @ReactMethod
    public void checkPermissions(Promise promise) {
        boolean hasPermission = ActivityCompat.checkSelfPermission(
            getReactApplicationContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        
        promise.resolve(hasPermission);
    }
    
    @ReactMethod
    public void isAvailable(Promise promise) {
        promise.resolve(true);
    }
    
    @ReactMethod
    public void isRecording(Promise promise) {
        promise.resolve(isRecording);
    }
    
    @ReactMethod
    public void isPaused(Promise promise) {
        promise.resolve(isPaused);
    }
    
    @ReactMethod
    public void getAudioLevel(Promise promise) {
        promise.resolve(currentAudioLevel);
    }
    
    @ReactMethod
    public void clearAllChunkFiles(Promise promise) {
        File[] files = recordingDirectory.listFiles();
        if (files != null) {
            for (File file : files) {
                file.delete();
            }
        }
        currentChunkIndex = 0;
        promise.resolve("All chunk files cleared");
        Log.i(TAG, "Cleared all chunks");
    }
    
    private boolean checkPermissions() {
        return ActivityCompat.checkSelfPermission(
            getReactApplicationContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
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
    
    private void sendEvent(String eventName, WritableMap params) {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }
    
    private void startAudioLevelMonitoring() {
        if (audioLevelHandler == null) {
            audioLevelHandler = new Handler(Looper.getMainLooper());
        }
        
        audioLevelRunnable = new Runnable() {
            @Override
            public void run() {
                if (isRecording && !isPaused && audioRecord != null) {
                    updateAudioLevel();
                    // Update every 100ms like iOS
                    audioLevelHandler.postDelayed(this, 100);
                }
            }
        };
        
        audioLevelHandler.post(audioLevelRunnable);
    }
    
    private void stopAudioLevelMonitoring() {
        if (audioLevelHandler != null && audioLevelRunnable != null) {
            audioLevelHandler.removeCallbacks(audioLevelRunnable);
        }
        
        // Send zero level when stopping
        WritableMap params = Arguments.createMap();
        params.putDouble("level", 0.0);
        params.putBoolean("hasAudio", false);
        sendEvent("onAudioLevel", params);
    }
    
    private void updateAudioLevel() {
        if (audioRecord == null || audioRecord.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            return;
        }
        
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
            // Android is less sensitive, so use lower threshold
            double normalizedLevel = Math.min(1.0, rms / 3000.0); // Adjust 3000 based on testing
            boolean hasAudio = normalizedLevel > 0.15; // Lower threshold for Android
            
            currentAudioLevel = normalizedLevel;
            
            WritableMap params = Arguments.createMap();
            params.putDouble("level", normalizedLevel);
            params.putBoolean("hasAudio", hasAudio);
            params.putDouble("averagePower", rms);
                         sendEvent("onAudioLevel", params);
         }
     }
     
     @Override
     public void onCatalystInstanceDestroy() {
         super.onCatalystInstanceDestroy();
         cleanup();
     }
     
     private void cleanup() {
         // Stop recording if active
         if (isRecording) {
             try {
                 stopRecording(null);
             } catch (Exception e) {
                 Log.e(TAG, "Error stopping recording during cleanup", e);
             }
         }
         
         // Remove phone state listener
         if (telephonyManager != null && phoneStateListener != null) {
             telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
         }
         
         // Stop audio level monitoring
         stopAudioLevelMonitoring();
         
         // Clean up handlers
         if (audioLevelHandler != null) {
             audioLevelHandler.removeCallbacksAndMessages(null);
             audioLevelHandler = null;
         }
     }
    
    private class RecordingRunnable implements Runnable {
        @Override
        public void run() {
            String fileName = "chunk_" + currentChunkIndex + ".wav";
            File file = new File(recordingDirectory, fileName);
            
            try (FileOutputStream fos = new FileOutputStream(file)) {
                int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
                byte[] buffer = new byte[bufferSize];
                
                while (isRecording && !isPaused && audioRecord != null) {
                    int bytesRead = audioRecord.read(buffer, 0, buffer.length);
                    if (bytesRead > 0) {
                        fos.write(buffer, 0, bytesRead);
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "Error writing audio data", e);
                sendErrorEvent("Error writing audio data: " + e.getMessage());
            }
        }
    }
} 