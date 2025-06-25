#!/bin/bash

echo "🚀 Starting Kotlin migration..."

# Create backup
BACKUP_DIR="backup/java-files-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup Java files
if [ -f "android/src/main/java/com/audiochunkrecorder/AudioChunkRecorderModule.java" ]; then
    cp "android/src/main/java/com/audiochunkrecorder/AudioChunkRecorderModule.java" "$BACKUP_DIR/"
fi

if [ -f "android/src/main/java/com/audiochunkrecorder/AudioChunkRecorderPackage.java" ]; then
    cp "android/src/main/java/com/audiochunkrecorder/AudioChunkRecorderPackage.java" "$BACKUP_DIR/"
fi

echo "✅ Java files backed up to $BACKUP_DIR"
echo "📝 Kotlin files created. Please test the build."
echo "🔄 Rollback: restore files from $BACKUP_DIR if needed" 