import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  ScrollView,
  Alert,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Switch,
} from "react-native";
import {
  useAudioRecorder,
  useAudioLevelPreview,
  useAudioChunks,
  useNativeModuleAvailability,
  isNativeModuleAvailableSync,
  isNativeModuleAvailableAsync,
  checkNativeAudioPermissions,
  getNativeModuleInfo,
  validateNativeModule,
  AudioChunk,
} from "../src";

const { width } = Dimensions.get("window");

export default function CompleteExample() {
  // ===== AUDIO RECORDER HOOK WITH AUTO-RECORDING =====
  const {
    isRecording,
    isPaused,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    hasPermissions,
    requestPermissions,
    // Auto-recording functionality
    autoRecording,
    setAutoRecording,
    toggleAutoRecording,
    // Native module availability
    isNativeModuleAvailable,
    checkNativeModuleAvailability,
    nativeModuleError,
  } = useAudioRecorder({
    autoRecording: false, // Start with auto-recording disabled
    onAutoRecordingStart: () => {
      console.log("🚀 Auto-recording started");
      Alert.alert(
        "Auto-Recording",
        "Auto-recording has been enabled and started!"
      );
    },
    onAutoRecordingStop: () => {
      console.log("🛑 Auto-recording stopped");
      Alert.alert(
        "Auto-Recording",
        "Auto-recording has been disabled and stopped!"
      );
    },
    onError: (error) => {
      console.error("❌ Recording error:", error);
      Alert.alert("Recording Error", error);
    },
    onStateChange: (state) => {
      console.log("🔄 Recording state changed:", state);
    },
  });

  // ===== NATIVE MODULE AVAILABILITY HOOK =====
  const {
    status: nativeModuleStatus,
    checkAvailability,
    refreshStatus,
    isLoading: isCheckingAvailability,
  } = useNativeModuleAvailability();

  // ===== AUDIO LEVEL PREVIEW HOOK =====
  const {
    data: levelData,
    startPreview,
    stopPreview,
    isPreviewing,
  } = useAudioLevelPreview();

  // ===== EXTERNAL STATE FOR CHUNK MANAGEMENT =====
  const [externalChunks, setExternalChunks] = useState<AudioChunk[]>([]);
  const [processedChunks, setProcessedChunks] = useState<AudioChunk[]>([]);
  const [chunkStats, setChunkStats] = useState({
    totalReceived: 0,
    totalProcessed: 0,
    totalRejected: 0,
  });

  // ===== CHUNK CALLBACKS =====
  const handleChunkReady = useCallback((chunk: AudioChunk) => {
    console.log(`🎯 Chunk ${chunk.seq} ready: ${chunk.path}`);

    // Update external chunks
    setExternalChunks((prev) => [...prev, chunk]);

    // Update stats
    setChunkStats((prev) => ({
      ...prev,
      totalReceived: prev.totalReceived + 1,
    }));

    // Simulate processing decision (e.g., based on audio quality, size, etc.)
    const shouldProcess = Math.random() > 0.2; // 80% chance to process

    if (shouldProcess) {
      setProcessedChunks((prev) => [...prev, chunk]);
      setChunkStats((prev) => ({
        ...prev,
        totalProcessed: prev.totalProcessed + 1,
      }));
      console.log(`✅ Chunk ${chunk.seq} processed successfully`);
    } else {
      setChunkStats((prev) => ({
        ...prev,
        totalRejected: prev.totalRejected + 1,
      }));
      console.log(`❌ Chunk ${chunk.seq} rejected (simulated)`);
    }
  }, []);

  const handleChunkRemoved = useCallback((seq: number) => {
    console.log(`🗑️ Chunk ${seq} removed`);
    setExternalChunks((prev) => prev.filter((chunk) => chunk.seq !== seq));
    setProcessedChunks((prev) => prev.filter((chunk) => chunk.seq !== seq));
  }, []);

  const handleChunksCleared = useCallback(() => {
    console.log(`🧹 All chunks cleared`);
    setExternalChunks([]);
    setProcessedChunks([]);
    setChunkStats({
      totalReceived: 0,
      totalProcessed: 0,
      totalRejected: 0,
    });
  }, []);

  // ===== AUDIO CHUNKS HOOK WITH CALLBACKS =====
  const {
    chunks: internalChunks,
    currentChunkIndex,
    removeChunk,
    clearChunks,
    totalChunks,
    totalDuration,
    getChunkBySeq,
    getChunksInRange,
  } = useAudioChunks({
    onChunkReady: handleChunkReady,
    onChunkRemoved: handleChunkRemoved,
    onChunksCleared: handleChunksCleared,
    autoAddChunks: true,
  });

  // ===== EVENT HANDLERS =====
  const handleStartRecording = async () => {
    try {
      // Clear all states
      clearChunks();
      setExternalChunks([]);
      setProcessedChunks([]);
      setChunkStats({
        totalReceived: 0,
        totalProcessed: 0,
        totalRejected: 0,
      });

      await startRecording(16000, 30); // 16kHz, 30 second chunks
    } catch (error) {
      Alert.alert("Error", `Failed to start recording: ${error}`);
    }
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch (error) {
      Alert.alert("Error", `Failed to stop recording: ${error}`);
    }
  };

  const handlePauseRecording = async () => {
    try {
      await pauseRecording();
    } catch (error) {
      Alert.alert("Error", `Failed to pause recording: ${error}`);
    }
  };

  const handleResumeRecording = async () => {
    try {
      await resumeRecording();
    } catch (error) {
      Alert.alert("Error", `Failed to resume recording: ${error}`);
    }
  };

  const handleStartPreview = async () => {
    try {
      await startPreview();
    } catch (error) {
      Alert.alert("Error", `Failed to start preview: ${error}`);
    }
  };

  const handleStopPreview = async () => {
    try {
      await stopPreview();
    } catch (error) {
      Alert.alert("Error", `Failed to stop preview: ${error}`);
    }
  };

  const handlePlayChunk = (chunk: AudioChunk) => {
    Alert.alert(
      "Play Chunk",
      `Playing chunk ${chunk.seq} from: ${chunk.path}`,
      [{ text: "OK" }]
    );
  };

  const handleDeleteChunk = (seq: number) => {
    Alert.alert("Delete Chunk", `Delete chunk ${seq}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeChunk(seq) },
    ]);
  };

  const handleExportProcessedChunks = () => {
    Alert.alert(
      "Export Processed Chunks",
      `Would export ${processedChunks.length} processed chunks`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export",
          onPress: () => console.log("Exporting processed chunks..."),
        },
      ]
    );
  };

  const handleGetChunkInfo = () => {
    if (currentChunkIndex > 0) {
      const chunk = getChunkBySeq(currentChunkIndex - 1);
      if (chunk) {
        Alert.alert(
          "Chunk Info",
          `Chunk ${chunk.seq}\nPath: ${
            chunk.path
          }\nTime: ${chunk.timestamp.toLocaleTimeString()}`,
          [{ text: "OK" }]
        );
      }
    }
  };

  // ===== NATIVE MODULE UTILITY HANDLERS =====
  const handleSyncCheck = () => {
    const result = isNativeModuleAvailableSync();
    Alert.alert(
      "Sync Check Result",
      `Available: ${result.isAvailable}\nPlatform: ${result.platform}\n${
        result.error ? `Error: ${result.error}` : ""
      }`,
      [{ text: "OK" }]
    );
  };

  const handleAsyncCheck = async () => {
    try {
      const result = await isNativeModuleAvailableAsync();
      Alert.alert(
        "Async Check Result",
        `Available: ${result.isAvailable}\nPlatform: ${result.platform}\n${
          result.error ? `Error: ${result.error}` : ""
        }`,
        [{ text: "OK" }]
      );
    } catch (error) {
      Alert.alert("Error", `Async check failed: ${error}`);
    }
  };

  const handleCheckPermissions = async () => {
    try {
      const hasPerms = await checkNativeAudioPermissions();
      Alert.alert("Permissions Check", `Has permissions: ${hasPerms}`, [
        { text: "OK" },
      ]);
    } catch (error) {
      Alert.alert("Error", `Permission check failed: ${error}`);
    }
  };

  const handleGetModuleInfo = () => {
    try {
      const info = getNativeModuleInfo();
      Alert.alert(
        "Module Info",
        `Platform: ${info.platform}\nModule exists: ${
          info.moduleExists
        }\nVersion: ${
          info.moduleVersion
        }\nMethods: ${info.availableMethods.join(", ")}`,
        [{ text: "OK" }]
      );
    } catch (error) {
      Alert.alert("Error", `Failed to get module info: ${error}`);
    }
  };

  const handleValidateModule = () => {
    try {
      validateNativeModule();
      Alert.alert("Validation", "✅ Native module is valid!", [{ text: "OK" }]);
    } catch (error) {
      Alert.alert("Validation Failed", `❌ ${error}`, [{ text: "OK" }]);
    }
  };

  // ===== UTILITY FUNCTIONS =====
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getRecordingStatus = () => {
    if (!isRecording) return "Stopped";
    if (isPaused) return "Paused";
    return "Recording";
  };

  const getAudioLevelColor = (level: number) => {
    if (level < 0.3) return "#4CAF50"; // Green
    if (level < 0.7) return "#FF9800"; // Orange
    return "#F44336"; // Red
  };

  // ===== RENDER FUNCTIONS =====
  const renderChunkItem = ({ item }: { item: AudioChunk }) => (
    <View style={styles.chunkItem}>
      <View style={styles.chunkInfo}>
        <Text style={styles.chunkTitle}>Chunk {item.seq}</Text>
        <Text style={styles.chunkDetails}>
          {item.timestamp.toLocaleTimeString()}
        </Text>
      </View>
      <View style={styles.chunkActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.playButton]}
          onPress={() => handlePlayChunk(item)}
        >
          <Text style={styles.actionButtonText}>▶️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteChunk(item.seq)}
        >
          <Text style={styles.actionButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Complete Audio Recorder Example</Text>
      <Text style={styles.subtitle}>
        All hooks working together: Recording + Auto-Recording + Level Preview +
        Chunk Management + Native Module Validation
      </Text>

      {/* Native Module Availability Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔧 Native Module Availability</Text>
        <Text style={styles.description}>
          Check if the native module is properly installed and available
        </Text>

        <View style={styles.statusRow}>
          <Text style={styles.label}>
            Status:{" "}
            {nativeModuleStatus.isAvailable
              ? "✅ Available"
              : "❌ Not Available"}
          </Text>
          {isCheckingAvailability && (
            <Text style={styles.loadingText}>Checking...</Text>
          )}
        </View>

        {nativeModuleStatus.error && (
          <Text style={styles.errorText}>
            Error: {nativeModuleStatus.error}
          </Text>
        )}

        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Platform</Text>
            <Text style={styles.detailValue}>
              {nativeModuleStatus.platform}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Initialized</Text>
            <Text style={styles.detailValue}>
              {nativeModuleStatus.isInitialized ? "✅" : "❌"}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Permissions</Text>
            <Text style={styles.detailValue}>
              {nativeModuleStatus.hasPermissions ? "✅" : "❌"}
            </Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Button
            title="Refresh Status"
            color="#2196F3"
            onPress={refreshStatus}
          />
          <Button
            title="Sync Check"
            color="#4CAF50"
            onPress={handleSyncCheck}
          />
          <Button
            title="Async Check"
            color="#FF9800"
            onPress={handleAsyncCheck}
          />
        </View>

        <View style={styles.buttonRow}>
          <Button
            title="Check Permissions"
            color="#9C27B0"
            onPress={handleCheckPermissions}
          />
          <Button
            title="Module Info"
            color="#607D8B"
            onPress={handleGetModuleInfo}
          />
          <Button
            title="Validate Module"
            color="#E91E63"
            onPress={handleValidateModule}
          />
        </View>
      </View>

      {/* Permissions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 Permissions</Text>
        <Text style={styles.label}>
          Status: {hasPermissions ? "✅ Granted" : "❌ Not Granted"}
        </Text>
        {!hasPermissions && (
          <Button
            title="Request Permissions"
            color="#FF9800"
            onPress={requestPermissions}
          />
        )}
      </View>

      {/* Auto-Recording Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🤖 Auto-Recording</Text>
        <Text style={styles.description}>
          Automatically start/stop recording based on state changes
        </Text>

        <View style={styles.autoRecordingRow}>
          <Text style={styles.label}>
            Auto-Recording: {autoRecording ? "🟢 Enabled" : "🔴 Disabled"}
          </Text>
          <Switch
            value={autoRecording}
            onValueChange={setAutoRecording}
            trackColor={{ false: "#767577", true: "#81b0ff" }}
            thumbColor={autoRecording ? "#f5dd4b" : "#f4f3f4"}
          />
        </View>

        <View style={styles.buttonRow}>
          <Button
            title="Toggle Auto-Recording"
            color="#9C27B0"
            onPress={toggleAutoRecording}
          />
        </View>

        <Text style={styles.infoText}>
          <Text style={styles.bold}>How it works:</Text>
          {"\n"}• When enabled, recording starts automatically when permissions
          are granted
          {"\n"}• When disabled, recording stops and auto-recording is turned
          off
          {"\n"}• Manual stop also disables auto-recording
        </Text>
      </View>

      {/* Audio Level Preview Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎤 Audio Level Preview</Text>
        <Text style={styles.description}>
          Real-time audio level monitoring without recording
        </Text>
        <Text style={styles.label}>
          Status: {isPreviewing ? "Previewing" : "Stopped"}
        </Text>

        <View style={styles.buttonRow}>
          {!isPreviewing ? (
            <Button
              title="Start Preview"
              color="#2196F3"
              onPress={handleStartPreview}
            />
          ) : (
            <Button
              title="Stop Preview"
              color="#F44336"
              onPress={handleStopPreview}
            />
          )}
        </View>

        <View style={styles.levelContainer}>
          <View style={styles.levelBox}>
            <View
              style={[
                styles.levelFill,
                {
                  width: `${Math.round(levelData.level * 100)}%`,
                  backgroundColor: getAudioLevelColor(levelData.level),
                },
              ]}
            />
          </View>
          <Text style={styles.levelText}>
            Level: {Math.round(levelData.level * 100)}%
            {levelData.hasAudio ? " (Audio detected)" : " (Silence)"}
          </Text>
        </View>
      </View>

      {/* Recording Controls Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎙️ Recording Controls</Text>
        <Text style={styles.label}>Status: {getRecordingStatus()}</Text>
        <Text style={styles.label}>Current Chunk: {currentChunkIndex}</Text>
        <Text style={styles.label}>
          Total Duration: {formatTime(totalDuration)}
        </Text>

        <View style={styles.buttonRow}>
          {!isRecording ? (
            <Button
              title="Start Recording"
              color="#43A047"
              onPress={handleStartRecording}
            />
          ) : (
            <>
              <Button
                title="Stop"
                color="#E53935"
                onPress={handleStopRecording}
              />
              {isPaused ? (
                <Button
                  title="Resume"
                  color="#FF9800"
                  onPress={handleResumeRecording}
                />
              ) : (
                <Button
                  title="Pause"
                  color="#FF9800"
                  onPress={handlePauseRecording}
                />
              )}
            </>
          )}
        </View>
      </View>

      {/* Statistics Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{chunkStats.totalReceived}</Text>
            <Text style={styles.statLabel}>Received</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{chunkStats.totalProcessed}</Text>
            <Text style={styles.statLabel}>Processed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{chunkStats.totalRejected}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalChunks}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>
      </View>

      {/* External Chunks Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            🎯 External Chunks ({externalChunks.length})
          </Text>
          {processedChunks.length > 0 && (
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExportProcessedChunks}
            >
              <Text style={styles.exportButtonText}>Export</Text>
            </TouchableOpacity>
          )}
        </View>

        {externalChunks.length === 0 ? (
          <Text style={styles.emptyText}>
            No external chunks yet. Start recording to see callbacks in action.
          </Text>
        ) : (
          <FlatList
            data={externalChunks}
            renderItem={renderChunkItem}
            keyExtractor={(item) => item.seq.toString()}
            scrollEnabled={false}
            style={styles.chunkList}
          />
        )}
      </View>

      {/* Processed Chunks Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          ✅ Processed Chunks ({processedChunks.length})
        </Text>
        {processedChunks.length === 0 ? (
          <Text style={styles.emptyText}>
            No processed chunks yet. Chunks are processed based on simulated
            criteria.
          </Text>
        ) : (
          <FlatList
            data={processedChunks}
            renderItem={renderChunkItem}
            keyExtractor={(item) => item.seq.toString()}
            scrollEnabled={false}
            style={styles.chunkList}
          />
        )}
      </View>

      {/* Hook Information Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔧 Hook Information</Text>
        <Text style={styles.infoText}>
          <Text style={styles.bold}>useAudioRecorder:</Text> Controls recording
          state, operations, and auto-recording functionality{"\n"}
          <Text style={styles.bold}>useAudioLevelPreview:</Text> Real-time audio
          level monitoring{"\n"}
          <Text style={styles.bold}>useAudioChunks:</Text> Chunk management with
          callbacks{"\n"}
          <Text style={styles.bold}>useNativeModuleAvailability:</Text> Native
          module availability checking and validation{"\n"}
          {"\n"}
          <Text style={styles.bold}>Features:</Text>
          {"\n"}• Native module availability validation{"\n"}• Auto-recording
          with smart state management{"\n"}• Audio level preview without
          recording{"\n"}• Recording with pause/resume{"\n"}• Automatic chunk
          creation every 30 seconds{"\n"}• External chunk processing with
          callbacks{"\n"}• Chunk statistics and management{"\n"}• TypeScript
          support throughout{"\n"}• Error handling and callbacks
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  description: {
    fontSize: 12,
    color: "#666",
    marginBottom: 10,
    fontStyle: "italic",
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  levelContainer: {
    marginTop: 15,
  },
  levelBox: {
    height: 20,
    backgroundColor: "#ddd",
    width: "100%",
    borderRadius: 10,
    marginVertical: 10,
    overflow: "hidden",
  },
  levelFill: {
    height: "100%",
    borderRadius: 10,
  },
  levelText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  statItem: {
    alignItems: "center",
    padding: 10,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2196F3",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  chunkList: {
    maxHeight: 200,
  },
  chunkItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "white",
    borderRadius: 6,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chunkInfo: {
    flex: 1,
  },
  chunkTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  chunkDetails: {
    fontSize: 12,
    color: "#666",
  },
  chunkActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "#4CAF50",
  },
  deleteButton: {
    backgroundColor: "#F44336",
  },
  actionButtonText: {
    fontSize: 16,
  },
  exportButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  exportButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  emptyText: {
    textAlign: "center",
    color: "#666",
    fontStyle: "italic",
    padding: 20,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
  },
  bold: {
    fontWeight: "bold",
  },
  autoRecordingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 12,
    color: "#666",
  },
  errorText: {
    fontSize: 12,
    color: "#F44336",
    marginTop: 10,
  },
  detailsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 10,
  },
  detailItem: {
    alignItems: "center",
    padding: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: "#666",
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
