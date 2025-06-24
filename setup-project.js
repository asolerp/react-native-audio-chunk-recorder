#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up project for react-native-audio-chunk-recorder...');

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

  // Add overrides/resolutions to handle Apollo Client conflict
  const hasOverrides = projectPkg.overrides;
  const hasResolutions = projectPkg.resolutions;

  let modified = false;

  if (!hasOverrides && !hasResolutions) {
    console.log('📝 Adding npm overrides to resolve Apollo Client conflict...');

    projectPkg.overrides = {
      '@apollo/client': {
        react: '$react'
      }
    };

    // Also add resolutions for Yarn compatibility
    projectPkg.resolutions = {
      '@apollo/client/react': '$react'
    };

    modified = true;
  }

  // Add npmrc suggestions
  const npmrcPath = path.join(parentDir, '.npmrc');
  const npmrcContent = `# Configuration for react-native-audio-chunk-recorder
auto-install-peers=false
strict-peer-deps=false
`;

  if (!fs.existsSync(npmrcPath)) {
    console.log('📝 Creating .npmrc configuration...');
    fs.writeFileSync(npmrcPath, npmrcContent);
    console.log('✅ Created .npmrc');
  } else {
    console.log('ℹ️  .npmrc already exists');
  }

  if (modified) {
    // Backup original package.json
    const backupPath = projectPackageJson + '.backup';
    fs.writeFileSync(backupPath, JSON.stringify(projectPkg, null, 2));
    console.log('💾 Backup created:', backupPath);

    // Write modified package.json
    fs.writeFileSync(projectPackageJson, JSON.stringify(projectPkg, null, 2));
    console.log('✅ Updated package.json with dependency overrides');
  }

  console.log('\n🎉 Project setup complete!');
  console.log('📖 Next steps:');
  console.log('   1. npm install (should now work without conflicts)');
  console.log('   2. cd ios && pod install (for iOS)');
  console.log('   3. Add required permissions (see README.md)');
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}
