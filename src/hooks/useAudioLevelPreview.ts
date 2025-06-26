import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { Alert } from "react-native";
import { useAudioPermissions } from "./useAudioPermissions";
import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";

export interface AudioLevelData {
  level: number;
  hasAudio: boolean;
}

export interface UseAudioLevelPreviewReturn {
  data: AudioLevelData;
  startPreview: () => Promise<void>;
  stopPreview: () => Promise<void>;
  isPreviewing: boolean;
  hasPermissions: boolean;
  requestPermissions: () => Promise<boolean>;
}

// PERFORMANCE: Throttle configuration (DISABLED FOR DEBUG)
// const THROTTLE_MS = 100; // 10 FPS for smooth UI
// const AUDIO_THRESHOLD = 0.001; // Minimum level to consider as "has audio"
// const CHANGE_THRESHOLD = 0.001; // Minimum change to trigger update (much more sensitive)

export function useAudioLevelPreview(): UseAudioLevelPreviewReturn {
  // PERFORMANCE: Use refs to avoid unnecessary re-renders
  const [data, setData] = useState<AudioLevelData>({
    level: 0,
    hasAudio: false,
  });
  const [isPreviewing, setIsPreviewing] = useState(false);

  // PERFORMANCE: Refs for throttling and state management
  const lastUpdateRef = useRef(Date.now());
  const lastLevelRef = useRef(0);
  const listenerRef = useRef<any>(null);
  const isStartingRef = useRef(false);

  // Use the permissions hook
  const { hasPermissions, requestPermissions } = useAudioPermissions();

  // PERFORMANCE: Memoized callback to prevent unnecessary re-renders
  const handleAudioLevel = useCallback((levelData: { level: number }) => {
    const level = levelData.level;

    // DEBUG: Log all incoming values with timestamp
    console.log("[AudioLevel] Raw level:", level, "at", Date.now());

    // TRANSFORM: Make audio more reactive for UI (optional)
    // Apply logarithmic scaling to make small values more visible
    const transformedLevel = level > 0 ? Math.pow(level, 0.3) : 0;

    // NO THROTTLING: Update immediately for all values
    setData({
      level: transformedLevel,
      hasAudio: level > 0,
    });
  }, []);

  // PERFORMANCE: Optimized start preview with proper error handling
  const startPreview = useCallback(async () => {
    console.log("[AudioLevelPreview] startPreview called");

    // Prevent multiple simultaneous starts
    if (isStartingRef.current || isPreviewing) {
      console.log(
        "[AudioLevelPreview] Already starting or previewing, skipping"
      );
      return;
    }

    isStartingRef.current = true;

    try {
      // Check permissions before starting preview
      if (!hasPermissions) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Microphone permission is required to monitor audio levels.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      // PERFORMANCE: Remove existing listener before adding new one
      if (listenerRef.current) {
        console.log("[AudioLevelPreview] Removing existing listener");
        listenerRef.current.remove();
        listenerRef.current = null;
      }

      // Add new listener
      console.log("[AudioLevelPreview] Adding new listener");
      listenerRef.current = AudioChunkRecorderEventEmitter.addListener(
        "onAudioLevel",
        handleAudioLevel
      );

      await NativeAudioChunkRecorder.startAudioLevelPreview();
      setIsPreviewing(true);
      console.log("[AudioLevelPreview] Preview started successfully");
    } catch (error) {
      console.error("Failed to start audio level preview:", error);
      Alert.alert("Error", `Failed to start audio level preview: ${error}`);
    } finally {
      isStartingRef.current = false;
    }
  }, [hasPermissions, requestPermissions, isPreviewing, handleAudioLevel]);

  // PERFORMANCE: Optimized stop preview
  const stopPreview = useCallback(async () => {
    console.log("[AudioLevelPreview] stopPreview called");

    try {
      await NativeAudioChunkRecorder.stopAudioLevelPreview();
      setIsPreviewing(false);

      // PERFORMANCE: Remove listener
      if (listenerRef.current) {
        console.log("[AudioLevelPreview] Removing listener in stopPreview");
        listenerRef.current.remove();
        listenerRef.current = null;
      }

      // Reset level when stopping
      setData({ level: 0, hasAudio: false });
      lastLevelRef.current = 0;
      console.log("[AudioLevelPreview] Preview stopped successfully");
    } catch (error) {
      console.error("Failed to stop audio level preview:", error);
      Alert.alert("Error", `Failed to stop audio level preview: ${error}`);
    }
  }, []);

  // PERFORMANCE: Cleanup on unmount
  useEffect(() => {
    console.log("[AudioLevelPreview] Component mounted");

    return () => {
      console.log("[AudioLevelPreview] Component unmounting, cleaning up");
      if (listenerRef.current) {
        console.log("[AudioLevelPreview] Removing listener in cleanup");
        listenerRef.current.remove();
      }
      if (isPreviewing) {
        console.log("[AudioLevelPreview] Stopping preview in cleanup");
        stopPreview().catch(console.error);
      }
    };
  }, [isPreviewing, stopPreview]);

  // PERFORMANCE: Memoized return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      data,
      startPreview,
      stopPreview,
      isPreviewing,
      hasPermissions,
      requestPermissions,
    }),
    [
      data,
      startPreview,
      stopPreview,
      isPreviewing,
      hasPermissions,
      requestPermissions,
    ]
  );
}
