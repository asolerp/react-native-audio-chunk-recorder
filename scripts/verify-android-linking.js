#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("🔍 Verifying Android auto-linking configuration...\n");

// Check if we're in a React Native project
const isReactNativeProject =
  fs.existsSync("android") && fs.existsSync("package.json");

if (!isReactNativeProject) {
  console.log("❌ Not in a React Native project root");
  console.log("📋 Run this script from your React Native app root directory");
  process.exit(1);
}

// Check package.json for the module
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
const hasModule = dependencies["@asolerp/react-native-audio-chunk-recorder"];

if (!hasModule) {
  console.log(
    "❌ @asolerp/react-native-audio-chunk-recorder not found in dependencies"
  );
  console.log(
    "📋 Install with: yarn add @asolerp/react-native-audio-chunk-recorder"
  );
  process.exit(1);
}

console.log(`✅ Module found in dependencies: ${hasModule}`);

// Check if node_modules contains the module
const modulePath = path.join(
  "node_modules",
  "@asolerp",
  "react-native-audio-chunk-recorder"
);
if (!fs.existsSync(modulePath)) {
  console.log("❌ Module not found in node_modules");
  console.log("📋 Run: yarn install or npm install");
  process.exit(1);
}

console.log("✅ Module found in node_modules");

// Check Android source files
const androidPath = path.join(modulePath, "android");
if (!fs.existsSync(androidPath)) {
  console.log("❌ Android source not found in module");
  process.exit(1);
}

console.log("✅ Android source found");

// Find MainApplication in common locations
const possibleMainApplicationPaths = [
  path.join(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "example",
    "MainApplication.kt"
  ),
  path.join(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "example",
    "MainApplication.java"
  ),
  path.join(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "app",
    "MainApplication.kt"
  ),
  path.join(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "app",
    "MainApplication.java"
  ),
  path.join(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "myapp",
    "MainApplication.kt"
  ),
  path.join(
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "myapp",
    "MainApplication.java"
  ),
];

let mainApplicationPath = null;
let mainApplicationContent = "";

for (const possiblePath of possibleMainApplicationPaths) {
  if (fs.existsSync(possiblePath)) {
    mainApplicationPath = possiblePath;
    mainApplicationContent = fs.readFileSync(possiblePath, "utf8");
    console.log(`✅ MainApplication found: ${possiblePath}`);
    break;
  }
}

if (!mainApplicationPath) {
  console.log("⚠️  MainApplication not found in expected locations");
  console.log("📋 Searching for MainApplication files...");

  // Search recursively for MainApplication files
  const searchMainApplication = (dir) => {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          searchMainApplication(fullPath);
        } else if (
          file === "MainApplication.kt" ||
          file === "MainApplication.java"
        ) {
          console.log(`📁 Found MainApplication: ${fullPath}`);
          mainApplicationPath = fullPath;
          mainApplicationContent = fs.readFileSync(fullPath, "utf8");
          return;
        }
      }
    } catch (error) {
      // Ignore errors
    }
  };

  searchMainApplication("android");

  if (!mainApplicationPath) {
    console.log("❌ MainApplication not found anywhere");
    console.log("📋 Check your app package name and structure");
    process.exit(1);
  }
}

// Check for auto-linking in MainApplication
if (mainApplicationContent) {
  const hasAutoLinking =
    mainApplicationContent.includes("new AudioChunkRecorderPackage()") ||
    mainApplicationContent.includes("AudioChunkRecorderPackage");

  if (hasAutoLinking) {
    console.log("✅ Auto-linking detected in MainApplication");
  } else {
    console.log("⚠️  Auto-linking not detected in MainApplication");
    console.log("📋 Manual linking required");

    // Show the current MainApplication content for reference
    console.log("\n📄 Current MainApplication content:");
    console.log("---");
    console.log(mainApplicationContent.substring(0, 500) + "...");
    console.log("---");

    console.log("\n🔧 Add this to your MainApplication:");
    console.log(
      "1. Add import: import com.recorder.AudioChunkRecorderPackage;"
    );
    console.log(
      "2. Add to getPackages(): packages.add(AudioChunkRecorderPackage());"
    );
  }
}

// Check build.gradle for dependencies
const appBuildGradlePath = path.join("android", "app", "build.gradle");
if (fs.existsSync(appBuildGradlePath)) {
  const buildGradleContent = fs.readFileSync(appBuildGradlePath, "utf8");
  const hasImplementation =
    buildGradleContent.includes(
      "implementation project(':react-native-audio-chunk-recorder')"
    ) ||
    buildGradleContent.includes(
      'implementation project(":react-native-audio-chunk-recorder")'
    );

  if (hasImplementation) {
    console.log("✅ Manual linking detected in build.gradle");
  } else {
    console.log(
      "ℹ️  No manual linking in build.gradle (auto-linking expected)"
    );
  }
}

// Check settings.gradle
const settingsGradlePath = path.join("android", "settings.gradle");
if (fs.existsSync(settingsGradlePath)) {
  const settingsGradleContent = fs.readFileSync(settingsGradlePath, "utf8");
  const hasInclude =
    settingsGradleContent.includes(
      "include ':react-native-audio-chunk-recorder'"
    ) ||
    settingsGradleContent.includes(
      'include ":react-native-audio-chunk-recorder"'
    );

  if (hasInclude) {
    console.log("✅ Manual linking detected in settings.gradle");
  } else {
    console.log(
      "ℹ️  No manual linking in settings.gradle (auto-linking expected)"
    );
  }
}

console.log("\n📋 Next steps:");
console.log("1. Clean build: cd android && ./gradlew clean && cd ..");
console.log("2. Clear Metro cache: npx react-native start --reset-cache");
console.log("3. Rebuild: npx react-native run-android");
console.log("\n🔧 If auto-linking fails, try manual linking:");
console.log(
  "   - Add to settings.gradle: include ':react-native-audio-chunk-recorder'"
);
console.log(
  "   - Add to app/build.gradle: implementation project(':react-native-audio-chunk-recorder')"
);
console.log("   - Add to MainApplication: new AudioChunkRecorderPackage()");
