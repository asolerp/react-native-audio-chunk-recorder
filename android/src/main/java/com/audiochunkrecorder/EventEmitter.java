package com.audiochunkrecorder;

import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * EventEmitter - Handles all React Native event emissions
 * 
 * Centralized event emission to JavaScript with proper error handling
 * and context validation.
 */
public class EventEmitter {
    private static final String TAG = "EventEmitter";
    private final ReactApplicationContext reactContext;

    public EventEmitter(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    /**
     * Send a generic event to JavaScript
     */
    public void sendEvent(String name, WritableMap params) {
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                       .emit(name, params);
        } else {
            Log.w(TAG, "React context not ready → event " + name + " lost");
        }
    }

    /**
     * Send state change event
     */
    public void sendStateChangeEvent(boolean isRecording, boolean isPaused) {
        WritableMap map = Arguments.createMap();
        map.putBoolean("isRecording", isRecording);
        map.putBoolean("isPaused", isPaused);
        sendEvent("onStateChange", map);
    }

    /**
     * Send error event
     */
    public void sendErrorEvent(String message) {
        WritableMap map = Arguments.createMap();
        map.putString("message", message);
        sendEvent("onError", map);
    }

    /**
     * Send audio level event
     */
    public void sendAudioLevelEvent(double level) {
        WritableMap map = Arguments.createMap();
        map.putDouble("level", level);
        map.putBoolean("hasAudio", level > 0.01);
        sendEvent("onAudioLevel", map);
    }

    /**
     * Send chunk ready event
     */
    public void sendChunkReadyEvent(String path, int sequence) {
        WritableMap map = Arguments.createMap();
        map.putString("uri", path);
        map.putString("path", path);
        map.putInt("seq", sequence);
        sendEvent("onChunkReady", map);
    }

    /**
     * Send interruption event
     */
    public void sendInterruptionEvent(WritableMap interruptionData) {
        sendEvent("onInterruption", interruptionData);
    }
} 