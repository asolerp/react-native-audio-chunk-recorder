import { useCallback, useEffect, useState } from "react";
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

export function useAudioLevelPreview(): UseAudioLevelPreviewReturn {
  const [data, setData] = useState<AudioLevelData>({
    level: 0,
    hasAudio: false,
  });
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Use the permissions hook
  const { hasPermissions, requestPermissions } = useAudioPermissions();

  const startPreview = useCallback(async () => {
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

    try {
      await NativeAudioChunkRecorder.startAudioLevelPreview();
      setIsPreviewing(true);
    } catch (error) {
      Alert.alert("Error", `Failed to start audio level preview: ${error}`);
    }
  }, [hasPermissions, requestPermissions]);

  const stopPreview = useCallback(async () => {
    try {
      await NativeAudioChunkRecorder.stopAudioLevelPreview();
      setIsPreviewing(false);
      // Reset level when stopping
      setData({ level: 0, hasAudio: false });
    } catch (error) {
      Alert.alert("Error", `Failed to stop audio level preview: ${error}`);
    }
  }, []);

  useEffect(() => {
    const audioLevelSub = AudioChunkRecorderEventEmitter.addListener(
      "onAudioLevel",
      (levelData: { level: number }) => {
        setData({
          level: levelData.level,
          hasAudio: levelData.level > 0.01,
        });
      }
    );

    return () => {
      audioLevelSub.remove();
    };
  }, []);

  return {
    data,
    startPreview,
    stopPreview,
    isPreviewing,
    hasPermissions,
    requestPermissions,
  };
}
