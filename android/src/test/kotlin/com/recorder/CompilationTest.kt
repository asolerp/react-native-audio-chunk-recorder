package com.recorder

import com.recorder.engine.RecorderEngine
import com.recorder.rotation.RotationManager
import com.recorder.rotation.RecorderEventSink
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.File

class CompilationTest {
    
    @Test
    fun testRecorderEngineCompilation() {
        val engine = RecorderEngine()
        // This test just verifies that the class compiles correctly
    }
    
    @Test
    fun testRotationManagerCompilation() {
        val eventSink = object : RecorderEventSink {
            override fun onStateChange(isRecording: Boolean, isPaused: Boolean) {}
            override fun onChunkReady(path: String, seq: Int) {}
            override fun onError(message: String) {}
        }
        
        val rotationManager = RotationManager(eventSink)
        // This test just verifies that the class compiles correctly
    }
} 