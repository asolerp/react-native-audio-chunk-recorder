import { useCallback, useEffect, useState } from "react";
import {
  NativeAudioChunkRecorder,
  AudioChunkRecorderEventEmitter,
} from "../NativeAudioChunkRecorder";

export interface AudioFileInfo {
  path: string;
  name: string;
  size: number;
  creationDate: number;
  modificationDate: number;
}

export interface UseAudioFilesReturn {
  files: AudioFileInfo[];
  directory: string | null;
  refresh: () => Promise<void>;
  saveTempFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  getFileInfo: (path: string) => Promise<AudioFileInfo | null>;
  clearAllFiles: () => Promise<void>;
}

export function useAudioFiles(): UseAudioFilesReturn {
  const [files, setFiles] = useState<AudioFileInfo[]>([]);
  const [directory, setDirectory] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Note: This hook currently doesn't have file listing functionality
      // You may need to implement this using the native module's capabilities
      console.warn("File listing functionality not yet implemented");
      setFiles([]);
    } catch (error) {
      console.error("Failed to refresh files:", error);
    }
  }, []);

  const saveTempFile = useCallback(async (tempPath: string) => {
    try {
      // Note: This functionality would need to be implemented in the native module
      console.warn("Save temp file functionality not yet implemented");
    } catch (error) {
      console.error("Failed to save temp file:", error);
    }
  }, []);

  const deleteFile = useCallback(async (path: string) => {
    try {
      // Note: This functionality would need to be implemented in the native module
      console.warn("Delete file functionality not yet implemented");
      setFiles((prev) => prev.filter((file) => file.path !== path));
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  }, []);

  const getFileInfo = useCallback(
    async (path: string): Promise<AudioFileInfo | null> => {
      try {
        // Note: This functionality would need to be implemented in the native module
        console.warn("Get file info functionality not yet implemented");
        return null;
      } catch (error) {
        console.error("Failed to get file info:", error);
        return null;
      }
    },
    []
  );

  const clearAllFiles = useCallback(async () => {
    try {
      await NativeAudioChunkRecorder.clearAllChunkFiles();
      setFiles([]);
    } catch (error) {
      console.error("Failed to clear all files:", error);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Note: Directory functionality would need to be implemented
    setDirectory(null);

    // Listen for chunk ready events which might indicate new files
    const chunkSub = AudioChunkRecorderEventEmitter.addListener(
      "onChunkReady",
      (event: { path: string; seq: number }) => {
        // When a new chunk is ready, it means a new file was created
        // You could update the file list here if needed
        console.log("New chunk file created:", event.path);
      }
    );

    return () => {
      chunkSub.remove();
    };
  }, [refresh]);

  return {
    files,
    directory,
    refresh,
    saveTempFile,
    deleteFile,
    getFileInfo,
    clearAllFiles,
  };
}
