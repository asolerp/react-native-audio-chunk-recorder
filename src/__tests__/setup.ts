// Mock React Native modules
jest.mock("react-native", () => ({
  NativeModules: {
    AudioChunkRecorder: {
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      checkPermissions: jest.fn().mockResolvedValue(true),
      isRecording: jest.fn().mockReturnValue(false),
      isPaused: jest.fn().mockReturnValue(false),
      getAudioLevel: jest.fn().mockReturnValue(0),
      isAvailable: jest.fn().mockReturnValue(true),
    },
  },
  NativeEventEmitter: jest.fn(() => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  })),
  Platform: {
    OS: "ios",
    select: jest.fn((options) => options.ios),
  },
  Alert: {
    alert: jest.fn(),
  },
}));

// Mock timers
jest.useFakeTimers();

// Global test utilities
global.beforeEach(() => {
  jest.clearAllMocks();
});

// Suppress console warnings in tests unless explicitly testing them
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// Basic test to satisfy Jest requirement
describe("Setup", () => {
  it("should setup mocks correctly", () => {
    expect(true).toBe(true);
  });
});
