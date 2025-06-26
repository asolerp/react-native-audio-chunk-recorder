import { useState, useEffect, useCallback } from "react";
import { NativeModules, Platform } from "react-native";
import { NativeAudioChunkRecorder } from "../NativeAudioChunkRecorder";

export interface NativeModuleStatus {
  isAvailable: boolean;
  isInitialized: boolean;
  hasPermissions: boolean;
  platform: "ios" | "android" | "unknown";
  error?: string;
  details: {
    moduleExists: boolean;
    methodsAvailable: boolean;
    permissionsGranted: boolean;
    platformSupported: boolean;
  };
}

export interface UseNativeModuleAvailabilityResult {
  status: NativeModuleStatus;
  checkAvailability: () => Promise<NativeModuleStatus>;
  refreshStatus: () => Promise<void>;
  isLoading: boolean;
}

export function useNativeModuleAvailability(): UseNativeModuleAvailabilityResult {
  const [status, setStatus] = useState<NativeModuleStatus>({
    isAvailable: false,
    isInitialized: false,
    hasPermissions: false,
    platform: Platform.OS as "ios" | "android" | "unknown",
    details: {
      moduleExists: false,
      methodsAvailable: false,
      permissionsGranted: false,
      platformSupported: false,
    },
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkAvailability =
    useCallback(async (): Promise<NativeModuleStatus> => {
      const newStatus: NativeModuleStatus = {
        isAvailable: false,
        isInitialized: false,
        hasPermissions: false,
        platform: Platform.OS as "ios" | "android" | "unknown",
        details: {
          moduleExists: false,
          methodsAvailable: false,
          permissionsGranted: false,
          platformSupported: false,
        },
      };

      try {
        // Check if platform is supported
        newStatus.details.platformSupported =
          Platform.OS === "ios" || Platform.OS === "android";

        if (!newStatus.details.platformSupported) {
          newStatus.error = `Platform ${Platform.OS} is not supported`;
          return newStatus;
        }

        // Check if module exists in NativeModules
        const { AudioChunkRecorder } = NativeModules;
        newStatus.details.moduleExists = !!AudioChunkRecorder;

        if (!newStatus.details.moduleExists) {
          newStatus.error =
            "AudioChunkRecorder module not found in NativeModules";
          return newStatus;
        }

        // Check if required methods are available
        const requiredMethods = [
          "startRecording",
          "stopRecording",
          "pauseRecording",
          "resumeRecording",
          "checkPermissions",
          "isAvailable",
          "clearAllChunkFiles",
        ];

        const availableMethods = requiredMethods.filter(
          (method) => typeof AudioChunkRecorder[method] === "function"
        );

        newStatus.details.methodsAvailable =
          availableMethods.length === requiredMethods.length;

        if (!newStatus.details.methodsAvailable) {
          const missingMethods = requiredMethods.filter(
            (method) => !availableMethods.includes(method)
          );
          newStatus.error = `Missing methods: ${missingMethods.join(", ")}`;
          return newStatus;
        }

        // Check if module is available (native check)
        try {
          const isAvailable = await NativeAudioChunkRecorder.isAvailable();
          newStatus.isAvailable = isAvailable;
          newStatus.isInitialized = isAvailable;

          if (!isAvailable) {
            newStatus.error =
              "Native module is not available (isAvailable() returned false)";
            return newStatus;
          }
        } catch (error) {
          newStatus.error = `Failed to check module availability: ${error}`;
          return newStatus;
        }

        // Check permissions
        try {
          const hasPermissions =
            await NativeAudioChunkRecorder.checkPermissions();
          newStatus.hasPermissions = hasPermissions;
          newStatus.details.permissionsGranted = hasPermissions;
        } catch (error) {
          console.warn("Failed to check permissions:", error);
          // Don't fail the entire check for permission issues
        }

        // If we get here, everything is working
        newStatus.isAvailable = true;
        newStatus.isInitialized = true;
      } catch (error) {
        newStatus.error = `Unexpected error checking availability: ${error}`;
      }

      return newStatus;
    }, []);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const newStatus = await checkAvailability();
      setStatus(newStatus);
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        error: `Failed to refresh status: ${error}`,
      }));
    } finally {
      setIsLoading(false);
    }
  }, [checkAvailability]);

  // Initial check on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    checkAvailability,
    refreshStatus,
    isLoading,
  };
}
