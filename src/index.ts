/**
 * react-native-audio-chunk-recorder
 * Main entry point for the NPM module
 */

// Main hook
export { useAudioRecorderCore } from "./hooks/useAudioRecorderCore";

// Native module interface
export {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "./NativeAudioChunkRecorder";
export type {
  NativeAudioChunkRecorderInterface,
  AudioChunkRecorderEvents,
  AudioChunkRecorderEventType,
} from "./NativeAudioChunkRecorder";

// Types
export type {
  AudioRecorderCoreOptions,
  AudioRecorderCoreReturn,
  ChunkData,
  ErrorData,
  InterruptionData,
  StateChangeData,
  AudioLevelData,
  RecordingOptions,
  AlertProvider,
  AlertButton,
  StateManager,
  InterruptionHandler,
  ChunkUploader,
} from "./types";

// Default providers
export { reactNativeAlertProvider } from "./providers/reactNativeAlertProvider";
export { createSimpleStateManager } from "./providers/simpleStateManager";

// Adapters
export { createJotaiStateManager } from "./adapters/jotaiAdapter";

// New Kotlin modular hooks
export { useAudioLevelPreview } from "./hooks/useAudioLevelPreview";
export { useAudioRecorder } from "./hooks/useAudioRecorder";
export { useAudioChunks } from "./hooks/useAudioChunks";
export { useAudioPermissions } from "./hooks/useAudioPermissions";
export type { AudioChunk } from "./hooks/useAudioChunks";
export type { PermissionStatus } from "./hooks/useAudioPermissions";
