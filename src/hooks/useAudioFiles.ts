import { useCallback, useEffect, useState } from "react";
import { NativeModules, NativeEventEmitter } from "react-native";

const { AudioFileManagerModule } = NativeModules;

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
      const filePaths: string[] = await AudioFileManagerModule.listFiles();
      const fileInfos: AudioFileInfo[] = [];

      for (const path of filePaths) {
        try {
          const info = await AudioFileManagerModule.getFileInfo(path);
          if (info) {
            fileInfos.push(info);
          }
        } catch (error) {
          console.warn("Failed to get file info for:", path, error);
        }
      }

      setFiles(fileInfos);
    } catch (error) {
      console.error("Failed to refresh files:", error);
    }
  }, []);

  const saveTempFile = useCallback(async (tempPath: string) => {
    try {
      await AudioFileManagerModule.saveTempFile(tempPath);
      // File list will be updated via event
    } catch (error) {
      console.error("Failed to save temp file:", error);
    }
  }, []);

  const deleteFile = useCallback(async (path: string) => {
    try {
      await AudioFileManagerModule.deleteFile(path);
      setFiles((prev) => prev.filter((file) => file.path !== path));
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  }, []);

  const getFileInfo = useCallback(
    async (path: string): Promise<AudioFileInfo | null> => {
      try {
        return await AudioFileManagerModule.getFileInfo(path);
      } catch (error) {
        console.error("Failed to get file info:", error);
        return null;
      }
    },
    []
  );

  const clearAllFiles = useCallback(async () => {
    try {
      await AudioFileManagerModule.clearAllFiles();
      setFiles([]);
    } catch (error) {
      console.error("Failed to clear all files:", error);
    }
  }, []);

  useEffect(() => {
    refresh();

    AudioFileManagerModule.getDirectory()
      .then(setDirectory)
      .catch(() => {});

    const emitter = new NativeEventEmitter(AudioFileManagerModule);

    const savedSub = emitter.addListener(
      "onFileSaved",
      (event: { path: string }) => {
        // Refresh the file list when a new file is saved
        refresh();
      }
    );

    const deletedSub = emitter.addListener(
      "onFileDeleted",
      (event: { path: string }) => {
        setFiles((prev) => prev.filter((file) => file.path !== event.path));
      }
    );

    return () => {
      savedSub.remove();
      deletedSub.remove();
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
