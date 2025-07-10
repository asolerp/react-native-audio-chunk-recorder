import { NativeAudioChunkRecorder } from "../NativeAudioChunkRecorder";

export type AudioActivityType = "recording" | "monitoring";

export interface AudioManagerListener {
  (type: AudioActivityType, active: boolean): void;
}

/**
 * Global Audio Manager - Coordinates all audio hooks to prevent conflicts
 *
 * This manager ensures that only one audio activity (recording or monitoring)
 * can be active at a time, preventing "Recording is already in progress" errors.
 */
class AudioManager {
  private static instance: AudioManager;
  private isRecording = false;
  private isMonitoring = false;
  private listeners = new Set<AudioManagerListener>();
  private nativeService: any = null;
  private initializationPromise: Promise<void>;

  private constructor() {
    this.initializationPromise = this.initializeNativeService();
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private async initializeNativeService(): Promise<void> {
    try {
      this.nativeService = NativeAudioChunkRecorder;
      const isAvailable = await this.nativeService.isAvailable();
      if (!isAvailable) {
        console.error("AudioManager: Native service not available");
      }
    } catch (error) {
      console.error(
        "AudioManager: Failed to initialize native service:",
        error
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
    if (!this.nativeService) {
      throw new Error("AudioManager: Native service not available");
    }
  }

  /**
   * Start recording - will stop monitoring if active
   */
  async startRecording(options?: any): Promise<string> {
    console.log("AudioManager: 🚀 startRecording called");

    await this.ensureInitialized();

    if (this.isRecording) {
      console.log("AudioManager: ⚠️ Already recording, skipping start request");
      return "Already recording";
    }

    // Stop monitoring if active
    if (this.isMonitoring) {
      console.log(
        "AudioManager: 🛑 Stopping monitoring before starting recording"
      );
      await this.stopMonitoring();
    }

    try {
      const result = await this.nativeService.startRecording(options);
      this.isRecording = true;
      this.notifyListeners("recording", true);
      console.log("AudioManager: 🚀 Recording started successfully:", result);
      return result;
    } catch (error) {
      console.error("AudioManager: ❌ Start recording failed:", error);
      throw error;
    }
  }

  /**
   * Start monitoring - will fail if recording is active
   */
  async startMonitoring(options?: any): Promise<string> {
    console.log("AudioManager: 🚀 startMonitoring called");

    await this.ensureInitialized();

    if (this.isMonitoring) {
      console.log(
        "AudioManager: ⚠️ Already monitoring, skipping start request"
      );
      return "Already monitoring";
    }

    if (this.isRecording) {
      const error =
        "AudioManager: Recording in progress. Stop recording first.";
      console.error(error);
      throw new Error(error);
    }

    try {
      const result = await this.nativeService.startRecording(options);
      this.isMonitoring = true;
      this.notifyListeners("monitoring", true);
      console.log("AudioManager: 🚀 Monitoring started successfully:", result);
      return result;
    } catch (error) {
      console.error("AudioManager: ❌ Start monitoring failed:", error);
      throw error;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<string> {
    console.log("AudioManager: 🛑 stopRecording called");

    await this.ensureInitialized();

    if (!this.isRecording) {
      console.log("AudioManager: ⚠️ Not recording, skipping stop request");
      return "Not recording";
    }

    try {
      const result = await this.nativeService.stopRecording();
      this.isRecording = false;
      this.notifyListeners("recording", false);
      console.log("AudioManager: 🛑 Recording stopped successfully:", result);
      return result;
    } catch (error) {
      console.error("AudioManager: ❌ Stop recording failed:", error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<string> {
    console.log("AudioManager: 🛑 stopMonitoring called");

    await this.ensureInitialized();

    if (!this.isMonitoring) {
      console.log("AudioManager: ⚠️ Not monitoring, skipping stop request");
      return "Not monitoring";
    }

    try {
      const result = await this.nativeService.stopRecording();
      this.isMonitoring = false;
      this.notifyListeners("monitoring", false);
      console.log("AudioManager: 🛑 Monitoring stopped successfully:", result);
      return result;
    } catch (error) {
      console.error("AudioManager: ❌ Stop monitoring failed:", error);
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      isRecording: this.isRecording,
      isMonitoring: this.isMonitoring,
      hasActiveAudio: this.isRecording || this.isMonitoring,
    };
  }

  /**
   * Add listener for state changes
   */
  addListener(listener: AudioManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(type: AudioActivityType, active: boolean) {
    console.log(`AudioManager: 📢 Notifying listeners - ${type}: ${active}`);
    this.listeners.forEach((listener) => {
      try {
        listener(type, active);
      } catch (error) {
        console.error("AudioManager: Error in listener:", error);
      }
    });
  }

  /**
   * Force stop all audio activities
   */
  async forceStopAll(): Promise<void> {
    console.log("AudioManager: 🚨 Force stopping all audio activities");

    if (this.isRecording) {
      await this.stopRecording();
    }

    if (this.isMonitoring) {
      await this.stopMonitoring();
    }
  }

  /**
   * Cleanup - call when app is shutting down
   */
  cleanup() {
    console.log("AudioManager: 🧹 Cleaning up");
    this.listeners.clear();
    this.isRecording = false;
    this.isMonitoring = false;
  }
}

// Export singleton instance
export const audioManager = AudioManager.getInstance();
