import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import {
  useAudioRecorderCore,
  createSentryErrorTracker,
  createConsoleErrorTracker,
} from "../src";
import type {
  ChunkData,
  MaxDurationReachedData,
  ErrorData,
} from "../src/types";

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

export default function DurationTrackingExample() {
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const recorder = useAudioRecorderCore({
    defaultRecordingOptions: {
      chunkSeconds: 5, // 5 second chunks for demo
      maxRecordingDuration: 30, // 30 seconds max for demo
      sampleRate: 16000,
    },
    onChunkReady: (chunk) => {
      console.log(`✅ Chunk ${chunk.seq} ready:`, {
        duration: chunk.duration,
        size: chunk.size,
        timestamp: new Date(chunk.timestamp || 0).toLocaleTimeString(),
      });
      setChunks((prev) => [...prev, chunk]);
    },
    onMaxDurationReached: (data: MaxDurationReachedData) => {
      Alert.alert(
        "⏰ Límite de tiempo alcanzado",
        `Grabación detenida automáticamente después de ${data.duration.toFixed(
          1
        )} segundos.\n\n` +
          `Se crearon ${
            data.chunks.length
          } chunks con una duración total de ${data.duration.toFixed(1)}s.`,
        [{ text: "OK" }]
      );
    },
    onError: (error: ErrorData) => {
      const errorMsg = `Error: ${error.message}`;
      setErrors((prev) => [...prev, errorMsg]);
      console.error("❌ Recording error:", error);
    },
  });

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleStartRecording = useCallback(() => {
    recorder.startRecording();
    setChunks([]);
    setErrors([]);
  }, [recorder]);

  const handleStopRecording = useCallback(() => {
    recorder.stopRecording();
  }, [recorder]);

  const clearAll = useCallback(() => {
    recorder.clearChunks();
    setChunks([]);
    setErrors([]);
  }, [recorder]);

  const getProgressPercentage = (): number => {
    if (recorder.maxRecordingDuration === 0) return 0;
    return (recorder.recordingDuration / recorder.maxRecordingDuration) * 100;
  };

  const getChunkStats = () => {
    const totalDuration = recorder.getTotalChunksDuration();
    const totalSize = chunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
    const avgDuration = chunks.length > 0 ? totalDuration / chunks.length : 0;
    const avgSize = chunks.length > 0 ? totalSize / chunks.length : 0;

    return {
      totalDuration,
      totalSize,
      avgDuration,
      avgSize,
    };
  };

  const stats = getChunkStats();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🎙️ Duration Tracking Demo</Text>

      {/* Recording Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Estado de Grabación</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Estado:</Text>
          <Text
            style={[
              styles.statusValue,
              {
                color: recorder.isRecording ? "#4CAF50" : "#666",
              },
            ]}
          >
            {recorder.isRecording
              ? recorder.isPaused
                ? "⏸️ Pausado"
                : "🔴 Grabando"
              : "⏹️ Detenido"}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Duración actual:</Text>
          <Text style={styles.statusValue}>
            {formatDuration(recorder.recordingDuration)}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Tiempo restante:</Text>
          <Text style={styles.statusValue}>
            {formatDuration(recorder.remainingDuration)}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Progreso:</Text>
          <Text style={styles.statusValue}>
            {getProgressPercentage().toFixed(1)}%
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${getProgressPercentage()}%` },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎛️ Controles</Text>
        <View style={styles.controlsContainer}>
          <Button
            title={recorder.isRecording ? "⏹️ Detener" : "▶️ Iniciar"}
            onPress={
              recorder.isRecording ? handleStopRecording : handleStartRecording
            }
            disabled={!recorder.isAvailable || !recorder.hasPermission}
            color={recorder.isRecording ? "#f44336" : "#4CAF50"}
          />

          {recorder.isRecording && (
            <Button
              title={recorder.isPaused ? "▶️ Reanudar" : "⏸️ Pausar"}
              onPress={
                recorder.isPaused
                  ? recorder.resumeRecording
                  : recorder.pauseRecording
              }
              color="#FF9800"
            />
          )}

          <Button
            title="🗑️ Limpiar"
            onPress={clearAll}
            disabled={recorder.isRecording}
            color="#9E9E9E"
          />
        </View>
      </View>

      {/* Chunk Statistics */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📈 Estadísticas de Chunks</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total chunks:</Text>
            <Text style={styles.statValue}>{chunks.length}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Duración total:</Text>
            <Text style={styles.statValue}>
              {formatDuration(stats.totalDuration)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Tamaño total:</Text>
            <Text style={styles.statValue}>{formatBytes(stats.totalSize)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Duración promedio:</Text>
            <Text style={styles.statValue}>
              {formatDuration(stats.avgDuration)}
            </Text>
          </View>
        </View>
      </View>

      {/* Chunks List */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          📁 Chunks Creados ({chunks.length})
        </Text>
        {chunks.length === 0 ? (
          <Text style={styles.emptyText}>No hay chunks disponibles</Text>
        ) : (
          chunks.map((chunk, index) => (
            <View key={chunk.seq} style={styles.chunkItem}>
              <View style={styles.chunkHeader}>
                <Text style={styles.chunkTitle}>Chunk #{chunk.seq}</Text>
                <Text style={styles.chunkDuration}>
                  {formatDuration(chunk.duration || 0)}
                </Text>
              </View>
              <View style={styles.chunkDetails}>
                <Text style={styles.chunkDetail}>
                  📏 Tamaño: {formatBytes(chunk.size || 0)}
                </Text>
                <Text style={styles.chunkDetail}>
                  🕒 Creado:{" "}
                  {chunk.timestamp
                    ? new Date(chunk.timestamp).toLocaleTimeString()
                    : "N/A"}
                </Text>
                <Text style={styles.chunkDetail}>
                  📂 Archivo: {chunk.path.split("/").pop() || "N/A"}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Audio Level */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎵 Nivel de Audio</Text>
        <Text style={styles.audioLevelText}>
          {(recorder.audioLevel * 100).toFixed(1)}%{" "}
          {recorder.hasAudio ? "🔊" : "🔇"}
        </Text>
        <View style={styles.audioLevelBar}>
          <View
            style={[
              styles.audioLevelFill,
              {
                width: `${recorder.audioLevel * 100}%`,
                backgroundColor: recorder.hasAudio ? "#4CAF50" : "#FFC107",
              },
            ]}
          />
        </View>
      </View>

      {/* Errors */}
      {errors.length > 0 && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.cardTitle}>❌ Errores</Text>
          {errors.map((error, index) => (
            <Text key={index} style={styles.errorText}>
              {error}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 20,
    color: "#333",
  },
  card: {
    backgroundColor: "#fff",
    margin: 10,
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 16,
    color: "#666",
  },
  statusValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4CAF50",
    borderRadius: 4,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 10,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statItem: {
    width: "48%",
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    fontStyle: "italic",
    marginVertical: 20,
  },
  chunkItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 10,
  },
  chunkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  chunkTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  chunkDuration: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF50",
  },
  chunkDetails: {
    marginLeft: 10,
  },
  chunkDetail: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  audioLevelText: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
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
  errorCard: {
    backgroundColor: "#ffebee",
    borderColor: "#f44336",
    borderWidth: 1,
  },
  errorText: {
    color: "#f44336",
    fontSize: 14,
    marginBottom: 5,
  },
});
