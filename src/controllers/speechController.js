const speechToTextService = require('../services/speechToTextService');
const textToSpeechService = require('../services/textToSpeechService');
const ragService = require('../services/ragService');
const logger = require('../utils/logger');
const fs = require('fs');

class SpeechController {
  // Voice RAG: audio -> text -> RAG -> speech
  async processVoiceQuery(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No audio file uploaded' });
      }

      logger.info('Processing voice query', {
        file: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      const sttResult = await speechToTextService.transcribeAudioFile(req.file.path);
      const question = sttResult.transcription;

      if (!question || question.trim() === '') {
        return res.status(400).json({ success: false, error: 'Unable to extract speech from audio' });
      }

      const answer = await ragService.generateAnswer(question);
      const ttsResult = await textToSpeechService.synthesizeSpeech(answer);

      fs.unlinkSync(req.file.path); // Clean up uploaded audio

      res.json({
        success: true,
        data: {
          question,
          answer,
          audio: ttsResult.audioUrl || null,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Voice query error:', error);
      res.status(500).json({
        success: false,
        error: 'Voice query processing failed',
        message: error.message
      });
    }
  }

  // Speech to Text
  // Speech to Text - Fixed method
async speechToText(req, res) {
  let tempFilePath = null;
  
  try {
    console.log('Speech-to-text request received');
    console.log('File info:', req.file);
    console.log('Request headers:', req.headers);

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file uploaded' 
      });
    }

    tempFilePath = req.file.path;

    logger.info('Processing speech-to-text', {
      file: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: tempFilePath
    });

    // Check if file exists
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Uploaded file not found');
    }

    const result = await speechToTextService.transcribeAudioFile(tempFilePath);
    
    // Clean up the uploaded file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    console.log('Transcription result:', result);

    // Return the format your frontend expects
    res.json({
      success: true,
      text: result.text || result.transcription, // Support both formats
      confidence: result.confidence,
      duration: result.duration,
      message: result.message,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Speech-to-text error:', error);
    logger.error('Speech-to-text error:', error);

    // Clean up file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.error('File cleanup error:', cleanupError);
      }
    }

    // Handle specific errors
    if (error.message.includes('Only audio files are allowed')) {
      return res.status(400).json({
        success: false,
        error: 'Only audio files are allowed'
      });
    }

    if (error.message.includes('No speech detected')) {
      return res.status(200).json({
        success: true,
        text: '',
        message: 'No speech detected in the audio'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Speech transcription failed',
      message: error.message
    });
  }
}

  // Text to Speech
  // Text to Speech - Complete fixed method
  async textToSpeech(req, res) {
    try {
      const { text, format = 'audio' } = req.body; // Add format parameter

      if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Text is required for synthesis'
        });
      }

      logger.info('Processing text-to-speech request', {
        textLength: text.length,
        format: format
      });

      const ttsResult = await textToSpeechService.synthesizeSpeech(text);

      // Debug logging to see what we received
      logger.info('TTS Result received:', {
        hasAudioBase64: !!ttsResult.audioBase64,
        format: ttsResult.format,
        duration: ttsResult.duration,
        resultKeys: Object.keys(ttsResult)
      });

      // If format is 'json', return JSON response (for API testing)
      if (format === 'json') {
        return res.json({
          success: true,
          data: {
            audioBase64: ttsResult.audioBase64,
            format: ttsResult.format,
            duration: ttsResult.duration,
            voiceUsed: ttsResult.voiceUsed,
            textLength: text.length,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Default: return audio buffer directly
      if (ttsResult.audioBase64) {
        // Convert base64 to buffer
        const audioBuffer = Buffer.from(ttsResult.audioBase64, 'base64');
        
        // Set appropriate content type based on format
        const contentType = ttsResult.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
        const fileExtension = ttsResult.format || 'mp3';
        
        logger.info('Sending audio response', {
          bufferSize: audioBuffer.length,
          contentType: contentType,
          fileExtension: fileExtension
        });
        
        res.set({
          'Content-Type': contentType,
          'Content-Length': audioBuffer.length,
          'Content-Disposition': `inline; filename="speech.${fileExtension}"`,
          'Cache-Control': 'no-cache'
        });
        
        return res.send(audioBuffer);
      } else {
        // Enhanced error logging
        logger.error('No audio content in TTS result:', {
          resultKeys: Object.keys(ttsResult),
          audioBase64Type: typeof ttsResult.audioBase64,
          audioBase64Length: ttsResult.audioBase64 ? ttsResult.audioBase64.length : 'N/A'
        });
        
        throw new Error(`No audio content available. TTS result contains: ${Object.keys(ttsResult).join(', ')}`);
      }

    } catch (error) {
      logger.error('Text-to-speech error:', {
        message: error.message,
        stack: error.stack,
        requestBody: req.body
      });
      
      res.status(500).json({
        success: false,
        error: 'Text-to-speech processing failed',
        message: error.message
      });
    }
  }
  // SSML synthesis
  async synthesizeSSML(req, res) {
    try {
      const { ssml } = req.body;

      if (!ssml || typeof ssml !== 'string') {
        return res.status(400).json({ success: false, error: 'SSML input is required' });
      }

      logger.info('Processing SSML synthesis');

      const result = await textToSpeechService.synthesizeSSML(ssml);

      res.json({
        success: true,
        data: {
          ...result,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('SSML synthesis error:', error);
      res.status(500).json({
        success: false,
        error: 'SSML synthesis failed',
        message: error.message
      });
    }
  }

  // Get available voices
  async getVoices(req, res) {
    try {
      logger.info('Fetching available voices');
      const voices = await textToSpeechService.getAvailableVoices();

      const popularVoices = voices.filter(voice =>
        voice.locale.startsWith('en-') && voice.name.includes('Neural')
      );

      res.json({
        success: true,
        data: {
          popularVoices,
          totalVoices: voices.length,
          allVoices: voices
        }
      });
    } catch (error) {
      logger.error('Get voices error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch voices',
        message: error.message
      });
    }
  }
}

module.exports = new SpeechController();
