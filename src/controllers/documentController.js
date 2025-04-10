// controllers/documentController.js
const { BlobServiceClient } = require('@azure/storage-blob');
const logger = require('../utils/logger');
const path = require('path');

// Initialize Azure Blob Service Client
const getBlobServiceClient = () => {
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not set');
  }
  return BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
};

const getContainerName = () => {
  return process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
};

// Get all documents from Azure Blob Storage
const getAllDocuments = async (req, res, next) => {
  try {
    const blobServiceClient = getBlobServiceClient();
    const containerName = getContainerName();
    const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Check if container exists
      const exists = await containerClient.exists();
      if (!exists) {
        return res.status(200).json({
          success: true,
          data: [],
          message: 'No documents container found'
        });
      }

      const documents = [];
      
      // List all blobs in the container
      for await (const blob of containerClient.listBlobsFlat()) {
        // Filter for document files
        const ext = path.extname(blob.name).toLowerCase();
        if (['.pdf', '.doc', '.docx', '.txt', '.md', '.json'].includes(ext)) {
          const blobClient = containerClient.getBlobClient(blob.name);
          const properties = await blobClient.getProperties();
          
          documents.push({
            id: blob.name,
            name: blob.name,
            filename: blob.name,
            originalName: blob.name,
            size: properties.contentLength,
            type: ext.substring(1),
            uploadedAt: properties.createdOn,
            lastModified: properties.lastModified,
            contentType: properties.contentType,
            url: blobClient.url
          });
        }
      }

      logger.info(`Retrieved ${documents.length} documents from Azure Blob Storage`);
      
      res.status(200).json({
        success: true,
        data: documents,
        count: documents.length
      });

    } catch (error) {
      logger.error('Error getting documents from Azure Blob Storage:', error);
      next(error);
    }
  };

  // Get specific document from Azure Blob Storage
  const getDocument = async (req, res, next) => {
    try {
      const { id } = req.params;
      const blobServiceClient = getBlobServiceClient();
      const containerName = getContainerName();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(id);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      const properties = await blobClient.getProperties();
      const ext = path.extname(id).toLowerCase();
      
      const document = {
        id: id,
        name: id,
        filename: id,
        originalName: id,
        size: properties.contentLength,
        type: ext.substring(1),
        uploadedAt: properties.createdOn,
        lastModified: properties.lastModified,
        contentType: properties.contentType,
        url: blobClient.url
      };

      logger.info(`Retrieved document from Azure Blob Storage: ${id}`);
      
      res.status(200).json({
        success: true,
        data: document
      });

    } catch (error) {
      logger.error('Error getting document from Azure Blob Storage:', error);
      next(error);
    }
  };

  // Download document content from Azure Blob Storage
  const downloadDocument = async (req, res, next) => {
    try {
      const { id } = req.params;
      const blobServiceClient = getBlobServiceClient();
      const containerName = getContainerName();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(id);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      const properties = await blobClient.getProperties();
      const downloadResponse = await blobClient.download();

      // Set appropriate headers
      res.setHeader('Content-Type', properties.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', properties.contentLength);
      res.setHeader('Content-Disposition', `attachment; filename="${id}"`);

      // Stream the blob content to the response
      downloadResponse.readableStreamBody.pipe(res);

      logger.info(`Downloaded document from Azure Blob Storage: ${id}`);

    } catch (error) {
      logger.error('Error downloading document from Azure Blob Storage:', error);
      next(error);
    }
  };

  // Delete document from Azure Blob Storage
  const deleteDocument = async (req, res, next) => {
    try {
      const { id } = req.params;
      const blobServiceClient = getBlobServiceClient();
      const containerName = getContainerName();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(id);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      // Delete the blob
      await blobClient.delete();

      logger.info(`Deleted document from Azure Blob Storage: ${id}`);
      
      res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting document from Azure Blob Storage:', error);
      next(error);
    }
  };

  // Upload document to Azure Blob Storage
  const uploadDocument = async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const blobServiceClient = getBlobServiceClient();
      const containerName = getContainerName();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Create container if it doesn't exist
      await containerClient.createIfNotExists({
        access: 'container'
      });

      const blobName = req.file.originalname;
      const blobClient = containerClient.getBlockBlobClient(blobName);

      // Upload the file buffer to blob storage
      const uploadResponse = await blobClient.uploadData(req.file.buffer, {
        blobHTTPHeaders: {
          blobContentType: req.file.mimetype
        }
      });

      const document = {
        id: blobName,
        name: req.file.originalname,
        filename: blobName,
        originalName: req.file.originalname,
        size: req.file.size,
        type: path.extname(req.file.originalname).toLowerCase().substring(1),
        uploadedAt: new Date(),
        contentType: req.file.mimetype,
        url: blobClient.url,
        etag: uploadResponse.etag
      };

      logger.info(`Uploaded document to Azure Blob Storage: ${req.file.originalname}`);
      
      res.status(201).json({
        success: true,
        data: document,
        message: 'Document uploaded successfully'
      });

    } catch (error) {
      logger.error('Error uploading document to Azure Blob Storage:', error);
      next(error);
    }
  };

  // Get document content as text (for RAG processing)
  const getDocumentContent = async (req, res, next) => {
    try {
      const { id } = req.params;
      const blobServiceClient = getBlobServiceClient();
      const containerName = getContainerName();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(id);

      // Check if blob exists
      const exists = await blobClient.exists();
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      const downloadResponse = await blobClient.download();
      const content = await streamToString(downloadResponse.readableStreamBody);

      logger.info(`Retrieved content for document: ${id}`);
      
      res.status(200).json({
        success: true,
        data: {
          id: id,
          content: content
        }
      });

    } catch (error) {
      logger.error('Error getting document content:', error);
      next(error);
    }
  };

// Helper function to convert stream to string
async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data.toString());
    });
    readableStream.on('end', () => {
      resolve(chunks.join(''));
    });
    readableStream.on('error', reject);
  });
}

module.exports = {
  getAllDocuments,
  getDocument,
  downloadDocument,
  deleteDocument,
  uploadDocument,
  getDocumentContent
};