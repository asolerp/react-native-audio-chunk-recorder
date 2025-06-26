/**
 * Core types and interfaces for react-native-audio-chunk-recorder
 */

import { ErrorTracker } from "./providers/errorTracker";

// ===== NATIVE MODULE TYPES =====
// These would normally come from the native module

export interface ChunkData {
  uri: string;
  path: string;
  seq: number;
}

export interface RecordingOptions {
  sampleRate?: number; // Default: 16000
  bitRate?: number; // Default: 64000
  chunkSeconds?: number; // Default: 30
}

// Aliases for compatibility
export type AudioChunkRecorderOptions = RecordingOptions;
export type AudioChunk = ChunkData;

export interface ErrorData {
  message: string;
  code?: number;
}

export interface InterruptionData {
  type: "began" | "ended" | "audioDeviceDisconnected";
  reason?: string;
  wasRecording?: boolean;
  shouldResume?: boolean;
  canResume?: boolean;
  nativePaused?: boolean;
}

export interface StateChangeData {
  isRecording: boolean;
  isPaused: boolean;
}

export interface AudioLevelData {
  level: number;
  hasAudio: boolean;
  averagePower?: number;
}

// ===== PROVIDER INTERFACES =====

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

export interface AlertProvider {
  showAlert: (title: string, message: string, buttons: AlertButton[]) => void;
}

export interface StateManager {
  getState: <T>(key: string) => T;
  setState: <T>(key: string, value: T) => void;
  subscribe: <T>(key: string, callback: (value: T) => void) => () => void;
}

export interface InterruptionHandler {
  onInterruption: (data: InterruptionData) => void;
  onDeviceDisconnected: (data: InterruptionData) => void;
}

export interface ChunkUploader {
  upload: (chunk: ChunkData) => Promise<void>;
  onProgress?: (progress: number) => void;
  onSuccess?: (chunkId: string) => void;
  onError?: (chunkId: string, error: string) => void;
}

// ===== CONFIGURATION INTERFACES =====

export interface AudioRecorderCoreOptions {
  // Injected dependencies (for modularity)
  alertProvider?: AlertProvider;
  stateManager?: StateManager;
  interruptionHandler?: InterruptionHandler;
  chunkUploader?: ChunkUploader;
  errorTracker?: ErrorTracker;
  nativeService?: any; // Inject the native service

  // Core configuration
  autoStartRecording?: boolean;
  autoCheckPermissions?: boolean;
  defaultRecordingOptions?: RecordingOptions;

  // Event callbacks
  onChunkReady?: (chunk: ChunkData) => void;
  onError?: (error: ErrorData) => void;
  onInterruption?: (interruption: InterruptionData) => void;
  onStateChange?: (state: StateChangeData) => void;
}

// ===== HOOK RETURN TYPES =====

export interface AudioRecorderCoreReturn {
  // Service instance
  service: any | null; // AudioRecorderService from native

  // State
  isRecording: boolean;
  isPaused: boolean;
  hasPermission: boolean;
  chunks: ChunkData[];
  audioLevel: number;
  hasAudio: boolean;
  isAvailable: boolean;
  isInterrupted: boolean;

  // Queue state (if enabled)
  queueSize?: number;
  isUploading?: boolean;

  // Actions
  startRecording: (options?: RecordingOptions) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  clearChunks: () => void;
  clearAllChunkFiles: () => Promise<void>;
  checkPermissions: () => Promise<void>;

  // Event handlers (for custom logic)
  onChunkReady: (callback: (chunk: ChunkData) => void) => () => void;
  onAudioLevel: (callback: (levelData: AudioLevelData) => void) => () => void;
  onError: (callback: (error: ErrorData) => void) => () => void;
  onInterruption: (
    callback: (interruption: InterruptionData) => void
  ) => () => void;
  onStateChange: (callback: (state: StateChangeData) => void) => () => void;
}
