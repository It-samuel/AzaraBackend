const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { speech } = require('../config/azure');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class SpeechToTextService {
  constructor() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(speech.key, speech.region);
    this.speechConfig.speechRecognitionLanguage = 'en-US';
    
    // Configure speech recognition settings
    this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000");
    this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "2000");
  }

  async transcribeAudioFile(audioFilePath) {
    try {
      logger.info('Starting speech-to-text transcription from file');
      
      if (!fs.existsSync(audioFilePath)) {
        throw new Error('Audio file not found');
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(audioFilePath));
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              logger.info('Speech transcribed successfully', { 
                text: result.text.substring(0, 100) + '...' 
              });
              
              resolve({
                text: result.text,
                confidence: result.confidence || 1.0,
                duration: result.duration || 0
              });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              logger.warn('No speech could be recognized');
              resolve({
                text: '',
                confidence: 0,
                duration: 0,
                message: 'No speech detected'
              });
            } else {
              logger.error('Speech recognition failed:', result.errorDetails);
              reject(new Error(`Speech recognition failed: ${result.errorDetails}`));
            }
            recognizer.close();
          },
          (error) => {
            logger.error('Speech recognition error:', error);
            recognizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      logger.error('Speech-to-text service error:', error);
      throw error;
    }
  }

  async transcribeBase64Audio(base64Audio, format = 'wav') {
    try {
      logger.info('Starting speech-to-text transcription from base64');
      
      const buffer = Buffer.from(base64Audio, 'base64');
      const tempFilePath = path.join('./uploads', `temp_${Date.now()}.${format}`);
      
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, buffer);
      
      // Transcribe the file
      const result = await this.transcribeAudioFile(tempFilePath);
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      
      return result;
    } catch (error) {
      logger.error('Base64 audio transcription error:', error);
      throw error;
    }
  }

  // For continuous recognition (useful for longer audio)
  async transcribeContinuous(audioFilePath) {
    try {
      logger.info('Starting continuous speech recognition');
      
      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(audioFilePath));
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      let fullText = '';
      const segments = [];

      return new Promise((resolve, reject) => {
        recognizer.recognized = (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            fullText += e.result.text + ' ';
            segments.push({
              text: e.result.text,
              offset: e.result.offset,
              duration: e.result.duration
            });
          }
        };

        recognizer.sessionStopped = (s, e) => {
          recognizer.stopContinuousRecognitionAsync();
          resolve({
            fullText: fullText.trim(),
            segments,
            totalSegments: segments.length
          });
        };

        recognizer.canceled = (s, e) => {
          recognizer.stopContinuousRecognitionAsync();
          reject(new Error(`Recognition canceled: ${e.errorDetails}`));
        };

        recognizer.startContinuousRecognitionAsync();
      });
    } catch (error) {
      logger.error('Continuous speech recognition error:', error);
      throw error;
    }
  }
}

module.exports = new SpeechToTextService();