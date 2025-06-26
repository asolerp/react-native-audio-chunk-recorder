package com.audiochunkrecorder;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
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
import java.io.IOException;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Queue;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AudioChunkRecorderModule - React Native Bridge
 * 
 * Main module that exposes the API to JavaScript and coordinates
 * the audio recording functionality through specialized components.
 */
public class AudioChunkRecorderModule extends ReactContextBaseJavaModule implements AudioManager.OnAudioFocusChangeListener {
    private static final String TAG = "AudioChunkRecorder";

    // Core components
    private final AudioRecorderManager recorderManager;
    private final EventEmitter eventEmitter;
    private final PermissionManager permissionManager;
    private final FileManager fileManager;
    private final AudioManager audioManager;
    
    // Interruption handling
    private boolean interruptionEventSent = false;
    private long lastInterruptionEndTime = 0;
    private boolean hasAudioFocus = false;
    
    // Map pools for performance
    private final Queue<WritableMap> stateMapPool = new ConcurrentLinkedQueue<>();
    private final Queue<WritableMap> errorMapPool = new ConcurrentLinkedQueue<>();
    private final Queue<WritableMap> chunkMapPool = new ConcurrentLinkedQueue<>();

    public AudioChunkRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        
        // Initialize components
        this.eventEmitter = new EventEmitter(reactContext);
        this.permissionManager = new PermissionManager(reactContext);
        this.fileManager = new FileManager(reactContext);
        this.recorderManager = new AudioRecorderManager(eventEmitter, fileManager);
        this.audioManager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
        
        initializeMapPool();
        Log.i(TAG, "AudioChunkRecorderModule initialized");
    }

    @Override
    public String getName() { 
        return "AudioChunkRecorder"; 
    }

    /* ==============================================================
     *                MAP POOL MANAGEMENT
     * ============================================================== */

    private void initializeMapPool() {
        for (int i = 0; i < 5; i++) {
            stateMapPool.offer(Arguments.createMap());
            errorMapPool.offer(Arguments.createMap());
            chunkMapPool.offer(Arguments.createMap());
        }
    }

    private WritableMap getStateMap() {
        WritableMap m = stateMapPool.poll();
        return m != null ? m : Arguments.createMap();
    }

    private WritableMap getErrorMap() {
        WritableMap m = errorMapPool.poll();
        return m != null ? m : Arguments.createMap();
    }

    private WritableMap getChunkMap() {
        WritableMap m = chunkMapPool.poll();
        return m != null ? m : Arguments.createMap();
    }

    /* ==============================================================
     *                REACT NATIVE API METHODS
     * ============================================================== */

    @ReactMethod
    public void startRecording(ReadableMap options, Promise promise) {
        if (!permissionManager.hasPermission()) {
            promise.reject("permission_denied", "Audio recording permission not granted");
            return;
        }

        try {
            // Reset interruption state for new recording session
            interruptionEventSent = false;
            lastInterruptionEndTime = 0;
            
            // Request audio focus for recording
            if (!requestAudioFocus()) {
                promise.reject("audio_focus_denied", "Could not obtain audio focus");
                return;
            }
            
            int sampleRate = options.hasKey("sampleRate") ? options.getInt("sampleRate") : 16000;
            double chunkDuration = options.hasKey("chunkSeconds") ? options.getDouble("chunkSeconds") : 30.0;
            
            recorderManager.startRecording(sampleRate, chunkDuration);
            promise.resolve("Recording started");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording", e);
            promise.reject("start_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void stopRecording(Promise promise) {
        try {
            recorderManager.stopRecording();
            
            // Abandon audio focus and reset interruption state
            abandonAudioFocus();
            interruptionEventSent = false;
            lastInterruptionEndTime = 0;
            
            promise.resolve("Recording stopped");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping recording", e);
            promise.reject("stop_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void pauseRecording(Promise promise) {
        try {
            recorderManager.pauseRecording();
            promise.resolve("Recording paused");
        } catch (Exception e) {
            promise.reject("pause_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void resumeRecording(Promise promise) {
        try {
            recorderManager.resumeRecording();
            promise.resolve("Recording resumed");
        } catch (Exception e) {
            promise.reject("resume_failed", e.getMessage());
        }
    }

    /* ==============================================================
     *                QUERY METHODS
     * ============================================================== */

    @ReactMethod
    public void checkPermissions(Promise promise) { 
        promise.resolve(permissionManager.hasPermission()); 
    }

    @ReactMethod
    public void isAvailable(Promise promise) { 
        promise.resolve(true); 
    }

    @ReactMethod
    public void isRecording(Promise promise) { 
        promise.resolve(recorderManager.isRecording()); 
    }

    @ReactMethod
    public void isPaused(Promise promise) { 
        promise.resolve(recorderManager.isPaused()); 
    }

    @ReactMethod
    public void isPreviewActive(Promise promise) { 
        promise.resolve(recorderManager.isPreviewActive()); 
    }

    @ReactMethod
    public void getAudioLevel(Promise promise) { 
        promise.resolve(recorderManager.getAudioLevel()); 
    }

    @ReactMethod
    public void hasAudioSession(Promise promise) { 
        promise.resolve(true); 
    }

    @ReactMethod
    public void getCurrentChunkIndex(Promise promise) { 
        promise.resolve(recorderManager.getCurrentChunkIndex()); 
    }

    @ReactMethod
    public void getChunkDuration(Promise promise) { 
        promise.resolve(recorderManager.getChunkDuration()); 
    }

    @ReactMethod
    public void getRecordingState(Promise promise) {
        WritableMap state = getStateMap();
        state.putBoolean("isRecording", recorderManager.isRecording());
        state.putBoolean("isPaused", recorderManager.isPaused());
        state.putBoolean("isPreviewActive", recorderManager.isPreviewActive());
        state.putBoolean("isAvailable", true);
        state.putBoolean("hasPermission", permissionManager.hasPermission());
        state.putInt("currentChunkIndex", recorderManager.getCurrentChunkIndex());
        state.putDouble("chunkDuration", recorderManager.getChunkDuration());
        state.putDouble("audioLevel", recorderManager.getAudioLevel());
        promise.resolve(state);
    }

    @ReactMethod
    public void clearAllChunkFiles(Promise promise) {
        try {
            int deletedCount = fileManager.clearAllChunkFiles();
            recorderManager.resetChunkIndex();
            promise.resolve("Deleted " + deletedCount + " chunk files");
        } catch (Exception e) {
            promise.reject("FILE_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getModuleInfo(Promise promise) {
        WritableMap info = Arguments.createMap();
        info.putString("name", "AudioChunkRecorder");
        info.putString("version", "1.0.0-refactored");
        info.putString("platform", "Android");
        info.putBoolean("isSimplified", false);
        info.putBoolean("hasAudioLevelMonitoring", true);
        info.putBoolean("hasChunkSupport", true);
        info.putInt("sampleRate", 16000);
        info.putString("audioFormat", "PCM_16BIT");
        info.putString("channelConfig", "MONO");
        promise.resolve(info);
    }

    /* ==============================================================
     *                AUDIO LEVEL PREVIEW METHODS
     * ============================================================== */

    @ReactMethod
    public void startAudioLevelPreview(Promise promise) {
        if (!permissionManager.hasPermission()) {
            promise.reject("permission_denied", "Audio recording permission not granted");
            return;
        }

        try {
            // Request audio focus for monitoring
            if (!requestAudioFocus()) {
                promise.reject("audio_focus_denied", "Could not obtain audio focus");
                return;
            }
            
            recorderManager.startAudioLevelPreview();
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start audio level preview", e);
            promise.reject("preview_start_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void stopAudioLevelPreview(Promise promise) {
        try {
            recorderManager.stopAudioLevelPreview();
            
            // Abandon audio focus
            abandonAudioFocus();
            
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop audio level preview", e);
            promise.reject("preview_stop_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void getAudioRecordState(Promise promise) { 
        promise.resolve(recorderManager.getAudioRecordState()); 
    }

    /* ==============================================================
     *                MODULE CLEANUP
     * ============================================================== */

    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        cleanup();
    }

    private void cleanup() {
        try {
            recorderManager.cleanup();
            
            // Abandon audio focus and reset interruption state
            abandonAudioFocus();
            interruptionEventSent = false;
            lastInterruptionEndTime = 0;
            
            stateMapPool.clear(); 
            errorMapPool.clear(); 
            chunkMapPool.clear();
        } catch (Exception e) {
            Log.e(TAG, "cleanup error", e);
        }
    }

    @Override
    public void onAudioFocusChange(int focusChange) {
        Log.d(TAG, "Audio focus change: " + focusChange);
        
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                handleInterruptionBegan();
                break;
                
            case AudioManager.AUDIOFOCUS_GAIN:
                handleInterruptionEnded();
                break;
                
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                // For recording, we treat this as a full interruption
                handleInterruptionBegan();
                break;
        }
    }
    
    /**
     * Handle interruption began (phone call, other app, etc.)
     */
    private void handleInterruptionBegan() {
        boolean isActive = recorderManager.isRecording() || recorderManager.isPreviewActive();
        
        if (!isActive || interruptionEventSent) {
            return;
        }
        
        Log.d(TAG, "Audio interruption began");
        
        // Pause recording or stop preview for safety
        if (recorderManager.isRecording()) {
            recorderManager.pauseRecording();
        } else if (recorderManager.isPreviewActive()) {
            recorderManager.stopAudioLevelPreview();
        }
        
        // Send interruption event
        WritableMap interruptionData = Arguments.createMap();
        interruptionData.putString("type", "began");
        interruptionData.putString("reason", "phone_call_or_other_app");
        interruptionData.putBoolean("wasRecording", recorderManager.isRecording());
        interruptionData.putBoolean("nativePaused", true);
        
        eventEmitter.sendInterruptionEvent(interruptionData);
        interruptionEventSent = true;
    }
    
    /**
     * Handle interruption ended
     */
    private void handleInterruptionEnded() {
        long currentTime = System.currentTimeMillis();
        
        // Prevent duplicate events within 1 second
        if (currentTime - lastInterruptionEndTime < 1000) {
            return;
        }
        
        if (interruptionEventSent) {
            Log.d(TAG, "Audio interruption ended");
            
            lastInterruptionEndTime = currentTime;
            
            // Send interruption end event
            WritableMap interruptionData = Arguments.createMap();
            interruptionData.putString("type", "ended");
            interruptionData.putBoolean("shouldResume", true);
            interruptionData.putBoolean("canResume", recorderManager.isRecording() && recorderManager.isPaused());
            
            eventEmitter.sendInterruptionEvent(interruptionData);
            interruptionEventSent = false;
        }
    }
    
    /**
     * Request audio focus for recording
     */
    private boolean requestAudioFocus() {
        if (hasAudioFocus) {
            return true;
        }
        
        int result = audioManager.requestAudioFocus(
            this,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN
        );
        
        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        Log.d(TAG, "Audio focus request result: " + result + ", granted: " + hasAudioFocus);
        
        return hasAudioFocus;
    }
    
    /**
     * Abandon audio focus
     */
    private void abandonAudioFocus() {
        if (hasAudioFocus) {
            audioManager.abandonAudioFocus(this);
            hasAudioFocus = false;
            Log.d(TAG, "Audio focus abandoned");
        }
    }
}
