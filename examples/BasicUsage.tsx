/**
 * Basic usage example for react-native-audio-chunk-recorder
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useAudioRecorderCore } from "../src/hooks/useAudioRecorderCore";

export default function BasicUsage() {
  const {
    isRecording,
    isPaused,
    recordingDuration,
    maxRecordingDuration,
    remainingDuration,
    chunks,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearChunks,
  } = useAudioRecorderCore({
    defaultRecordingOptions: {
      chunkSeconds: 10, // 10 seconds for faster testing
      maxRecordingDuration: 60, // 1 minute for testing
    },
    onChunkReady: (chunk) => {
      console.log("📦 New chunk ready:", {
        sequence: chunk.sequence,
        duration: chunk.duration,
        size: chunk.size,
        timestamp: chunk.timestamp
          ? new Date(chunk.timestamp).toLocaleTimeString()
          : "N/A",
        path: chunk.path.split("/").pop(), // Just filename for cleaner logs
      });
    },
    onError: (error) => {
      console.error("❌ Recording error:", error);
      Alert.alert("Error", error.message);
    },
    onMaxDurationReached: (data) => {
      console.log("⏰ Max duration reached:", data);
      Alert.alert(
        "Recording Complete",
        `Maximum recording duration of ${data.maxDuration}s reached`
      );
    },
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audio Chunk Recorder</Text>

      {/* Recording Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status:{" "}
          {isRecording ? (isPaused ? "Paused" : "Recording") : "Stopped"}
        </Text>
        <Text style={styles.statusText}>
          Duration: {formatTime(recordingDuration)} /{" "}
          {formatTime(maxRecordingDuration)}
        </Text>
        <Text style={styles.statusText}>
          Remaining: {formatTime(remainingDuration)}
        </Text>
        <Text style={styles.statusText}>Chunks: {chunks.length}</Text>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {!isRecording ? (
          <TouchableOpacity
            style={styles.button}
            onPress={handleStartRecording}
          >
            <Text style={styles.buttonText}>Start Recording</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.recordingControls}>
            <TouchableOpacity style={styles.button} onPress={stopRecording}>
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={isPaused ? resumeRecording : pauseRecording}
            >
              <Text style={styles.buttonText}>
                {isPaused ? "Resume" : "Pause"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.clearButton} onPress={clearChunks}>
          <Text style={styles.buttonText}>Clear Chunks</Text>
        </TouchableOpacity>
      </View>

      {/* Chunks List */}
      <View style={styles.chunksContainer}>
        <Text style={styles.sectionTitle}>Chunks ({chunks.length})</Text>
        {chunks.map((chunk, index) => (
          <View key={index} style={styles.chunkItem}>
            <Text style={styles.chunkText}>
              #{chunk.sequence} - {chunk.duration?.toFixed(1) || "0.0"}s -{" "}
              {((chunk.size || 0) / 1024).toFixed(1)}KB
            </Text>
            <Text style={styles.chunkTime}>
              {chunk.timestamp
                ? new Date(chunk.timestamp).toLocaleTimeString()
                : "N/A"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#333",
  },
  statusContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
    color: "#333",
  },
  controlsContainer: {
    marginBottom: 20,
  },
  recordingControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
  },
  clearButton: {
    backgroundColor: "#FF3B30",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  chunksContainer: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  chunkItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  chunkText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  chunkTime: {
    fontSize: 12,
    color: "#666",
  },
});
