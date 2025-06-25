import { useCallback, useEffect, useState } from "react";
import { NativeModules, NativeEventEmitter, Alert } from "react-native";
import { useAudioPermissions } from "./useAudioPermissions";

const { AudioChunkRecorderModule } = NativeModules;

export interface UseAudioRecorderResult {
  isRecording: boolean;
  isPaused: boolean;
  startRecording: (sampleRate?: number, chunkSeconds?: number) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  hasPermissions: boolean;
  requestPermissions: () => Promise<boolean>;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Use the permissions hook
  const { hasPermissions, requestPermissions } = useAudioPermissions();

  const startRecording = useCallback(
    async (sampleRate: number = 16000, chunkSeconds: number = 30) => {
      // Check permissions before starting recording
      if (!hasPermissions) {
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            "Permission Required",
            "Microphone permission is required to record audio.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      try {
        const options = {
          sampleRate,
          chunkSeconds,
        };
        await AudioChunkRecorderModule.startRecording(options);
      } catch (error) {
        Alert.alert("Error", `Failed to start recording: ${error}`);
      }
    },
    [hasPermissions, requestPermissions]
  );

  const stopRecording = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.stopRecording();
    } catch (error) {
      Alert.alert("Error", `Failed to stop recording: ${error}`);
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.pauseRecording();
    } catch (error) {
      Alert.alert("Error", `Failed to pause recording: ${error}`);
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.resumeRecording();
    } catch (error) {
      Alert.alert("Error", `Failed to resume recording: ${error}`);
    }
  }, []);

  useEffect(() => {
    const emitter = new NativeEventEmitter(AudioChunkRecorderModule);

    const stateSub = emitter.addListener(
      "onStateChange",
      (state: { isRecording: boolean; isPaused: boolean }) => {
        setIsRecording(state.isRecording);
        setIsPaused(state.isPaused || false);
      }
    );

    const errorSub = emitter.addListener(
      "onError",
      (error: { message: string }) => {
        console.error("AudioRecorder error:", error.message);
      }
    );

    return () => {
      stateSub.remove();
      errorSub.remove();
    };
  }, []);

  return {
    isRecording,
    isPaused,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    hasPermissions,
    requestPermissions,
  };
}
