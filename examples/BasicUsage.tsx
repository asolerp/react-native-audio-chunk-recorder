/**
 * Basic usage example for react-native-audio-chunk-recorder
 */

import React from 'react';
import { View, Button, Text, StyleSheet, Alert } from 'react-native';
import { useAudioRecorderCore } from '../src';

export const BasicRecordingExample = () => {
  const {
    isRecording,
    isPaused,
    hasPermission,
    chunks,
    audioLevel,
    hasAudio,
    isAvailable,
    isInterrupted,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearChunks,
    checkPermissions
  } = useAudioRecorderCore({
    autoCheckPermissions: true,
    defaultRecordingOptions: {
      sampleRate: 16000, // Matching your native defaults
      bitRate: 64000, // Matching your native defaults
      chunkSeconds: 30 // Matching your native defaults
    },
    onChunkReady: chunk => {
      console.log('New chunk ready:', chunk);
      Alert.alert('Chunk Ready', `Chunk ${chunk.seq} recorded successfully!`);
    },
    onError: error => {
      console.error('Recording error:', error);
      Alert.alert('Recording Error', error.message);
    }
  });

  if (!isAvailable) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Audio recorder not available</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Microphone permission required</Text>
        <Button title="Request Permission" onPress={checkPermissions} />
      </View>
    );
  }

  const handleStartStop = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audio Chunk Recorder</Text>

      {/* Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status:{' '}
          {isRecording ? (isPaused ? 'Paused' : 'Recording') : 'Stopped'}
        </Text>
        {isInterrupted && (
          <Text style={styles.interruptedText}>⚠️ Interrupted</Text>
        )}
      </View>

      {/* Audio Level */}
      <View style={styles.levelContainer}>
        <Text>Audio Level: {Math.round(audioLevel * 100)}%</Text>
        <View style={styles.levelBar}>
          <View
            style={[
              styles.levelFill,
              {
                width: `${audioLevel * 100}%`,
                backgroundColor: hasAudio ? '#4CAF50' : '#FFC107'
              }
            ]}
          />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <Button
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
          onPress={handleStartStop}
          color={isRecording ? '#f44336' : '#4CAF50'}
        />

        {isRecording && (
          <Button
            title={isPaused ? 'Resume' : 'Pause'}
            onPress={handlePauseResume}
            color="#FF9800"
          />
        )}
      </View>

      {/* Chunks Info */}
      <View style={styles.chunksContainer}>
        <Text style={styles.chunksTitle}>Chunks: {chunks.length}</Text>
        {chunks.length > 0 && (
          <Button title="Clear Chunks" onPress={clearChunks} color="#9E9E9E" />
        )}
      </View>

      {/* Chunks List */}
      {chunks.length > 0 && (
        <View style={styles.chunksList}>
          <Text style={styles.chunksListTitle}>Recorded Chunks:</Text>
          {chunks.slice(-5).map((chunk, index) => (
            <Text key={chunk.seq} style={styles.chunkItem}>
              Chunk #{chunk.seq}: {chunk.uri}
            </Text>
          ))}
          {chunks.length > 5 && (
            <Text style={styles.moreChunks}>
              ... and {chunks.length - 5} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 20
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600'
  },
  interruptedText: {
    fontSize: 16,
    color: '#f44336',
    marginTop: 5
  },
  levelContainer: {
    marginBottom: 20
  },
  levelBar: {
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    marginTop: 5
  },
  levelFill: {
    height: '100%',
    borderRadius: 5
  },
  controlsContainer: {
    gap: 10,
    marginBottom: 20
  },
  chunksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  chunksTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  chunksList: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 5
  },
  chunksListTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5
  },
  chunkItem: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2
  },
  moreChunks: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 5
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 20
  }
});
