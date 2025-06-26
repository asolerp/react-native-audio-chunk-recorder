module.exports = {
  dependencies: {
    "@asolerp/react-native-audio-chunk-recorder": {
      platforms: {
        android: {
          sourceDir: "./android",
          packageImportPath: "import com.recorder.AudioChunkRecorderPackage;",
          packageName: "com.recorder.AudioChunkRecorderPackage",
        },
      },
    },
  },
};
