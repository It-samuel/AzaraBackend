require('dotenv').config(); // 👈 Load environment variables first

const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 8080;

// Log startup environment info for debugging
logger.info('Starting server with configuration:', {
  port: PORT,
  nodeEnv: process.env.NODE_ENV,
  platform: process.platform,
  nodeVersion: process.version
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Start server - BIND TO 0.0.0.0 for Azure compatibility
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Voice RAG Backend server is running on port ${PORT}`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  logger.info('Server successfully bound to 0.0.0.0 - Azure compatible');
});

// Add server error handling
server.on('error', (error) => {
  logger.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
  }
  gracefulShutdown('SERVER_ERROR');
});

// Handle unhandled promise rejections - LOG BUT DON'T SHUTDOWN
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise);
  logger.error('Rejection reason:', reason);
  
  // Log the stack trace if available
  if (reason && reason.stack) {
    logger.error('Stack trace:', reason.stack);
  }
  
  // DON'T call gracefulShutdown here - just log the error
  // The server should continue running
  logger.warn('Server continuing to run despite unhandled rejection');
});

// Handle uncaught exceptions - THESE should shutdown the server
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  logger.error('Stack trace:', error.stack);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export server for testing purposes
module.exports = server;