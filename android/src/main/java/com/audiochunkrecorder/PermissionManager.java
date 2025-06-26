package com.audiochunkrecorder;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import com.facebook.react.bridge.ReactApplicationContext;

/**
 * PermissionManager - Handles audio recording permissions
 * 
 * Centralized permission checking for audio recording functionality.
 */
public class PermissionManager {
    private final ReactApplicationContext reactContext;

    public PermissionManager(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    /**
     * Check if audio recording permission is granted
     */
    public boolean hasPermission() {
        return ActivityCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Get the permission string for audio recording
     */
    public String getPermissionString() {
        return Manifest.permission.RECORD_AUDIO;
    }
} 