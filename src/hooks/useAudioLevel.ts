import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";
import { audioManager } from "../providers/audioManager";

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
        console.error("useAudioLevel: Native error:", error);
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

    // Debug logging - always log received data
    console.log(
      `[useAudioLevel] 📨 Received from native: level=${levelData.level.toFixed(
        6
      )}, hasAudio=${
        levelData.hasAudio
      }, time since last: ${timeSinceLastUpdate}ms`
    );

    if (options.debug) {
      console.log(`[useAudioLevel] 🐛 DEBUG MODE: Processing all updates`);
    }

    if (
      !options.disableThrottling &&
      !options.debug &&
      timeSinceLastUpdate < (options.throttleMs || 100)
    ) {
      console.log(
        `[useAudioLevel] ⏱️ Throttled update (${timeSinceLastUpdate}ms < ${
          options.throttleMs || 100
        }ms) - SKIPPING UPDATE`
      );
      return; // Throttle updates
    }

    console.log(
      `[useAudioLevel] ✅ Processing update after ${timeSinceLastUpdate}ms`
    );

    // Use native values directly without any processing
    const nativeLevel = levelData.level;
    const nativeHasAudio = levelData.hasAudio;

    console.log(
      `[useAudioLevel] 📊 Native values: level=${nativeLevel.toFixed(
        6
      )}, hasAudio=${nativeHasAudio}`
    );

    // Debug: Log when level is very low but not zero
    if (nativeLevel > 0 && nativeLevel < 0.001) {
      console.log(
        `[useAudioLevel] 🔍 Very low level detected: ${nativeLevel.toFixed(
          8
        )} (background noise?)`
      );
    }

    // Debug: Log when hasAudio is false but level > 0
    if (!nativeHasAudio && nativeLevel > 0) {
      console.log(
        `[useAudioLevel] 🤔 hasAudio=false but level=${nativeLevel.toFixed(
          6
        )} > 0`
      );
    }

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
    console.log("useAudioLevel: 🚀 startMonitoring called");

    // Check if already monitoring to avoid conflicts
    if (state.isMonitoring) {
      console.log(
        "useAudioLevel: ⚠️ Already monitoring, skipping start request"
      );
      return;
    }

    try {
      updateState({ error: undefined });
      console.log("useAudioLevel: 🚀 Starting monitoring via AudioManager...");

      // Use AudioManager to start monitoring
      const result = await audioManager.startMonitoring({
        sampleRate: 16000,
        chunkSeconds: 0.1, // Less than 1s = no file saving
      });

      updateState({ isMonitoring: true });
      console.log("useAudioLevel: 🚀 Monitoring started successfully:", result);
    } catch (error) {
      console.error("useAudioLevel: ❌ Start monitoring failed:", error);
      updateState({ error: `Failed to start monitoring: ${error}` });
      throw error;
    }
  }, [state.isMonitoring, updateState]);

  const stopMonitoring = useCallback(async () => {
    try {
      console.log("useAudioLevel: 🛑 Stopping monitoring via AudioManager...");
      await audioManager.stopMonitoring();

      // Reset state
      updateState({
        isMonitoring: false,
        audioLevel: 0,
        hasAudio: false,
        error: undefined,
      });

      console.log("useAudioLevel: 🛑 Monitoring stopped successfully");
    } catch (error) {
      console.error("useAudioLevel: Stop monitoring failed:", error);
      updateState({ error: `Failed to stop monitoring: ${error}` });
      throw error;
    }
  }, [updateState]);

  // Auto start monitoring when conditions are met
  useEffect(() => {
    if (
      autoStart &&
      !state.isMonitoring &&
      !autoStartAttemptedRef.current &&
      serviceRef.current
    ) {
      console.log("useAudioLevel: Auto-starting monitoring...");
      autoStartAttemptedRef.current = true;
      startMonitoring().catch((error: unknown) => {
        console.error("useAudioLevel: Auto-start failed:", error);
        // Reset flag on error so it can try again
        autoStartAttemptedRef.current = false;
      });
    }
  }, [autoStart, state.isMonitoring, startMonitoring]);

  // Listen to AudioManager state changes
  useEffect(() => {
    const unsubscribe = audioManager.addListener((type, active) => {
      console.log(
        `useAudioLevel: 📢 AudioManager notification - ${type}: ${active}`
      );

      if (type === "monitoring") {
        if (!active && state.isMonitoring) {
          // Monitoring was stopped by another hook or the manager
          console.log(
            "useAudioLevel: 📢 Monitoring stopped by AudioManager, updating state"
          );
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

    console.log(
      `[useAudioLevel] 🔍 Audio state check: wasAudio=${wasAudio}, isAudio=${isAudio}, level=${state.audioLevel.toFixed(
        6
      )}`
    );

    // Only call callbacks on state transitions
    if (isAudio && !wasAudio && options.onAudioDetected) {
      console.log("useAudioLevel: 🔊 Audio detected, calling onAudioDetected");
      options.onAudioDetected(state.audioLevel);
    } else if (!isAudio && wasAudio && options.onAudioLost) {
      console.log("useAudioLevel: 🔇 Audio lost, calling onAudioLost");
      options.onAudioLost();
    }

    // Update previous state reference
    previousHasAudioRef.current = isAudio;
    console.log(
      `[useAudioLevel] 📝 Updated previousHasAudioRef to: ${isAudio}`
    );
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

/**
 * USAGE EXAMPLES:
 *
 * // Basic usage - Uses recording pipeline with 100ms chunks (no file saving)
 * const { data, startMonitoring, stopMonitoring, isMonitoring } = useAudioLevel();
 *
 * // With custom options
 * const { data } = useAudioLevel({
 *   audioThreshold: 0.01,
 *   throttleMs: 50,
 *   transformLevel: (level) => Math.pow(level, 0.3), // Logarithmic scaling
 *   onAudioDetected: (level) => console.log('Audio detected:', level),
 *   onAudioLost: () => console.log('Audio lost'),
 *   autoStart: true,
 * });
 *
 * // VU Meter component - High performance (60 FPS)
 * function VUMeter() {
 *   const { data, startMonitoring, stopMonitoring, isMonitoring } = useAudioLevel({
 *     throttleMs: 16, // 60 FPS
 *     transformLevel: (level) => Math.pow(level, 0.3),
 *   });
 *
 *   useEffect(() => {
 *     startMonitoring();
 *     return () => stopMonitoring();
 *   }, []);
 *
 *   return (
 *     <View style={{ height: 100, backgroundColor: '#333' }}>
 *       <View
 *         style={{
 *           height: `${data.level * 100}%`,
 *           backgroundColor: data.hasAudio ? '#0f0' : '#666'
 *         }}
 *       />
 *     </View>
 *   );
 * }
 *
 * // Voice activity detection
 * function VoiceActivityDetector() {
 *   const [isSpeaking, setIsSpeaking] = useState(false);
 *
 *   const { startMonitoring, stopMonitoring } = useAudioLevel({
 *     audioThreshold: 0.005,
 *     onAudioDetected: () => setIsSpeaking(true),
 *     onAudioLost: () => setIsSpeaking(false),
 *   });
 *
 *   return (
 *     <View>
 *       <Text>{isSpeaking ? 'Speaking...' : 'Silent'}</Text>
 *       <Button title="Start Monitoring" onPress={startMonitoring} />
 *       <Button title="Stop Monitoring" onPress={stopMonitoring} />
 *     </View>
 *   );
 * }
 */
