/**
 * react-native-audio-chunk-recorder
 * Main entry point for the NPM module
 */

// Main hooks
export { useAudioRecorderCore } from "./hooks/useAudioRecorderCore";
export { useAudioLevel } from "./hooks/useAudioLevel";
export type {
  UseAudioLevelOptions,
  UseAudioLevelReturn,
} from "./hooks/useAudioLevel";

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
