import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useAudioPermissions } from "./useAudioPermissions";
import {
  isNativeModuleAvailableSync,
  isNativeModuleAvailableAsync,
} from "../utils/nativeModuleUtils";
import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";

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
  // Native module availability
  isNativeModuleAvailable: boolean;
  checkNativeModuleAvailability: () => Promise<boolean>;
  nativeModuleError?: string;
}

export interface UseAudioRecorderOptions {
  autoRecording?: boolean;
  onAutoRecordingStart?: () => void;
  onAutoRecordingStop?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: { isRecording: boolean; isPaused: boolean }) => void;
  validateNativeModule?: boolean; // Whether to validate on mount
}

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoRecording, setAutoRecording] = useState(
    options.autoRecording || false
  );
  const [isNativeModuleAvailable, setIsNativeModuleAvailable] = useState(false);
  const [nativeModuleError, setNativeModuleError] = useState<
    string | undefined
  >();

  // Use the permissions hook
  const { hasPermissions, requestPermissions } = useAudioPermissions();

  // Check native module availability
  const checkNativeModuleAvailability =
    useCallback(async (): Promise<boolean> => {
      try {
        const syncCheck = isNativeModuleAvailableSync();
        if (!syncCheck.isAvailable) {
          setNativeModuleError(syncCheck.error);
          setIsNativeModuleAvailable(false);
          return false;
        }

        const asyncCheck = await isNativeModuleAvailableAsync();
        if (!asyncCheck.isAvailable) {
          setNativeModuleError(asyncCheck.error);
          setIsNativeModuleAvailable(false);
          return false;
        }

        setNativeModuleError(undefined);
        setIsNativeModuleAvailable(true);
        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setNativeModuleError(errorMessage);
        setIsNativeModuleAvailable(false);
        return false;
      }
    }, []);

  const startRecording = useCallback(
    async (sampleRate: number = 16000, chunkSeconds: number = 30) => {
      // Check native module availability first
      if (!isNativeModuleAvailable) {
        const isAvailable = await checkNativeModuleAvailability();
        if (!isAvailable) {
          const errorMessage = `Native module not available: ${nativeModuleError}`;
          options.onError?.(errorMessage);
          Alert.alert("Error", errorMessage);
          return;
        }
      }

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
        await NativeAudioChunkRecorder.startRecording(recordingOptions);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        options.onError?.(errorMessage);
        Alert.alert("Error", `Failed to start recording: ${errorMessage}`);
      }
    },
    [
      hasPermissions,
      requestPermissions,
      options.onError,
      isNativeModuleAvailable,
      checkNativeModuleAvailability,
      nativeModuleError,
    ]
  );

  const stopRecording = useCallback(async () => {
    if (!isNativeModuleAvailable) {
      const errorMessage = "Native module not available";
      options.onError?.(errorMessage);
      Alert.alert("Error", errorMessage);
      return;
    }

    try {
      await NativeAudioChunkRecorder.stopRecording();
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
  }, [
    autoRecording,
    options.onAutoRecordingStop,
    options.onError,
    isNativeModuleAvailable,
  ]);

  const pauseRecording = useCallback(async () => {
    if (!isNativeModuleAvailable) {
      const errorMessage = "Native module not available";
      options.onError?.(errorMessage);
      Alert.alert("Error", errorMessage);
      return;
    }

    try {
      await NativeAudioChunkRecorder.pauseRecording();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      options.onError?.(errorMessage);
      Alert.alert("Error", `Failed to pause recording: ${errorMessage}`);
    }
  }, [options.onError, isNativeModuleAvailable]);

  const resumeRecording = useCallback(async () => {
    if (!isNativeModuleAvailable) {
      const errorMessage = "Native module not available";
      options.onError?.(errorMessage);
      Alert.alert("Error", errorMessage);
      return;
    }

    try {
      await NativeAudioChunkRecorder.resumeRecording();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      options.onError?.(errorMessage);
      Alert.alert("Error", `Failed to resume recording: ${errorMessage}`);
    }
  }, [options.onError, isNativeModuleAvailable]);

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
    if (!isNativeModuleAvailable) return;

    const stateSub = AudioChunkRecorderEventEmitter.addListener(
      "onStateChange",
      (state: { isRecording: boolean; isPaused: boolean }) => {
        setIsRecording(state.isRecording);
        setIsPaused(state.isPaused || false);
        options.onStateChange?.(state);
      }
    );

    const errorSub = AudioChunkRecorderEventEmitter.addListener(
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
  }, [options.onStateChange, options.onError, isNativeModuleAvailable]);

  // Auto-start recording when autoRecording is enabled and permissions are granted
  useEffect(() => {
    if (
      autoRecording &&
      hasPermissions &&
      !isRecording &&
      isNativeModuleAvailable
    ) {
      startRecording().catch(console.error);
    }
  }, [
    autoRecording,
    hasPermissions,
    isRecording,
    startRecording,
    isNativeModuleAvailable,
  ]);

  // Initial native module validation
  useEffect(() => {
    if (options.validateNativeModule !== false) {
      checkNativeModuleAvailability();
    }
  }, [checkNativeModuleAvailability, options.validateNativeModule]);

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
    isNativeModuleAvailable,
    checkNativeModuleAvailability,
    nativeModuleError,
  };
}
