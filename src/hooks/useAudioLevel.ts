import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";
import { audioManager } from "../providers/audioManager";
import { noopErrorTracker } from "../providers/errorTracker";

export interface AudioLevelData {
  level: number;
  hasAudio: boolean;
}

export interface UseAudioLevelOptions {
  /** Throttle audio level updates in milliseconds (default: 100) */
  throttleMs?: number;
  /** Disable throttling completely for debugging (default: false) */
  disableThrottling?: boolean;
  /** Debug mode - logs all native updates and disables throttling (default: false) */
  debug?: boolean;
  /** Callback when audio level changes */
  onLevelChange?: (data: AudioLevelData) => void;
  /** Callback when audio is detected */
  onAudioDetected?: (level: number) => void;
  /** Callback when audio is lost */
  onAudioLost?: () => void;
  /** Callback when an error occurs */
  onError?: (error: any) => void;
  /** Auto-start monitoring when hook mounts */
  autoStart?: boolean;
  /** Error tracker for monitoring errors */
  errorTracker?: any;
}

export interface UseAudioLevelReturn {
  /** Current audio level data */
  data: AudioLevelData;
  /** Start audio level monitoring */
  startMonitoring: () => Promise<void>;
  /** Stop audio level monitoring */
  stopMonitoring: () => Promise<void>;
  /** Whether monitoring is currently active */
  isMonitoring: boolean;
  /** Error message if any */
  error?: string;
  /** Debug method to check AudioRecord state */
  getAudioRecordState: () => Promise<string>;
}

// Optimized event listener manager for audio level only
class AudioLevelEventListenerManager {
  private listeners = {
    onAudioLevel: new Set<(levelData: AudioLevelData) => void>(),
    onError: new Set<(error: any) => void>(),
  };

  private nativeListeners: any[] = [];
  private lastAudioLevelUpdate = 0;

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
    this.listeners[event].forEach((listener: any) => {
      try {
        listener(data);
      } catch (error) {
        console.error(`useAudioLevel: Error in ${event} listener:`, error);
      }
    });
  }

  setupNativeListeners(
    options: UseAudioLevelOptions,
    updateState: (updates: any) => void
  ) {
    // Clear existing listeners
    this.cleanup();

    // Audio level listener with throttling
    const levelListener = AudioChunkRecorderEventEmitter.addListener(
      "onAudioLevel",
      (data: AudioLevelData) => {
        // Call the handleAudioLevel function instead of directly updating state
        this.handleAudioLevel(data, options, updateState);
        this.notifyListeners("onAudioLevel", data);
      }
    );

    // Error listener
    const errorListener = AudioChunkRecorderEventEmitter.addListener(
      "onError",
      (error: any) => {
        this.notifyListeners("onError", error);
        options.onError?.(error);
      }
    );

    this.nativeListeners = [levelListener, errorListener];
  }

  private handleAudioLevel(
    levelData: AudioLevelData,
    options: UseAudioLevelOptions,
    updateState: (updates: any) => void
  ) {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastAudioLevelUpdate;

    if (
      !options.disableThrottling &&
      !options.debug &&
      timeSinceLastUpdate < (options.throttleMs || 100)
    ) {
      return; // Throttle updates
    }

    // Use native values directly without any processing
    const nativeLevel = levelData.level;
    const nativeHasAudio = levelData.hasAudio;

    const newData: AudioLevelData = {
      level: nativeLevel,
      hasAudio: nativeHasAudio,
    };

    // Update state with native values
    updateState({ audioLevel: nativeLevel, hasAudio: nativeHasAudio });

    // Call level change callback
    options.onLevelChange?.(newData);
  }

  cleanup() {
    this.nativeListeners.forEach((listener) => {
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    });
    this.nativeListeners = [];
  }
}

/**
 * useAudioLevel - Specialized hook for audio level monitoring only
 *
 * This hook follows the same pattern as useAudioRecorderCore but is optimized
 * specifically for audio level monitoring. It uses the recording pipeline
 * with very short chunks (< 1 second) to avoid file creation.
 */
export function useAudioLevel(
  options: UseAudioLevelOptions = {}
): UseAudioLevelReturn {
  const { autoStart = false } = options;

  // Local state with optimized updates
  const [state, setState] = useState({
    audioLevel: 0,
    hasAudio: false,
    isMonitoring: false,
    error: undefined as string | undefined,
  });

  // Event listener manager - singleton instance
  const eventManagerRef = useRef<AudioLevelEventListenerManager | null>(null);
  if (!eventManagerRef.current) {
    eventManagerRef.current = new AudioLevelEventListenerManager();
  }

  // Service ref
  const serviceRef = useRef<any>(null);

  // Auto start tracking
  const autoStartAttemptedRef = useRef(false);

  // Track previous audio state for detection callbacks
  const previousHasAudioRef = useRef(false);

  // Memoized state setters to prevent unnecessary re-renders
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Error tracker - use provided or fallback to no-op
  const errorTracker = useMemo(
    () => options.errorTracker || noopErrorTracker,
    [options.errorTracker]
  );

  // Initialize service - only once
  useEffect(() => {
    try {
      serviceRef.current = NativeAudioChunkRecorder;
      NativeAudioChunkRecorder.isAvailable()
        .then((available) => {
          if (!available) {
            setState((prev) => ({ ...prev, error: "Service not available" }));
          }
        })
        .catch((error) => {
          console.error("useAudioLevel: Failed to check availability:", error);
          setState((prev) => ({ ...prev, error: "Service not available" }));
        });
    } catch (error) {
      console.error("useAudioLevel: Failed to initialize service:", error);
      setState((prev) => ({ ...prev, error: "Service not available" }));
    }
  }, []); // Empty dependency array - only run once

  // Setup native event listeners - optimized dependencies
  useEffect(() => {
    if (!serviceRef.current) return;

    eventManagerRef.current!.setupNativeListeners(options, updateState);

    return () => {
      eventManagerRef.current!.cleanup();
    };
  }, [
    options.onLevelChange,
    options.onAudioDetected,
    options.onAudioLost,
    options.onError,
    options.throttleMs,
    options.disableThrottling,
    updateState,
  ]);

  // Memoized actions to prevent unnecessary re-creation
  const startMonitoring = useCallback(async () => {
    // Check if already monitoring to avoid conflicts
    if (state.isMonitoring) {
      return;
    }

    try {
      updateState({ error: undefined });

      errorTracker.addBreadcrumb({
        message: "Starting audio level monitoring",
        category: "audio_monitoring",
        level: "info",
      });

      // Use AudioManager to start monitoring
      const result = await audioManager.startMonitoring({
        sampleRate: 16000,
        chunkSeconds: 0.1, // Less than 1s = no file saving
      });

      updateState({ isMonitoring: true });
    } catch (error) {
      updateState({ error: `Failed to start monitoring: ${error}` });
      errorTracker.captureException(error as Error, {
        action: "start_monitoring",
      });
      throw error;
    }
  }, [state.isMonitoring, updateState, errorTracker]);

  const stopMonitoring = useCallback(async () => {
    try {
      errorTracker.addBreadcrumb({
        message: "Stopping audio level monitoring",
        category: "audio_monitoring",
        level: "info",
      });

      await audioManager.stopMonitoring();

      // Reset state
      updateState({
        isMonitoring: false,
        audioLevel: 0,
        hasAudio: false,
        error: undefined,
      });
    } catch (error) {
      updateState({ error: `Failed to stop monitoring: ${error}` });
      errorTracker.captureException(error as Error, {
        action: "stop_monitoring",
      });
      throw error;
    }
  }, [updateState, errorTracker]);

  // Auto start monitoring when conditions are met
  useEffect(() => {
    if (
      autoStart &&
      !state.isMonitoring &&
      !autoStartAttemptedRef.current &&
      serviceRef.current
    ) {
      autoStartAttemptedRef.current = true;
      startMonitoring().catch((error: unknown) => {
        // Reset flag on error so it can try again
        autoStartAttemptedRef.current = false;
      });
    }
  }, [autoStart, state.isMonitoring, startMonitoring]);

  // Listen to AudioManager state changes
  useEffect(() => {
    const unsubscribe = audioManager.addListener((type, active) => {
      if (type === "monitoring") {
        if (!active && state.isMonitoring) {
          // Monitoring was stopped by another hook or the manager
          updateState({
            isMonitoring: false,
            audioLevel: 0,
            hasAudio: false,
            error: undefined,
          });
        }
      }
    });

    return unsubscribe;
  }, [state.isMonitoring, updateState]);

  // Handle audio detection/loss callbacks
  useEffect(() => {
    const wasAudio = previousHasAudioRef.current;
    const isAudio = state.hasAudio;

    // Only call callbacks on state transitions
    if (isAudio && !wasAudio && options.onAudioDetected) {
      options.onAudioDetected(state.audioLevel);
    } else if (!isAudio && wasAudio && options.onAudioLost) {
      options.onAudioLost();
    }

    // Update previous state reference
    previousHasAudioRef.current = isAudio;
  }, [
    state.hasAudio,
    state.audioLevel,
    options.onAudioDetected,
    options.onAudioLost,
  ]);

  // Debug method to check AudioRecord state
  const getAudioRecordState = useCallback(async () => {
    if (!serviceRef.current) {
      return "Service not available";
    }

    try {
      const state = await serviceRef.current.getAudioRecordState();
      return state;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("useAudioLevel: Failed to get AudioRecord state:", err);
      return errorMessage;
    }
  }, []);

  // Memoized return object to prevent unnecessary re-renders
  const returnValue = useMemo<UseAudioLevelReturn>(
    () => ({
      // State
      data: {
        level: state.audioLevel,
        hasAudio: state.hasAudio,
      },
      isMonitoring: state.isMonitoring,
      error: state.error,

      // Actions
      startMonitoring,
      stopMonitoring,

      // Debug
      getAudioRecordState,
    }),
    [
      state.audioLevel,
      state.hasAudio,
      state.isMonitoring,
      state.error,
      startMonitoring,
      stopMonitoring,
      getAudioRecordState,
    ]
  );

  return returnValue;
}
