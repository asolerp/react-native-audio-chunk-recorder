import { useCallback, useEffect, useState, useRef } from "react";
import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";

export interface AudioLevelData {
  level: number;
  hasAudio: boolean;
}

export interface UseAudioLevelOptions {
  /** Minimum level to consider as "has audio" (default: 0.001) */
  audioThreshold?: number;
  /** Throttle audio level updates in milliseconds (default: 100) */
  throttleMs?: number;
  /** Disable throttling completely for debugging (default: false) */
  disableThrottling?: boolean;
  /** Transform function to modify audio level values */
  transformLevel?: (level: number) => number;
  /** Callback when audio level changes */
  onLevelChange?: (data: AudioLevelData) => void;
  /** Callback when audio is detected */
  onAudioDetected?: (level: number) => void;
  /** Callback when audio is lost */
  onAudioLost?: () => void;
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

/**
 * useAudioLevel - Audio level monitoring using the same approach as useAudioRecorderCore
 *
 * This hook provides audio level monitoring by using the recording pipeline
 * with very short chunks (< 1 second) to avoid file creation. It follows the
 * same pattern as useAudioRecorderCore for consistency and reliability.
 */
export function useAudioLevel(
  options: UseAudioLevelOptions = {}
): UseAudioLevelReturn {
  const {
    audioThreshold = 0.001,
    throttleMs = 100,
    disableThrottling = false,
    transformLevel,
    onLevelChange,
    onAudioDetected,
    onAudioLost,
    autoStart = false,
  } = options;

  // State
  const [data, setData] = useState<AudioLevelData>({
    level: 0,
    hasAudio: false,
  });
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string>();

  // Refs
  const listenerRef = useRef<any>(null);
  const lastUpdateRef = useRef(Date.now());
  const lastHasAudioRef = useRef(false);
  const serviceRef = useRef<any>(null);

  // Initialize service - same as useAudioRecorderCore
  useEffect(() => {
    try {
      serviceRef.current = NativeAudioChunkRecorder;
    } catch (error) {
      console.error("useAudioLevel: Failed to initialize service:", error);
      setError("Service not available");
    }
  }, []);

  // Handle audio level updates - same throttling logic as useAudioRecorderCore
  const handleAudioLevel = useCallback(
    (levelData: { level: number }) => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;

      // Debug logging
      console.log(
        `[useAudioLevel] Received audio level: ${levelData.level.toFixed(
          6
        )}, time since last: ${timeSinceLastUpdate}ms, throttle: ${throttleMs}ms, disabled: ${disableThrottling}`
      );

      if (!disableThrottling && timeSinceLastUpdate < throttleMs) {
        console.log(
          `[useAudioLevel] ⏱️ Throttled update (${timeSinceLastUpdate}ms < ${throttleMs}ms)`
        );
        return; // Throttle updates
      }

      console.log(
        `[useAudioLevel] ✅ Processing update after ${timeSinceLastUpdate}ms`
      );
      lastUpdateRef.current = now;

      const rawLevel = levelData.level;
      const transformedLevel = transformLevel
        ? transformLevel(rawLevel)
        : rawLevel;
      const hasAudio = transformedLevel > audioThreshold;

      const newData: AudioLevelData = {
        level: transformedLevel,
        hasAudio,
      };

      setData(newData);

      // Call callbacks
      onLevelChange?.(newData);

      // Handle audio detection/loss
      if (hasAudio && !lastHasAudioRef.current) {
        onAudioDetected?.(transformedLevel);
      } else if (!hasAudio && lastHasAudioRef.current) {
        onAudioLost?.();
      }

      lastHasAudioRef.current = hasAudio;
    },
    [
      audioThreshold,
      throttleMs,
      disableThrottling,
      transformLevel,
      onLevelChange,
      onAudioDetected,
      onAudioLost,
    ]
  );

  // Setup event listener - same pattern as useAudioRecorderCore
  useEffect(() => {
    if (!serviceRef.current) return;

    // Remove existing listener
    if (listenerRef.current) {
      listenerRef.current.remove();
      listenerRef.current = null;
    }

    // Add new listener
    listenerRef.current = AudioChunkRecorderEventEmitter.addListener(
      "onAudioLevel",
      handleAudioLevel
    );

    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }
    };
  }, [handleAudioLevel]);

  // Start monitoring - same approach as useAudioRecorderCore
  const startMonitoring = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("useAudioLevel: Service not available");
    }

    if (isMonitoring) {
      console.log("useAudioLevel: Already monitoring, skipping start request");
      return;
    }

    try {
      setError(undefined);
      console.log("useAudioLevel: Starting monitoring...");

      // Start recording with very short chunks (no file saving)
      await serviceRef.current.startRecording({
        sampleRate: 16000,
        chunkSeconds: 0.1, // Less than 1s = no file saving
      });

      setIsMonitoring(true);
      console.log("useAudioLevel: Monitoring started successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to start monitoring: ${errorMessage}`);
      console.error("useAudioLevel: Failed to start monitoring:", err);
      throw err;
    }
  }, [isMonitoring]);

  // Stop monitoring - same approach as useAudioRecorderCore
  const stopMonitoring = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("useAudioLevel: Service not available");
    }

    try {
      console.log("useAudioLevel: Stopping monitoring...");
      await serviceRef.current.stopRecording();
      setIsMonitoring(false);

      // Reset state
      setData({ level: 0, hasAudio: false });
      lastHasAudioRef.current = false;
      setError(undefined);

      console.log("useAudioLevel: Monitoring stopped successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop monitoring: ${errorMessage}`);
      console.error("useAudioLevel: Failed to stop monitoring:", err);
      throw err;
    }
  }, []);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && serviceRef.current) {
      startMonitoring().catch(console.error);
    }
  }, [autoStart, startMonitoring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }
      if (isMonitoring) {
        stopMonitoring().catch(console.error);
      }
    };
  }, [isMonitoring, stopMonitoring]);

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

  return {
    data,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    error,
    getAudioRecordState,
  };
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
