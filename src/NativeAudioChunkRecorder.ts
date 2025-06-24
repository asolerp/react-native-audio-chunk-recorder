import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  RecordingOptions,
  ChunkData,
  ErrorData,
  StateChangeData,
  AudioLevelData,
  InterruptionData
} from './types';

const { AudioChunkRecorder } = NativeModules;

if (!AudioChunkRecorder) {
  throw new Error(
    'AudioChunkRecorder native module is not available. Make sure you have properly installed and linked the react-native-audio-chunk-recorder package.'
  );
}

export interface NativeAudioChunkRecorderInterface {
  // Recording control methods - matching your native implementation
  startRecording(options: RecordingOptions): Promise<string>;
  stopRecording(): Promise<string>;
  pauseRecording(): Promise<string>;
  resumeRecording(): Promise<string>;

  // Permission and availability methods
  checkPermissions(): Promise<boolean>;
  isAvailable(): Promise<boolean>;

  // Cleanup method
  clearAllChunkFiles(): Promise<string>;
}

export const NativeAudioChunkRecorder: NativeAudioChunkRecorderInterface =
  AudioChunkRecorder;

// Event emitter for native events
export const AudioChunkRecorderEventEmitter = new NativeEventEmitter(
  AudioChunkRecorder
);

// Event types - matching your native implementation exactly
export interface AudioChunkRecorderEvents {
  onChunkReady: (chunk: ChunkData) => void;
  onError: (error: ErrorData) => void;
  onStateChange: (state: StateChangeData) => void;
  onAudioLevel: (levelData: AudioLevelData) => void;
  onInterruption: (interruption: InterruptionData) => void;
}

export type AudioChunkRecorderEventType = keyof AudioChunkRecorderEvents;
