//
// AudioChunkRecorder.m 
//
#import "AudioChunkRecorder.h"
#import <AVFoundation/AVFoundation.h>

// Constants for error domain and default settings
static NSString * const kRecorderErrorDomain = @"AudioChunkRecorder";
static const NSTimeInterval kDefaultSampleRate = 16000.0;
static const NSInteger       kDefaultBitRate    = 64000;
static const NSInteger       kDefaultChunkSecs  = 30;

@interface AudioChunkRecorder ()
@property (nonatomic, strong) AVAudioRecorder *recorder;
@property (nonatomic)            dispatch_source_t timer;
@property (nonatomic)            dispatch_source_t levelTimer;
@property (nonatomic)            dispatch_source_t maxDurationTimer;
@property (nonatomic)            NSInteger seq;
@property (nonatomic)            double sampleRate;
@property (nonatomic)            NSInteger bitRate;
@property (nonatomic)            NSInteger chunkSeconds;
@property (nonatomic)            NSTimeInterval maxRecordingDuration;
@property (nonatomic)            NSTimeInterval recordingStartTime;
@property (nonatomic)            BOOL isRecording;
@property (nonatomic)            BOOL isPaused;
@property (nonatomic, copy)      NSString *currentFilePath;
@property (nonatomic)            NSTimeInterval chunkStartTime;
@property (nonatomic)            NSTimeInterval accumulatedRecordingTime;
@property (nonatomic)            BOOL interruptionEventSent; // Prevent multiple interruption events
@property (nonatomic)            NSTimeInterval lastInterruptionEndTime; // Prevent multiple interruption end events within 1 second
@end

@implementation AudioChunkRecorder

RCT_EXPORT_MODULE();

#pragma mark - RCTEventEmitter Boilerplate

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onChunkReady", @"onError", @"onAudioLevel", @"onInterruption", @"onStateChange", @"onMaxDurationReached"];
}

#pragma mark - Public API

// Starts recording audio chunks with provided options
RCT_EXPORT_METHOD(startRecording:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (self.isRecording) {
        reject(@"already_recording", @"Recording is already in progress", nil);
        return;
    }
    [self resetState];

    // Apply configuration or use defaults
    self.sampleRate   = [options[@"sampleRate"] doubleValue]   ?: kDefaultSampleRate;
    self.bitRate      = [options[@"bitRate"] integerValue]     ?: kDefaultBitRate;
    self.chunkSeconds = [options[@"chunkSeconds"] integerValue] ?: kDefaultChunkSecs;
    self.maxRecordingDuration = [options[@"maxRecordingDuration"] doubleValue] ?: 7200.0; // Default 2 hours
    self.seq = 1; // Start from 1 instead of 0
    self.isPaused = NO;
    self.interruptionEventSent = NO; // Reset for new recording session
    self.lastInterruptionEndTime = 0; // Reset for new recording session
    self.recordingStartTime = [NSDate timeIntervalSinceReferenceDate]; // Track total recording start time

    // Check microphone permission
    AVAudioSessionRecordPermission perm = [[AVAudioSession sharedInstance] recordPermission];
    if (perm != AVAudioSessionRecordPermissionGranted) {
        reject(@"permission_denied", @"Microphone permission not granted", nil);
        return;
    }

    // Configure and start recording on main thread
    dispatch_async(dispatch_get_main_queue(), ^{
        NSError *error = nil;
        if (![self configureAudioSession:&error] || ![self beginRecording:&error]) {
            reject(@"start_failed", error.localizedDescription ?: @"Failed to start recording", error);
            return;
        }
        self.isRecording = YES;
        
        // Emit state change event immediately after starting
        [self emitStateChange];
        
        [self setupAudioSessionNotifications];
        [self scheduleRotation];
        [self startAudioLevelMonitoring];
        [self startMaxDurationTracking]; // Start max duration tracking
        resolve(@"Recording started");
    });
}

// Stops recording and cleans up resources
RCT_EXPORT_METHOD(stopRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!self.isRecording) { 
        reject(@"not_recording", @"No recording in progress", nil);
        return; 
    }

    self.isRecording = NO;
    
    // Emit state change event immediately after stopping
    [self emitStateChange];
    
    self.interruptionEventSent = NO; // Reset for next recording session
    self.lastInterruptionEndTime = 0; // Reset for next recording session
    [self removeAudioSessionNotifications];
    [self stopAudioLevelMonitoring];
    [self stopMaxDurationTracking]; // Stop max duration tracking
    [self finishCurrentChunk:YES]; // Mark as last chunk
    [self resetState];
    
    resolve(@"Recording stopped");
}

// Pauses recording without stopping completely
RCT_EXPORT_METHOD(pauseRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!self.isRecording || self.isPaused) {
        reject(@"invalid_state", @"Cannot pause - not recording or already paused", nil);
        return;
    }
    
    // Accumulate the time that was recorded before pausing
    NSTimeInterval currentTime = [NSDate timeIntervalSinceReferenceDate];
    self.accumulatedRecordingTime += (currentTime - self.chunkStartTime);
    
    self.isPaused = YES;
    
    // Emit state change event
    [self emitStateChange];
    
    // Stop audio level monitoring when paused
    [self stopAudioLevelMonitoring];
    
    // Pause max duration tracking
    [self pauseMaxDurationTracking];
    
    // Pause the recorder (don't stop it)
    if (self.recorder && self.recorder.isRecording) {
        [self.recorder pause];
    }
    
    // Cancel the current timer
    if (self.timer) {
        dispatch_source_cancel(self.timer);
        self.timer = nil;
    }
    
    resolve(@"Recording paused");
}

// Resumes recording from paused state
RCT_EXPORT_METHOD(resumeRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (!self.isRecording || !self.isPaused) {
        reject(@"invalid_state", @"Cannot resume - not recording or not paused", nil);
        return;
    }
    
    self.isPaused = NO;
    
    // Emit state change event
    [self emitStateChange];
    
    // Update chunk start time for the resumed session
    self.chunkStartTime = [NSDate timeIntervalSinceReferenceDate];
    
    // Resume the recorder
    if (self.recorder) {
        [self.recorder record];
    }
    
    // Restart audio level monitoring when resumed
    [self startAudioLevelMonitoring];
    
    // Resume max duration tracking
    [self resumeMaxDurationTracking];
    
    // Calculate remaining time for this chunk
    NSTimeInterval remainingTime = self.chunkSeconds - self.accumulatedRecordingTime;
    
    if (remainingTime <= 0) {
        // Chunk is already complete, finish it immediately
        [self finishCurrentChunk];
        
        // Start next chunk if still recording
        if (self.isRecording) {
            NSError *error = nil;
            if (![self beginRecording:&error]) {
                reject(@"resume_failed", error.localizedDescription ?: @"Failed to start new chunk", error);
                [self stopRecording:nil rejecter:nil];
                return;
            }
            [self scheduleRotation];
        }
    } else {
        // Schedule timer for remaining time
        [self scheduleRotationWithDelay:remainingTime];
    }
    
    resolve(@"Recording resumed");
}

// Returns a promise resolving to microphone permission status
RCT_EXPORT_METHOD(checkPermissions:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    AVAudioSession *session = [AVAudioSession sharedInstance];
    switch (session.recordPermission) {
        case AVAudioSessionRecordPermissionGranted:
            resolve(@(YES));
            break;
        case AVAudioSessionRecordPermissionDenied:
            resolve(@(NO));
            break;
        case AVAudioSessionRecordPermissionUndetermined: {
            [session requestRecordPermission:^(BOOL granted) {
                resolve(@(granted));
            }];
            break;
        }
        default:
            resolve(@(NO));
            break;
    }
}

// Check if recording is available
RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@(YES));
}

// Check if recording is currently active
RCT_EXPORT_METHOD(isRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    resolve(@(self.isRecording));
}

// Get current AudioRecord state for debugging
RCT_EXPORT_METHOD(getAudioRecordState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSTimeInterval currentTime = [NSDate timeIntervalSinceReferenceDate];
    NSTimeInterval elapsedRecordingTime = self.recordingStartTime > 0 ? (currentTime - self.recordingStartTime) : 0;
    NSTimeInterval remainingTime = self.maxRecordingDuration > 0 ? (self.maxRecordingDuration - elapsedRecordingTime) : 0;
    
    NSDictionary *state = @{
        @"isRecording": @(self.isRecording),
        @"isPaused": @(self.isPaused),
        @"seq": @(self.seq),
        @"sampleRate": @(self.sampleRate),
        @"chunkSeconds": @(self.chunkSeconds),
        @"maxRecordingDuration": @(self.maxRecordingDuration),
        @"elapsedRecordingTime": @(elapsedRecordingTime),
        @"remainingTime": @(remainingTime),
        @"currentFilePath": self.currentFilePath ?: @"",
        @"accumulatedRecordingTime": @(self.accumulatedRecordingTime),
        @"interruptionEventSent": @(self.interruptionEventSent)
    };
    resolve(state);
}

// Clears all recorded chunk files from the Documents directory
RCT_EXPORT_METHOD(clearAllChunkFiles:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSFileManager *fileManager = [NSFileManager defaultManager];
        NSString *documentsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
        
        NSError *error = nil;
        NSArray *files = [fileManager contentsOfDirectoryAtPath:documentsPath error:&error];
        
        if (error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"FILE_ERROR", @"Could not read documents directory", error);
            });
            return;
        }
        
        NSInteger deletedCount = 0;
        NSMutableArray *deletedFiles = [NSMutableArray array];
        
        for (NSString *fileName in files) {
            // Delete files that start with "chunk_" and end with ".m4a"
            if ([fileName hasPrefix:@"chunk_"] && [fileName hasSuffix:@".m4a"]) {
                NSString *filePath = [documentsPath stringByAppendingPathComponent:fileName];
                NSError *deleteError = nil;
                
                if ([fileManager removeItemAtPath:filePath error:&deleteError]) {
                    deletedCount++;
                    [deletedFiles addObject:fileName];
                } else {
                    NSLog(@"Failed to delete chunk file %@: %@", fileName, deleteError.localizedDescription);
                }
            }
        }
        
        dispatch_async(dispatch_get_main_queue(), ^{
            resolve([NSString stringWithFormat:@"Deleted %ld chunk files", (long)deletedCount]);
        });
    });
}

#pragma mark - Audio Session Configuration

// Sets up AVAudioSession with category, sample rate, and activation
- (BOOL)configureAudioSession:(NSError **)outError {
    AVAudioSession *session = [AVAudioSession sharedInstance];
    BOOL success = [session setCategory:AVAudioSessionCategoryPlayAndRecord
                             withOptions:AVAudioSessionCategoryOptionAllowBluetooth | AVAudioSessionCategoryOptionDefaultToSpeaker
                                   error:outError] &&
                   [session setPreferredSampleRate:self.sampleRate error:outError] &&
                   [session setActive:YES error:outError];
    if (!success) { return NO; }

    // Update sampleRate if hardware differs
    if (session.sampleRate != self.sampleRate) {
        self.sampleRate = session.sampleRate;
    }
    return YES;
}

#pragma mark - Recording Lifecycle

// Initializes and starts AVAudioRecorder
- (BOOL)beginRecording:(NSError **)outError {
    NSURL *fileURL = [self nextFileURL];
    self.currentFilePath = fileURL.path;
    
    // Reset timing for new chunk
    self.chunkStartTime = [NSDate timeIntervalSinceReferenceDate];
    self.accumulatedRecordingTime = 0.0;
    
    // Starting chunk recording

    NSDictionary *settings = @{
        AVFormatIDKey: @(kAudioFormatMPEG4AAC),
        AVSampleRateKey: @(self.sampleRate),
        AVNumberOfChannelsKey: @1,
        AVEncoderAudioQualityKey: @(AVAudioQualityMedium),
        AVEncoderBitRateKey: @(self.bitRate)
    };

    self.recorder = [[AVAudioRecorder alloc] initWithURL:fileURL
                                                settings:settings
                                                   error:outError];
    if (!self.recorder) { 
        return NO; 
    }

    self.recorder.meteringEnabled = YES;
    if (![self.recorder prepareToRecord] || ![self.recorder record]) {
        if (outError) {
            *outError = [NSError errorWithDomain:kRecorderErrorDomain
                                            code:1006
                                        userInfo:@{NSLocalizedDescriptionKey: @"Failed to start recording"}];
        }
        return NO;
    }
    return YES;
}

// Schedules timer to rotate audio chunks at fixed intervals
- (void)scheduleRotation {
    [self scheduleRotationWithDelay:self.chunkSeconds];
}

// Schedules timer to rotate audio chunks with custom delay
- (void)scheduleRotationWithDelay:(NSTimeInterval)delay {
    if (self.timer) {
        dispatch_source_cancel(self.timer);
    }
    
    // Update chunk start time when scheduling
    self.chunkStartTime = [NSDate timeIntervalSinceReferenceDate];
    
    self.timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(self.timer,
                              dispatch_time(DISPATCH_TIME_NOW, delay * NSEC_PER_SEC),
                              DISPATCH_TIME_FOREVER, // One-time timer
                              0);
    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.timer, ^{ [weakSelf startNextChunk]; });
    dispatch_resume(self.timer);
    
    // Timer scheduled for next chunk rotation
}

// Stops recorder, verifies file, and emits event with file info
- (void)finishCurrentChunk {
    [self finishCurrentChunk:NO];
}

- (void)finishCurrentChunk:(BOOL)isLastChunk {
    if (self.recorder) {
        [self.recorder stop];
    }
    
    // FIXED: Capture the file path and seq in local variables to avoid race conditions
    NSString *filePath = self.currentFilePath;
    NSInteger chunkSeq = self.seq;
    NSTimeInterval chunkStartTimestamp = self.chunkStartTime;
    
    if (!filePath) { 
        NSLog(@"AudioChunkRecorder: No currentFilePath to finish");
        return; 
    }
    
    // Calculate actual chunk duration
    NSTimeInterval chunkEndTime = [NSDate timeIntervalSinceReferenceDate];
    NSTimeInterval actualDuration = self.accumulatedRecordingTime + (chunkEndTime - self.chunkStartTime);
    
    NSLog(@"AudioChunkRecorder: Finishing chunk %ld at path: %@, duration: %.2fs, isLast: %@", (long)chunkSeq, filePath, actualDuration, isLastChunk ? @"YES" : @"NO");

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        NSFileManager *fm = [NSFileManager defaultManager];
        if ([fm fileExistsAtPath:filePath]) {
            NSDictionary *attributes = [fm attributesOfItemAtPath:filePath error:nil];
            NSNumber *size = attributes[NSFileSize];
            NSLog(@"AudioChunkRecorder: File exists, size: %@ bytes", size);
            if (size.unsignedLongLongValue > 0) {
                NSLog(@"AudioChunkRecorder: 🎯 EMITTING CHUNK TO FRONTEND - seq: %ld, path: %@, size: %@ bytes, duration: %.2fs, isLast: %@", (long)chunkSeq, filePath, size, actualDuration, isLastChunk ? @"YES" : @"NO");
                
                // Convert timestamp to milliseconds (Unix timestamp)
                NSTimeInterval timestampMs = chunkStartTimestamp * 1000;
                
                NSDictionary *chunkData = @{
                    @"path": filePath,
                    @"sequence": @(chunkSeq),
                    @"duration": @(actualDuration),
                    @"timestamp": @(timestampMs),
                    @"size": size,
                    @"isLastChunk": @(isLastChunk)
                };
                
                NSLog(@"AudioChunkRecorder: 📤 Event data: %@", chunkData);
                [self sendEventWithName:@"onChunkReady" body:chunkData];
                NSLog(@"AudioChunkRecorder: ✅ Event sent successfully for chunk %ld", (long)chunkSeq);
            } else {
                NSLog(@"AudioChunkRecorder: ❌ File is empty");
                [self emitErrorWithCode:1007 message:@"Recorded file is empty"];                
            }
        } else {
            NSLog(@"AudioChunkRecorder: ❌ File does not exist at path: %@", filePath);
            [self emitErrorWithCode:1008 message:@"Recorded file was not created"];            
        }
    });
}

// Starts the next chunk
- (void)startNextChunk {
    if (!self.isRecording || self.isPaused) { 
        return; 
    }
    
    // Accumulate final recording time for this chunk
    NSTimeInterval currentTime = [NSDate timeIntervalSinceReferenceDate];
    self.accumulatedRecordingTime += (currentTime - self.chunkStartTime);
    
    [self finishCurrentChunk];
    
    if (self.isRecording) {
        NSError *error;
        if (![self beginRecording:&error]) {
            [self emitError:error];
            [self stopRecording:nil rejecter:nil];
        } else {
            [self scheduleRotation];
        }
    }
}

#pragma mark - Audio Level Monitoring

// Starts monitoring audio levels and emitting events
- (void)startAudioLevelMonitoring {
    if (self.levelTimer) {
        dispatch_source_cancel(self.levelTimer);
    }
    
    self.levelTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(self.levelTimer,
                              dispatch_time(DISPATCH_TIME_NOW, 0),
                              0.1 * NSEC_PER_SEC, // Update every 100ms
                              0.05 * NSEC_PER_SEC); // 50ms leeway
    
    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.levelTimer, ^{
        [weakSelf updateAudioLevel];
    });
    dispatch_resume(self.levelTimer);
}

// Stops monitoring audio levels
- (void)stopAudioLevelMonitoring {
    if (self.levelTimer) {
        dispatch_source_cancel(self.levelTimer);
        self.levelTimer = nil;
    }
    
    // Emit zero level when stopping
    [self sendEventWithName:@"onAudioLevel" body:@{@"level": @(0.0)}];
}

// Updates and emits current audio level
- (void)updateAudioLevel {
    if (!self.recorder || !self.recorder.isRecording || self.isPaused) {
        return;
    }
    
    [self.recorder updateMeters];
    
    // Get average power level in dB (typically -160 to 0)
    float averagePower = [self.recorder averagePowerForChannel:0];
    
    // Convert dB to linear scale (0.0 to 1.0)
    // -60dB is considered silence, 0dB is maximum
    float normalizedLevel = 0.0;
    if (averagePower > -60.0) {
        normalizedLevel = (averagePower + 60.0) / 60.0;
        normalizedLevel = MAX(0.0, MIN(1.0, normalizedLevel));
    }
    
    // iOS is more sensitive, so use moderate threshold (25% instead of 35%)
    BOOL hasAudio = normalizedLevel > 0.20; // Reduced from 0.35 to 0.25 for iOS
    
    [self sendEventWithName:@"onAudioLevel" body:@{
        @"level": @(normalizedLevel),
        @"hasAudio": @(hasAudio),
        @"averagePower": @(averagePower)
    }];
}

#pragma mark - Audio Session Interruption Handling

// Sets up AVAudioSession interruption notifications
- (void)setupAudioSessionNotifications {
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    
    [center addObserver:self
               selector:@selector(handleAudioSessionInterruption:)
                   name:AVAudioSessionInterruptionNotification
                 object:[AVAudioSession sharedInstance]];
    
    [center addObserver:self
               selector:@selector(handleAudioSessionRouteChange:)
                   name:AVAudioSessionRouteChangeNotification
                 object:[AVAudioSession sharedInstance]];
}

// Removes AVAudioSession interruption notifications
- (void)removeAudioSessionNotifications {
    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    [center removeObserver:self name:AVAudioSessionInterruptionNotification object:nil];
    [center removeObserver:self name:AVAudioSessionRouteChangeNotification object:nil];
}

// Handles audio session interruptions (phone calls, other apps)
- (void)handleAudioSessionInterruption:(NSNotification *)notification {
    if (!self.isRecording) return;
    
    NSNumber *interruptionTypeNumber = notification.userInfo[AVAudioSessionInterruptionTypeKey];
    AVAudioSessionInterruptionType interruptionType = [interruptionTypeNumber unsignedIntegerValue];
    
    switch (interruptionType) {
        case AVAudioSessionInterruptionTypeBegan: {
            // Save current state before interruption
            BOOL wasRecording = self.isRecording && !self.isPaused;
            
            // Only process if we haven't already sent an interruption event
            if (!self.interruptionEventSent && wasRecording) {
                // Pause recording and save current chunk (NATIVE PAUSE for safety)
                [self pauseRecordingForInterruption];
                
                // Notify React Native about the interruption with automatic pause flag
                [self sendEventWithName:@"onInterruption" body:@{
                    @"type": @"began",
                    @"reason": @"phone_call_or_other_app",
                    @"wasRecording": @(wasRecording),
                    @"nativePaused": @(wasRecording) // Flag to indicate native paused automatically
                }];
                
                self.interruptionEventSent = YES;
                self.lastInterruptionEndTime = 0; // Reset for this interruption cycle
            }
            
            break;
        }
        case AVAudioSessionInterruptionTypeEnded: {
            NSTimeInterval currentTime = [NSDate timeIntervalSinceReferenceDate];
            
            // Prevent duplicate events within 1 second
            if (currentTime - self.lastInterruptionEndTime < 1.0) {
                break;
            }
            
            // Only process if we had sent an interruption event before
            if (self.interruptionEventSent) {
                // Check if we should resume
                NSNumber *optionsNumber = notification.userInfo[AVAudioSessionInterruptionOptionKey];
                AVAudioSessionInterruptionOptions options = [optionsNumber unsignedIntegerValue];
                
                BOOL shouldResume = (options & AVAudioSessionInterruptionOptionShouldResume) != 0;
                
                // Record timestamp BEFORE sending event to prevent race conditions
                self.lastInterruptionEndTime = currentTime;
                
                // Notify React Native about interruption end
                [self sendEventWithName:@"onInterruption" body:@{
                    @"type": @"ended",
                    @"shouldResume": @(shouldResume),
                    @"canResume": @(self.isRecording && self.isPaused)
                }];
                
                // Reset begin flag for next interruption cycle
                self.interruptionEventSent = NO;
            }
            
            break;
        }
    }
}

// Handles audio route changes (headphones disconnected, etc.)
- (void)handleAudioSessionRouteChange:(NSNotification *)notification {
    if (!self.isRecording) return;
    
    NSNumber *reasonNumber = notification.userInfo[AVAudioSessionRouteChangeReasonKey];
    AVAudioSessionRouteChangeReason reason = [reasonNumber unsignedIntegerValue];
    
    switch (reason) {
        case AVAudioSessionRouteChangeReasonOldDeviceUnavailable: {
            // Save current state before pausing
            BOOL wasRecording = self.isRecording && !self.isPaused;
            
            // Only process if we haven't already sent an interruption event
            if (!self.interruptionEventSent && wasRecording) {
                // Pause recording when audio device is disconnected (NATIVE PAUSE for safety)
                [self pauseRecordingForInterruption];
                
                [self sendEventWithName:@"onInterruption" body:@{
                    @"type": @"audioDeviceDisconnected",
                    @"reason": @"headphones_or_bluetooth_disconnected",
                    @"nativePaused": @(wasRecording) // Flag to indicate native paused automatically
                }];
                
                self.interruptionEventSent = YES;
            }
            break;
        }
        case AVAudioSessionRouteChangeReasonNewDeviceAvailable:
            // Don't auto-resume, let user decide
            break;
        default:
            break;
    }
}

// Pauses recording specifically for interruptions (saves state)
- (void)pauseRecordingForInterruption {
    if (!self.isRecording || self.isPaused) return;
    
    // Accumulate the time that was recorded before interruption
    NSTimeInterval currentTime = [NSDate timeIntervalSinceReferenceDate];
    self.accumulatedRecordingTime += (currentTime - self.chunkStartTime);
    
    self.isPaused = YES;
    
    // Emit state change event immediately
    [self emitStateChange];
    
    // Stop audio level monitoring
    [self stopAudioLevelMonitoring];
    
    // Pause max duration tracking
    [self pauseMaxDurationTracking];
    
    // Pause the recorder
    if (self.recorder && self.recorder.isRecording) {
        [self.recorder pause];
    }
    
    // Cancel the current timer
    if (self.timer) {
        dispatch_source_cancel(self.timer);
        self.timer = nil;
    }
}

// Emits current recording state to React Native
- (void)emitStateChange {
    NSDictionary *stateData = @{
        @"isRecording": @(self.isRecording),
        @"isPaused": @(self.isPaused)
    };
    
    [self sendEventWithName:@"onStateChange" body:stateData];
}

#pragma mark - Max Duration Tracking

// Starts tracking maximum recording duration
- (void)startMaxDurationTracking {
    if (self.maxDurationTimer) {
        dispatch_source_cancel(self.maxDurationTimer);
    }
    
    if (self.maxRecordingDuration <= 0) {
        return; // No limit set
    }
    
    self.maxDurationTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(self.maxDurationTimer,
                              dispatch_time(DISPATCH_TIME_NOW, self.maxRecordingDuration * NSEC_PER_SEC),
                              DISPATCH_TIME_FOREVER, // One-time timer
                              0);
    
    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.maxDurationTimer, ^{
        [weakSelf handleMaxDurationReached];
    });
    dispatch_resume(self.maxDurationTimer);
}

// Stops tracking maximum recording duration
- (void)stopMaxDurationTracking {
    if (self.maxDurationTimer) {
        dispatch_source_cancel(self.maxDurationTimer);
        self.maxDurationTimer = nil;
    }
}

// Pauses maximum duration tracking (for pause/resume functionality)
- (void)pauseMaxDurationTracking {
    if (self.maxDurationTimer) {
        dispatch_source_cancel(self.maxDurationTimer);
        self.maxDurationTimer = nil;
    }
}

// Resumes maximum duration tracking with remaining time
- (void)resumeMaxDurationTracking {
    if (self.maxRecordingDuration <= 0) {
        return; // No limit set
    }
    
    // Calculate elapsed recording time
    NSTimeInterval currentTime = [NSDate timeIntervalSinceReferenceDate];
    NSTimeInterval elapsedTime = currentTime - self.recordingStartTime;
    NSTimeInterval remainingTime = self.maxRecordingDuration - elapsedTime;
    
    if (remainingTime <= 0) {
        // Max duration already reached
        [self handleMaxDurationReached];
        return;
    }
    
    // Start timer for remaining time
    self.maxDurationTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(self.maxDurationTimer,
                              dispatch_time(DISPATCH_TIME_NOW, remainingTime * NSEC_PER_SEC),
                              DISPATCH_TIME_FOREVER, // One-time timer
                              0);
    
    __weak typeof(self) weakSelf = self;
    dispatch_source_set_event_handler(self.maxDurationTimer, ^{
        [weakSelf handleMaxDurationReached];
    });
    dispatch_resume(self.maxDurationTimer);
}

// Handles when maximum recording duration is reached
- (void)handleMaxDurationReached {
    if (!self.isRecording) {
        return;
    }
    
    NSLog(@"AudioChunkRecorder: Max duration reached, stopping recording");
    
    // Stop recording
    self.isRecording = NO;
    [self emitStateChange];
    
    // Clean up
    [self removeAudioSessionNotifications];
    [self stopAudioLevelMonitoring];
    [self stopMaxDurationTracking];
    [self finishCurrentChunk:YES]; // Mark as last chunk
    
    // Calculate total recording duration
    NSTimeInterval totalDuration = [NSDate timeIntervalSinceReferenceDate] - self.recordingStartTime;
    
    // Emit max duration reached event
    NSDictionary *maxDurationData = @{
        @"duration": @(totalDuration),
        @"maxDuration": @(self.maxRecordingDuration)
    };
    
    [self sendEventWithName:@"onMaxDurationReached" body:maxDurationData];
    
    [self resetState];
}

#pragma mark - Helpers

// Resets recorder, timer, and audio session
- (void)resetState {
    if (self.timer) { dispatch_source_cancel(self.timer); self.timer = nil; }
    if (self.levelTimer) { dispatch_source_cancel(self.levelTimer); self.levelTimer = nil; }
    if (self.maxDurationTimer) { dispatch_source_cancel(self.maxDurationTimer); self.maxDurationTimer = nil; }
    if (self.recorder.isRecording) { [self.recorder stop]; }
    self.recorder = nil;
    self.isPaused = NO;
    self.interruptionEventSent = NO; // Reset interruption flag
    self.lastInterruptionEndTime = 0; // Reset interruption flag
    self.recordingStartTime = 0; // Reset recording start time
    [self removeAudioSessionNotifications];
    [[AVAudioSession sharedInstance] setActive:NO
                                   withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                         error:nil];
}

// Builds the URL for the next audio chunk file
- (NSURL *)nextFileURL {
    NSString *docs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    NSString *fileName = [NSString stringWithFormat:@"chunk_%04ld.m4a", (long)self.seq];
    return [NSURL fileURLWithPath:[docs stringByAppendingPathComponent:fileName]];
}

// Emits an event with an NSError
- (void)emitError:(NSError *)error {
    if (!error) { return; }
    [self sendEventWithName:@"onError" body:@{@"message": error.localizedDescription ?: @"Unknown error"}];
}

// Convenience to create and emit NSError by code and message
- (void)emitErrorWithCode:(NSInteger)code message:(NSString *)message {
    NSError *error = [NSError errorWithDomain:kRecorderErrorDomain
                                         code:code
                                     userInfo:@{NSLocalizedDescriptionKey: message}];
    [self emitError:error];
}

// Rotates to a new chunk by finishing the current one and starting a new one
- (void)rotateChunk {
    if (!self.isRecording) { 
        return; 
    }
    
    NSLog(@"AudioChunkRecorder: Rotating to new chunk");
    
    // First, finish the current chunk
    [self finishCurrentChunk:NO]; // Not the last chunk
    
    // Increment sequence number for the next chunk
    self.seq += 1;
    
    // Then start a new chunk
    NSError *error = nil;
    if (![self beginRecording:&error]) {
        NSLog(@"AudioChunkRecorder: Failed to start new chunk: %@", error.localizedDescription);
        [self emitErrorWithCode:1009 message:@"Failed to start new chunk"];
        return;
    }
    
    // Schedule the next rotation
    [self scheduleRotation];
}

@end 