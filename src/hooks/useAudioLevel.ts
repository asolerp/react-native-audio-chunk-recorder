import { useCallback, useEffect, useState, useRef } from "react";
import { Alert } from "react-native";
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
  /** Check if microphone permission is granted */
  hasPermissions: boolean;
  /** Request microphone permission */
  requestPermissions: () => Promise<boolean>;
  /** Check if native module is available */
  isNativeModuleAvailable: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * useAudioLevel - Specialized hook for audio level monitoring
 *
 * This hook provides audio level monitoring functionality independent
 * of recording. It can be used for:
 * - VU meters and audio visualizations
 * - Voice activity detection
 * - Audio input monitoring
 * - Sound level indicators
 *
 * @param options Configuration options for audio level monitoring
 * @returns Audio level monitoring interface
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
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isNativeModuleAvailable, setIsNativeModuleAvailable] = useState(false);
  const [error, setError] = useState<string>();

  // Refs
  const listenerRef = useRef<any>(null);
  const lastUpdateRef = useRef(Date.now());
  const lastHasAudioRef = useRef(false);
  const isStartingRef = useRef(false);

  // Check native module availability
  const checkNativeModuleAvailability =
    useCallback(async (): Promise<boolean> => {
      try {
        const isAvailable = await NativeAudioChunkRecorder.isAvailable();
        setIsNativeModuleAvailable(isAvailable);
        return isAvailable;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Native module not available: ${errorMessage}`);
        setIsNativeModuleAvailable(false);
        return false;
      }
    }, []);

  // Check permissions
  const checkPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const hasPermission = await NativeAudioChunkRecorder.checkPermissions();
      setHasPermissions(hasPermission);
      return hasPermission;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Permission check failed: ${errorMessage}`);
      return false;
    }
  }, []);

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // This would typically use a permission library like react-native-permissions
      // For now, we'll show an alert and return false
      Alert.alert(
        "Permission Required",
        "Microphone permission is required to monitor audio levels.",
        [{ text: "OK" }]
      );
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Permission request failed: ${errorMessage}`);
      return false;
    }
  }, []);

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

  // Start monitoring
  const startMonitoring = useCallback(async () => {
    if (isStartingRef.current || isMonitoring) {
      return;
    }

    isStartingRef.current = true;
    setError(undefined);

    try {
      // Check native module availability
      if (!isNativeModuleAvailable) {
        const isAvailable = await checkNativeModuleAvailability();
        if (!isAvailable) {
          throw new Error("Native module not available");
        }
      }

      // Check permissions
      if (!hasPermissions) {
        const granted = await checkPermissions();
        if (!granted) {
          const requested = await requestPermissions();
          if (!requested) {
            throw new Error("Microphone permission not granted");
          }
        }
      }

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
    } finally {
      isStartingRef.current = false;
    }
  }, [
    isMonitoring,
    isNativeModuleAvailable,
    hasPermissions,
    checkNativeModuleAvailability,
    checkPermissions,
    requestPermissions,
    handleAudioLevel,
  ]);

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

  return {
    data,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    hasPermissions,
    requestPermissions,
    isNativeModuleAvailable,
    error,
  };
}

/**
 * USAGE EXAMPLES:
 *
 * // Basic usage
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
