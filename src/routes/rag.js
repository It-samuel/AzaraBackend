const express = require('express');
const ragController = require('../controllers/ragController'); // ✅ Correct file
const upload = require('../middleware/upload');

const router = express.Router();

router.post('/upload-document', upload.single('document'), ragController.uploadDocument);
router.post('/query', ragController.processQuery);
router.post('/voice-query', upload.single('audio'), ragController.processVoiceQuery);
router.get('/documents', ragController.getDocuments);
router.delete('/documents/:id', ragController.deleteDocument);

module.exports = router;
