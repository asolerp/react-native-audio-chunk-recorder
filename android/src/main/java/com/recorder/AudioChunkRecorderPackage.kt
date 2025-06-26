package com.recorder

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * AudioChunkRecorderPackage
 * 
 * React Native package for the AudioChunkRecorder module.
 * Updated to use the new modular Kotlin implementation.
 */
class AudioChunkRecorderPackage : ReactPackage {
    
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AudioChunkRecorderModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
    
    companion object {
        const val PACKAGE_NAME = "com.recorder.AudioChunkRecorderPackage"
    }
} 