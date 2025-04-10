const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { speech } = require('../config/azure');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class TextToSpeechService {
  constructor() {
    this.speechConfig = sdk.SpeechConfig.fromSubscription(speech.key, speech.region);
    this.speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';
    this.speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    
    // Ensure uploads directory exists
    this.uploadsDir = './uploads';
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
      logger.info('Created uploads directory');
    }
  }

  async synthesizeSpeech(text, options = {}) {
    try {
      logger.info('Starting text-to-speech synthesis', { textLength: text.length });
      
      const {
        voiceName = 'en-US-JennyNeural',
        rate = 'medium',
        pitch = 'medium',
        volume = 'medium'
      } = options;

      // Update voice configuration
      this.speechConfig.speechSynthesisVoiceName = voiceName;
      
      const tempFileName = `speech_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const tempFilePath = path.join(this.uploadsDir, tempFileName);
      
      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(tempFilePath);
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        synthesizer.speakTextAsync(
          text,
          (result) => {
            try {
              if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                logger.info('Speech synthesis completed successfully');
                
                // Check if file exists before reading
                if (!fs.existsSync(tempFilePath)) {
                  throw new Error('Audio file was not created');
                }
                
                // Read the file and convert to base64
                const audioBuffer = fs.readFileSync(tempFilePath);
                const base64Audio = audioBuffer.toString('base64');
                
                // Clean up temporary file
                fs.unlinkSync(tempFilePath);
                
                resolve({
                  audioBase64: base64Audio,
                  format: 'mp3',
                  duration: result.audioDuration / 10000000, // Convert to seconds
                  text: text,
                  voiceUsed: voiceName
                });
              } else {
                logger.error('Speech synthesis failed:', result.errorDetails);
                reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
              }
            } catch (error) {
              logger.error('Error processing synthesis result:', error);
              // Clean up file if it exists
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
              }
              reject(error);
            } finally {
              synthesizer.close();
            }
          },
          (error) => {
            logger.error('Speech synthesis error:', error);
            synthesizer.close();
            // Clean up file if it exists
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
            reject(error);
          }
        );
      });
    } catch (error) {
      logger.error('Text-to-speech service error:', error);
      throw error;
    }
  }


  async synthesizeSSML(ssml) {
    try {
      logger.info('Starting SSML synthesis');
      
      const tempFileName = `ssml_speech_${Date.now()}.mp3`;
      const tempFilePath = path.join('./uploads', tempFileName);
      
      const audioConfig = sdk.AudioConfig.fromAudioFileOutput(tempFilePath);
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, audioConfig);

      return new Promise((resolve, reject) => {
        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              logger.info('SSML synthesis completed successfully');
              
              const audioBuffer = fs.readFileSync(tempFilePath);
              const base64Audio = audioBuffer.toString('base64');
              
              fs.unlinkSync(tempFilePath);
              
              resolve({
                audioBase64: base64Audio,
                format: 'mp3',
                duration: result.audioDuration / 10000000
              });
            } else {
              logger.error('SSML synthesis failed:', result.errorDetails);
              reject(new Error(`SSML synthesis failed: ${result.errorDetails}`));
            }
            synthesizer.close();
          },
          (error) => {
            logger.error('SSML synthesis error:', error);
            synthesizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      logger.error('SSML synthesis error:', error);
      throw error;
    }
  }

  // Get available voices
  async getAvailableVoices() {
    try {
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig);
      
      return new Promise((resolve, reject) => {
        synthesizer.getVoicesAsync(
          (result) => {
            if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
              const voices = result.voices.map(voice => ({
                name: voice.name,
                displayName: voice.displayName,
                localName: voice.localName,
                gender: voice.gender,
                locale: voice.locale
              }));
              
              resolve(voices);
            } else {
              reject(new Error('Failed to retrieve voices'));
            }
            synthesizer.close();
          },
          (error) => {
            synthesizer.close();
            reject(error);
          }
        );
      });
    } catch (error) {
      logger.error('Error getting available voices:', error);
      throw error;
    }
  }

  // Create SSML for advanced speech control
  createSSML(text, options = {}) {
    const {
      voiceName = 'en-US-JennyNeural',
      rate = '1.0',
      pitch = '0Hz',
      volume = '100'
    } = options;

    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voiceName}">
          <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
            ${text}
          </prosody>
        </voice>
      </speak>
    `.trim();
  }
}

module.exports = new TextToSpeechService();