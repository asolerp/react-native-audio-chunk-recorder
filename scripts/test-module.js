#!/usr/bin/env node

console.log("🧪 Testing react-native-audio-chunk-recorder module...");

try {
  // Test importing the module
  console.log("📦 Testing module import...");

  // This will only work in a React Native environment
  // For now, we'll just test the file structure
  const fs = require("fs");
  const path = require("path");

  // Check if we're in a React Native project
  const packageJsonPath = path.join(process.cwd(), "package.json");
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const isReactNative =
      packageJson.dependencies?.["react-native"] ||
      packageJson.devDependencies?.["react-native"];

    if (isReactNative) {
      console.log("✅ React Native project detected");

      // Check if the package is installed
      const nodeModulesPath = path.join(
        process.cwd(),
        "node_modules",
        "@asolerp",
        "react-native-audio-chunk-recorder"
      );
      if (fs.existsSync(nodeModulesPath)) {
        console.log("✅ Package found in node_modules");

        // Check the main entry point
        const mainFile = path.join(nodeModulesPath, "lib", "index.js");
        if (fs.existsSync(mainFile)) {
          console.log("✅ Main library file exists");

          // Read and check the exports
          const mainContent = fs.readFileSync(mainFile, "utf8");
          const hasExports =
            mainContent.includes("isNativeModuleAvailableSync") &&
            mainContent.includes("useAudioRecorder") &&
            mainContent.includes("NativeAudioChunkRecorder");

          if (hasExports) {
            console.log("✅ Main exports are present");
          } else {
            console.log("❌ Main exports are missing");
          }
        } else {
          console.log("❌ Main library file missing");
        }

        // Check native modules
        const androidModule = path.join(
          nodeModulesPath,
          "android",
          "src",
          "main",
          "java",
          "com",
          "recorder",
          "AudioChunkRecorderModule.kt"
        );
        const iosModule = path.join(
          nodeModulesPath,
          "ios",
          "AudioChunkRecorder.m"
        );

        if (fs.existsSync(androidModule)) {
          console.log("✅ Android native module exists");
        } else {
          console.log("❌ Android native module missing");
        }

        if (fs.existsSync(iosModule)) {
          console.log("✅ iOS native module exists");
        } else {
          console.log("❌ iOS native module missing");
        }
      } else {
        console.log("❌ Package not found in node_modules");
        console.log(
          "💡 Run: yarn add @asolerp/react-native-audio-chunk-recorder"
        );
      }
    } else {
      console.log("ℹ️  Not a React Native project");
    }
  }

  console.log("\n📋 Test instructions for React Native app:");
  console.log("1. In your React Native app, add this test code:");
  console.log(`
import { 
  isNativeModuleAvailableSync, 
  isNativeModuleAvailableAsync,
  useAudioRecorder,
  NativeAudioChunkRecorder 
} from '@asolerp/react-native-audio-chunk-recorder';

// Test sync check
console.log('Sync check:', isNativeModuleAvailableSync());

// Test async check
isNativeModuleAvailableAsync().then(result => {
  console.log('Async check:', result);
});

// Test hook
const { isNativeModuleAvailable } = useAudioRecorder();
console.log('Hook check:', isNativeModuleAvailable);

// Test native module
console.log('Native module:', NativeAudioChunkRecorder);
  `);

  console.log("\n2. If any function returns null/undefined:");
  console.log("   - Check that auto-linking is working");
  console.log("   - Run: cd ios && pod install (for iOS)");
  console.log("   - Clean and rebuild: npx react-native clean");
  console.log("   - Check permissions are granted");
} catch (error) {
  console.log("❌ Test failed:", error.message);
}
