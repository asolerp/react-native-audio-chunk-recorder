import { useCallback, useState, useEffect } from "react";
import { PermissionsAndroid, Platform } from "react-native";

export interface PermissionStatus {
  granted: boolean;
  checking: boolean;
  error?: string;
}

export interface UseAudioPermissionsReturn {
  permissionStatus: PermissionStatus;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  hasPermissions: boolean;
}

export function useAudioPermissions(): UseAudioPermissionsReturn {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    granted: false,
    checking: false,
  });

  const checkPermissions = useCallback(async (): Promise<boolean> => {
    setPermissionStatus((prev) => ({
      ...prev,
      checking: true,
      error: undefined,
    }));

    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );

        setPermissionStatus({
          granted,
          checking: false,
        });

        return granted;
      } else {
        // iOS permissions are handled differently - usually checked at runtime
        // You might want to add iOS-specific permission checking here
        setPermissionStatus({
          granted: true, // iOS typically handles this automatically
          checking: false,
        });
        return true;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setPermissionStatus({
        granted: false,
        checking: false,
        error: errorMessage,
      });
      return false;
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    setPermissionStatus((prev) => ({
      ...prev,
      checking: true,
      error: undefined,
    }));

    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Audio Recording Permission",
            message:
              "This app needs access to your microphone to record audio.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );

        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;

        setPermissionStatus({
          granted: isGranted,
          checking: false,
        });

        return isGranted;
      } else {
        // iOS permissions are typically requested automatically when needed
        setPermissionStatus({
          granted: true,
          checking: false,
        });
        return true;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setPermissionStatus({
        granted: false,
        checking: false,
        error: errorMessage,
      });
      return false;
    }
  }, []);

  // Check permissions on mount
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  return {
    permissionStatus,
    checkPermissions,
    requestPermissions,
    hasPermissions: permissionStatus.granted,
  };
}
