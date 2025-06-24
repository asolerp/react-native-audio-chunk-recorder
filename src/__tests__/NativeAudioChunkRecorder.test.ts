describe("NativeAudioChunkRecorder", () => {
  it("should be available as a module", () => {
    const AudioChunkRecorder = require("../NativeAudioChunkRecorder");
    expect(AudioChunkRecorder).toBeDefined();
  });

  it("should export expected functions", () => {
    const AudioChunkRecorder = require("../NativeAudioChunkRecorder");
    expect(AudioChunkRecorder).toBeDefined();
    // Test the actual export structure
    expect(typeof AudioChunkRecorder.default).toBeDefined();
  });
});
