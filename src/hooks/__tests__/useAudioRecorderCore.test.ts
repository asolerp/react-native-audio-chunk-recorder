import { renderHook } from "@testing-library/react";
import { useAudioRecorder } from "../useAudioRecorder";

describe("useAudioRecorder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with correct default state", () => {
      const { result } = renderHook(() => useAudioRecorder());

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.autoRecording).toBe(false);
      expect(typeof result.current.hasPermissions).toBe("boolean");
      expect(typeof result.current.isNativeModuleAvailable).toBe("boolean");
      expect(typeof result.current.startRecording).toBe("function");
      expect(typeof result.current.stopRecording).toBe("function");
      expect(typeof result.current.pauseRecording).toBe("function");
      expect(typeof result.current.resumeRecording).toBe("function");
      expect(typeof result.current.requestPermissions).toBe("function");
    });
  });

  describe("Recording Operations", () => {
    it("should provide all required recording methods", () => {
      const { result } = renderHook(() => useAudioRecorder());

      expect(typeof result.current.startRecording).toBe("function");
      expect(typeof result.current.stopRecording).toBe("function");
      expect(typeof result.current.pauseRecording).toBe("function");
      expect(typeof result.current.resumeRecording).toBe("function");
    });
  });

  describe("Permission Handling", () => {
    it("should provide requestPermissions method", () => {
      const { result } = renderHook(() => useAudioRecorder());

      expect(typeof result.current.requestPermissions).toBe("function");
    });
  });

  describe("Auto Recording", () => {
    it("should provide auto recording functionality", () => {
      const { result } = renderHook(() => useAudioRecorder());

      expect(typeof result.current.autoRecording).toBe("boolean");
      expect(typeof result.current.setAutoRecording).toBe("function");
      expect(typeof result.current.toggleAutoRecording).toBe("function");
    });
  });

  describe("Native Module", () => {
    it("should provide native module availability checks", () => {
      const { result } = renderHook(() => useAudioRecorder());

      expect(typeof result.current.isNativeModuleAvailable).toBe("boolean");
      expect(typeof result.current.checkNativeModuleAvailability).toBe(
        "function"
      );
    });
  });

  describe("Event Callbacks", () => {
    it("should accept onError callback", () => {
      const mockOnError = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            onError: mockOnError,
          })
        );
      }).not.toThrow();
    });

    it("should accept onStateChange callback", () => {
      const mockOnStateChange = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            onStateChange: mockOnStateChange,
          })
        );
      }).not.toThrow();
    });

    it("should accept onAutoRecordingStart callback", () => {
      const mockOnAutoRecordingStart = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            onAutoRecordingStart: mockOnAutoRecordingStart,
          })
        );
      }).not.toThrow();
    });

    it("should accept onAutoRecordingStop callback", () => {
      const mockOnAutoRecordingStop = jest.fn();

      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            onAutoRecordingStop: mockOnAutoRecordingStop,
          })
        );
      }).not.toThrow();
    });
  });

  describe("Configuration Options", () => {
    it("should accept autoRecording option", () => {
      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            autoRecording: true,
          })
        );
      }).not.toThrow();

      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            autoRecording: false,
          })
        );
      }).not.toThrow();
    });

    it("should accept validateNativeModule option", () => {
      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            validateNativeModule: true,
          })
        );
      }).not.toThrow();

      expect(() => {
        renderHook(() =>
          useAudioRecorder({
            validateNativeModule: false,
          })
        );
      }).not.toThrow();
    });
  });

  describe("State Properties", () => {
    it("should provide all required state properties", () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Boolean states
      expect(typeof result.current.isRecording).toBe("boolean");
      expect(typeof result.current.isPaused).toBe("boolean");
      expect(typeof result.current.autoRecording).toBe("boolean");
      expect(typeof result.current.hasPermissions).toBe("boolean");
      expect(typeof result.current.isNativeModuleAvailable).toBe("boolean");

      // Optional error state
      expect(
        ["string", "undefined"].includes(
          typeof result.current.nativeModuleError
        )
      ).toBe(true);
    });
  });

  describe("Hook Stability", () => {
    it("should maintain function references across re-renders", () => {
      const { result, rerender } = renderHook(() => useAudioRecorder());

      const firstRenderMethods = {
        startRecording: result.current.startRecording,
        stopRecording: result.current.stopRecording,
        pauseRecording: result.current.pauseRecording,
        resumeRecording: result.current.resumeRecording,
        requestPermissions: result.current.requestPermissions,
        setAutoRecording: result.current.setAutoRecording,
        toggleAutoRecording: result.current.toggleAutoRecording,
        checkNativeModuleAvailability:
          result.current.checkNativeModuleAvailability,
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
      expect(result.current.requestPermissions).toBe(
        firstRenderMethods.requestPermissions
      );
      expect(result.current.setAutoRecording).toBe(
        firstRenderMethods.setAutoRecording
      );
      expect(result.current.toggleAutoRecording).toBe(
        firstRenderMethods.toggleAutoRecording
      );
      expect(result.current.checkNativeModuleAvailability).toBe(
        firstRenderMethods.checkNativeModuleAvailability
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid options gracefully", () => {
      expect(() => {
        renderHook(() => useAudioRecorder({}));
      }).not.toThrow();

      expect(() => {
        renderHook(() => useAudioRecorder(undefined));
      }).not.toThrow();
    });
  });
});
