//
//  AudioChunkRecorder.h
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/**
 * AudioChunkRecorder - Native module for recording audio in chunks
 * 
 * Supported Events:
 * - onChunkReady: Emitted when a chunk is ready with file path and sequence number
 * - onError: Emitted when an error occurs
 * - onAudioLevel: Emitted with current audio level data (level, hasAudio, averagePower)
 * - onInterruption: Emitted when audio session is interrupted (calls, device disconnection)
 * - onStateChange: Emitted when recording state changes (isRecording, isPaused)
 */

@interface AudioChunkRecorder : RCTEventEmitter <RCTBridgeModule>

// Recording control methods
- (void)startRecording:(NSDictionary *)options resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)stopRecording:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)pauseRecording:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)resumeRecording:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

// Permission and availability methods
- (void)checkPermissions:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)isAvailable:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

// State checking methods
- (void)isRecording:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)getAudioRecordState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

// Cleanup method
- (void)clearAllChunkFiles:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

@end 