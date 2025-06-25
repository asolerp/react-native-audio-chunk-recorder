package com.audiochunkrecorder;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
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
 * AudioChunkRecorderModule
 * 
 * Complete implementation with continuous buffer reading to avoid
 * audio levels always being 0.
 */
public class AudioChunkRecorderModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AudioChunkRecorder";

    private static final int SAMPLE_RATE     = 16000; // Standard for voice recording
    private static final int CHANNEL_CONFIG  = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT    = AudioFormat.ENCODING_PCM_16BIT;

    // -------------------------------------------------------
    //  Recording state and configuration
    // -------------------------------------------------------
    private AudioRecord audioRecord;
    private volatile boolean isRecording = false;
    private volatile boolean isPaused    = false;

    private final AtomicInteger currentChunkIndex = new AtomicInteger(0);
    private double   chunkDuration   = 30.0; // seconds (default 30)

    private Timer chunkTimer;
    private File  recordingDirectory;

    // Audio level
    private volatile double lastAudioLevel = 0.0;          // 0.0 – 1.0
    private static final double AUDIO_LEVEL_DELTA = 0.02;  // threshold for emitting events

    // Audio data collection
    private ByteArrayOutputStream audioDataBuffer;
    private final Object audioDataLock = new Object();

    // Continuous reading
    private ExecutorService recorderExecutor;

    // Synchronization
    private final Object stateLock  = new Object();
    private final Object mapPoolLock = new Object();

    // -------------------------------------------------------
    //  Map pools to reduce allocations
    // -------------------------------------------------------
    private final Queue<WritableMap> stateMapPool = new ConcurrentLinkedQueue<>();
    private final Queue<WritableMap> errorMapPool = new ConcurrentLinkedQueue<>();
    private final Queue<WritableMap> chunkMapPool = new ConcurrentLinkedQueue<>();

    // -------------------------------------------------------
    //  Constructor
    // -------------------------------------------------------
    public AudioChunkRecorderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        setupRecordingDirectory();
        initializeMapPool();
        Log.i(TAG, "AudioChunkRecorderModule initialized");
    }

    @Override
    public String getName() { return "AudioChunkRecorder"; }

    /* ==============================================================
     *                AUXILIARY METHODS (directories, pools)
     * ============================================================== */

    private void setupRecordingDirectory() {
        Context ctx = getReactApplicationContext();
        recordingDirectory = new File(ctx.getFilesDir(), "AudioChunks");
        if (!recordingDirectory.exists()) recordingDirectory.mkdirs();
    }

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
     *                SENDING EVENTS TO JAVASCRIPT
     * ============================================================== */

    private void sendEvent(String name, WritableMap params) {
        ReactApplicationContext ctx = getReactApplicationContext();
        if (ctx != null && ctx.hasActiveCatalystInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
               .emit(name, params);
        } else {
            Log.w(TAG, "React context not ready → event " + name + " lost");
        }
    }

    private void sendStateChangeEvent() {
        WritableMap map = getStateMap();
        synchronized (stateLock) {
            map.putBoolean("isRecording", isRecording);
            map.putBoolean("isPaused",    isPaused);
        }
        sendEvent("onStateChange", map);
    }

    private void sendErrorEvent(String message) {
        WritableMap map = getErrorMap();
        map.putString("message", message);
        sendEvent("onError", map);
    }

    private void sendAudioLevelEvent(double level) {
        WritableMap map = Arguments.createMap();
        map.putDouble("level", level);
        map.putBoolean("hasAudio", level > 0.01);
        sendEvent("onAudioLevel", map);
    }

    /* ==============================================================
     *      METHODS EXPOSED TO REACT NATIVE (public API)
     * ============================================================== */

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

        int sampleRate = options.hasKey("sampleRate") ? options.getInt("sampleRate") : SAMPLE_RATE;
        chunkDuration  = options.hasKey("chunkSeconds") ? options.getDouble("chunkSeconds") : 30.0;

        try {
            startNewChunk(sampleRate);
            promise.resolve("Recording started");
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
            stopCaptureLoop();

            if (chunkTimer != null) { chunkTimer.cancel(); chunkTimer = null; }
            if (!isPaused) finishCurrentChunk();

            if (audioRecord != null) { audioRecord.release(); audioRecord = null; }

            synchronized (stateLock) {
                isRecording = false;
                isPaused    = false;
            }
            sendStateChangeEvent();
            promise.resolve("Recording stopped");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping recording", e);
            promise.reject("stop_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void pauseRecording(Promise promise) {
        if (!isRecording || isPaused) {
            promise.reject("invalid_state", "Cannot pause");
            return;
        }
        try {
            if (audioRecord != null) audioRecord.stop();
            if (chunkTimer  != null) { chunkTimer.cancel(); chunkTimer = null; }
            isPaused = true;
            sendStateChangeEvent();
            promise.resolve("Recording paused");
        } catch (Exception e) {
            promise.reject("pause_failed", e.getMessage());
        }
    }

    @ReactMethod
    public void resumeRecording(Promise promise) {
        if (!isRecording || !isPaused) {
            promise.reject("invalid_state", "Cannot resume");
            return;
        }
        try {
            if (audioRecord != null) audioRecord.startRecording();
            isPaused = false;
            scheduleRotation(chunkDuration);
            sendStateChangeEvent();
            promise.resolve("Recording resumed");
        } catch (Exception e) {
            promise.reject("resume_failed", e.getMessage());
        }
    }

    /* -------------  query/permission utilities ------------- */

    @ReactMethod
    public void checkPermissions(Promise promise) { promise.resolve(checkPermissions()); }

    @ReactMethod
    public void isAvailable(Promise promise) { promise.resolve(true); }

    @ReactMethod
    public void isRecording(Promise promise) { promise.resolve(isRecording); }

    @ReactMethod
    public void isPaused(Promise promise) { promise.resolve(isPaused); }

    @ReactMethod
    public void getAudioLevel(Promise promise) { promise.resolve(lastAudioLevel); }

    @ReactMethod
    public void hasAudioSession(Promise promise) { promise.resolve(true); }

    @ReactMethod
    public void getCurrentChunkIndex(Promise promise) { promise.resolve(currentChunkIndex.get()); }

    @ReactMethod
    public void getChunkDuration(Promise promise) { promise.resolve(chunkDuration); }

    @ReactMethod
    public void getRecordingState(Promise promise) {
        WritableMap state = Arguments.createMap();
        synchronized (stateLock) {
            state.putBoolean("isRecording", isRecording);
            state.putBoolean("isPaused",    isPaused);
        }
        state.putBoolean("isAvailable", true);
        state.putBoolean("hasPermission", checkPermissions());
        state.putInt("currentChunkIndex", currentChunkIndex.get());
        state.putDouble("chunkDuration", chunkDuration);
        state.putDouble("audioLevel", lastAudioLevel);
        promise.resolve(state);
    }

    @ReactMethod
    public void clearAllChunkFiles(Promise promise) {
        try {
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
            currentChunkIndex.set(0);
            promise.resolve("Deleted " + deletedCount + " chunk files");
        } catch (Exception e) {
            promise.reject("FILE_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getModuleInfo(Promise promise) {
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
    }

    /* ==============================================================
     *            CAPTURE AND CHUNK ROTATION (core)
     * ============================================================== */

    private void startNewChunk(int sampleRate) throws Exception {
        int bufferSize = AudioRecord.getMinBufferSize(sampleRate, CHANNEL_CONFIG, AUDIO_FORMAT);
        
        // Ensure minimum buffer size
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
        isPaused    = false;

        // Initialize audio data buffer
        synchronized (audioDataLock) {
            audioDataBuffer = new ByteArrayOutputStream();
        }

        startCaptureLoop(bufferSize, sampleRate);
        scheduleRotation(chunkDuration);
        sendStateChangeEvent();
    }

    /* --------  continuous buffer reading (main FIX)  -------- */

    private void startCaptureLoop(int bufferSize, int sampleRate) {
        if (recorderExecutor == null || recorderExecutor.isShutdown()) {
            recorderExecutor = Executors.newSingleThreadExecutor();
        }
        final short[] buffer = new short[Math.max(256, bufferSize)];

        recorderExecutor.execute(() -> {
            while (isRecording) {
                if (isPaused || audioRecord == null) {
                    try { Thread.sleep(20); } catch (InterruptedException ignored) {}
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

                double sum = 0;
                for (int i = 0; i < read; i++) sum += buffer[i] * buffer[i];
                double rms = Math.sqrt(sum / read) / 32768.0;
                if (rms > 1.0) rms = 1.0;

                if (Math.abs(rms - lastAudioLevel) >= AUDIO_LEVEL_DELTA) {
                    lastAudioLevel = rms;
                    sendAudioLevelEvent(rms);
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
                try { audioDataBuffer.close(); } catch (IOException ignored) {}
                audioDataBuffer = null;
            }
        }
    }

    /* -------------------------- rotation --------------------------- */

    private void scheduleRotation(double delaySeconds) {
        if (chunkTimer != null) chunkTimer.cancel();
        chunkTimer = new Timer();
        long delayMs = (long) (delaySeconds * 1000);
        chunkTimer.schedule(new TimerTask() {
            @Override public void run() {
                if (isRecording && !isPaused) {
                    finishCurrentChunk();
                    try { 
                        // Use the same sample rate as the current recording
                        int currentSampleRate = SAMPLE_RATE;
                        try {
                            if (audioRecord != null) {
                                currentSampleRate = audioRecord.getSampleRate();
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "Could not get current sample rate, using default");
                        }
                        startNewChunk(currentSampleRate); 
                    }
                    catch (Exception e) { sendErrorEvent(e.getMessage()); }
                }
            }
        }, delayMs);
    }

    private void finishCurrentChunk() {
        if (audioRecord != null && isRecording && !isPaused) {
            audioRecord.stop();
            String fileName = "chunk_" + currentChunkIndex.get() + ".wav";
            File file = new File(recordingDirectory, fileName);
            
            // Write WAV file with actual audio data
            try {
                byte[] audioData;
                synchronized (audioDataLock) {
                    audioData = audioDataBuffer != null ? audioDataBuffer.toByteArray() : new byte[0];
                    audioDataBuffer = new ByteArrayOutputStream(); // Reset for next chunk
                }
                
                // Get the actual sample rate from the current recording
                int actualSampleRate = SAMPLE_RATE; // Default fallback
                try {
                    actualSampleRate = audioRecord.getSampleRate();
                } catch (Exception e) {
                    Log.w(TAG, "Could not get sample rate, using default: " + SAMPLE_RATE);
                }
                writeWavFile(file, audioData, actualSampleRate);
            } catch (IOException e) {
                Log.e(TAG, "Error writing WAV file: " + e.getMessage());
            }
            
            synchronized (mapPoolLock) {
                WritableMap map = getChunkMap();
                map.putString("uri",  file.getAbsolutePath());
                map.putString("path", file.getAbsolutePath());
                map.putInt("seq", currentChunkIndex.get());
                sendEvent("onChunkReady", map);
            }
            currentChunkIndex.incrementAndGet();
        }
    }

    /* ==============================================================
     *                      MODULE CLEANUP
     * ============================================================== */

    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        cleanup();
    }

    private void cleanup() {
        try {
            stopCaptureLoop();
            if (audioRecord != null) { audioRecord.release(); audioRecord = null; }
            if (chunkTimer  != null) { chunkTimer.cancel(); chunkTimer = null; }
            stateMapPool.clear(); errorMapPool.clear(); chunkMapPool.clear();
            // Clear audio data buffer
            synchronized (audioDataLock) {
                if (audioDataBuffer != null) {
                    try { audioDataBuffer.close(); } catch (IOException ignored) {}
                    audioDataBuffer = null;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "cleanup error", e);
        }
    }

    /* ==============================================================
     *                  PERMISSIONS AND VARIOUS CHECKS
     * ============================================================== */
    private boolean checkPermissions() {
        return ActivityCompat.checkSelfPermission(
                getReactApplicationContext(),
                Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    /* ==============================================================
     *                  WAV FILE WRITING
     * ============================================================== */
    
    private void writeWavFile(File file, byte[] audioData, int sampleRate) throws IOException {
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
            header.putInt(sampleRate * 2); // Byte rate (sampleRate * channels * bitsPerSample/8) = 16000 * 1 * 16/8 = 32000
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
}
