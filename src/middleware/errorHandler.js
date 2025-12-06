const logger = require('../utils/logger');

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  // Get request ID for tracing
  const requestId = req.requestId || req.headers['x-request-id'] || 'unknown';
  
  // Default error
  let error = { ...err };
  error.message = err.message;

  // Log error with request ID for correlation
  logger.error(`[${requestId}] Error: ${error.message}`, {
    requestId,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous'
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID';
    error = { message, statusCode: 400 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Sequelize errors
  if (err.name === 'SequelizeValidationError') {
    const message = err.errors.map(e => e.message).join(', ');
    error = { message, statusCode: 400 };
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const message = 'Duplicate entry found';
    error = { message, statusCode: 409 };
  }

  if (err.name === 'SequelizeDatabaseError') {
    const message = 'Database error occurred';
    error = { message, statusCode: 500 };
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File size too large';
    error = { message, statusCode: 413 };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = 'Too many files uploaded';
    error = { message, statusCode: 413 };
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    const message = 'Too many requests, please try again later';
    error = { message, statusCode: 429 };
  }

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    const message = 'Cross-origin request blocked';
    error = { message, statusCode: 403 };
  }

  // Payment errors
  if (err.type && err.type.startsWith('Stripe')) {
    const message = 'Payment processing error';
    error = { message, statusCode: 400 };
  }

  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    requestId, // Include request ID for client-side error reporting
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const requestId = req.requestId || req.headers['x-request-id'] || 'unknown';
  const message = `Resource not found - ${req.originalUrl}`;
  
  logger.warn(`[${requestId}] 404 Error: ${message}`, {
    requestId,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    success: false,
    error: message,
    requestId
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Custom error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError
};