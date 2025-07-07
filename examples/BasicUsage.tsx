/**
 * Basic usage example for react-native-audio-chunk-recorder
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, Alert, Platform } from "react-native";
import { useAudioRecorderCore } from "../src/hooks/useAudioRecorderCore";
import type { ChunkData, MaxDurationReachedData } from "../src/types";

export default function BasicUsage() {
  const [chunks, setChunks] = useState<ChunkData[]>([]);

  const recorder = useAudioRecorderCore({
    defaultRecordingOptions: {
      chunkSeconds: 10, // 10 second chunks
      maxRecordingDuration: 120, // 2 minutes max
      sampleRate: 16000, // Works on both iOS and Android
      bitRate: 64000, // Works on both iOS and Android
    },
    onChunkReady: (chunk) => {
      console.log(`✅ [${Platform.OS}] Chunk ${chunk.seq} ready:`, {
        duration: chunk.duration,
        size: chunk.size,
        timestamp: chunk.timestamp
          ? new Date(chunk.timestamp).toLocaleTimeString()
          : "N/A",
      });
      setChunks((prev) => [...prev, chunk]);
    },
    onMaxDurationReached: (data: MaxDurationReachedData) => {
      Alert.alert(
        "⏰ Límite de tiempo alcanzado",
        `Grabación detenida automáticamente después de ${data.duration.toFixed(
          1
        )} segundos.\n\n` +
          `Plataforma: ${Platform.OS}\n` +
          `Chunks creados: ${data.chunks.length || chunks.length}`
      );
    },
  });

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
          Estado:{" "}
          {recorder.isRecording
            ? recorder.isPaused
              ? "⏸️ Pausado"
              : "🔴 Grabando"
            : "⏹️ Detenido"}
        </Text>
        <Text style={styles.statusText}>
          Duración actual: {formatDuration(recorder.recordingDuration)}
        </Text>
        <Text style={styles.statusText}>
          Tiempo restante: {formatDuration(recorder.remainingDuration)}
        </Text>
        <Text style={styles.statusText}>
          Duración esperada por chunk: {recorder.getExpectedChunkDuration()}s
        </Text>
        <Text style={styles.statusText}>
          Duración máxima: {formatDuration(recorder.maxRecordingDuration)}
        </Text>
      </View>

      {/* Controls */}
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
          title="🗑️ Limpiar chunks"
          onPress={() => {
            recorder.clearChunks();
            setChunks([]);
          }}
          disabled={recorder.isRecording}
          color="#9E9E9E"
        />
      </View>

      {/* Chunks Information */}
      <View style={styles.chunksContainer}>
        <Text style={styles.chunksTitle}>
          📁 Chunks creados: {chunks.length}
        </Text>
        <Text style={styles.chunksTitle}>
          ⏱️ Duración total grabada:{" "}
          {formatDuration(getTotalRecordedDuration())}
        </Text>

        {chunks.map((chunk, index) => {
          const chunkInfo = getChunkInfo(index);
          return (
            <View key={chunk.seq} style={styles.chunkItem}>
              <Text style={styles.chunkText}>
                Chunk #{chunk.seq}: {formatDuration(chunkInfo?.duration || 0)}
              </Text>
              <Text style={styles.chunkDetails}>
                📏 Tamaño: {((chunkInfo?.size || 0) / 1024).toFixed(1)} KB
              </Text>
              <Text style={styles.chunkDetails}>
                🕒 Creado: {chunkInfo?.timestamp || "N/A"}
              </Text>
              <Text style={styles.chunkDetails}>
                📂 Archivo:{" "}
                {Platform.OS === "ios"
                  ? chunk.path.split("/").pop()
                  : chunk.path.split("/").pop() || "N/A"}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Audio Level */}
      <View style={styles.audioLevelContainer}>
        <Text style={styles.audioLevelText}>
          🎵 Nivel de audio: {(recorder.audioLevel * 100).toFixed(1)}%{" "}
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
});
