#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("🔍 Diagnosing react-native-audio-chunk-recorder module...\n");

// Check package.json
const packageJsonPath = path.join(__dirname, "..", "package.json");
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  console.log("📦 Package Info:");
  console.log(`   Name: ${packageJson.name}`);
  console.log(`   Version: ${packageJson.version}`);
  console.log(`   Main: ${packageJson.main}`);
  console.log(`   Types: ${packageJson.types}`);
  console.log("");
}

// Check main library file
const mainLibPath = path.join(__dirname, "..", "lib", "index.js");
if (fs.existsSync(mainLibPath)) {
  console.log("✅ Main library file exists:", mainLibPath);
  const mainLibContent = fs.readFileSync(mainLibPath, "utf8");

  // Check if NativeAudioChunkRecorder is exported
  if (mainLibContent.includes("NativeAudioChunkRecorder")) {
    console.log("✅ NativeAudioChunkRecorder is exported in main library");
  } else {
    console.log("❌ NativeAudioChunkRecorder is NOT exported in main library");
  }

  // Check if useAudioRecorder is exported
  if (mainLibContent.includes("useAudioRecorder")) {
    console.log("✅ useAudioRecorder is exported in main library");
  } else {
    console.log("❌ useAudioRecorder is NOT exported in main library");
  }
} else {
  console.log("❌ Main library file missing:", mainLibPath);
}
console.log("");

// Check NativeAudioChunkRecorder file
const nativeModulePath = path.join(
  __dirname,
  "..",
  "lib",
  "NativeAudioChunkRecorder.js"
);
if (fs.existsSync(nativeModulePath)) {
  console.log("✅ NativeAudioChunkRecorder file exists:", nativeModulePath);
  const nativeModuleContent = fs.readFileSync(nativeModulePath, "utf8");

  // Check for NativeModules import
  if (nativeModuleContent.includes("NativeModules")) {
    console.log("✅ NativeModules import found");
  } else {
    console.log("❌ NativeModules import NOT found");
  }

  // Check for module name
  if (nativeModuleContent.includes("AudioChunkRecorder")) {
    console.log("✅ AudioChunkRecorder module name found");
  } else {
    console.log("❌ AudioChunkRecorder module name NOT found");
  }

  // Check for method definitions
  const methods = [
    "startRecording",
    "stopRecording",
    "pauseRecording",
    "resumeRecording",
    "startAudioLevelPreview",
    "stopAudioLevelPreview",
    "isAvailable",
    "checkPermissions",
    "clearAllChunkFiles",
  ];
  methods.forEach((method) => {
    if (nativeModuleContent.includes(method)) {
      console.log(`✅ Method ${method} found`);
    } else {
      console.log(`❌ Method ${method} NOT found`);
    }
  });
} else {
  console.log("❌ NativeAudioChunkRecorder file missing:", nativeModulePath);
}
console.log("");

// Check Android native module
const androidModulePath = path.join(
  __dirname,
  "..",
  "android",
  "src",
  "main",
  "java",
  "com",
  "recorder",
  "AudioChunkRecorderModule.kt"
);
if (fs.existsSync(androidModulePath)) {
  console.log("✅ Android native module exists:", androidModulePath);
  const androidModuleContent = fs.readFileSync(androidModulePath, "utf8");

  // Check for ReactMethod annotations
  const reactMethods = [
    "startRecording",
    "stopRecording",
    "pauseRecording",
    "resumeRecording",
    "startAudioLevelPreview",
    "stopAudioLevelPreview",
    "isAvailable",
    "checkPermissions",
    "clearAllChunkFiles",
  ];
  reactMethods.forEach((method) => {
    if (androidModuleContent.includes(`@ReactMethod\n    fun ${method}`)) {
      console.log(`✅ Android @ReactMethod ${method} found`);
    } else {
      console.log(`❌ Android @ReactMethod ${method} NOT found`);
    }
  });
} else {
  console.log("❌ Android native module missing:", androidModulePath);
}
console.log("");

// Check iOS native module
const iosModulePath = path.join(__dirname, "..", "ios", "AudioChunkRecorder.m");
if (fs.existsSync(iosModulePath)) {
  console.log("✅ iOS native module exists:", iosModulePath);
  const iosModuleContent = fs.readFileSync(iosModulePath, "utf8");

  // Check for RCT_EXPORT_METHOD
  const iosMethods = [
    "startRecording",
    "stopRecording",
    "pauseRecording",
    "resumeRecording",
    "startAudioLevelPreview",
    "stopAudioLevelPreview",
    "isAvailable",
    "checkPermissions",
    "clearAllChunkFiles",
  ];
  iosMethods.forEach((method) => {
    if (iosModuleContent.includes(`RCT_EXPORT_METHOD(${method}`)) {
      console.log(`✅ iOS RCT_EXPORT_METHOD ${method} found`);
    } else {
      console.log(`❌ iOS RCT_EXPORT_METHOD ${method} NOT found`);
    }
  });
} else {
  console.log("❌ iOS native module missing:", iosModulePath);
}
console.log("");

// Check package registration
const androidPackagePath = path.join(
  __dirname,
  "..",
  "android",
  "src",
  "main",
  "java",
  "com",
  "recorder",
  "AudioChunkRecorderPackage.kt"
);
if (fs.existsSync(androidPackagePath)) {
  console.log("✅ Android package exists:", androidPackagePath);
  const androidPackageContent = fs.readFileSync(androidPackagePath, "utf8");

  if (androidPackageContent.includes("AudioChunkRecorderModule")) {
    console.log("✅ AudioChunkRecorderModule is registered in package");
  } else {
    console.log("❌ AudioChunkRecorderModule is NOT registered in package");
  }
} else {
  console.log("❌ Android package missing:", androidPackagePath);
}
console.log("");

// Check build.gradle
const buildGradlePath = path.join(__dirname, "..", "android", "build.gradle");
if (fs.existsSync(buildGradlePath)) {
  console.log("✅ Android build.gradle exists:", buildGradlePath);
  const buildGradleContent = fs.readFileSync(buildGradlePath, "utf8");

  if (buildGradleContent.includes("kotlin-android")) {
    console.log("✅ Kotlin Android plugin configured");
  } else {
    console.log("❌ Kotlin Android plugin NOT configured");
  }

  if (buildGradleContent.includes("kotlinx-coroutines")) {
    console.log("✅ Kotlin coroutines dependency found");
  } else {
    console.log("❌ Kotlin coroutines dependency NOT found");
  }
} else {
  console.log("❌ Android build.gradle missing:", buildGradlePath);
}
console.log("");

// Check podspec
const podspecPath = path.join(
  __dirname,
  "..",
  "react-native-audio-chunk-recorder.podspec"
);
if (fs.existsSync(podspecPath)) {
  console.log("✅ iOS podspec exists:", podspecPath);
  const podspecContent = fs.readFileSync(podspecPath, "utf8");

  if (podspecContent.includes("AudioChunkRecorder")) {
    console.log("✅ AudioChunkRecorder module referenced in podspec");
  } else {
    console.log("❌ AudioChunkRecorder module NOT referenced in podspec");
  }
} else {
  console.log("❌ iOS podspec missing:", podspecPath);
}
console.log("");

console.log("📋 Troubleshooting Steps:");
console.log("");
console.log("1. If any files are missing, run: npm run build");
console.log("2. In your React Native app, check:");
console.log('   - package.json has correct version: "^0.2.10"');
console.log("   - Run: yarn install or npm install");
console.log("   - For iOS: cd ios && pod install");
console.log("   - Clean build: npx react-native clean");
console.log("   - Rebuild: npx react-native run-android/ios");
console.log("");
console.log("3. Test module availability:");
console.log(
  '   import { NativeAudioChunkRecorder } from "@asolerp/react-native-audio-chunk-recorder";'
);
console.log('   console.log("Module:", NativeAudioChunkRecorder);');
console.log(
  '   console.log("Methods:", Object.keys(NativeAudioChunkRecorder || {}));'
);
console.log("");
console.log("4. If module is still null, check:");
console.log("   - Metro bundler cache: npx react-native start --reset-cache");
console.log("   - Auto-linking is working");
console.log("   - Native modules are properly linked");
console.log("   - App permissions are granted");
console.log("");
console.log("5. For manual linking (if auto-linking fails):");
console.log("   - Android: Add to MainApplication.kt");
console.log("   - iOS: Add to Podfile and run pod install");
