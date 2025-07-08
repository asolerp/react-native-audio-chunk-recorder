/**
 * Basic usage example for react-native-audio-chunk-recorder
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, Alert, Platform } from "react-native";
import { useAudioRecorderCore } from "../src/hooks/useAudioRecorderCore";
import type {
  ChunkData,
  MaxDurationReachedData,
  AudioLevelData,
  ErrorData,
} from "../src/types";
import { getChunkUri } from "../src/types";

export default function BasicUsage() {
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Chunk handling
  const handleChunkReady = useCallback((chunk: ChunkData) => {
    console.log("New chunk ready:", chunk);
    setChunks((prev) => [...prev, chunk]);

    // Show last chunk indicator
    if (chunk.isLastChunk) {
      Alert.alert("Recording Complete", "Final chunk received!");
    }
  }, []);

  // Audio level monitoring
  const handleAudioLevel = useCallback((levelData: AudioLevelData) => {
    setAudioLevel(levelData.level);
  }, []);

  // Error handling
  const handleError = useCallback((error: ErrorData) => {
    console.error("Recording error:", error);
    Alert.alert("Error", error.message);
  }, []);

  // Max duration reached
  const handleMaxDurationReached = useCallback(
    (data: MaxDurationReachedData) => {
      console.log("Max duration reached:", data);
      Alert.alert(
        "Recording Limit Reached",
        `Recording stopped after ${Math.round(data.duration)}s (max: ${
          data.maxDuration
        }s)`
      );
    },
    []
  );

  const recorder = useAudioRecorderCore({
    defaultRecordingOptions: {
      chunkSeconds: 5, // 5 seconds per chunk
      maxRecordingDuration: 60, // 1 minute max for demo
      sampleRate: 16000,
      bitRate: 128000,
    },
    onChunkReady: handleChunkReady,
    onMaxDurationReached: handleMaxDurationReached,
  });

  // Subscribe to events
  useEffect(() => {
    const unsubscribeAudioLevel = recorder.onAudioLevel(handleAudioLevel);
    const unsubscribeError = recorder.onError(handleError);

    return () => {
      unsubscribeAudioLevel();
      unsubscribeError();
    };
  }, [recorder, handleAudioLevel, handleError]);

  const playChunk = useCallback((chunk: ChunkData) => {
    const uri = getChunkUri(chunk);
    console.log(`Playing chunk ${chunk.sequence} from URI: ${uri}`);

    // Here you would use an audio player library like react-native-sound
    // or expo-av to play the audio file
    Alert.alert(
      "Play Chunk",
      `Would play chunk ${chunk.sequence}\nPath: ${chunk.path}\nURI: ${uri}`
    );
  }, []);

  const deleteChunk = useCallback((chunkToDelete: ChunkData) => {
    Alert.alert("Delete Chunk", `Delete chunk ${chunkToDelete.sequence}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Remove from local state
          setChunks((prev) =>
            prev.filter((c) => c.sequence !== chunkToDelete.sequence)
          );

          // Here you would also delete the actual file
          console.log(`Deleted chunk ${chunkToDelete.sequence}`);
        },
      },
    ]);
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = useCallback(() => {
    recorder.startRecording();
    setChunks([]);
  }, [recorder]);

  const handleStopRecording = useCallback(() => {
    recorder.stopRecording();
  }, [recorder]);

  const getTotalRecordedDuration = () => {
    return recorder.getTotalChunksDuration();
  };

  const getChunkInfo = (index: number) => {
    const chunk = chunks[index];
    if (!chunk) return null;

    return {
      duration: chunk.duration || 0,
      size: chunk.size || 0,
      timestamp: chunk.timestamp
        ? new Date(chunk.timestamp).toLocaleTimeString()
        : "N/A",
    };
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙️ Audio Recorder with Duration Tracking</Text>
      <Text style={styles.subtitle}>
        Plataforma: {Platform.OS.toUpperCase()}
      </Text>

      {/* Recording Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status:{" "}
          {recorder.isRecording
            ? recorder.isPaused
              ? "Paused"
              : "Recording"
            : "Stopped"}
        </Text>
        <Text style={styles.statusText}>
          Permission: {recorder.hasPermission ? "Granted" : "Denied"}
        </Text>
        <Text style={styles.statusText}>
          Available: {recorder.isAvailable ? "Yes" : "No"}
        </Text>
      </View>

      {/* Duration Display */}
      <View style={styles.durationContainer}>
        <Text style={styles.durationText}>
          Duration: {Math.round(recorder.recordingDuration)}s /{" "}
          {recorder.maxRecordingDuration}s
        </Text>
        <Text style={styles.durationText}>
          Remaining: {Math.round(recorder.remainingDuration)}s
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  (recorder.recordingDuration / recorder.maxRecordingDuration) *
                  100
                }%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Audio Level */}
      <View style={styles.audioLevelContainer}>
        <Text style={styles.audioLevelText}>
          Audio Level: {Math.round(audioLevel * 100)}%
        </Text>
        <View style={styles.audioLevelBar}>
          <View
            style={[styles.audioLevelFill, { width: `${audioLevel * 100}%` }]}
          />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <Button
          title="Start Recording"
          onPress={() => recorder.startRecording()}
          disabled={recorder.isRecording}
        />
        <Button
          title={recorder.isPaused ? "Resume" : "Pause"}
          onPress={() =>
            recorder.isPaused
              ? recorder.resumeRecording()
              : recorder.pauseRecording()
          }
          disabled={!recorder.isRecording}
        />
        <Button
          title="Stop Recording"
          onPress={() => recorder.stopRecording()}
          disabled={!recorder.isRecording}
        />
        <Button
          title="Clear Chunks"
          onPress={() => {
            setChunks([]);
            recorder.clearChunks();
          }}
          disabled={chunks.length === 0}
        />
      </View>

      {/* Chunks List */}
      <View style={styles.chunksContainer}>
        <Text style={styles.chunksTitle}>Chunks ({chunks.length}):</Text>
        {chunks.map((chunk) => (
          <View key={chunk.sequence} style={styles.chunkItem}>
            <Text style={styles.chunkText}>
              #{chunk.sequence} - {chunk.duration?.toFixed(1)}s - {chunk.size}{" "}
              bytes
              {chunk.isLastChunk && (
                <Text style={styles.lastChunkText}> (LAST)</Text>
              )}
            </Text>
            <View style={styles.chunkActions}>
              <Button title="Play" onPress={() => playChunk(chunk)} />
              <Button title="Delete" onPress={() => deleteChunk(chunk)} />
            </View>
          </View>
        ))}
      </View>

      {/* Platform Info */}
      <View style={styles.platformInfo}>
        <Text style={styles.platformText}>
          ℹ️ Funcionalidades implementadas en {Platform.OS}:
        </Text>
        <Text style={styles.featureText}>✅ Limitación de duración máxima</Text>
        <Text style={styles.featureText}>✅ Duración real de chunks</Text>
        <Text style={styles.featureText}>✅ Timestamp de creación</Text>
        <Text style={styles.featureText}>✅ Tamaño de archivos</Text>
        <Text style={styles.featureText}>✅ Seguimiento en tiempo real</Text>
        <Text style={styles.featureText}>✅ Manejo de interrupciones</Text>

        <Text style={styles.platformText}>📁 Formato de archivos:</Text>
        <Text style={styles.featureText}>
          • path: Para operaciones del sistema
        </Text>
        <Text style={styles.featureText}>
          • getChunkUri(): Para reproducir audio
        </Text>
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
    marginBottom: 10,
    color: "#333",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#666",
    fontWeight: "600",
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
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
    gap: 10,
  },
  chunksContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    maxHeight: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chunksTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  chunkItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 8,
  },
  chunkText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  chunkDetails: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  audioLevelContainer: {
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
  audioLevelText: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
    color: "#333",
  },
  audioLevelBar: {
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
  },
  audioLevelFill: {
    height: "100%",
    borderRadius: 6,
  },
  platformInfo: {
    backgroundColor: "#e8f5e8",
    padding: 15,
    borderRadius: 8,
    borderColor: "#4CAF50",
    borderWidth: 1,
  },
  platformText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  featureText: {
    fontSize: 14,
    color: "#2e7d32",
    marginBottom: 4,
  },
  durationContainer: {
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
  durationText: {
    fontSize: 16,
    marginBottom: 5,
    color: "#333",
  },
  progressBar: {
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: "#4CAF50",
  },
  chunkActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastChunkText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "bold",
  },
});
