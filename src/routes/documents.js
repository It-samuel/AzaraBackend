// routes/documents.js
const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const upload = require('../middleware/upload');

// GET /api/documents - Get all documents
router.get('/', documentController.getAllDocuments);

// GET /api/documents/:id - Get specific document metadata
router.get('/:id', documentController.getDocument);

// GET /api/documents/:id/download - Download document
router.get('/:id/download', documentController.downloadDocument);

// GET /api/documents/:id/content - Get document content as text
router.get('/:id/content', documentController.getDocumentContent);

// POST /api/documents - Upload new document
router.post('/', upload.single('file'), documentController.uploadDocument);

// DELETE /api/documents/:id - Delete document
router.delete('/:id', documentController.deleteDocument);

module.exports = router;