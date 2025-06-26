#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("🔧 react-native-audio-chunk-recorder postinstall setup...");

try {
  // Find the project root (where node_modules is)
  let currentDir = __dirname;
  let projectRoot = null;

  // Go up directories until we find node_modules or package.json
  for (let i = 0; i < 10; i++) {
    currentDir = path.dirname(currentDir);

    if (
      fs.existsSync(path.join(currentDir, "node_modules")) &&
      fs.existsSync(path.join(currentDir, "package.json"))
    ) {
      projectRoot = currentDir;
      break;
    }
  }

  if (!projectRoot) {
    console.log("⚠️  Could not find project root. Skipping postinstall setup.");
    process.exit(0);
  }

  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  console.log("📦 Project:", packageJson.name);

  // Check if it's a React Native project
  const isReactNative =
    packageJson.dependencies?.["react-native"] ||
    packageJson.devDependencies?.["react-native"];

  if (!isReactNative) {
    console.log("ℹ️  Not a React Native project. Skipping native setup.");
    process.exit(0);
  }

  console.log("📱 React Native project detected!");

  // Check for iOS
  const iosDir = path.join(projectRoot, "ios");
  if (fs.existsSync(iosDir)) {
    console.log("🍎 iOS project found");

    // Check if Podfile exists
    const podfilePath = path.join(iosDir, "Podfile");
    if (fs.existsSync(podfilePath)) {
      console.log(
        '✅ Podfile exists - run "cd ios && pod install" to complete iOS setup'
      );
    }
  }

  // Check for Android
  const androidDir = path.join(projectRoot, "android");
  if (fs.existsSync(androidDir)) {
    console.log("🤖 Android project found");

    // Check React Native version for auto-linking
    const rnVersion =
      packageJson.dependencies?.["react-native"] ||
      packageJson.devDependencies?.["react-native"];

    if (rnVersion && (rnVersion.includes("0.6") || rnVersion.includes("0.7"))) {
      console.log(
        "✅ React Native >= 0.60 detected - auto-linking should work"
      );
    } else {
      console.log(
        "⚠️  React Native < 0.60 detected - manual linking may be required"
      );
      console.log("📚 Check README.md for manual linking instructions");
    }
  }

  // Verify the package installation
  console.log("\n🔍 Verifying package installation...");

  // Check if the package is properly installed
  const nodeModulesPath = path.join(
    projectRoot,
    "node_modules",
    "@asolerp",
    "react-native-audio-chunk-recorder"
  );
  if (fs.existsSync(nodeModulesPath)) {
    console.log("✅ Package found in node_modules");

    // Check essential files
    const essentialFiles = [
      "lib/index.js",
      "lib/index.d.ts",
      "android/src/main/java/com/recorder/AudioChunkRecorderModule.kt",
      "android/src/main/java/com/recorder/AudioChunkRecorderPackage.kt",
      "ios/AudioChunkRecorder.h",
      "ios/AudioChunkRecorder.m",
      "react-native-audio-chunk-recorder.podspec",
    ];

    let allFilesPresent = true;
    essentialFiles.forEach((file) => {
      const filePath = path.join(nodeModulesPath, file);
      if (fs.existsSync(filePath)) {
        console.log(`✅ ${file}`);
      } else {
        console.log(`❌ ${file} - MISSING`);
        allFilesPresent = false;
      }
    });

    if (!allFilesPresent) {
      console.log(
        "\n⚠️  Some essential files are missing. The package may not work correctly."
      );
      console.log("💡 Try: yarn cache clean && yarn install");
    } else {
      console.log("\n✅ All essential files are present!");
    }
  } else {
    console.log("❌ Package not found in node_modules");
  }

  console.log("\n🎉 Postinstall setup complete!");
  console.log("📖 Next steps:");
  console.log("   1. Add required permissions (see README.md)");
  console.log("   2. For iOS: cd ios && pod install");
  console.log("   3. Test the installation:");
  console.log(
    '      import { isNativeModuleAvailableSync } from "@asolerp/react-native-audio-chunk-recorder"'
  );
  console.log("      console.log(isNativeModuleAvailableSync())");
  console.log("   4. If methods are null, check:");
  console.log("      - Auto-linking is working (React Native >= 0.60)");
  console.log("      - Native modules are properly built");
  console.log("      - Permissions are granted");
} catch (error) {
  console.log("⚠️  Postinstall setup encountered an issue:", error.message);
  console.log("📚 Please check the README.md for manual setup instructions");
}
