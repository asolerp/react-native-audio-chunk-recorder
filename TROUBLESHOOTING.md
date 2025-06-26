# Troubleshooting Guide

## Common Issues and Solutions

### 1. Methods are null/undefined

**Error:** `TypeError: isNativeModuleAvailableSync is not a function (it is undefined)`

**Solution:**

1. **Clean and reinstall:**

   ```bash
   # Remove node_modules and reinstall
   rm -rf node_modules
   yarn install

   # For iOS, also clean pods
   cd ios
   rm -rf Pods
   pod install
   cd ..
   ```

2. **Check auto-linking:**

   ```bash
   # Verify React Native version (should be >= 0.60)
   npx react-native --version

   # Clean React Native cache
   npx react-native clean
   ```

3. **Manual linking (if auto-linking fails):**

   **Android:**

   - Add to `android/settings.gradle`:

     ```gradle
     include ':@asolerp_react-native-audio-chunk-recorder'
     project(':@asolerp_react-native-audio-chunk-recorder').projectDir = new File(rootProject.projectDir, '../node_modules/@asolerp/react-native-audio-chunk-recorder/android')
     ```

   - Add to `android/app/build.gradle`:

     ```gradle
     implementation project(':@asolerp_react-native-audio-chunk-recorder')
     ```

   - Add to `android/app/src/main/java/com/yourapp/MainApplication.java`:

     ```java
     import com.recorder.AudioChunkRecorderPackage;

     // In getPackages() method:
     packages.add(new AudioChunkRecorderPackage());
     ```

   **iOS:**

   - Add to `ios/Podfile`:

     ```ruby
     pod 'react-native-audio-chunk-recorder', :path => '../node_modules/@asolerp/react-native-audio-chunk-recorder'
     ```

   - Run: `cd ios && pod install`

4. **Test the installation:**

   ```javascript
   import {
     isNativeModuleAvailableSync,
     useAudioRecorder,
     NativeAudioChunkRecorder,
   } from "@asolerp/react-native-audio-chunk-recorder";

   // Test sync check
   console.log("Sync check:", isNativeModuleAvailableSync());

   // Test hook
   const { isNativeModuleAvailable } = useAudioRecorder();
   console.log("Hook check:", isNativeModuleAvailable);

   // Test native module
   console.log("Native module:", NativeAudioChunkRecorder);
   ```

### 2. Native module not found

**Error:** `Native module AudioChunkRecorder is not available`

**Solution:**

1. **Check platform support:**

   ```javascript
   import { Platform } from "react-native";
   console.log("Platform:", Platform.OS);
   ```

2. **Verify native files exist:**

   ```bash
   # Check Android files
   ls node_modules/@asolerp/react-native-audio-chunk-recorder/android/src/main/java/com/recorder/

   # Check iOS files
   ls node_modules/@asolerp/react-native-audio-chunk-recorder/ios/
   ```

3. **Rebuild native modules:**

   ```bash
   # Android
   cd android && ./gradlew clean && cd ..

   # iOS
   cd ios && xcodebuild clean && cd ..
   ```

### 3. Permission issues

**Error:** `Permission denied` or `Microphone permission is required`

**Solution:**

1. **Add permissions to Android:**

   ```xml
   <!-- android/app/src/main/AndroidManifest.xml -->
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
   <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
   ```

2. **Add permissions to iOS:**

   ```xml
   <!-- ios/YourApp/Info.plist -->
   <key>NSMicrophoneUsageDescription</key>
   <string>This app needs access to microphone to record audio.</string>
   ```

3. **Request permissions in code:**

   ```javascript
   import { useAudioPermissions } from "@asolerp/react-native-audio-chunk-recorder";

   const { hasPermissions, requestPermissions } = useAudioPermissions();

   if (!hasPermissions) {
     const granted = await requestPermissions();
     if (!granted) {
       console.log("Permission denied");
     }
   }
   ```

### 4. Build errors

**Error:** Kotlin compilation errors or iOS build failures

**Solution:**

1. **Update dependencies:**

   ```bash
   # Update React Native
   npx react-native upgrade

   # Update pods
   cd ios && pod update && cd ..
   ```

2. **Check Kotlin version compatibility:**

   - Ensure Android project uses Kotlin 1.8.0+
   - Update `android/build.gradle` if needed

3. **Check iOS deployment target:**
   - Ensure iOS deployment target is 12.0+
   - Update `ios/Podfile` if needed

### 5. Runtime errors

**Error:** `AudioRecord init failed` or similar native errors

**Solution:**

1. **Check device compatibility:**

   ```javascript
   import { isNativeModuleAvailableSync } from "@asolerp/react-native-audio-chunk-recorder";

   const check = isNativeModuleAvailableSync();
   console.log("Module available:", check.isAvailable);
   console.log("Platform:", check.platform);
   console.log("Error:", check.error);
   ```

2. **Test on different devices:**

   - Try on physical device vs simulator
   - Test on different Android/iOS versions

3. **Check audio hardware:**
   - Ensure device has microphone
   - Check if microphone is being used by another app

## Verification Commands

Run these commands to verify your installation:

```bash
# 1. Check package installation
npm run verify

# 2. Test module structure
npm run test-module

# 3. Check React Native version
npx react-native --version

# 4. Check if auto-linking is working
npx react-native config
```

## Getting Help

If you're still experiencing issues:

1. **Check the logs:**

   ```bash
   # Android
   npx react-native log-android

   # iOS
   npx react-native log-ios
   ```

2. **Create a minimal test case:**

   ```javascript
   import { isNativeModuleAvailableSync } from "@asolerp/react-native-audio-chunk-recorder";
   console.log("Test:", isNativeModuleAvailableSync());
   ```

3. **Report the issue:**
   - Include your React Native version
   - Include your platform (iOS/Android)
   - Include the full error message
   - Include the output of `npm run verify`
