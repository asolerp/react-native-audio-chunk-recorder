# react-native-audio-chunk-recorder

A modular React Native audio recording library with chunking support and configurable dependencies.

## Features

- 🎙️ **Audio Recording with Chunking**: Record audio in configurable chunks
- 🔄 **Interruption Handling**: Handle phone calls and device disconnections
- 🎛️ **Modular Architecture**: Inject your own state management, alerts, and upload logic
- 📱 **React Native Ready**: Works out of the box with React Native
- 🔧 **TypeScript Support**: Full TypeScript definitions
- 🧩 **Framework Agnostic**: Core logic can work with any React app

## Installation

```bash
npm install @asolerp/react-native-audio-chunk-recorder
# or
yarn add @asolerp/react-native-audio-chunk-recorder
```

### iOS Setup

1. Run `cd ios && pod install` to install iOS dependencies
2. Add the following permissions to your `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs access to microphone to record audio</string>
```

3. For background recording support, add background modes to your `Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

### Android Setup

1. Add the following permissions to your `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />

<!-- For background recording support -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

2. For background recording, declare a foreground service in your `<application>` tag:

```xml
<service
    android:name=".AudioRecordingService"
    android:foregroundServiceType="microphone"
    android:exported="false" />
```

2. For React Native >= 0.60, the package will be auto-linked. For older versions, you need to manually link:

```bash
react-native link react-native-audio-chunk-recorder
```

### Manual Linking (if needed)

#### iOS

1. In XCode, in the project navigator, right click `Libraries` ➜ `Add Files to [your project's name]`
2. Go to `node_modules` ➜ `react-native-audio-chunk-recorder` and add `AudioChunkRecorder.xcodeproj`
3. In XCode, in the project navigator, select your project. Add `libAudioChunkRecorder.a` to your project's `Build Phases` ➜ `Link Binary With Libraries`

#### Android

1. Open up `android/app/src/main/java/[...]/MainApplication.java`
2. Add `import com.audiochunkrecorder.AudioChunkRecorderPackage;` to the imports at the top of the file
3. Add `new AudioChunkRecorderPackage()` to the list returned by the `getPackages()` method

4. Append the following lines to `android/settings.gradle`:

   ```gradle
   include ':react-native-audio-chunk-recorder'
   project(':react-native-audio-chunk-recorder').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-audio-chunk-recorder/android')
   ```

5. Insert the following lines inside the dependencies block in `android/app/build.gradle`:
   ```gradle
   implementation project(':react-native-audio-chunk-recorder')
   ```

## Background Recording

This library supports background recording on both iOS and Android. When properly configured, your app can continue recording audio even when the user switches to another app or when the device screen is locked.

### How it works

- **iOS**: Uses `UIBackgroundModes` with `audio` capability to keep the audio session active
- **Android**: Uses foreground services with microphone type to maintain recording in background
- **Automatic handling**: The library automatically manages the background recording lifecycle

### Important Notes

1. **iOS**: Background recording will continue as long as the audio session is active. The system may terminate background recording after extended periods of inactivity.

2. **Android**: The foreground service will show a persistent notification to the user while recording in background. This is required by Android for transparency.

3. **Battery optimization**: On Android, users may need to disable battery optimization for your app to ensure reliable background recording.

4. **Permissions**: Make sure you have proper permissions and inform users why background recording is necessary for your app.

## Quick Start

### Basic Usage

```tsx
import React from "react";
import { View, Button } from "react-native";
import { useAudioRecorderCore } from "react-native-audio-chunk-recorder";

export const RecordingScreen = () => {
  const { isRecording, startRecording, stopRecording, chunks, hasPermission } =
    useAudioRecorderCore();

  if (!hasPermission) {
    return <Text>Microphone permission required</Text>;
  }

  return (
    <View>
      <Button
        title={isRecording ? "Stop Recording" : "Start Recording"}
        onPress={isRecording ? stopRecording : startRecording}
      />
      <Text>Chunks recorded: {chunks.length}</Text>
    </View>
  );
};
```

### Advanced Usage with Custom Providers

```tsx
import React from "react";
import {
  useAudioRecorderCore,
  createJotaiStateManager,
} from "react-native-audio-chunk-recorder";
import { useStore } from "jotai";
import { audioInterruptionAtom } from "./atoms";

const customAlertProvider = {
  showAlert: (title, message, buttons) => {
    // Custom alert implementation
    MyCustomAlert.show({ title, message, buttons });
  },
};

const customInterruptionHandler = {
  onInterruption: (data) => {
    // Custom interruption logic
    console.log("Custom interruption handling:", data);
  },
  onDeviceDisconnected: (data) => {
    // Custom device disconnection logic
    console.log("Device disconnected:", data);
  },
};

const atoms = {
  audioInterruption: audioInterruptionAtom,
};

export const AdvancedRecordingScreen = () => {
  const store = useStore();
  const stateManager = createJotaiStateManager(store, atoms);

  const recorder = useAudioRecorderCore({
    alertProvider: customAlertProvider,
    stateManager: stateManager,
    interruptionHandler: customInterruptionHandler,
    autoCheckPermissions: true,
    defaultRecordingOptions: {
      sampleRate: 16000, // Optimized for speech recognition
      bitRate: 64000, // Good quality for speech
      chunkSeconds: 30, // Balanced chunk size
    },
    onChunkReady: (chunk) => {
      console.log("New chunk ready:", chunk);
      // Custom chunk handling
    },
  });

  // ... rest of component
};
```

## Audio Formats

### iOS Supported Formats

- **AAC** (Advanced Audio Codec) - Default, best balance of quality and size
- **Linear PCM** - Uncompressed, highest quality
- **AIFF** - Apple Interchange File Format
- **CAF** - Core Audio Format (Apple's container format)
- **FLAC** - Free Lossless Audio Codec (iOS 11+)

### Android Supported Formats

- **AAC** - Advanced Audio Codec (recommended)
- **AMR_NB** - Adaptive Multi-Rate Narrowband (8kHz)
- **AMR_WB** - Adaptive Multi-Rate Wideband (16kHz)
- **MPEG_4** - MPEG-4 audio format
- **THREE_GPP** - 3GPP multimedia format
- **WEBM** - WebM audio format (Android 5.0+)
- **OGG** - OGG Vorbis format (Android 10+)

### Recommended Settings

- **Sample Rate**: 44100 Hz (CD quality) or 16000 Hz (speech optimized)
- **Bit Rate**: 128 kbps (high quality) or 64 kbps (speech optimized)
- **Format**: AAC (best compatibility across platforms)

## API Reference

### useAudioRecorderCore(options?)

Main hook for audio recording functionality.

#### Options

```typescript
interface AudioRecorderCoreOptions {
  // Injected dependencies
  alertProvider?: AlertProvider;
  stateManager?: StateManager;
  interruptionHandler?: InterruptionHandler;
  chunkUploader?: ChunkUploader;

  // Configuration
  autoStartRecording?: boolean;
  autoCheckPermissions?: boolean;
  defaultRecordingOptions?: RecordingOptions;

  // Event callbacks
  onChunkReady?: (chunk: ChunkData) => void;
  onError?: (error: ErrorData) => void;
  onInterruption?: (interruption: InterruptionData) => void;
  onStateChange?: (state: StateChangeData) => void;
}
```

#### Returns

```typescript
interface AudioRecorderCoreReturn {
  // State
  isRecording: boolean;
  isPaused: boolean;
  hasPermission: boolean;
  chunks: ChunkData[];
  audioLevel: number;
  hasAudio: boolean;
  isAvailable: boolean;
  isInterrupted: boolean;

  // Actions
  startRecording: (options?: RecordingOptions) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  clearChunks: () => void;
  clearAllChunkFiles: () => Promise<void>;
  checkPermissions: () => Promise<void>;

  // Event handlers
  onChunkReady: (callback: (chunk: ChunkData) => void) => () => void;
  onAudioLevel: (callback: (levelData: AudioLevelData) => void) => () => void;
  onError: (callback: (error: ErrorData) => void) => () => void;
  onInterruption: (
    callback: (interruption: InterruptionData) => void
  ) => () => void;
  onStateChange: (callback: (state: StateChangeData) => void) => () => void;
}
```

## Methods and Properties Reference

| Name                       | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| **State Properties**       |
| `isRecording`              | Boolean indicating if recording is currently active          |
| `isPaused`                 | Boolean indicating if recording is currently paused          |
| `hasPermission`            | Boolean indicating if microphone permission is granted       |
| `chunks`                   | Array of recorded audio chunks with metadata                 |
| `audioLevel`               | Current audio input level (0-1) for visualizations           |
| `hasAudio`                 | Boolean indicating if any audio has been recorded            |
| `isAvailable`              | Boolean indicating if audio recording is available on device |
| `isInterrupted`            | Boolean indicating if recording was interrupted              |
| **Recording Actions**      |
| `startRecording(options?)` | Starts audio recording with optional configuration           |
| `stopRecording()`          | Stops current recording session                              |
| `pauseRecording()`         | Pauses current recording (can be resumed)                    |
| `resumeRecording()`        | Resumes paused recording                                     |
| `clearChunks()`            | Clears all recorded chunks from memory                       |
| `clearAllChunkFiles()`     | Deletes all chunk files from device storage                  |
| `checkPermissions()`       | Manually checks and requests microphone permissions          |
| **Event Handlers**         |
| `onChunkReady(callback)`   | Fires when a new audio chunk is ready                        |
| `onAudioLevel(callback)`   | Fires with real-time audio level data                        |
| `onError(callback)`        | Fires when recording errors occur                            |
| `onInterruption(callback)` | Fires when recording is interrupted (calls, etc.)            |
| `onStateChange(callback)`  | Fires when recording state changes                           |

## Providers

### AlertProvider

Interface for showing alerts to users:

```typescript
interface AlertProvider {
  showAlert: (title: string, message: string, buttons: AlertButton[]) => void;
}
```

**Default**: `reactNativeAlertProvider` - Uses React Native's `Alert.alert()`

### StateManager

Interface for global state management:

```typescript
interface StateManager {
  getState: <T>(key: string) => T;
  setState: <T>(key: string, value: T) => void;
  subscribe: <T>(key: string, callback: (value: T) => void) => () => void;
}
```

**Default**: `createSimpleStateManager()` - In-memory state management

**Jotai**: `createJotaiStateManager(store, atoms)` - For apps using Jotai

### InterruptionHandler

Interface for handling audio interruptions:

```typescript
interface InterruptionHandler {
  onInterruption: (data: InterruptionData) => void;
  onDeviceDisconnected: (data: InterruptionData) => void;
}
```

**Default**: Shows alerts for interruptions and device disconnections

## State Management Integration

### With Jotai

```tsx
import { atom, useAtom } from "jotai";
import { createJotaiStateManager } from "react-native-audio-chunk-recorder";

const audioInterruptionAtom = atom(false);
const audioAlertActiveAtom = atom(false);

const atoms = {
  audioInterruption: audioInterruptionAtom,
  audioAlertActive: audioAlertActiveAtom,
};

const stateManager = createJotaiStateManager(store, atoms);
```

### With Redux

Create your own adapter:

```tsx
import { useDispatch, useSelector } from "react-redux";

const createReduxStateManager = () => ({
  getState: (key) => useSelector((state) => state[key]),
  setState: (key, value) => {
    const dispatch = useDispatch();
    dispatch({ type: `SET_${key.toUpperCase()}`, payload: value });
  },
  subscribe: (key, callback) => {
    // Redux subscription logic
  },
});
```

## Types

All TypeScript types are exported for custom implementations:

```tsx
import type {
  ChunkData,
  ErrorData,
  InterruptionData,
  AudioLevelData,
  RecordingOptions,
  AlertProvider,
  StateManager,
  InterruptionHandler,
} from "react-native-audio-chunk-recorder";
```

## Architecture

This library follows a modular architecture that allows you to:

1. **Inject Dependencies**: Provide your own alert system, state management, and upload logic
2. **Customize Behavior**: Handle interruptions and errors according to your app's needs
3. **Framework Agnostic**: Core logic works with any React setup
4. **Type Safe**: Full TypeScript support with proper interfaces

## License

MIT
