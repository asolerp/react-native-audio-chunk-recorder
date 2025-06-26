# react-native-audio-chunk-recorder

A modular React Native audio recording library with chunking support, audio level monitoring, and configurable dependencies.

## Features

- 🎙️ **Audio Recording with Chunking**: Record audio in configurable chunks
- 📊 **Audio Level Monitoring**: Real-time audio level detection and monitoring
- 🔄 **Interruption Handling**: Handle phone calls and device disconnections
- 🎛️ **Modular Architecture**: Inject your own state management, alerts, and upload logic
- 📱 **React Native Ready**: Works out of the box with React Native
- 🔧 **TypeScript Support**: Full TypeScript definitions
- 🧩 **Framework Agnostic**: Core logic can work with any React app
- 🎯 **Global Coordination**: AudioManager prevents conflicts between hooks

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

### Basic Audio Recording

```tsx
import React from "react";
import { View, Button, Text } from "react-native";
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

### Error Tracking

The library supports optional error tracking integration for monitoring and debugging issues in production:

```tsx
import React from "react";
import { View, Button, Text, Alert } from "react-native";
import {
  useAudioRecorderCore,
  createSentryErrorTracker,
  createConsoleErrorTracker,
} from "react-native-audio-chunk-recorder";

export const RecordingWithErrorTracking = () => {
  // Option 1: Sentry error tracking (requires @sentry/react-native)
  const sentryTracker = createSentryErrorTracker("YOUR_SENTRY_DSN");

  // Option 2: Console error tracking (for development)
  const consoleTracker = createConsoleErrorTracker();

  const { isRecording, startRecording, stopRecording } = useAudioRecorderCore({
    // Configure error tracking
    errorTracker: sentryTracker, // or consoleTracker for development

    // Optional: Set user context for better error tracking
    onError: (error) => {
      sentryTracker.setUser("user123");
      sentryTracker.setTag("component", "audio_recorder");
    },
  });

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      Alert.alert("Error", "Failed to start recording");
    }
  };

  return (
    <View>
      <Button
        title={isRecording ? "Stop Recording" : "Start Recording"}
        onPress={isRecording ? stopRecording : handleStartRecording}
      />
    </View>
  );
};
```

### Audio Level Monitoring

```tsx
import React from "react";
import { View, Button, Text } from "react-native";
import { useAudioLevel } from "react-native-audio-chunk-recorder";

export const AudioLevelScreen = () => {
  const { data, startMonitoring, stopMonitoring, isMonitoring } = useAudioLevel(
    {
      onAudioDetected: (level) => console.log("Audio detected:", level),
      onAudioLost: () => console.log("Audio lost"),
      onLevelChange: (data) =>
        console.log("Level:", data.level, "HasAudio:", data.hasAudio),
    }
  );

  return (
    <View>
      <Button
        title={isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
        onPress={isMonitoring ? stopMonitoring : startMonitoring}
      />
      <Text>Audio Level: {(data.level * 100).toFixed(1)}%</Text>
      <Text>Has Audio: {data.hasAudio ? "Yes" : "No"}</Text>
    </View>
  );
};
```

### VU Meter Component

```tsx
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useAudioLevel } from "react-native-audio-chunk-recorder";

export const VUMeter = () => {
  const { data, startMonitoring, stopMonitoring } = useAudioLevel({
    throttleMs: 16, // 60 FPS for smooth animation
    transformLevel: (level) => Math.pow(level, 0.3), // Logarithmic scaling
  });

  useEffect(() => {
    startMonitoring();
    return () => stopMonitoring();
  }, []);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.meter,
          {
            height: `${data.level * 100}%`,
            backgroundColor: data.hasAudio ? "#0f0" : "#666",
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 100,
    backgroundColor: "#333",
    borderRadius: 8,
    overflow: "hidden",
  },
  meter: {
    width: "100%",
    transition: "height 0.1s ease-out",
  },
});
```

### Voice Activity Detection

```tsx
import React, { useState } from "react";
import { View, Text, Button } from "react-native";
import { useAudioLevel } from "react-native-audio-chunk-recorder";

export const VoiceActivityDetector = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const { startMonitoring, stopMonitoring } = useAudioLevel({
    audioThreshold: 0.005, // Adjust sensitivity
    onAudioDetected: () => setIsSpeaking(true),
    onAudioLost: () => setIsSpeaking(false),
  });

  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>
        {isSpeaking ? "🎤 Speaking..." : "🔇 Silent"}
      </Text>
      <Button title="Start Monitoring" onPress={startMonitoring} />
      <Button title="Stop Monitoring" onPress={stopMonitoring} />
    </View>
  );
};
```

### Coordinated Usage (Multiple Hooks)

```tsx
import React from "react";
import { View, Button, Text } from "react-native";
import {
  useAudioLevel,
  useAudioRecorderCore,
} from "react-native-audio-chunk-recorder";

export const CoordinatedScreen = () => {
  // Audio level monitoring
  const {
    data: levelData,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
  } = useAudioLevel({
    onAudioDetected: (level) => console.log("Audio detected:", level),
    onAudioLost: () => console.log("Audio lost"),
  });

  // Audio recording
  const { isRecording, startRecording, stopRecording, chunks } =
    useAudioRecorderCore({
      onChunkReady: (chunk) => console.log("Chunk ready:", chunk),
    });

  return (
    <View>
      {/* Audio Level Section */}
      <View>
        <Text>Audio Level: {(levelData.level * 100).toFixed(1)}%</Text>
        <Text>Has Audio: {levelData.hasAudio ? "Yes" : "No"}</Text>
        <Button
          title={isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          onPress={isMonitoring ? stopMonitoring : startMonitoring}
        />
      </View>

      {/* Recording Section */}
      <View>
        <Text>Recording: {isRecording ? "Active" : "Inactive"}</Text>
        <Text>Chunks: {chunks.length}</Text>
        <Button
          title={isRecording ? "Stop Recording" : "Start Recording"}
          onPress={isRecording ? stopRecording : startRecording}
        />
      </View>
    </View>
  );
};
```

**Note**: The AudioManager automatically coordinates between hooks to prevent conflicts. When you start recording, monitoring will be stopped automatically, and vice versa.

## AudioManager

The AudioManager is a global singleton that coordinates all audio activities to prevent conflicts between hooks.

### Features

- 🎯 **Conflict Prevention**: Only one audio activity (recording or monitoring) can be active at a time
- 🔄 **Automatic Coordination**: Hooks are automatically notified of state changes
- 🛡️ **Error Prevention**: Prevents "Recording is already in progress" errors
- 📊 **State Management**: Centralized state tracking for all audio activities

### Usage

```tsx
import { audioManager } from "react-native-audio-chunk-recorder";

// Get current state
const state = audioManager.getState();
console.log("Is recording:", state.isRecording);
console.log("Is monitoring:", state.isMonitoring);
console.log("Has active audio:", state.hasActiveAudio);

// Listen to state changes
const unsubscribe = audioManager.addListener((type, active) => {
  console.log(`${type} is now ${active ? "active" : "inactive"}`);
});

// Force stop all audio activities
await audioManager.forceStopAll();

// Cleanup when app shuts down
audioManager.cleanup();
```

### API Reference

#### useAudioRecorderCore(options?)

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

#### useAudioLevel(options?)

Specialized hook for audio level monitoring only.

#### Options

```typescript
interface UseAudioLevelOptions {
  /** Throttle audio level updates in milliseconds (default: 100) */
  throttleMs?: number;
  /** Disable throttling completely for debugging (default: false) */
  disableThrottling?: boolean;
  /** Debug mode - logs all native updates and disables throttling (default: false) */
  debug?: boolean;
  /** Callback when audio level changes */
  onLevelChange?: (data: AudioLevelData) => void;
  /** Callback when audio is detected */
  onAudioDetected?: (level: number) => void;
  /** Callback when audio is lost */
  onAudioLost?: () => void;
  /** Callback when an error occurs */
  onError?: (error: any) => void;
  /** Auto-start monitoring when hook mounts */
  autoStart?: boolean;
}
```

#### Returns

```typescript
interface UseAudioLevelReturn {
  /** Current audio level data */
  data: AudioLevelData;
  /** Start audio level monitoring */
  startMonitoring: () => Promise<void>;
  /** Stop audio level monitoring */
  stopMonitoring: () => Promise<void>;
  /** Whether monitoring is currently active */
  isMonitoring: boolean;
  /** Error message if any */
  error?: string;
  /** Debug method to check AudioRecord state */
  getAudioRecordState: () => Promise<string>;
}
```

## Error Tracking

The library supports optional error tracking integration for monitoring and debugging issues in production. This is especially useful for audio recording applications where errors can be critical for user experience.

### Available Error Trackers

#### 1. Sentry Integration (Recommended for Production)

```tsx
import { createSentryErrorTracker } from "react-native-audio-chunk-recorder";

// Initialize Sentry error tracker
const sentryTracker = createSentryErrorTracker("YOUR_SENTRY_DSN");

const { startRecording } = useAudioRecorderCore({
  errorTracker: sentryTracker,
});
```

**Requirements**: Install `@sentry/react-native` in your project

```bash
npm install @sentry/react-native
```

#### 2. Console Error Tracker (Development)

```tsx
import { createConsoleErrorTracker } from "react-native-audio-chunk-recorder";

// For development and debugging
const consoleTracker = createConsoleErrorTracker();

const { startRecording } = useAudioRecorderCore({
  errorTracker: consoleTracker,
});
```

#### 3. No-op Error Tracker (Default)

If no error tracker is provided, the library uses a no-op implementation that does nothing.

### Error Tracking Features

The error tracking system captures:

- **Recording Errors**: Failed start/stop operations, permission issues
- **Native Module Errors**: Errors from the underlying audio recording system
- **Interruption Events**: Phone calls, device disconnections
- **Upload Failures**: Chunk upload errors when using chunk uploaders
- **Permission Issues**: Microphone permission failures
- **Breadcrumbs**: Contextual information about audio operations

### Advanced Error Tracking Configuration

```tsx
import { createSentryErrorTracker } from "react-native-audio-chunk-recorder";

const sentryTracker = createSentryErrorTracker("YOUR_SENTRY_DSN");

const { startRecording, isRecording, audioLevel } = useAudioRecorderCore({
  errorTracker: sentryTracker,

  // Set user context for better error tracking
  onError: (error) => {
    sentryTracker.setUser("user123");
    sentryTracker.setTag("component", "audio_recorder");
    sentryTracker.setContext("recording_state", {
      isRecording,
      audioLevel,
      timestamp: Date.now(),
    });
  },

  // Track interruptions
  onInterruption: (interruption) => {
    sentryTracker.addBreadcrumb({
      message: `Audio interruption: ${interruption.type}`,
      category: "audio_interruption",
      level: "warning",
      data: interruption,
    });
  },
});
```

### Error Tracking with Audio Level Monitoring

```tsx
import {
  useAudioLevel,
  createSentryErrorTracker,
} from "react-native-audio-chunk-recorder";

const sentryTracker = createSentryErrorTracker("YOUR_SENTRY_DSN");

const { startMonitoring, stopMonitoring } = useAudioLevel({
  errorTracker: sentryTracker,

  onError: (error) => {
    sentryTracker.captureMessage("Audio level monitoring error", "error");
  },
});
```

### Custom Error Tracker Implementation

You can implement your own error tracker by following the `ErrorTracker` interface:

```tsx
import { ErrorTracker } from "react-native-audio-chunk-recorder";

const customErrorTracker: ErrorTracker = {
  captureException: (error, context) => {
    // Your error reporting logic
    console.error("Custom error tracking:", error, context);
  },

  captureMessage: (message, level) => {
    // Your message reporting logic
    console.log(`[${level}] ${message}`);
  },

  setUser: (userId) => {
    // Set user context
  },

  setTag: (key, value) => {
    // Set tag for filtering
  },

  setContext: (name, context) => {
    // Set additional context
  },

  addBreadcrumb: (breadcrumb) => {
    // Add breadcrumb for debugging
  },
};

const { startRecording } = useAudioRecorderCore({
  errorTracker: customErrorTracker,
});
```

### Error Tracking Best Practices

1. **Use Sentry for Production**: Provides comprehensive error monitoring and debugging
2. **Set User Context**: Helps identify which users are experiencing issues
3. **Add Relevant Tags**: Use tags to filter and categorize errors
4. **Include Device Info**: Add device context for better debugging
5. **Track Performance**: Monitor recording performance and failures
6. **Handle Gracefully**: Always provide fallback behavior when errors occur

## Methods and Properties Reference

### useAudioRecorderCore

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

### useAudioLevel

| Name                   | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| **State Properties**   |
| `data.level`           | Current audio level (0-1) from native module         |
| `data.hasAudio`        | Boolean indicating if audio is detected              |
| `isMonitoring`         | Boolean indicating if monitoring is currently active |
| `error`                | Error message if any occurred                        |
| **Monitoring Actions** |
| `startMonitoring()`    | Starts audio level monitoring                        |
| `stopMonitoring()`     | Stops audio level monitoring                         |

| `getAudioRecordState()`
