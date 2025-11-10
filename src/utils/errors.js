/**
 * Custom Error Classes for Better Error Handling
 * Following modern best practices with specific error types
 */

/**
 * Base Application Error
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication Errors
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', code = 'AUTH_FAILED') {
    super(message, 401, code);
  }
}

class TokenExpiredError extends AuthenticationError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED');
  }
}

class InvalidCredentialsError extends AuthenticationError {
  constructor(message = 'Invalid email or password') {
    super(message, 'INVALID_CREDENTIALS');
  }
}

class AccountLockedError extends AuthenticationError {
  constructor(message, lockoutInfo = {}) {
    super(message, 'ACCOUNT_LOCKED');
    this.statusCode = 423; // Locked
    this.lockoutInfo = lockoutInfo;
  }
}

/**
 * Authorization Errors
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class SubscriptionRequiredError extends AuthorizationError {
  constructor(requiredTier, currentTier) {
    super(
      `This feature requires ${requiredTier} subscription. Current: ${currentTier}`,
      'SUBSCRIPTION_REQUIRED'
    );
    this.requiredTier = requiredTier;
    this.currentTier = currentTier;
  }
}

/**
 * Validation Errors
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = [], code = 'VALIDATION_ERROR') {
    super(message, 400, code);
    this.errors = errors;
  }
}

class InvalidInputError extends ValidationError {
  constructor(field, message) {
    super(`Invalid ${field}: ${message}`, [{ field, message }], 'INVALID_INPUT');
  }
}

/**
 * Resource Errors
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource', id = null) {
    const message = id 
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.id = id;
  }
}

class AlreadyExistsError extends AppError {
  constructor(resource = 'Resource', identifier = null) {
    const message = identifier
      ? `${resource} with ${identifier} already exists`
      : `${resource} already exists`;
    super(message, 409, 'ALREADY_EXISTS');
    this.resource = resource;
  }
}

/**
 * Rate Limiting Errors
 */
class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

class UsageLimitError extends RateLimitError {
  constructor(limit, used, resetDate) {
    super(
      `Usage limit reached: ${used}/${limit} queries used. Resets on ${resetDate}`,
      'USAGE_LIMIT_EXCEEDED'
    );
    this.limit = limit;
    this.used = used;
    this.resetDate = resetDate;
  }
}

/**
 * Payment & Subscription Errors
 */
class PaymentError extends AppError {
  constructor(message = 'Payment failed', code = 'PAYMENT_FAILED') {
    super(message, 402, code);
  }
}

class PaymentRequiredError extends PaymentError {
  constructor(message = 'Payment required to continue') {
    super(message, 'PAYMENT_REQUIRED');
  }
}

class SubscriptionError extends AppError {
  constructor(message = 'Subscription error', code = 'SUBSCRIPTION_ERROR') {
    super(message, 400, code);
  }
}

class SubscriptionExpiredError extends SubscriptionError {
  constructor() {
    super('Subscription has expired', 'SUBSCRIPTION_EXPIRED');
  }
}

class SubscriptionCancelledError extends SubscriptionError {
  constructor() {
    super('Subscription has been cancelled', 'SUBSCRIPTION_CANCELLED');
  }
}

/**
 * External Service Errors
 */
class ExternalServiceError extends AppError {
  constructor(service, message, code = 'EXTERNAL_SERVICE_ERROR') {
    super(`${service} error: ${message}`, 503, code);
    this.service = service;
  }
}

class AIServiceError extends ExternalServiceError {
  constructor(message, provider = 'AI') {
    super('AI Service', message, 'AI_SERVICE_ERROR');
    this.provider = provider;
  }
}

class PaymentProviderError extends ExternalServiceError {
  constructor(message) {
    super('Payment Provider', message, 'PAYMENT_PROVIDER_ERROR');
  }
}

class EmailServiceError extends ExternalServiceError {
  constructor(message) {
    super('Email Service', message, 'EMAIL_SERVICE_ERROR');
  }
}

/**
 * Timeout Errors
 */
class TimeoutError extends AppError {
  constructor(operation = 'Operation', timeoutMs = 30000) {
    super(
      `${operation} timed out after ${timeoutMs}ms`,
      504,
      'TIMEOUT_ERROR'
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Concurrency Errors
 */
class ConcurrencyError extends AppError {
  constructor(message = 'Concurrent modification detected') {
    super(message, 409, 'CONCURRENCY_ERROR');
  }
}

class ResourceLockedError extends ConcurrencyError {
  constructor(resource = 'Resource') {
    super(`${resource} is currently locked by another operation`, 'RESOURCE_LOCKED');
    this.resource = resource;
  }
}

/**
 * Database Errors
 */
class DatabaseError extends AppError {
  constructor(message = 'Database error', code = 'DATABASE_ERROR') {
    super(message, 500, code);
  }
}

class TransactionError extends DatabaseError {
  constructor(message = 'Transaction failed') {
    super(message, 'TRANSACTION_ERROR');
  }
}

/**
 * Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  const logger = require('../utils/logger');
  
  // Log all errors with context
  logger.error('Error occurred:', {
    error: err.message,
    code: err.code || 'UNKNOWN',
    statusCode: err.statusCode || 500,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    requestId: req.id
  });
  
  // Handle known operational errors
  if (err.isOperational) {
    const response = {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode
    };
    
    // Add extra fields for specific error types
    if (err instanceof ValidationError) {
      response.errors = err.errors;
    }
    
    if (err instanceof UsageLimitError) {
      response.limit = err.limit;
      response.used = err.used;
      response.resetDate = err.resetDate;
    }
    
    if (err instanceof RateLimitError) {
      response.retryAfter = err.retryAfter;
      res.setHeader('Retry-After', err.retryAfter);
    }
    
    if (err instanceof SubscriptionRequiredError) {
      response.requiredTier = err.requiredTier;
      response.currentTier = err.currentTier;
    }
    
    if (err instanceof AccountLockedError) {
      response.lockoutInfo = err.lockoutInfo;
    }
    
    // Development: include stack trace
    if (process.env.NODE_ENV === 'development') {
      response.stack = err.stack;
    }
    
    return res.status(err.statusCode).json(response);
  }
  
  // Handle Sequelize errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      errors: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }
  
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Resource already exists',
      code: 'ALREADY_EXISTS',
      field: err.errors[0]?.path
    });
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }
  
  // Unknown/Unexpected errors
  logger.error('Unexpected error:', err);
  
  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not Found Handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
    method: req.method
  });
};

module.exports = {
  // Error classes
  AppError,
  AuthenticationError,
  TokenExpiredError,
  InvalidCredentialsError,
  AccountLockedError,
  AuthorizationError,
  SubscriptionRequiredError,
  ValidationError,
  InvalidInputError,
  NotFoundError,
  AlreadyExistsError,
  RateLimitError,
  UsageLimitError,
  PaymentError,
  PaymentRequiredError,
  SubscriptionError,
  SubscriptionExpiredError,
  SubscriptionCancelledError,
  ExternalServiceError,
  AIServiceError,
  PaymentProviderError,
  EmailServiceError,
  TimeoutError,
  ConcurrencyError,
  ResourceLockedError,
  DatabaseError,
  TransactionError,
  
  // Middleware
  errorHandler,
  asyncHandler,
  notFoundHandler
};
