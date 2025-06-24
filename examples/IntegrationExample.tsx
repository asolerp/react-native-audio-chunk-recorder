/**
 * Integration example showing how to use the module with the current app's setup
 * This demonstrates how to migrate from the current useAudioRecorder to the modular version
 */

import React from 'react';
import { View, Button, Text } from 'react-native';
import { useAtom, useStore } from 'jotai';
import {
  useAudioRecorderCore,
  createJotaiStateManager,
  type AlertProvider,
  type InterruptionHandler
} from '../src';

// Import existing atoms from the app
// import { audioInterruptionAtom, audioAlertActiveAtom } from '../../../src/store/atoms/audioInterruption';

// Mock atoms for this example
const audioInterruptionAtom = { read: () => false, write: () => {} };
const audioAlertActiveAtom = { read: () => false, write: () => {} };

// Custom alert provider that could integrate with the app's existing alert system
const appAlertProvider: AlertProvider = {
  showAlert: (title, message, buttons) => {
    // Could integrate with react-native-flash-message or other alert systems
    console.log('App Alert:', { title, message, buttons });

    // For now, use React Native's Alert
    import('react-native').then(({ Alert }) => {
      Alert.alert(title, message, buttons);
    });
  }
};

// Custom interruption handler that matches the app's current behavior
const appInterruptionHandler: InterruptionHandler = {
  onInterruption: data => {
    console.log('App: Audio interruption detected', data);

    if (data.type === 'began') {
      // Custom logic for when interruption begins
      // Could trigger app-specific side effects
    } else if (data.type === 'ended') {
      // Custom logic for when interruption ends
      // Could resume recording automatically based on app preferences
    }
  },

  onDeviceDisconnected: data => {
    console.log('App: Audio device disconnected', data);

    // Custom logic for device disconnection
    // Could show different UI or handle differently than phone calls
  }
};

export const IntegratedRecordingExample = () => {
  const store = useStore();

  // Create state manager with app's existing atoms
  const stateManager = createJotaiStateManager(store, {
    audioInterruption: audioInterruptionAtom,
    audioAlertActive: audioAlertActiveAtom
  });

  // Use the modular hook with app-specific configuration
  const recorder = useAudioRecorderCore({
    // Inject app-specific dependencies
    alertProvider: appAlertProvider,
    stateManager: stateManager,
    interruptionHandler: appInterruptionHandler,

    // Configuration that matches current app behavior
    autoCheckPermissions: true,
    defaultRecordingOptions: {
      sampleRate: 44100,
      bitRate: 128000,
      chunkSeconds: 10 // Match current app's chunk size
    },

    // Callbacks that integrate with existing app logic
    onChunkReady: chunk => {
      console.log('App: New chunk ready for processing', chunk);

      // Here you could integrate with existing chunk queue logic
      // audioChunkQueueService.enqueue(chunk);
    },

    onError: error => {
      console.error('App: Recording error', error);

      // Here you could integrate with existing error tracking
      // Bugsnag.notify(error);
    },

    onInterruption: interruption => {
      console.log('App: Interruption callback', interruption);

      // Additional app-specific interruption handling
      // Could update UI state, show notifications, etc.
    }
  });

  // Subscribe to additional events if needed
  React.useEffect(() => {
    const unsubscribeAudioLevel = recorder.onAudioLevel(levelData => {
      // Handle audio level updates for UI animations
      console.log('Audio level:', levelData);
    });

    const unsubscribeStateChange = recorder.onStateChange(state => {
      // Handle state changes for analytics or other side effects
      console.log('Recording state changed:', state);
    });

    return () => {
      unsubscribeAudioLevel();
      unsubscribeStateChange();
    };
  }, [recorder]);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 20 }}>
        Integrated Recording Example
      </Text>

      <Text style={{ marginBottom: 10 }}>
        Status: {recorder.isRecording ? 'Recording' : 'Stopped'}
      </Text>

      <Text style={{ marginBottom: 10 }}>Chunks: {recorder.chunks.length}</Text>

      {recorder.isInterrupted && (
        <Text style={{ color: 'red', marginBottom: 10 }}>
          ⚠️ Recording interrupted
        </Text>
      )}

      <Button
        title={recorder.isRecording ? 'Stop Recording' : 'Start Recording'}
        onPress={() => {
          if (recorder.isRecording) {
            recorder.stopRecording();
          } else {
            recorder.startRecording();
          }
        }}
      />

      {recorder.chunks.length > 0 && (
        <Button title="Clear Chunks" onPress={recorder.clearChunks} />
      )}
    </View>
  );
};

// Example of how to create a wrapper hook that maintains the same API as the current useAudioRecorder
export const useAudioRecorderCompatible = () => {
  const store = useStore();

  const stateManager = createJotaiStateManager(store, {
    audioInterruption: audioInterruptionAtom,
    audioAlertActive: audioAlertActiveAtom
  });

  const recorder = useAudioRecorderCore({
    alertProvider: appAlertProvider,
    stateManager: stateManager,
    interruptionHandler: appInterruptionHandler,
    autoCheckPermissions: true,
    defaultRecordingOptions: {
      sampleRate: 44100,
      bitRate: 128000,
      chunkSeconds: 10
    }
  });

  // Return the same interface as the current useAudioRecorder
  return {
    // Existing API
    service: recorder.service,
    isRecording: recorder.isRecording,
    isPaused: recorder.isPaused,
    hasPermission: recorder.hasPermission,
    chunks: recorder.chunks,
    audioLevel: recorder.audioLevel,
    hasAudio: recorder.hasAudio,
    isAvailable: recorder.isAvailable,
    isInterrupted: recorder.isInterrupted,

    // Existing methods
    startRecording: recorder.startRecording,
    stopRecording: recorder.stopRecording,
    pauseRecording: recorder.pauseRecording,
    resumeRecording: recorder.resumeRecording,
    clearChunks: recorder.clearChunks,
    clearAllChunkFiles: recorder.clearAllChunkFiles,
    checkPermissions: recorder.checkPermissions

    // Additional methods that were in the original hook
    // These could be implemented as wrappers around the core functionality
  };
};

/*
Migration Strategy:

1. **Phase 1 - Side by Side**: 
   - Install the module alongside existing code
   - Create wrapper hooks like `useAudioRecorderCompatible`
   - Test in development with feature flags

2. **Phase 2 - Gradual Migration**:
   - Replace one component at a time
   - Use the compatible wrapper to maintain API
   - Verify functionality matches exactly

3. **Phase 3 - Full Migration**:
   - Remove old useAudioRecorder implementation
   - Remove wrapper hooks
   - Use the modular API directly

4. **Phase 4 - Customization**:
   - Customize providers for app-specific needs
   - Add additional features using the modular architecture
   - Extract common patterns into reusable components
*/
