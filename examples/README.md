# Audio Chunk Recorder Examples

This folder contains comprehensive examples demonstrating how to use the React Native Audio Chunk Recorder library with its modular hooks.

## 📁 Examples

### `CompleteExample.tsx` - Full Integration Example

**The most comprehensive example showing all hooks working together.**

**Features:**

- ✅ **Audio Level Preview** - Real-time audio level monitoring without recording
- ✅ **Recording Controls** - Start, stop, pause, resume with chunk management
- ✅ **Chunk Management** - External processing with callbacks
- ✅ **Statistics** - Real-time stats for received, processed, and rejected chunks
- ✅ **Visual Feedback** - Audio level meter with color coding
- ✅ **Chunk Operations** - Play, delete, export functionality

**Hooks Used:**

- `useAudioRecorder` - Recording state and controls
- `useAudioLevelPreview` - Audio level monitoring
- `useAudioChunks` - Chunk management with callbacks

## 🎯 Key Features Demonstrated

### 1. **Audio Level Preview**

```typescript
const {
  data: levelData,
  startPreview,
  stopPreview,
  isPreviewing,
} = useAudioLevelPreview();
```

- Real-time audio level monitoring
- Visual level meter with color coding
- Audio detection indicators

### 2. **Recording with Chunks**

```typescript
const {
  isRecording,
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording,
} = useAudioRecorder();
```

- 30-second automatic chunk creation
- Pause/resume functionality
- Recording state management

### 3. **Advanced Chunk Management**

```typescript
const { chunks, removeChunk, clearChunks, totalChunks, totalDuration } =
  useAudioChunks({
    onChunkReady: handleChunkReady,
    onChunkRemoved: handleChunkRemoved,
    onChunksCleared: handleChunksCleared,
  });
```

- External chunk processing
- Callback-based architecture
- Statistics tracking
- Chunk filtering and validation

## 🚀 Getting Started

1. **Install the library:**

   ```bash
   npm install react-native-audio-chunk-recorder
   ```

2. **Import the hooks:**

   ```typescript
   import {
     useAudioRecorder,
     useAudioLevelPreview,
     useAudioChunks,
   } from "react-native-audio-chunk-recorder";
   ```

3. **Use the CompleteExample as a reference:**
   ```typescript
   import CompleteExample from "./examples/CompleteExample";
   ```

## 🏗️ Architecture

The examples demonstrate a **modular architecture** where each hook has a specific responsibility:

- **`useAudioRecorder`** - Recording state and controls
- **`useAudioLevelPreview`** - Audio level monitoring
- **`useAudioChunks`** - Chunk management with callbacks

This separation allows for:

- ✅ **Flexible usage** - Use only the hooks you need
- ✅ **Easy testing** - Test each hook independently
- ✅ **Clean code** - Clear separation of concerns
- ✅ **TypeScript support** - Full type safety

## 📱 Usage Patterns

### Basic Recording

```typescript
const { isRecording, startRecording, stopRecording } = useAudioRecorder();
```

### Audio Level Monitoring

```typescript
const { data: levelData, startPreview, stopPreview } = useAudioLevelPreview();
```

### Chunk Management

```typescript
const { chunks, removeChunk, clearChunks } = useAudioChunks();
```

### Advanced Chunk Processing

```typescript
const { chunks } = useAudioChunks({
  onChunkReady: (chunk) => {
    // Custom processing logic
    if (shouldProcess(chunk)) {
      processChunk(chunk);
    }
  },
  autoAddChunks: false, // Only use callbacks
});
```

## 🎨 UI Components

The examples include reusable UI components:

- **Audio Level Meter** - Visual representation of audio levels
- **Chunk List** - Display and manage audio chunks
- **Statistics Grid** - Real-time statistics display
- **Control Buttons** - Recording and preview controls

## 🔧 Customization

All examples are fully customizable:

- **Styling** - Modify the StyleSheet objects
- **Logic** - Customize the callback functions
- **UI** - Adapt the components to your design
- **Functionality** - Add your own features

## 📊 Performance Features

- **Real-time updates** - Immediate feedback for all operations
- **Memory efficient** - Streaming WAV encoding
- **Optimized rendering** - Efficient React Native components
- **Background processing** - Non-blocking audio operations

## 🐛 Troubleshooting

If you encounter issues:

1. **Check permissions** - Ensure microphone permissions are granted
2. **Verify native modules** - Make sure the Kotlin modules are properly linked
3. **Check console logs** - Look for error messages in the console
4. **Test individual hooks** - Try using hooks separately to isolate issues

## 📚 Additional Resources

- **Library Documentation** - See the main README.md
- **TypeScript Types** - Full type definitions available
- **Native Implementation** - Kotlin modules in `/android/src/main/java/com/recorder/`
- **Hook Documentation** - Detailed hook documentation in `/src/hooks/`

---

**Happy Recording! 🎤🎵**
