// Enhanced middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname) || '.m4a';
    cb(null, `audio-${uniqueSuffix}${extension}`);
  }
});

// Enhanced file filter for better audio support
const fileFilter = (req, file, cb) => {
  console.log('Upload middleware - File received:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });

  // Comprehensive list of supported audio MIME types
  const allowedMimeTypes = [
    // WAV formats
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    
    // MP3 formats
    'audio/mpeg',
    'audio/mp3',
    'audio/mpeg3',
    'audio/x-mpeg-3',
    
    // MP4/M4A formats (common in mobile)
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/mp4a-latm',
    
    // AAC formats
    'audio/aac',
    'audio/aacp',
    'audio/x-aac',
    
    // OGG formats
    'audio/ogg',
    'audio/ogg; codecs=opus',
    'audio/ogg; codecs=vorbis',
    
    // FLAC
    'audio/flac',
    'audio/x-flac',
    
    // WebM
    'audio/webm',
    'audio/webm; codecs=opus',
    
    // AMR (mobile recordings)
    'audio/amr',
    'audio/3gpp',
    'audio/3gpp2',
    
    // Generic audio
    'audio/*'
  ];

  // Check MIME type
  const isMimeTypeAllowed = allowedMimeTypes.some(type => {
    if (type.includes('*')) {
      return file.mimetype.startsWith('audio/');
    }
    return file.mimetype === type || file.mimetype.startsWith(type);
  });

  // Also check file extension as fallback
  const allowedExtensions = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.webm', '.amr', '.3gp'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const isExtensionAllowed = allowedExtensions.includes(fileExtension);

  if (isMimeTypeAllowed || isExtensionAllowed) {
    console.log('✅ Audio file accepted:', {
      mimetype: file.mimetype,
      extension: fileExtension
    });
    cb(null, true);
  } else {
    console.log('❌ File rejected - not a supported audio format:', {
      mimetype: file.mimetype,
      extension: fileExtension
    });
    
    // Provide more helpful error message
    const error = new Error(`Unsupported audio format. Received: ${file.mimetype} (${fileExtension}). Supported formats: WAV, MP3, M4A, AAC, OGG, FLAC, WebM`);
    error.code = 'UNSUPPORTED_AUDIO_FORMAT';
    cb(error, false);
  }
};

// Configure multer with enhanced settings
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (Azure limit)
    files: 1,
    fieldSize: 25 * 1024 * 1024 // Allow large field values for base64
  },
  fileFilter: fileFilter
});

// Enhanced error handling middleware
const handleUploadError = (error, req, res, next) => {
  console.error('Upload error:', error);
  
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: 'Audio file must be smaller than 25MB',
          code: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Only one audio file allowed per upload',
          code: 'TOO_MANY_FILES'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected field',
          message: 'Audio file should be uploaded with field name "audio"',
          code: 'UNEXPECTED_FIELD'
        });
      default:
        return res.status(400).json({
          error: 'Upload error',
          message: error.message,
          code: 'UPLOAD_ERROR'
        });
    }
  }
  
  if (error.code === 'UNSUPPORTED_AUDIO_FORMAT') {
    return res.status(400).json({
      error: 'Unsupported format',
      message: error.message,
      code: 'UNSUPPORTED_FORMAT'
    });
  }
  
  // Generic error
  return res.status(500).json({
    error: 'Server error',
    message: 'An error occurred while processing the upload',
    code: 'SERVER_ERROR'
  });
};

// Helper function to validate uploaded file
const validateUploadedFile = (file) => {
  if (!file) {
    throw new Error('No file uploaded');
  }

  // Check if file exists on disk
  if (!fs.existsSync(file.path)) {
    throw new Error('Uploaded file not found on disk');
  }

  // Check file size
  const stats = fs.statSync(file.path);
  if (stats.size === 0) {
    throw new Error('Uploaded file is empty');
  }

  // Log successful upload
  console.log('File validated successfully:', {
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: stats.size,
    path: file.path
  });

  return {
    valid: true,
    file: {
      ...file,
      actualSize: stats.size
    }
  };
};

// Middleware for cleaning up uploaded files
const cleanupFiles = (filePaths) => {
  if (!Array.isArray(filePaths)) {
    filePaths = [filePaths];
  }

  filePaths.forEach(filePath => {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('Cleaned up file:', filePath);
      } catch (error) {
        console.error('Failed to cleanup file:', filePath, error.message);
      }
    }
  });
};

module.exports = {
  upload,
  handleUploadError,
  validateUploadedFile,
  cleanupFiles,
  
  // Single file upload middleware
  single: (fieldName = 'audio') => upload.single(fieldName),
  
  // Error handling middleware
  errorHandler: handleUploadError
};