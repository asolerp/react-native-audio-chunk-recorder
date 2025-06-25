import { useCallback, useEffect, useState } from "react";
import { NativeModules, NativeEventEmitter } from "react-native";

const { AudioChunkRecorderModule } = NativeModules;

export interface UseAudioRecorderResult {
  isRecording: boolean;
  isPaused: boolean;
  startRecording: (sampleRate?: number, chunkSeconds?: number) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const startRecording = useCallback(
    async (sampleRate: number = 16000, chunkSeconds: number = 30) => {
      const options = {
        sampleRate,
        chunkSeconds,
      };
      await AudioChunkRecorderModule.startRecording(options);
    },
    []
  );

  const stopRecording = useCallback(async () => {
    await AudioChunkRecorderModule.stopRecording();
  }, []);

  const pauseRecording = useCallback(async () => {
    await AudioChunkRecorderModule.pauseRecording();
  }, []);

  const resumeRecording = useCallback(async () => {
    await AudioChunkRecorderModule.resumeRecording();
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
  };
}
