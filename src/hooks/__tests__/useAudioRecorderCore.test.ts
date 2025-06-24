import { renderHook } from "@testing-library/react";
import { useAudioRecorderCore } from "../useAudioRecorderCore";

describe("useAudioRecorderCore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with correct default state", () => {
      const { result } = renderHook(() => useAudioRecorderCore());

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isInterrupted).toBe(false);
      expect(result.current.audioLevel).toBe(0);
      expect(result.current.chunks).toEqual([]);
      expect(typeof result.current.startRecording).toBe("function");
      expect(typeof result.current.stopRecording).toBe("function");
      expect(typeof result.current.pauseRecording).toBe("function");
      expect(typeof result.current.resumeRecording).toBe("function");
      expect(typeof result.current.checkPermissions).toBe("function");
    });
  });

  describe("Recording Operations", () => {
    it("should provide all required recording methods", () => {
      const { result } = renderHook(() => useAudioRecorderCore());

      expect(typeof result.current.startRecording).toBe("function");
      expect(typeof result.current.stopRecording).toBe("function");
      expect(typeof result.current.pauseRecording).toBe("function");
      expect(typeof result.current.resumeRecording).toBe("function");
    });
  });

  describe("Permission Handling", () => {
    it("should provide checkPermissions method", () => {
      const { result } = renderHook(() => useAudioRecorderCore());

      expect(typeof result.current.checkPermissions).toBe("function");
    });
  });

  describe("Event Callbacks", () => {
    it("should accept onChunkReady callback", () => {
      const mockOnChunkReady = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            onChunkReady: mockOnChunkReady,
          })
        );
      }).not.toThrow();
    });

    it("should accept onStateChange callback", () => {
      const mockOnStateChange = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            onStateChange: mockOnStateChange,
          })
        );
      }).not.toThrow();
    });

    it("should accept onInterruption callback", () => {
      const mockOnInterruption = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            onInterruption: mockOnInterruption,
          })
        );
      }).not.toThrow();
    });
  });

  describe("Configuration Options", () => {
    it("should accept autoCheckPermissions option", () => {
      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            autoCheckPermissions: true,
          })
        );
      }).not.toThrow();

      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            autoCheckPermissions: false,
          })
        );
      }).not.toThrow();
    });

    it("should accept autoStartRecording option", () => {
      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            autoStartRecording: true,
          })
        );
      }).not.toThrow();

      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            autoStartRecording: false,
          })
        );
      }).not.toThrow();
    });

    it("should accept custom recording options", () => {
      expect(() => {
        renderHook(() =>
          useAudioRecorderCore({
            defaultRecordingOptions: {
              sampleRate: 48000,
              bitRate: 256000,
              chunkSeconds: 60,
            },
          })
        );
      }).not.toThrow();
    });
  });

  describe("State Properties", () => {
    it("should provide all required state properties", () => {
      const { result } = renderHook(() => useAudioRecorderCore());

      // Boolean states
      expect(typeof result.current.isRecording).toBe("boolean");
      expect(typeof result.current.isPaused).toBe("boolean");
      expect(typeof result.current.isInterrupted).toBe("boolean");
      expect(typeof result.current.isAvailable).toBe("boolean");

      // Numeric state
      expect(typeof result.current.audioLevel).toBe("number");

      // Array state
      expect(Array.isArray(result.current.chunks)).toBe(true);

      // Permission state (can be boolean or null)
      expect(
        ["boolean", "object"].includes(typeof result.current.hasPermission)
      ).toBe(true);
    });
  });

  describe("Hook Stability", () => {
    it("should maintain function references across re-renders", () => {
      const { result, rerender } = renderHook(() => useAudioRecorderCore());

      const firstRenderMethods = {
        startRecording: result.current.startRecording,
        stopRecording: result.current.stopRecording,
        pauseRecording: result.current.pauseRecording,
        resumeRecording: result.current.resumeRecording,
        checkPermissions: result.current.checkPermissions,
      };

      rerender();

      expect(result.current.startRecording).toBe(
        firstRenderMethods.startRecording
      );
      expect(result.current.stopRecording).toBe(
        firstRenderMethods.stopRecording
      );
      expect(result.current.pauseRecording).toBe(
        firstRenderMethods.pauseRecording
      );
      expect(result.current.resumeRecording).toBe(
        firstRenderMethods.resumeRecording
      );
      expect(result.current.checkPermissions).toBe(
        firstRenderMethods.checkPermissions
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid options gracefully", () => {
      expect(() => {
        renderHook(() => useAudioRecorderCore({}));
      }).not.toThrow();

      expect(() => {
        renderHook(() => useAudioRecorderCore(undefined));
      }).not.toThrow();

      expect(() => {
        renderHook(() => useAudioRecorderCore({}));
      }).not.toThrow();
    });
  });
});
