import React from "react";
import { View, Text, Button, Alert } from "react-native";
import {
  useAudioRecorderCore,
  createSentryErrorTracker,
  createConsoleErrorTracker,
} from "../src";

/**
 * Example showing how to integrate error tracking with the audio recorder
 */
export const ErrorTrackingExample: React.FC = () => {
  // Option 1: Sentry error tracking (requires @sentry/react-native)
  const sentryTracker = createSentryErrorTracker("YOUR_SENTRY_DSN");

  // Option 2: Console error tracking (for development)
  const consoleTracker = createConsoleErrorTracker();

  // Use the audio recorder with error tracking
  const { isRecording, startRecording, stopRecording, audioLevel, hasAudio } =
    useAudioRecorderCore({
      // Configure error tracking
      errorTracker: sentryTracker, // or consoleTracker for development

      // Optional: Set user context for better error tracking
      onError: (error) => {
        // Set user context when errors occur
        sentryTracker.setUser("user123");
        sentryTracker.setTag("component", "audio_recorder");
        sentryTracker.setContext("recording_state", {
          isRecording,
          audioLevel,
          hasAudio,
        });
      },

      // Optional: Custom error handling
      onInterruption: (interruption) => {
        Alert.alert(
          "Recording Interrupted",
          `Recording was interrupted: ${interruption.type}`,
          [{ text: "OK" }]
        );
      },
    });

  const handleStartRecording = async () => {
    try {
      await startRecording({
        sampleRate: 16000,
        chunkSeconds: 30,
      });
    } catch (error) {
      Alert.alert("Error", "Failed to start recording");
    }
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch (error) {
      Alert.alert("Error", "Failed to stop recording");
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 20 }}>
        Error Tracking Example
      </Text>

      <Text style={{ marginBottom: 10 }}>
        Recording: {isRecording ? "Yes" : "No"}
      </Text>

      <Text style={{ marginBottom: 10 }}>
        Audio Level: {audioLevel.toFixed(3)}
      </Text>

      <Text style={{ marginBottom: 20 }}>
        Has Audio: {hasAudio ? "Yes" : "No"}
      </Text>

      <Button
        title={isRecording ? "Stop Recording" : "Start Recording"}
        onPress={isRecording ? handleStopRecording : handleStartRecording}
      />
    </View>
  );
};

/**
 * Example with console error tracking for development
 */
export const DevelopmentErrorTrackingExample: React.FC = () => {
  const consoleTracker = createConsoleErrorTracker();

  const { isRecording, startRecording, stopRecording } = useAudioRecorderCore({
    errorTracker: consoleTracker,

    // This will log all errors to console during development
    onError: (error) => {
      console.log("Development error caught:", error);
    },
  });

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      console.log("Failed to start recording:", error);
    }
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch (error) {
      console.log("Failed to stop recording:", error);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 20 }}>
        Development Error Tracking
      </Text>

      <Text style={{ marginBottom: 20 }}>Check console for error logs</Text>

      <Button
        title={isRecording ? "Stop Recording" : "Start Recording"}
        onPress={isRecording ? handleStopRecording : handleStartRecording}
      />
    </View>
  );
};
