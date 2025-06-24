/**
 * Core audio recorder hook - modular and framework-agnostic
 * This is the main hook that would be part of the NPM module
 */

import { useRef, useEffect, useCallback, useState } from "react";

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

// This would be imported from the native module
// For now, we'll inject it via options
// declare const AudioRecorderService: AudioRecorderNative;

export const useAudioRecorderCore = (
  options: AudioRecorderCoreOptions = {}
): AudioRecorderCoreReturn => {
  // Use provided dependencies or defaults
  const alertProvider = options.alertProvider || reactNativeAlertProvider;
  const stateManager = options.stateManager || createSimpleStateManager();

  // Local state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  // Global state (shared across hook instances)
  const [isInterrupted, setIsInterrupted] = useState(false);

  // Event listeners refs
  const listenersRef = useRef<{
    onChunkReady: Set<(chunk: ChunkData) => void>;
    onAudioLevel: Set<(levelData: AudioLevelData) => void>;
    onError: Set<(error: ErrorData) => void>;
    onInterruption: Set<(interruption: InterruptionData) => void>;
    onStateChange: Set<(state: StateChangeData) => void>;
  }>({
    onChunkReady: new Set(),
    onAudioLevel: new Set(),
    onError: new Set(),
    onInterruption: new Set(),
    onStateChange: new Set(),
  });

  // Native listeners refs
  const nativeListenersRef = useRef<any[]>([]);

  // Service ref
  const serviceRef = useRef<AudioRecorderNative | null>(null);

  // Initialize service
  useEffect(() => {
    try {
      serviceRef.current = NativeAudioChunkRecorder;
      NativeAudioChunkRecorder.isAvailable()
        .then((available) => {
          setIsAvailable(available);
        })
        .catch((error) => {
          console.error(
            "AudioRecorderCore: Failed to check availability:",
            error
          );
          setIsAvailable(false);
        });
    } catch (error) {
      console.error("AudioRecorderCore: Failed to initialize service:", error);
      setIsAvailable(false);
    }
  }, []);

  // Setup native event listeners
  useEffect(() => {
    if (!serviceRef.current) return;

    // Chunk ready listener
    const chunkListener = AudioChunkRecorderEventEmitter.addListener(
      "onChunkReady",
      (chunk: ChunkData) => {
        console.log("AudioRecorderCore: Chunk ready:", chunk);
        setChunks((prev) => [...prev, chunk]);

        // Notify custom listeners
        listenersRef.current.onChunkReady.forEach((listener) => {
          try {
            listener(chunk);
          } catch (error) {
            console.error("AudioRecorderCore: Error in chunk listener:", error);
          }
        });

        // Call configuration callback
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

    // Audio level listener
    const levelListener = AudioChunkRecorderEventEmitter.addListener(
      "onAudioLevel",
      (data: AudioLevelData) => {
        setAudioLevel(data.level);
        setHasAudio(data.hasAudio);

        // Notify custom listeners
        listenersRef.current.onAudioLevel.forEach((listener) => {
          try {
            listener(data);
          } catch (error) {
            console.error(
              "AudioRecorderCore: Error in audio level listener:",
              error
            );
          }
        });
      }
    );

    // Error listener
    const errorListener = AudioChunkRecorderEventEmitter.addListener(
      "onError",
      (error: ErrorData) => {
        console.error("AudioRecorderCore: Native error:", error);

        // Notify custom listeners
        listenersRef.current.onError.forEach((listener) => {
          try {
            listener(error);
          } catch (error) {
            console.error("AudioRecorderCore: Error in error listener:", error);
          }
        });

        // Call configuration callback
        options.onError?.(error);
      }
    );

    // State change listener
    const stateListener = AudioChunkRecorderEventEmitter.addListener(
      "onStateChange",
      (state: StateChangeData) => {
        console.log(
          "AudioRecorderCore: 🔄 State change received from native:",
          state
        );
        console.log("AudioRecorderCore: 🔄 Previous React state:", {
          isRecording,
          isPaused,
        });

        setIsRecording(state.isRecording);
        setIsPaused(state.isPaused);

        console.log("AudioRecorderCore: 🔄 React state updated to:", {
          isRecording: state.isRecording,
          isPaused: state.isPaused,
        });

        // Notify custom listeners
        listenersRef.current.onStateChange.forEach((listener) => {
          try {
            listener(state);
          } catch (error) {
            console.error("AudioRecorderCore: Error in state listener:", error);
          }
        });

        // Call configuration callback
        options.onStateChange?.(state);
      }
    );

    // Interruption listener
    const interruptionListener = AudioChunkRecorderEventEmitter.addListener(
      "onInterruption",
      (interruption: InterruptionData) => {
        console.log("AudioRecorderCore: Interruption:", interruption);

        // Update global state
        if (interruption.type === "began") {
          setIsInterrupted(true);
          stateManager.setState("audioInterruption", true);
        } else if (interruption.type === "ended") {
          setIsInterrupted(false);
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
          handleInterruptionDefault(interruption);
        }

        // Notify custom listeners
        listenersRef.current.onInterruption.forEach((listener) => {
          try {
            listener(interruption);
          } catch (error) {
            console.error(
              "AudioRecorderCore: Error in interruption listener:",
              error
            );
          }
        });

        // Call configuration callback
        options.onInterruption?.(interruption);
      }
    );

    // Store listeners for cleanup
    nativeListenersRef.current = [
      chunkListener,
      levelListener,
      errorListener,
      stateListener,
      interruptionListener,
    ];

    // Cleanup
    return () => {
      nativeListenersRef.current.forEach((listener) => {
        if (listener && typeof listener.remove === "function") {
          listener.remove();
        }
      });
      nativeListenersRef.current = [];
    };
  }, [options, stateManager]);

  // Default interruption handler
  const handleInterruptionDefault = useCallback(
    (interruption: InterruptionData) => {
      if (interruption.type === "began") {
        // Show alert for phone call
        alertProvider.showAlert(
          "Call in Progress",
          "Recording paused due to incoming call. Recording will resume when the call ends.",
          [{ text: "OK" }]
        );
      } else if (interruption.type === "audioDeviceDisconnected") {
        // Show alert for device disconnection
        alertProvider.showAlert(
          "Audio Device Disconnected",
          "Your audio device was disconnected. Please reconnect and try again.",
          [{ text: "OK" }]
        );
      }
    },
    [alertProvider]
  );

  // Auto check permissions on mount
  useEffect(() => {
    if (options.autoCheckPermissions !== false && serviceRef.current) {
      checkPermissions();
    }
  }, [options.autoCheckPermissions]);

  // Actions
  const startRecording = useCallback(
    async (recordingOptions?: RecordingOptions) => {
      console.log("AudioRecorderCore: 🚀 startRecording called");
      console.log("AudioRecorderCore: 🚀 Current state:", {
        isRecording,
        isPaused,
        hasPermission,
        isAvailable,
        serviceAvailable: !!serviceRef.current,
      });

      if (!serviceRef.current) {
        throw new Error("AudioRecorderCore: Service not available");
      }

      // Check if already recording to avoid "Recording is already in progress" error
      if (isRecording) {
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
    [
      options.defaultRecordingOptions,
      isRecording,
      isPaused,
      hasPermission,
      isAvailable,
    ]
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
    setChunks([]);
    // Note: clearAllChunkFiles is async, but we don't await here for backwards compatibility
    serviceRef.current?.clearAllChunkFiles().catch((error: unknown) => {
      console.error("AudioRecorderCore: Failed to clear chunk files:", error);
    });
  }, []);

  const clearAllChunkFiles = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      await serviceRef.current.clearAllChunkFiles();
      setChunks([]);
    } catch (error) {
      console.error("AudioRecorderCore: Clear files failed:", error);
      throw error;
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("AudioRecorderCore: Service not available");
    }

    try {
      const granted = await serviceRef.current.checkPermissions();
      setHasPermission(granted);
    } catch (error) {
      console.error("AudioRecorderCore: Check permissions failed:", error);
      setHasPermission(false);
      throw error;
    }
  }, []);

  // Auto start recording when conditions are met
  const autoStartAttemptedRef = useRef(false);

  useEffect(() => {
    if (
      options.autoStartRecording &&
      isAvailable &&
      hasPermission &&
      !isRecording &&
      !isPaused &&
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
    isAvailable,
    hasPermission,
    isRecording,
    isPaused,
    startRecording,
  ]);

  // Event subscription methods
  const onChunkReady = useCallback((callback: (chunk: ChunkData) => void) => {
    listenersRef.current.onChunkReady.add(callback);
    return () => {
      listenersRef.current.onChunkReady.delete(callback);
    };
  }, []);

  const onAudioLevel = useCallback(
    (callback: (levelData: AudioLevelData) => void) => {
      listenersRef.current.onAudioLevel.add(callback);
      return () => {
        listenersRef.current.onAudioLevel.delete(callback);
      };
    },
    []
  );

  const onError = useCallback((callback: (error: ErrorData) => void) => {
    listenersRef.current.onError.add(callback);
    return () => {
      listenersRef.current.onError.delete(callback);
    };
  }, []);

  const onInterruption = useCallback(
    (callback: (interruption: InterruptionData) => void) => {
      listenersRef.current.onInterruption.add(callback);
      return () => {
        listenersRef.current.onInterruption.delete(callback);
      };
    },
    []
  );

  const onStateChange = useCallback(
    (callback: (state: StateChangeData) => void) => {
      listenersRef.current.onStateChange.add(callback);
      return () => {
        listenersRef.current.onStateChange.delete(callback);
      };
    },
    []
  );

  return {
    // Service
    service: serviceRef.current,

    // State
    isRecording,
    isPaused,
    hasPermission,
    chunks,
    audioLevel,
    hasAudio,
    isAvailable,
    isInterrupted,

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
  };
};
