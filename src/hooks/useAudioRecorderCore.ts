/**
 * Core audio recorder hook - modular and framework-agnostic
 * This is the main hook that would be part of the NPM module
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";

import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";
import type {
  AudioRecorderCoreOptions,
  AudioRecorderCoreReturn,
  ChunkData,
  ErrorData,
  InterruptionData,
  StateChangeData,
  AudioLevelData,
  RecordingOptions,
} from "../types";
import { reactNativeAlertProvider } from "../providers/reactNativeAlertProvider";
import { createSimpleStateManager } from "../providers/simpleStateManager";

// Mock native module interface - in real implementation this would come from native
// Native interface - using the actual bridge
interface AudioRecorderNative {
  startRecording: (options: RecordingOptions) => Promise<string>;
  stopRecording: () => Promise<string>;
  pauseRecording: () => Promise<string>;
  resumeRecording: () => Promise<string>;
  clearAllChunkFiles: () => Promise<string>;
  checkPermissions: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
}

// Performance constants
const AUDIO_LEVEL_THROTTLE_MS = 100; // Throttle audio level updates
const STATE_UPDATE_DEBOUNCE_MS = 50; // Debounce state updates

// Optimized event listener manager
class EventListenerManager {
  private listeners = {
    onChunkReady: new Set<(chunk: ChunkData) => void>(),
    onAudioLevel: new Set<(levelData: AudioLevelData) => void>(),
    onError: new Set<(error: ErrorData) => void>(),
    onInterruption: new Set<(interruption: InterruptionData) => void>(),
    onStateChange: new Set<(state: StateChangeData) => void>(),
  };

  private nativeListeners: any[] = [];
  private lastAudioLevelUpdate = 0;
  private stateUpdateTimeout: NodeJS.Timeout | null = null;

  addListener<T extends keyof typeof this.listeners>(
    event: T,
    callback: Parameters<(typeof this.listeners)[T]["add"]>[0]
  ) {
    this.listeners[event].add(callback as any);
  }

  removeListener<T extends keyof typeof this.listeners>(
    event: T,
    callback: Parameters<(typeof this.listeners)[T]["add"]>[0]
  ) {
    this.listeners[event].delete(callback as any);
  }

  notifyListeners<T extends keyof typeof this.listeners>(
    event: T,
    data: Parameters<Parameters<(typeof this.listeners)[T]["add"]>[0]>[0]
  ) {
    // Throttle audio level updates for performance
    if (event === "onAudioLevel") {
      const now = Date.now();
      if (now - this.lastAudioLevelUpdate < AUDIO_LEVEL_THROTTLE_MS) {
        return;
      }
      this.lastAudioLevelUpdate = now;
    }

    this.listeners[event].forEach((listener: any) => {
      try {
        listener(data);
      } catch (error) {
        console.error(`AudioRecorderCore: Error in ${event} listener:`, error);
      }
    });
  }

  setupNativeListeners(
    options: AudioRecorderCoreOptions,
    stateManager: any,
    alertProvider: any,
    updateState: (updates: any) => void
  ) {
    // Clear existing listeners
    this.cleanup();

    // Chunk ready listener
    const chunkListener = AudioChunkRecorderEventEmitter.addListener(
      "onChunkReady",
      (chunk: ChunkData) => {
        console.log("AudioRecorderCore: Chunk ready:", chunk);
        this.notifyListeners("onChunkReady", chunk);
        options.onChunkReady?.(chunk);

        // Upload chunk if uploader is provided
        if (options.chunkUploader) {
          console.log("AudioRecorderCore: Uploading chunk via chunkUploader");
          options.chunkUploader.upload(chunk).catch((error) => {
            console.error("AudioRecorderCore: Chunk upload failed:", error);
            options.chunkUploader?.onError?.(
              chunk.seq.toString(),
              error.message || "Upload failed"
            );
          });
        }
      }
    );

    // Audio level listener with throttling
    const levelListener = AudioChunkRecorderEventEmitter.addListener(
      "onAudioLevel",
      (data: AudioLevelData) => {
        // Update state directly for audio level
        updateState({ audioLevel: data.level, hasAudio: data.hasAudio });
        this.notifyListeners("onAudioLevel", data);
      }
    );

    // Error listener
    const errorListener = AudioChunkRecorderEventEmitter.addListener(
      "onError",
      (error: ErrorData) => {
        console.error("AudioRecorderCore: Native error:", error);
        this.notifyListeners("onError", error);
        options.onError?.(error);
      }
    );

    // State change listener with debouncing
    const stateListener = AudioChunkRecorderEventEmitter.addListener(
      "onStateChange",
      (state: StateChangeData) => {
        console.log(
          "AudioRecorderCore: 🔄 State change received from native:",
          state
        );

        // Update state directly for recording state
        updateState({
          isRecording: state.isRecording,
          isPaused: state.isPaused,
        });

        // Debounce state updates to prevent excessive re-renders
        if (this.stateUpdateTimeout) {
          clearTimeout(this.stateUpdateTimeout);
        }

        this.stateUpdateTimeout = setTimeout(() => {
          this.notifyListeners("onStateChange", state);
          options.onStateChange?.(state);
        }, STATE_UPDATE_DEBOUNCE_MS);
      }
    );

    // Interruption listener
    const interruptionListener = AudioChunkRecorderEventEmitter.addListener(
      "onInterruption",
      (interruption: InterruptionData) => {
        console.log("AudioRecorderCore: Interruption:", interruption);
        this.notifyListeners("onInterruption", interruption);

        // Update global state
        if (interruption.type === "began") {
          updateState({ isInterrupted: true });
          stateManager.setState("audioInterruption", true);
        } else if (interruption.type === "ended") {
          updateState({ isInterrupted: false });
          stateManager.setState("audioInterruption", false);
        }

        // Handle interruption with custom handler or default behavior
        if (options.interruptionHandler) {
          if (interruption.type === "audioDeviceDisconnected") {
            options.interruptionHandler.onDeviceDisconnected(interruption);
          } else {
            options.interruptionHandler.onInterruption(interruption);
          }
        } else {
          // Default interruption handling
          this.handleInterruptionDefault(interruption, alertProvider);
        }

        options.onInterruption?.(interruption);
      }
    );

    this.nativeListeners = [
      chunkListener,
      levelListener,
      errorListener,
      stateListener,
      interruptionListener,
    ];
  }

  private handleInterruptionDefault(
    interruption: InterruptionData,
    alertProvider: any
  ) {
    if (interruption.type === "began") {
      alertProvider.showAlert(
        "Call in Progress",
        "Recording paused due to incoming call. Recording will resume when the call ends.",
        [{ text: "OK" }]
      );
    } else if (interruption.type === "audioDeviceDisconnected") {
      alertProvider.showAlert(
        "Audio Device Disconnected",
        "Your audio device was disconnected. Please reconnect and try again.",
        [{ text: "OK" }]
      );
    }
  }

  cleanup() {
    this.nativeListeners.forEach((listener) => {
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    });
    this.nativeListeners = [];

    if (this.stateUpdateTimeout) {
      clearTimeout(this.stateUpdateTimeout);
      this.stateUpdateTimeout = null;
    }
  }
}

export const useAudioRecorderCore = (
  options: AudioRecorderCoreOptions = {}
): AudioRecorderCoreReturn => {
  // Use provided dependencies or defaults - memoized to prevent re-creation
  const alertProvider = useMemo(
    () => options.alertProvider || reactNativeAlertProvider,
    [options.alertProvider]
  );
  const stateManager = useMemo(
    () => options.stateManager || createSimpleStateManager(),
    [options.stateManager]
  );

  // Local state with optimized updates
  const [state, setState] = useState({
    isRecording: false,
    isPaused: false,
    hasPermission: false,
    chunks: [] as ChunkData[],
    audioLevel: 0,
    hasAudio: false,
    isAvailable: false,
    isInterrupted: false,
  });

  // Event listener manager - singleton instance
  const eventManagerRef = useRef<EventListenerManager>();
  if (!eventManagerRef.current) {
    eventManagerRef.current = new EventListenerManager();
  }

  // Service ref
  const serviceRef = useRef<AudioRecorderNative | null>(null);

  // Auto start tracking
  const autoStartAttemptedRef = useRef(false);

  // Memoized state setters to prevent unnecessary re-renders
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Initialize service - only once
  useEffect(() => {
    try {
      serviceRef.current = NativeAudioChunkRecorder;
      NativeAudioChunkRecorder.isAvailable()
        .then((available) => {
          setState((prev) => ({ ...prev, isAvailable: available }));
        })
        .catch((error) => {
          console.error(
            "AudioRecorderCore: Failed to check availability:",
            error
          );
          setState((prev) => ({ ...prev, isAvailable: false }));
        });
    } catch (error) {
      console.error("AudioRecorderCore: Failed to initialize service:", error);
      setState((prev) => ({ ...prev, isAvailable: false }));
    }
  }, []); // Empty dependency array - only run once

  // Setup native event listeners - optimized dependencies
  useEffect(() => {
    if (!serviceRef.current) return;

    eventManagerRef.current!.setupNativeListeners(
      options,
      stateManager,
      alertProvider,
      updateState
    );

    return () => {
      eventManagerRef.current!.cleanup();
    };
  }, [
    options.onChunkReady,
    options.onError,
    options.onStateChange,
    options.onInterruption,
    options.chunkUploader,
    options.interruptionHandler,
    updateState,
  ]); // Add updateState to dependencies

  // Memoized actions to prevent unnecessary re-creation
  const startRecording = useCallback(
    async (recordingOptions?: RecordingOptions) => {
      console.log("AudioRecorderCore: 🚀 startRecording called");

      if (!serviceRef.current) {
        throw new Error("AudioRecorderCore: Service not available");
      }

      // Check if already recording to avoid "Recording is already in progress" error
      if (state.isRecording) {
        console.log(
          "AudioRecorderCore: ⚠️ Already recording, skipping start request"
        );
        return;
      }

      try {
        const finalOptions = {
          ...options.defaultRecordingOptions,
          ...recordingOptions,
        };
        console.log(
          "AudioRecorderCore: 🚀 Calling native startRecording with options:",
          finalOptions
        );

        const result = await serviceRef.current.startRecording(finalOptions);
        console.log(
          "AudioRecorderCore: 🚀 Native startRecording result:",
          result
        );
      } catch (error) {
        console.error("AudioRecorderCore: ❌ Start recording failed:", error);
        throw error;
      }
    },
    [state.isRecording, options.defaultRecordingOptions]
  );

  const stopRecording = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      await serviceRef.current.stopRecording();
    } catch (error) {
      console.error("AudioRecorderCore: Stop recording failed:", error);
      throw error;
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      await serviceRef.current.pauseRecording();
    } catch (error) {
      console.error("AudioRecorderCore: Pause recording failed:", error);
      throw error;
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      await serviceRef.current.resumeRecording();
    } catch (error) {
      console.error("AudioRecorderCore: Resume recording failed:", error);
      throw error;
    }
  }, []);

  const clearChunks = useCallback(() => {
    updateState({ chunks: [] });
    // Note: clearAllChunkFiles is async, but we don't await here for backwards compatibility
    serviceRef.current?.clearAllChunkFiles().catch((error: unknown) => {
      console.error("AudioRecorderCore: Failed to clear chunk files:", error);
    });
  }, [updateState]);

  const clearAllChunkFiles = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      await serviceRef.current.clearAllChunkFiles();
      updateState({ chunks: [] });
    } catch (error) {
      console.error("AudioRecorderCore: Clear files failed:", error);
      throw error;
    }
  }, [updateState]);

  const checkPermissions = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      const granted = await serviceRef.current.checkPermissions();
      updateState({ hasPermission: granted });
    } catch (error) {
      console.error("AudioRecorderCore: Check permissions failed:", error);
      updateState({ hasPermission: false });
      throw error;
    }
  }, [updateState]);

  // Auto check permissions on mount - moved after checkPermissions definition
  useEffect(() => {
    if (options.autoCheckPermissions !== false && serviceRef.current) {
      (async () => {
        await checkPermissions();
      })();
    }
  }, [options.autoCheckPermissions, checkPermissions]);

  // Auto start recording when conditions are met
  useEffect(() => {
    if (
      options.autoStartRecording &&
      state.isAvailable &&
      state.hasPermission &&
      !state.isRecording &&
      !state.isPaused &&
      !autoStartAttemptedRef.current &&
      serviceRef.current
    ) {
      console.log("AudioRecorderCore: Auto-starting recording...");
      autoStartAttemptedRef.current = true;
      startRecording().catch((error: unknown) => {
        console.error("AudioRecorderCore: Auto-start failed:", error);
        // Reset flag on error so it can try again
        autoStartAttemptedRef.current = false;
      });
    }
  }, [
    options.autoStartRecording,
    state.isAvailable,
    state.hasPermission,
    state.isRecording,
    state.isPaused,
    startRecording,
  ]);

  // Optimized event subscription methods with memoization
  const onChunkReady = useCallback((callback: (chunk: ChunkData) => void) => {
    eventManagerRef.current!.addListener("onChunkReady", callback);
    return () => {
      eventManagerRef.current!.removeListener("onChunkReady", callback);
    };
  }, []);

  const onAudioLevel = useCallback(
    (callback: (levelData: AudioLevelData) => void) => {
      eventManagerRef.current!.addListener("onAudioLevel", callback);
      return () => {
        eventManagerRef.current!.removeListener("onAudioLevel", callback);
      };
    },
    []
  );

  const onError = useCallback((callback: (error: ErrorData) => void) => {
    eventManagerRef.current!.addListener("onError", callback);
    return () => {
      eventManagerRef.current!.removeListener("onError", callback);
    };
  }, []);

  const onInterruption = useCallback(
    (callback: (interruption: InterruptionData) => void) => {
      eventManagerRef.current!.addListener("onInterruption", callback);
      return () => {
        eventManagerRef.current!.removeListener("onInterruption", callback);
      };
    },
    []
  );

  const onStateChange = useCallback(
    (callback: (state: StateChangeData) => void) => {
      eventManagerRef.current!.addListener("onStateChange", callback);
      return () => {
        eventManagerRef.current!.removeListener("onStateChange", callback);
      };
    },
    []
  );

  // Memoized return object to prevent unnecessary re-renders
  const returnValue = useMemo<AudioRecorderCoreReturn>(
    () => ({
      // Service
      service: serviceRef.current,

      // State
      isRecording: state.isRecording,
      isPaused: state.isPaused,
      hasPermission: state.hasPermission,
      chunks: state.chunks,
      audioLevel: state.audioLevel,
      hasAudio: state.hasAudio,
      isAvailable: state.isAvailable,
      isInterrupted: state.isInterrupted,

      // Actions
      startRecording,
      stopRecording,
      pauseRecording,
      resumeRecording,
      clearChunks,
      clearAllChunkFiles,
      checkPermissions,

      // Event handlers
      onChunkReady,
      onAudioLevel,
      onError,
      onInterruption,
      onStateChange,
    }),
    [
      state.isRecording,
      state.isPaused,
      state.hasPermission,
      state.chunks,
      state.audioLevel,
      state.hasAudio,
      state.isAvailable,
      state.isInterrupted,
      startRecording,
      stopRecording,
      pauseRecording,
      resumeRecording,
      clearChunks,
      clearAllChunkFiles,
      checkPermissions,
      onChunkReady,
      onAudioLevel,
      onError,
      onInterruption,
      onStateChange,
    ]
  );

  return returnValue;
};
