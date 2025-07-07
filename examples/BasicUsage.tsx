/**
 * Basic usage example for react-native-audio-chunk-recorder
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, Alert } from "react-native";
import { useAudioRecorderCore } from "../src/hooks/useAudioRecorderCore";
import type { ChunkData, MaxDurationReachedData } from "../src/types";

export default function BasicUsage() {
  const [chunks, setChunks] = useState<ChunkData[]>([]);

  const recorder = useAudioRecorderCore({
    defaultRecordingOptions: {
      chunkSeconds: 10, // 10 second chunks
      maxRecordingDuration: 120, // 2 minutes max
    },
    onChunkReady: (chunk) => {
      console.log(`Chunk ${chunk.seq} ready:`, {
        duration: chunk.duration,
        size: chunk.size,
        timestamp: chunk.timestamp,
      });
      setChunks((prev) => [...prev, chunk]);
    },
    onMaxDurationReached: (data: MaxDurationReachedData) => {
      Alert.alert(
        "Límite de tiempo alcanzado",
        `Grabación detenida automáticamente después de ${data.duration.toFixed(
          1
        )} segundos`
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
      <Text style={styles.title}>Audio Recorder with Duration Tracking</Text>

      {/* Recording Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Estado:{" "}
          {recorder.isRecording
            ? recorder.isPaused
              ? "Pausado"
              : "Grabando"
            : "Detenido"}
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
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <Button
          title={recorder.isRecording ? "Detener" : "Iniciar"}
          onPress={
            recorder.isRecording ? handleStopRecording : handleStartRecording
          }
          disabled={!recorder.isAvailable || !recorder.hasPermission}
        />

        {recorder.isRecording && (
          <Button
            title={recorder.isPaused ? "Reanudar" : "Pausar"}
            onPress={
              recorder.isPaused
                ? recorder.resumeRecording
                : recorder.pauseRecording
            }
          />
        )}

        <Button
          title="Limpiar chunks"
          onPress={() => {
            recorder.clearChunks();
            setChunks([]);
          }}
          disabled={recorder.isRecording}
        />
      </View>

      {/* Chunks Information */}
      <View style={styles.chunksContainer}>
        <Text style={styles.chunksTitle}>Chunks creados: {chunks.length}</Text>
        <Text style={styles.chunksTitle}>
          Duración total grabada: {formatDuration(getTotalRecordedDuration())}
        </Text>

        {chunks.map((chunk, index) => {
          const chunkInfo = getChunkInfo(index);
          return (
            <View key={chunk.seq} style={styles.chunkItem}>
              <Text style={styles.chunkText}>
                Chunk #{chunk.seq}: {formatDuration(chunkInfo?.duration || 0)}
              </Text>
              <Text style={styles.chunkDetails}>
                Tamaño: {((chunkInfo?.size || 0) / 1024).toFixed(1)} KB
              </Text>
              <Text style={styles.chunkDetails}>
                Creado: {chunkInfo?.timestamp || "N/A"}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Audio Level */}
      <View style={styles.audioLevelContainer}>
        <Text style={styles.audioLevelText}>
          Nivel de audio: {(recorder.audioLevel * 100).toFixed(1)}%
        </Text>
        <View style={styles.audioLevelBar}>
          <View
            style={[
              styles.audioLevelFill,
              { width: `${recorder.audioLevel * 100}%` },
            ]}
          />
        </View>
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
  },
  statusContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  chunksContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    maxHeight: 200,
  },
  chunksTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  chunkItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 5,
  },
  chunkText: {
    fontSize: 16,
    fontWeight: "500",
  },
  chunkDetails: {
    fontSize: 14,
    color: "#666",
  },
  audioLevelContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
  },
  audioLevelText: {
    fontSize: 16,
    marginBottom: 10,
  },
  audioLevelBar: {
    height: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 5,
  },
  audioLevelFill: {
    height: "100%",
    backgroundColor: "#4CAF50",
    borderRadius: 5,
  },
});
