// src/controllers/ragController.js

const ragService = require('../services/ragService');

class RagController {
  async uploadDocument(req, res) {
    res.json({ success: true, message: 'Document uploaded (not implemented)' });
  }

  async processQuery(req, res) {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const result = await ragService.generateAnswer(query);
    res.json({ success: true, data: result });
  }

  async processVoiceQuery(req, res) {
    res.json({ success: true, message: 'Voice query processed (not implemented)' });
  }

  async getDocuments(req, res) {
    res.json({ success: true, data: [] });
  }

  async deleteDocument(req, res) {
    const { id } = req.params;
    res.json({ success: true, message: `Document ${id} deleted (not implemented)` });
  }
}

module.exports = new RagController();
