const express = require('express');
const speechController = require('../controllers/speechController');
const upload = require('../middleware/upload');

const router = express.Router();

router.post('/voice-query', upload.single('audio'), speechController.processVoiceQuery);
router.post('/speech-to-text', speechController.speechToText);
router.post('/text-to-speech', speechController.textToSpeech);
router.post('/synthesize-ssml', speechController.synthesizeSSML);
router.post('/upload-audio', upload.single('audio'), speechController.uploadAudioFile);
router.get('/voices', speechController.getVoices);

module.exports = router;
