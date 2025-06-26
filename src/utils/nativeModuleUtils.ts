import { NativeModules, Platform } from "react-native";
import { NativeAudioChunkRecorder } from "../NativeAudioChunkRecorder";

export interface QuickAvailabilityCheck {
  isAvailable: boolean;
  platform: "ios" | "android" | "unknown";
  error?: string;
}

/**
 * Quick synchronous check for native module availability
 * This is useful for early validation without async operations
 */
export function isNativeModuleAvailableSync(): QuickAvailabilityCheck {
  try {
    // Check platform support
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return {
        isAvailable: false,
        platform: "unknown",
        error: `Platform ${Platform.OS} is not supported`,
      };
    }

    // Check if module exists in NativeModules
    const { AudioChunkRecorder } = NativeModules;
    if (!AudioChunkRecorder) {
      return {
        isAvailable: false,
        platform: Platform.OS as "ios" | "android",
        error: "AudioChunkRecorder module not found in NativeModules",
      };
    }

    // Check if required methods exist (synchronous check)
    const requiredMethods = [
      "startRecording",
      "stopRecording",
      "pauseRecording",
      "resumeRecording",
      "checkPermissions",
      "isAvailable",
      "clearAllChunkFiles",
    ];

    const missingMethods = requiredMethods.filter(
      (method) => typeof AudioChunkRecorder[method] !== "function"
    );

    if (missingMethods.length > 0) {
      return {
        isAvailable: false,
        platform: Platform.OS as "ios" | "android",
        error: `Missing methods: ${missingMethods.join(", ")}`,
      };
    }

    return {
      isAvailable: true,
      platform: Platform.OS as "ios" | "android",
    };
  } catch (error) {
    return {
      isAvailable: false,
      platform: Platform.OS as "ios" | "android",
      error: `Unexpected error: ${error}`,
    };
  }
}

/**
 * Comprehensive asynchronous check for native module availability
 * This includes native-side validation and permission checks
 */
export async function isNativeModuleAvailableAsync(): Promise<QuickAvailabilityCheck> {
  try {
    // First do a quick sync check
    const syncCheck = isNativeModuleAvailableSync();
    if (!syncCheck.isAvailable) {
      return syncCheck;
    }

    // Now do native-side checks
    try {
      const isAvailable = await NativeAudioChunkRecorder.isAvailable();
      if (!isAvailable) {
        return {
          isAvailable: false,
          platform: syncCheck.platform,
          error:
            "Native module is not available (isAvailable() returned false)",
        };
      }
    } catch (error) {
      return {
        isAvailable: false,
        platform: syncCheck.platform,
        error: `Failed to check native availability: ${error}`,
      };
    }

    return {
      isAvailable: true,
      platform: syncCheck.platform,
    };
  } catch (error) {
    return {
      isAvailable: false,
      platform: Platform.OS as "ios" | "android",
      error: `Unexpected error: ${error}`,
    };
  }
}

/**
 * Check if the module has audio recording permissions
 */
export async function hasAudioPermissions(): Promise<boolean> {
  try {
    const syncCheck = isNativeModuleAvailableSync();
    if (!syncCheck.isAvailable) {
      return false;
    }

    return await NativeAudioChunkRecorder.checkPermissions();
  } catch (error) {
    console.warn("Failed to check audio permissions:", error);
    return false;
  }
}

/**
 * Get detailed information about the native module
 */
export function getNativeModuleInfo() {
  const { AudioChunkRecorder } = NativeModules;

  return {
    platform: Platform.OS,
    moduleExists: !!AudioChunkRecorder,
    availableMethods: AudioChunkRecorder
      ? Object.keys(AudioChunkRecorder).filter(
          (key) => typeof AudioChunkRecorder[key] === "function"
        )
      : [],
    moduleVersion: AudioChunkRecorder?.version || "unknown",
  };
}

/**
 * Validate that the native module is properly set up
 * Throws an error if validation fails
 */
export function validateNativeModule(): void {
  const check = isNativeModuleAvailableSync();
  if (!check.isAvailable) {
    throw new Error(
      `Native module validation failed: ${check.error}. ` +
        "Make sure you have properly installed and linked the react-native-audio-chunk-recorder package."
    );
  }
}
