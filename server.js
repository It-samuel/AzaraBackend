require('dotenv').config(); // 👈 Load environment variables first

const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

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

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Voice RAG Backend server is running on port ${PORT}`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
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