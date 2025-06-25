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
  // Auto-recording functionality
  autoRecording: boolean;
  setAutoRecording: (enabled: boolean) => void;
  toggleAutoRecording: () => void;
}

export interface UseAudioRecorderOptions {
  autoRecording?: boolean;
  onAutoRecordingStart?: () => void;
  onAutoRecordingStop?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: { isRecording: boolean; isPaused: boolean }) => void;
}

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoRecording, setAutoRecording] = useState(
    options.autoRecording || false
  );

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
        const recordingOptions = {
          sampleRate,
          chunkSeconds,
        };
        await AudioChunkRecorderModule.startRecording(recordingOptions);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        options.onError?.(errorMessage);
        Alert.alert("Error", `Failed to start recording: ${errorMessage}`);
      }
    },
    [hasPermissions, requestPermissions, options.onError]
  );

  const stopRecording = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.stopRecording();
      // If auto-recording is enabled, stop it when manually stopped
      if (autoRecording) {
        setAutoRecording(false);
        options.onAutoRecordingStop?.();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      options.onError?.(errorMessage);
      Alert.alert("Error", `Failed to stop recording: ${errorMessage}`);
    }
  }, [autoRecording, options.onAutoRecordingStop, options.onError]);

  const pauseRecording = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.pauseRecording();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      options.onError?.(errorMessage);
      Alert.alert("Error", `Failed to pause recording: ${errorMessage}`);
    }
  }, [options.onError]);

  const resumeRecording = useCallback(async () => {
    try {
      await AudioChunkRecorderModule.resumeRecording();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      options.onError?.(errorMessage);
      Alert.alert("Error", `Failed to resume recording: ${errorMessage}`);
    }
  }, [options.onError]);

  const toggleAutoRecording = useCallback(() => {
    const newAutoRecording = !autoRecording;
    setAutoRecording(newAutoRecording);

    if (newAutoRecording) {
      options.onAutoRecordingStart?.();
      // Start recording immediately if auto-recording is enabled
      if (!isRecording) {
        startRecording().catch(console.error);
      }
    } else {
      options.onAutoRecordingStop?.();
      // Stop recording if auto-recording is disabled and currently recording
      if (isRecording) {
        stopRecording().catch(console.error);
      }
    }
  }, [
    autoRecording,
    isRecording,
    startRecording,
    stopRecording,
    options.onAutoRecordingStart,
    options.onAutoRecordingStop,
  ]);

  // Listen for native events
  useEffect(() => {
    const emitter = new NativeEventEmitter(AudioChunkRecorderModule);

    const stateSub = emitter.addListener(
      "onStateChange",
      (state: { isRecording: boolean; isPaused: boolean }) => {
        setIsRecording(state.isRecording);
        setIsPaused(state.isPaused || false);
        options.onStateChange?.(state);
      }
    );

    const errorSub = emitter.addListener(
      "onError",
      (error: { message: string }) => {
        console.error("AudioRecorder error:", error.message);
        options.onError?.(error.message);
      }
    );

    return () => {
      stateSub.remove();
      errorSub.remove();
    };
  }, [options.onStateChange, options.onError]);

  // Auto-start recording when autoRecording is enabled and permissions are granted
  useEffect(() => {
    if (autoRecording && hasPermissions && !isRecording) {
      startRecording().catch(console.error);
    }
  }, [autoRecording, hasPermissions, isRecording, startRecording]);

  return {
    isRecording,
    isPaused,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    hasPermissions,
    requestPermissions,
    autoRecording,
    setAutoRecording,
    toggleAutoRecording,
  };
}
