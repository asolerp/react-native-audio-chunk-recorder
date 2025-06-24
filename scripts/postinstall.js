#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 react-native-audio-chunk-recorder postinstall setup...');

try {
  // Find the project root (where node_modules is)
  let currentDir = __dirname;
  let projectRoot = null;

  // Go up directories until we find node_modules or package.json
  for (let i = 0; i < 10; i++) {
    currentDir = path.dirname(currentDir);

    if (
      fs.existsSync(path.join(currentDir, 'node_modules')) &&
      fs.existsSync(path.join(currentDir, 'package.json'))
    ) {
      projectRoot = currentDir;
      break;
    }
  }

  if (!projectRoot) {
    console.log('⚠️  Could not find project root. Skipping postinstall setup.');
    process.exit(0);
  }

  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  console.log('📦 Project:', packageJson.name);

  // Check if it's a React Native project
  const isReactNative =
    packageJson.dependencies?.['react-native'] ||
    packageJson.devDependencies?.['react-native'];

  if (!isReactNative) {
    console.log('ℹ️  Not a React Native project. Skipping native setup.');
    process.exit(0);
  }

  console.log('📱 React Native project detected!');

  // Check for iOS
  const iosDir = path.join(projectRoot, 'ios');
  if (fs.existsSync(iosDir)) {
    console.log('🍎 iOS project found');

    // Check if Podfile exists
    const podfilePath = path.join(iosDir, 'Podfile');
    if (fs.existsSync(podfilePath)) {
      console.log(
        '✅ Podfile exists - run "cd ios && pod install" to complete iOS setup'
      );
    }
  }

  // Check for Android
  const androidDir = path.join(projectRoot, 'android');
  if (fs.existsSync(androidDir)) {
    console.log('🤖 Android project found');

    // Check React Native version for auto-linking
    const rnVersion =
      packageJson.dependencies?.['react-native'] ||
      packageJson.devDependencies?.['react-native'];

    if (rnVersion && (rnVersion.includes('0.6') || rnVersion.includes('0.7'))) {
      console.log(
        '✅ React Native >= 0.60 detected - auto-linking should work'
      );
    } else {
      console.log(
        '⚠️  React Native < 0.60 detected - manual linking may be required'
      );
      console.log('📚 Check README.md for manual linking instructions');
    }
  }

  console.log('\n🎉 Postinstall setup complete!');
  console.log('📖 Next steps:');
  console.log('   1. Add required permissions (see README.md)');
  console.log('   2. For iOS: cd ios && pod install');
  console.log(
    '   3. Import and use: import { useAudioRecorderCore } from "react-native-audio-chunk-recorder"'
  );
} catch (error) {
  console.log('⚠️  Postinstall setup encountered an issue:', error.message);
  console.log('📚 Please check the README.md for manual setup instructions');
}
