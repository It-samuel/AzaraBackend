const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Azure Speech SDK errors
  if (err.message && err.message.includes('speech')) {
    error.message = 'Speech processing failed';
    error.statusCode = 400;
  }

  // Azure Search errors
  if (err.message && err.message.includes('search')) {
    error.message = 'Search service unavailable';
    error.statusCode = 503;
  }

  // OpenAI errors
  if (err.message && err.message.includes('openai')) {
    error.message = 'AI service temporarily unavailable';
    error.statusCode = 503;
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = { message: 'File too large', statusCode: 413 };
  }

  // Default error response
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    })
  });
};

module.exports = errorHandler;