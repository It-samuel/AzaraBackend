// Enhanced speechToText.js with audio conversion
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { speech } = require('../config/azure');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

class SpeechToTextService {
  constructor() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(speech.key, speech.region);
    this.speechConfig.speechRecognitionLanguage = 'en-US';
    
    // More lenient timeout settings for mobile
    this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "8000");
    this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "3000");
    
    // Enable detailed results
    this.speechConfig.requestWordLevelTimestamps();
    this.speechConfig.enableDictation();
  }

  // Convert audio to WAV format using ffmpeg
  async convertToWav(inputPath) {
    const outputPath = inputPath.replace(path.extname(inputPath), '.wav');
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioChannels(1) // Mono
        .audioFrequency(16000) // 16kHz
        .audioBitrate('16k')
        .on('end', () => {
          logger.info('Audio conversion completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error('Audio conversion failed:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async transcribeAudioFile(audioFilePath) {
    let wavFilePath = audioFilePath;
    let conversionNeeded = false;

    try {
      logger.info('Starting speech-to-text transcription from file');
      
      if (!fs.existsSync(audioFilePath)) {
        throw new Error('Audio file not found');
      }

      // Check if conversion is needed
      const fileExtension = path.extname(audioFilePath).toLowerCase();
      if (!['.wav'].includes(fileExtension)) {
        logger.info('Converting audio file to WAV format');
        wavFilePath = await this.convertToWav(audioFilePath);
        conversionNeeded = true;
      }

      // Use the more flexible AudioConfig.fromWavFileInput
      const audioBuffer = fs.readFileSync(wavFilePath);
      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            try {
              if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                logger.info('Speech transcribed successfully', { 
                  text: result.text.substring(0, 100) + '...',
                  confidence: result.confidence 
                });
                
                resolve({
                  text: result.text,
                  confidence: result.confidence || 1.0,
                  duration: result.duration || 0,
                  offset: result.offset || 0
                });
              } else if (result.reason === sdk.ResultReason.NoMatch) {
                logger.warn('No speech could be recognized');
                resolve({
                  text: '',
                  confidence: 0,
                  duration: 0,
                  message: 'No speech detected in audio'
                });
              } else if (result.reason === sdk.ResultReason.Canceled) {
                const cancellation = sdk.CancellationDetails.fromResult(result);
                logger.error('Speech recognition was cancelled:', cancellation.reason);
                
                if (cancellation.reason === sdk.CancellationReason.Error) {
                  reject(new Error(`Speech recognition error: ${cancellation.errorDetails}`));
                } else {
                  reject(new Error(`Speech recognition cancelled: ${cancellation.reason}`));
                }
              } else {
                logger.error('Unexpected recognition result:', result.reason);
                reject(new Error(`Unexpected result: ${result.reason}`));
              }
            } catch (error) {
              logger.error('Error processing recognition result:', error);
              reject(error);
            } finally {
              recognizer.close();
              
              // Cleanup converted file
              if (conversionNeeded && fs.existsSync(wavFilePath)) {
                fs.unlinkSync(wavFilePath);
              }
            }
          },
          (error) => {
            logger.error('Speech recognition error:', error);
            recognizer.close();
            
            // Cleanup converted file
            if (conversionNeeded && fs.existsSync(wavFilePath)) {
              fs.unlinkSync(wavFilePath);
            }
            
            reject(new Error(`Recognition failed: ${error.message || error}`));
          }
        );
      });
    } catch (error) {
      logger.error('Speech-to-text service error:', error);
      
      // Cleanup on error
      if (conversionNeeded && fs.existsSync(wavFilePath)) {
        fs.unlinkSync(wavFilePath);
      }
      
      throw error;
    }
  }

  // Enhanced base64 transcription with proper format handling
  async transcribeBase64Audio(base64Audio, format = 'wav') {
    let tempFilePath = null;
    let wavFilePath = null;

    try {
      logger.info('Starting speech-to-text transcription from base64');
      
      const buffer = Buffer.from(base64Audio, 'base64');
      tempFilePath = path.join('./uploads', `temp_${Date.now()}.${format}`);
      
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, buffer);
      
      // Convert to WAV if needed
      if (format.toLowerCase() !== 'wav') {
        wavFilePath = await this.convertToWav(tempFilePath);
      } else {
        wavFilePath = tempFilePath;
      }
      
      // Transcribe the WAV file
      const result = await this.transcribeAudioFile(wavFilePath);
      
      return result;
    } catch (error) {
      logger.error('Base64 audio transcription error:', error);
      throw error;
    } finally {
      // Cleanup all temporary files
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (wavFilePath && wavFilePath !== tempFilePath && fs.existsSync(wavFilePath)) {
        fs.unlinkSync(wavFilePath);
      }
    }
  }

  // Enhanced continuous recognition with better error handling
  async transcribeContinuous(audioFilePath) {
    let wavFilePath = audioFilePath;
    let conversionNeeded = false;

    try {
      logger.info('Starting continuous speech recognition');
      
      // Convert to WAV if needed
      const fileExtension = path.extname(audioFilePath).toLowerCase();
      if (!['.wav'].includes(fileExtension)) {
        wavFilePath = await this.convertToWav(audioFilePath);
        conversionNeeded = true;
      }
      
      const audioBuffer = fs.readFileSync(wavFilePath);
      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      let fullText = '';
      const segments = [];
      let isComplete = false;

      return new Promise((resolve, reject) => {
        recognizer.recognized = (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
            fullText += e.result.text + ' ';
            segments.push({
              text: e.result.text,
              offset: e.result.offset,
              duration: e.result.duration,
              confidence: e.result.confidence || 1.0
            });
            logger.info('Recognized segment:', e.result.text);
          }
        };

        recognizer.sessionStopped = (s, e) => {
          if (!isComplete) {
            isComplete = true;
            recognizer.stopContinuousRecognitionAsync();
            
            // Cleanup converted file
            if (conversionNeeded && fs.existsSync(wavFilePath)) {
              fs.unlinkSync(wavFilePath);
            }
            
            resolve({
              fullText: fullText.trim(),
              segments,
              totalSegments: segments.length,
              duration: segments.reduce((sum, seg) => sum + (seg.duration || 0), 0)
            });
          }
        };

        recognizer.canceled = (s, e) => {
          if (!isComplete) {
            isComplete = true;
            recognizer.stopContinuousRecognitionAsync();
            
            // Cleanup converted file
            if (conversionNeeded && fs.existsSync(wavFilePath)) {
              fs.unlinkSync(wavFilePath);
            }
            
            const cancellation = sdk.CancellationDetails.fromResult(e.result);
            reject(new Error(`Recognition canceled: ${cancellation.errorDetails || cancellation.reason}`));
          }
        };

        // Start recognition
        recognizer.startContinuousRecognitionAsync(
          () => {
            logger.info('Continuous recognition started successfully');
          },
          (error) => {
            if (!isComplete) {
              isComplete = true;
              
              // Cleanup converted file
              if (conversionNeeded && fs.existsSync(wavFilePath)) {
                fs.unlinkSync(wavFilePath);
              }
              
              reject(new Error(`Failed to start recognition: ${error}`));
            }
          }
        );
      });
    } catch (error) {
      logger.error('Continuous speech recognition error:', error);
      
      // Cleanup on error
      if (conversionNeeded && fs.existsSync(wavFilePath)) {
        fs.unlinkSync(wavFilePath);
      }
      
      throw error;
    }
  }

  // Method to validate audio file
  validateAudioFile(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      // Check file size (Azure has limits)
      if (fileSizeInMB > 25) {
        throw new Error('Audio file too large (max 25MB)');
      }
      
      return {
        valid: true,
        size: stats.size,
        sizeInMB: fileSizeInMB
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = new SpeechToTextService();