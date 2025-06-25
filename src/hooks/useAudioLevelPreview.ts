import { useCallback, useEffect, useState } from "react";
import { NativeModules, NativeEventEmitter } from "react-native";

const { AudioChunkRecorderModule } = NativeModules;

export interface AudioLevelData {
  level: number;
  hasAudio: boolean;
}

export interface UseAudioLevelPreviewReturn {
  data: AudioLevelData;
  startPreview: () => Promise<void>;
  stopPreview: () => Promise<void>;
  isPreviewing: boolean;
}

export function useAudioLevelPreview(): UseAudioLevelPreviewReturn {
  const [data, setData] = useState<AudioLevelData>({
    level: 0,
    hasAudio: false,
  });
  const [isPreviewing, setIsPreviewing] = useState(false);

  const startPreview = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.startAudioLevelPreview();
      setIsPreviewing(true);
    } catch (error) {
      console.error("Failed to start audio level preview:", error);
    }
  }, []);

  const stopPreview = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.stopAudioLevelPreview();
      setIsPreviewing(false);
      // Reset level when stopping
      setData({ level: 0, hasAudio: false });
    } catch (error) {
      console.error("Failed to stop audio level preview:", error);
    }
  }, []);

  useEffect(() => {
    const emitter = new NativeEventEmitter(AudioChunkRecorderModule);

    const audioLevelSub = emitter.addListener(
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
  };
}
