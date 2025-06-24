#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Installing react-native-audio-chunk-recorder locally...');

// Get the parent directory (where the main project is)
const parentDir = path.resolve(__dirname, '..');
const projectPackageJson = path.join(parentDir, 'package.json');

if (!fs.existsSync(projectPackageJson)) {
  console.error('❌ Could not find package.json in parent directory');
  process.exit(1);
}

try {
  // Read the main project's package.json
  const projectPkg = JSON.parse(fs.readFileSync(projectPackageJson, 'utf8'));

  console.log('📦 Main project:', projectPkg.name);
  console.log(
    '⚛️  React version:',
    projectPkg.dependencies?.react ||
      projectPkg.devDependencies?.react ||
      'not found'
  );

  // Install the local module
  console.log('📥 Installing local module...');

  const moduleDir = __dirname;

  // Try different installation strategies
  const strategies = [
    { cmd: `npm install ${moduleDir}`, desc: 'Standard installation' },
    {
      cmd: `npm install ${moduleDir} --no-optional`,
      desc: 'Without optional dependencies'
    },
    { cmd: `npm install ${moduleDir} --force`, desc: 'Force installation' },
    {
      cmd: `npm install ${moduleDir} --legacy-peer-deps`,
      desc: 'Legacy peer deps'
    }
  ];

  // Change to parent directory
  process.chdir(parentDir);

  let installSuccess = false;

  for (const strategy of strategies) {
    try {
      console.log(`🔧 Trying: ${strategy.desc}`);
      console.log(`   Command: ${strategy.cmd}`);

      execSync(strategy.cmd, { stdio: 'inherit' });
      installSuccess = true;
      console.log(`✅ Success with: ${strategy.desc}`);
      break;
    } catch (error) {
      console.log(`❌ Failed: ${strategy.desc}`);
      if (strategy === strategies[strategies.length - 1]) {
        throw error; // Re-throw on last attempt
      }
      console.log('🔄 Trying next strategy...\n');
    }
  }

  if (!installSuccess) {
    throw new Error('All installation strategies failed');
  }

  console.log('✅ Successfully installed react-native-audio-chunk-recorder!');

  // Check if we need to run pod install
  const iosDir = path.join(parentDir, 'ios');
  if (fs.existsSync(iosDir)) {
    console.log('🍎 iOS project detected. Running pod install...');
    try {
      process.chdir(iosDir);
      execSync('bundle exec pod install', { stdio: 'inherit' });
      console.log('✅ Pod install completed!');
    } catch (error) {
      console.warn('⚠️  Pod install failed. You may need to run it manually:');
      console.warn('   cd ios && pod install');
    }
  }

  console.log('\n🎉 Installation complete!');
  console.log('📚 Check the examples/ directory for usage examples.');
} catch (error) {
  console.error('❌ Installation failed:', error.message);

  if (error.message.includes('ERESOLVE')) {
    console.log(
      '\n💡 Dependency conflict detected. Trying alternative approach...'
    );

    try {
      const altCommand = `npm install ${__dirname} --force`;
      console.log('🔧 Running:', altCommand);
      execSync(altCommand, { stdio: 'inherit' });
      console.log('✅ Installation successful with --force flag!');
    } catch (forceError) {
      console.error('❌ Alternative installation also failed.');
      console.log('\n🛠️  Manual installation steps:');
      console.log('1. cd ..');
      console.log('2. npm install ./react-native-audio-chunk-recorder --force');
      console.log('3. cd ios && pod install');
    }
  }

  process.exit(1);
}
