import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, ScrollView } from "react-native";
import { useAudioLevel } from "../src/hooks/useAudioLevel";

export function ExploreScreenDebugExample() {
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [audioRecordState, setAudioRecordState] = useState<string>("Unknown");
  const [disableThrottling, setDisableThrottling] = useState(false);

  const {
    data,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    error,
    getAudioRecordState,
  } = useAudioLevel({
    throttleMs: 16, // 60 FPS para debugging
    disableThrottling, // Nueva opción para deshabilitar throttling
    audioThreshold: 0.001,
    onLevelChange: (levelData) => {
      const log = `[${new Date().toISOString()}] Audio Level: ${levelData.level.toFixed(
        6
      )} (hasAudio: ${levelData.hasAudio})`;
      setDebugLogs((prev) => [...prev.slice(-50), log]); // Keep last 50 logs
    },
    onAudioDetected: (level) => {
      const log = `[${new Date().toISOString()}] 🎤 Audio DETECTED: ${level.toFixed(
        6
      )}`;
      setDebugLogs((prev) => [...prev.slice(-50), log]);
    },
    onAudioLost: () => {
      const log = `[${new Date().toISOString()}] 🔇 Audio LOST`;
      setDebugLogs((prev) => [...prev.slice(-50), log]);
    },
  });

  // Check AudioRecord state periodically
  useEffect(() => {
    const checkState = async () => {
      try {
        const state = await getAudioRecordState();
        setAudioRecordState(state);
      } catch (err) {
        setAudioRecordState(`Error: ${err}`);
      }
    };

    const interval = setInterval(checkState, 1000); // Check every second
    return () => clearInterval(interval);
  }, [getAudioRecordState]);

  const handleStart = async () => {
    try {
      await startMonitoring();
      const log = `[${new Date().toISOString()}] 🚀 Started monitoring`;
      setDebugLogs((prev) => [...prev.slice(-50), log]);
    } catch (err) {
      const log = `[${new Date().toISOString()}] ❌ Failed to start: ${err}`;
      setDebugLogs((prev) => [...prev.slice(-50), log]);
    }
  };

  const handleStop = async () => {
    try {
      await stopMonitoring();
      const log = `[${new Date().toISOString()}] 🛑 Stopped monitoring`;
      setDebugLogs((prev) => [...prev.slice(-50), log]);
    } catch (err) {
      const log = `[${new Date().toISOString()}] ❌ Failed to stop: ${err}`;
      setDebugLogs((prev) => [...prev.slice(-50), log]);
    }
  };

  const toggleThrottling = () => {
    setDisableThrottling(!disableThrottling);
    const log = `[${new Date().toISOString()}] 🔧 Throttling ${
      !disableThrottling ? "DISABLED" : "ENABLED"
    }`;
    setDebugLogs((prev) => [...prev.slice(-50), log]);
  };

  const clearLogs = () => {
    setDebugLogs([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ExploreScreen Audio Debug</Text>

      {/* Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Monitoring: {isMonitoring ? "🟢 Active" : "🔴 Inactive"}
        </Text>
        <Text style={styles.statusText}>
          AudioRecord State: {audioRecordState}
        </Text>
        <Text style={styles.statusText}>
          Current Level: {data.level.toFixed(6)}
        </Text>
        <Text style={styles.statusText}>
          Has Audio: {data.hasAudio ? "✅ Yes" : "❌ No"}
        </Text>
        <Text style={styles.statusText}>
          Throttling: {disableThrottling ? "🔴 DISABLED" : "🟢 ENABLED"}
        </Text>
        {error && <Text style={styles.errorText}>Error: {error}</Text>}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <Button
          title={isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          onPress={isMonitoring ? handleStop : handleStart}
          color={isMonitoring ? "#ff4444" : "#44ff44"}
        />
        <Button
          title={disableThrottling ? "Enable Throttling" : "Disable Throttling"}
          onPress={toggleThrottling}
          color={disableThrottling ? "#44ff44" : "#ff4444"}
        />
        <Button title="Clear Logs" onPress={clearLogs} />
      </View>

      {/* VU Meter */}
      <View style={styles.vuMeter}>
        <View style={styles.vuMeterBackground}>
          <View
            style={[
              styles.vuMeterBar,
              {
                height: `${data.level * 100}%`,
                backgroundColor: data.hasAudio ? "#0f0" : "#666",
              },
            ]}
          />
        </View>
        <Text style={styles.vuMeterText}>{Math.round(data.level * 100)}%</Text>
      </View>

      {/* Debug Logs */}
      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Debug Logs (Last 50):</Text>
        <ScrollView style={styles.logs} showsVerticalScrollIndicator={true}>
          {debugLogs.map((log, index) => (
            <Text key={index} style={styles.logEntry}>
              {log}
            </Text>
          ))}
        </ScrollView>
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
    borderRadius: 10,
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
    fontFamily: "monospace",
  },
  errorText: {
    fontSize: 16,
    marginTop: 10,
    color: "#ff0000",
    fontWeight: "bold",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
    flexWrap: "wrap",
  },
  vuMeter: {
    alignItems: "center",
    marginBottom: 20,
  },
  vuMeterBackground: {
    width: 60,
    height: 200,
    backgroundColor: "#333",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 10,
  },
  vuMeterBar: {
    width: "100%",
    position: "absolute",
    bottom: 0,
    borderRadius: 5,
  },
  vuMeterText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  logsContainer: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  logs: {
    flex: 1,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: "monospace",
    marginBottom: 2,
    color: "#333",
  },
});
