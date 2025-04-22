// routes/voiceRag.js - Complete Voice RAG API endpoint
const express = require('express');
const router = express.Router();
const speechToTextService = require('../services/speechToText');
const textToSpeechService = require('../services/textToSpeech');
const { upload, handleUploadError, validateUploadedFile, cleanupFiles } = require('../middleware/upload');
const logger = require('../utils/logger');

// Your RAG service
const ragService = require('../services/ragService');

// Voice RAG endpoint - handles the complete flow
router.post('/voice-query', upload.single('audio'), async (req, res) => {
  let uploadedFile = null;
  
  try {
    // Validate the uploaded file
    const validation = validateUploadedFile(req.file);
    uploadedFile = validation.file;
    
    logger.info('Processing voice RAG request', {
      filename: uploadedFile.filename,
      size: uploadedFile.actualSize,
      mimetype: uploadedFile.mimetype
    });

    // Step 1: Convert speech to text
    logger.info('Step 1: Converting speech to text');
    const transcriptionResult = await speechToTextService.transcribeAudioFile(uploadedFile.path);
    
    if (!transcriptionResult.text || transcriptionResult.text.trim().length === 0) {
      return res.status(400).json({
        error: 'No speech detected',
        message: 'Could not detect any speech in the audio file',
        transcription: transcriptionResult
      });
    }

    logger.info('Speech transcribed successfully', {
      text: transcriptionResult.text,
      confidence: transcriptionResult.confidence
    });

    // Step 2: Query RAG with the transcribed text
    logger.info('Step 2: Querying RAG system');
    const ragAnswer = await ragService.generateAnswer(transcriptionResult.text);
    
    if (!ragAnswer || ragAnswer.trim().length === 0) {
      return res.status(500).json({
        error: 'RAG query failed',
        message: 'Failed to get response from RAG system',
        transcription: transcriptionResult
      });
    }

    logger.info('RAG query completed', {
      query: transcriptionResult.text,
      answerLength: ragAnswer.length
    });

    // Step 3: Convert RAG response to speech
    logger.info('Step 3: Converting response to speech');
    const speechResult = await textToSpeechService.synthesizeSpeech(ragAnswer, {
      voiceName: req.body.voiceName || 'en-US-JennyNeural',
      rate: req.body.rate || 'medium',
      pitch: req.body.pitch || 'medium',
      volume: req.body.volume || 'medium'
    });

    logger.info('Complete voice RAG process completed successfully');

    // Return the complete response
    res.json({
      success: true,
      transcription: {
        text: transcriptionResult.text,
        confidence: transcriptionResult.confidence,
        duration: transcriptionResult.duration
      },
      ragResponse: {
        answer: ragAnswer,
        query: transcriptionResult.text
      },
      speech: {
        audioBase64: speechResult.audioBase64,
        format: speechResult.format,
        duration: speechResult.duration,
        voiceUsed: speechResult.voiceUsed
      },
      processingTime: {
        total: Date.now() - req.startTime
      }
    });

  } catch (error) {
    logger.error('Voice RAG processing error:', error);
    
    // Determine error type for appropriate response
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.message.includes('No speech detected') || 
        error.message.includes('Audio file not found')) {
      statusCode = 400;
      errorMessage = 'Invalid audio input';
    } else if (error.message.includes('Speech recognition')) {
      statusCode = 422;
      errorMessage = 'Speech recognition failed';
    } else if (error.message.includes('RAG')) {
      statusCode = 503;
      errorMessage = 'RAG service unavailable';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      message: error.message,
      code: error.code || 'PROCESSING_ERROR'
    });
  } finally {
    // Cleanup uploaded file
    if (uploadedFile) {
      cleanupFiles(uploadedFile.path);
    }
  }
});

// Alternative endpoint for base64 audio input
router.post('/voice-query-base64', async (req, res) => {
  try {
    const { audioBase64, format = 'wav', voiceOptions = {} } = req.body;
    
    if (!audioBase64) {
      return res.status(400).json({
        error: 'Missing audio data',
        message: 'audioBase64 field is required'
      });
    }

    logger.info('Processing base64 voice RAG request', { format });

    // Step 1: Convert speech to text
    const transcriptionResult = await speechToTextService.transcribeBase64Audio(audioBase64, format);
    
    if (!transcriptionResult.text || transcriptionResult.text.trim().length === 0) {
      return res.status(400).json({
        error: 'No speech detected',
        message: 'Could not detect any speech in the audio data',
        transcription: transcriptionResult
      });
    }

    // Step 2: Query RAG
    const ragAnswer = await ragService.generateAnswer(transcriptionResult.text);
    
    if (!ragAnswer || ragAnswer.trim().length === 0) {
      return res.status(500).json({
        error: 'RAG query failed',
        message: 'Failed to get response from RAG system',
        transcription: transcriptionResult
      });
    }

    // Step 3: Convert to speech
    const speechResult = await textToSpeechService.synthesizeSpeech(ragAnswer, voiceOptions);

    res.json({
      success: true,
      transcription: {
        text: transcriptionResult.text,
        confidence: transcriptionResult.confidence,
        duration: transcriptionResult.duration
      },
      ragResponse: {
        answer: ragAnswer,
        query: transcriptionResult.text
      },
      speech: {
        audioBase64: speechResult.audioBase64,
        format: speechResult.format,
        duration: speechResult.duration,
        voiceUsed: speechResult.voiceUsed
      }
    });

  } catch (error) {
    logger.error('Base64 voice RAG processing error:', error);
    res.status(500).json({
      error: 'Processing failed',
      message: error.message
    });
  }
});

// Endpoint to test individual components
router.post('/test-speech-to-text', upload.single('audio'), async (req, res) => {
  let uploadedFile = null;
  
  try {
    const validation = validateUploadedFile(req.file);
    uploadedFile = validation.file;
    
    const result = await speechToTextService.transcribeAudioFile(uploadedFile.path);
    
    res.json({
      success: true,
      transcription: result,
      fileInfo: {
        filename: uploadedFile.filename,
        size: uploadedFile.actualSize,
        mimetype: uploadedFile.mimetype
      }
    });
  } catch (error) {
    logger.error('Speech-to-text test error:', error);
    res.status(500).json({
      error: 'Speech-to-text failed',
      message: error.message
    });
  } finally {
    if (uploadedFile) {
      cleanupFiles(uploadedFile.path);
    }
  }
});

router.post('/test-text-to-speech', async (req, res) => {
  try {
    const { text, voiceOptions = {} } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: 'Missing text',
        message: 'text field is required'
      });
    }
    
    const result = await textToSpeechService.synthesizeSpeech(text, voiceOptions);
    
    res.json({
      success: true,
      speech: result
    });
  } catch (error) {
    logger.error('Text-to-speech test error:', error);
    res.status(500).json({
      error: 'Text-to-speech failed',
      message: error.message
    });
  }
});

// Add request timing middleware
router.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// Apply error handling middleware
router.use(handleUploadError);

module.exports = router;