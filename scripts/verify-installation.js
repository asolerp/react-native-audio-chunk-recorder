#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("🔍 Verifying react-native-audio-chunk-recorder installation...");

function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${description}: ${filePath}`);
    return true;
  } else {
    console.log(`❌ ${description}: ${filePath} - NOT FOUND`);
    return false;
  }
}

function checkDirectoryExists(dirPath, description) {
  if (fs.existsSync(dirPath)) {
    console.log(`✅ ${description}: ${dirPath}`);
    return true;
  } else {
    console.log(`❌ ${description}: ${dirPath} - NOT FOUND`);
    return false;
  }
}

try {
  // Find the package directory
  const packageDir = __dirname;
  const packageJsonPath = path.join(packageDir, "..", "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    console.log("❌ package.json not found");
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  console.log(`📦 Package: ${packageJson.name}@${packageJson.version}`);

  // Check essential files
  const checks = [
    // Main files
    {
      path: path.join(packageDir, "..", "lib", "index.js"),
      desc: "Main library file",
    },
    {
      path: path.join(packageDir, "..", "lib", "index.d.ts"),
      desc: "TypeScript definitions",
    },

    // Native modules
    {
      path: path.join(packageDir, "..", "android"),
      desc: "Android native module",
    },
    { path: path.join(packageDir, "..", "ios"), desc: "iOS native module" },

    // Android specific
    {
      path: path.join(packageDir, "..", "android", "build.gradle"),
      desc: "Android build.gradle",
    },
    {
      path: path.join(
        packageDir,
        "..",
        "android",
        "src",
        "main",
        "java",
        "com",
        "recorder",
        "AudioChunkRecorderModule.kt"
      ),
      desc: "Android Kotlin module",
    },
    {
      path: path.join(
        packageDir,
        "..",
        "android",
        "src",
        "main",
        "java",
        "com",
        "recorder",
        "AudioChunkRecorderPackage.kt"
      ),
      desc: "Android package",
    },

    // iOS specific
    {
      path: path.join(packageDir, "..", "ios", "AudioChunkRecorder.h"),
      desc: "iOS header file",
    },
    {
      path: path.join(packageDir, "..", "ios", "AudioChunkRecorder.m"),
      desc: "iOS implementation",
    },
    {
      path: path.join(
        packageDir,
        "..",
        "react-native-audio-chunk-recorder.podspec"
      ),
      desc: "iOS podspec",
    },

    // Hooks
    {
      path: path.join(packageDir, "..", "lib", "hooks", "useAudioRecorder.js"),
      desc: "useAudioRecorder hook",
    },
    {
      path: path.join(
        packageDir,
        "..",
        "lib",
        "hooks",
        "useAudioPermissions.js"
      ),
      desc: "useAudioPermissions hook",
    },
    {
      path: path.join(packageDir, "..", "lib", "utils", "nativeModuleUtils.js"),
      desc: "Native module utilities",
    },
  ];

  let allChecksPassed = true;

  checks.forEach((check) => {
    const passed = checkFileExists(check.path, check.desc);
    if (!passed) allChecksPassed = false;
  });

  // Check package.json configuration
  console.log("\n📋 Package configuration:");
  console.log(`   Main: ${packageJson.main}`);
  console.log(`   Types: ${packageJson.types}`);
  console.log(`   Files: ${packageJson.files?.length || 0} files included`);

  if (packageJson["react-native"]) {
    console.log(
      `   React Native config: ${JSON.stringify(packageJson["react-native"])}`
    );
  }

  // Check if files array includes necessary files
  const requiredFiles = [
    "lib/**/*.js",
    "lib/**/*.d.ts",
    "ios",
    "android",
    "react-native-audio-chunk-recorder.podspec",
  ];

  console.log("\n📦 Files included in package:");
  requiredFiles.forEach((file) => {
    const included = packageJson.files?.includes(file);
    console.log(`   ${included ? "✅" : "❌"} ${file}`);
    if (!included) allChecksPassed = false;
  });

  if (allChecksPassed) {
    console.log(
      "\n🎉 All checks passed! The package should install correctly."
    );
    console.log("\n📖 Installation verification:");
    console.log(
      "   1. Run: yarn add @asolerp/react-native-audio-chunk-recorder"
    );
    console.log("   2. For iOS: cd ios && pod install");
    console.log(
      '   3. Test import: import { isNativeModuleAvailableSync } from "@asolerp/react-native-audio-chunk-recorder"'
    );
    console.log(
      "   4. Test function: console.log(isNativeModuleAvailableSync())"
    );
  } else {
    console.log(
      "\n⚠️  Some checks failed. The package may not install correctly."
    );
    console.log(
      "📚 Please check the build process and ensure all files are included."
    );
  }
} catch (error) {
  console.log("❌ Verification failed:", error.message);
  process.exit(1);
}
