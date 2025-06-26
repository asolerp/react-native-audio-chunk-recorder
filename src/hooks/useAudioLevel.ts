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
 * useAudioLevel - Simplified version for audio level monitoring
 *
 * This version assumes the native module is already configured and available.
 * Much simpler than the full version - similar to useAudioRecorderCore approach.
 */
export function useAudioLevel(
  options: UseAudioLevelOptions = {}
): UseAudioLevelReturn {
  const {
    audioThreshold = 0.001,
    throttleMs = 100,
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

  // Handle audio level updates with throttling
  const handleAudioLevel = useCallback(
    (levelData: { level: number }) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < throttleMs) {
        return; // Throttle updates
      }
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
      transformLevel,
      onLevelChange,
      onAudioDetected,
      onAudioLost,
    ]
  );

  // Start monitoring - Simplified version
  const startMonitoring = useCallback(async () => {
    if (isMonitoring) return;

    try {
      setError(undefined);

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

      // Start native audio level preview
      await NativeAudioChunkRecorder.startAudioLevelPreview();
      setIsMonitoring(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to start audio monitoring: ${errorMessage}`);
      console.error("useAudioLevel: Failed to start monitoring:", err);
    }
  }, [isMonitoring, handleAudioLevel]);

  // Stop monitoring
  const stopMonitoring = useCallback(async () => {
    try {
      await NativeAudioChunkRecorder.stopAudioLevelPreview();
      setIsMonitoring(false);

      // Remove listener
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }

      // Reset state
      setData({ level: 0, hasAudio: false });
      lastHasAudioRef.current = false;
      setError(undefined);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop audio monitoring: ${errorMessage}`);
      console.error("useAudioLevel: Failed to stop monitoring:", err);
    }
  }, []);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart) {
      startMonitoring().catch(console.error);
    }
  }, [autoStart, startMonitoring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
      }
      if (isMonitoring) {
        stopMonitoring().catch(console.error);
      }
    };
  }, [isMonitoring, stopMonitoring]);

  // Debug method to check AudioRecord state
  const getAudioRecordState = useCallback(async () => {
    try {
      const state = await NativeAudioChunkRecorder.getAudioRecordState();
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
 * // Basic usage - Much simpler now!
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
 * // VU Meter component
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
 */
