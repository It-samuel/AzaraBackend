const express = require('express');
const multer = require('multer');
const speechController = require('../controllers/speechController');
const upload = require('../middleware/upload');

const router = express.Router();

// Route for speech-to-text conversion
router.post('/speech-to-text', upload.single('audio'), speechController.speechToText);

// Route for text-to-speech conversion
router.post('/text-to-speech', speechController.textToSpeech);

module.exports = router;