import { useState, useEffect, useCallback } from "react";
import { NativeEventEmitter, NativeModules } from "react-native";

const { AudioChunkRecorderModule } = NativeModules;

export interface AudioChunk {
  path: string;
  seq: number;
  timestamp: Date;
  size?: number;
}

export interface UseAudioChunksReturn {
  chunks: AudioChunk[];
  currentChunkIndex: number;
  addChunk: (chunk: AudioChunk) => void;
  removeChunk: (seq: number) => void;
  clearChunks: () => void;
  getChunkBySeq: (seq: number) => AudioChunk | undefined;
  getChunksInRange: (startSeq: number, endSeq: number) => AudioChunk[];
  totalChunks: number;
  totalDuration: number; // in seconds
}

export interface UseAudioChunksOptions {
  onChunkReady?: (chunk: AudioChunk) => void;
  onChunkRemoved?: (seq: number) => void;
  onChunksCleared?: () => void;
  autoAddChunks?: boolean; // Whether to automatically add chunks to internal state
}

export function useAudioChunks(
  options: UseAudioChunksOptions = {}
): UseAudioChunksReturn {
  const {
    onChunkReady,
    onChunkRemoved,
    onChunksCleared,
    autoAddChunks = true, // Default to true for backward compatibility
  } = options;

  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);

  // Listen for chunk ready events from native module
  useEffect(() => {
    const emitter = new NativeEventEmitter(AudioChunkRecorderModule);

    const chunkSub = emitter.addListener(
      "onChunkReady",
      (chunkData: { path: string; seq: number }) => {
        const newChunk: AudioChunk = {
          path: chunkData.path,
          seq: chunkData.seq,
          timestamp: new Date(),
        };

        // Call the external callback first
        onChunkReady?.(newChunk);

        // Then update internal state if autoAddChunks is enabled
        if (autoAddChunks) {
          setChunks((prev) => [...prev, newChunk]);
        }

        setCurrentChunkIndex(chunkData.seq);

        console.log(`Chunk ${chunkData.seq} ready: ${chunkData.path}`);
      }
    );

    return () => {
      chunkSub.remove();
    };
  }, [onChunkReady, autoAddChunks]);

  const addChunk = useCallback(
    (chunk: AudioChunk) => {
      setChunks((prev) => [...prev, chunk]);
      onChunkReady?.(chunk);
    },
    [onChunkReady]
  );

  const removeChunk = useCallback(
    (seq: number) => {
      setChunks((prev) => prev.filter((chunk) => chunk.seq !== seq));
      onChunkRemoved?.(seq);
    },
    [onChunkRemoved]
  );

  const clearChunks = useCallback(() => {
    setChunks([]);
    setCurrentChunkIndex(0);
    onChunksCleared?.();
  }, [onChunksCleared]);

  const getChunkBySeq = useCallback(
    (seq: number) => {
      return chunks.find((chunk) => chunk.seq === seq);
    },
    [chunks]
  );

  const getChunksInRange = useCallback(
    (startSeq: number, endSeq: number) => {
      return chunks.filter(
        (chunk) => chunk.seq >= startSeq && chunk.seq <= endSeq
      );
    },
    [chunks]
  );

  const totalChunks = chunks.length;
  const totalDuration = totalChunks * 30; // Assuming 30-second chunks

  return {
    chunks,
    currentChunkIndex,
    addChunk,
    removeChunk,
    clearChunks,
    getChunkBySeq,
    getChunksInRange,
    totalChunks,
    totalDuration,
  };
}
