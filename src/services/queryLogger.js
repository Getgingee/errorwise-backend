/**
 * Query Logger Service - Central Error Logging (A1)
 * 
 * Provides structured logging for all AI queries with:
 * - Sensitive data redaction (emails, tokens, API keys)
 * - Success/failure tracking
 * - Confidence score monitoring
 * - Latency measurement
 * - Analytics and pattern detection
 * 
 * @ticket A1 – Implement structured error logging for all queries
 * @epic EPIC A — Reliability & Error Handling
 * @metric % of queries that fail or give < 0.6 confidence
 * @target >95% successful, high-confidence answers
 */

const crypto = require('crypto');
const QueryLog = require('../models/QueryLog');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  LOW_CONFIDENCE_THRESHOLD: 0.6,
  MAX_RAW_ERROR_LENGTH: 5000,
  MAX_USER_AGENT_LENGTH: 255,
  SENSITIVE_PATTERNS: [
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    // API keys (various formats)
    /\b(sk-[A-Za-z0-9]{20,})\b/gi,  // OpenAI
    /\b(AIza[A-Za-z0-9_-]{35})\b/gi,  // Google
    /\b(ghp_[A-Za-z0-9]{36})\b/gi,  // GitHub
    /\b(xox[baprs]-[A-Za-z0-9-]+)\b/gi,  // Slack
    /\b(Bearer\s+[A-Za-z0-9._-]+)\b/gi,  // Bearer tokens
    /\b(api[_-]?key[=:]\s*['"]?[A-Za-z0-9_-]+['"]?)\b/gi,
    /\b(secret[=:]\s*['"]?[A-Za-z0-9_-]+['"]?)\b/gi,
    /\b(password[=:]\s*['"]?[^\s'"]+['"]?)\b/gi,
    /\b(token[=:]\s*['"]?[A-Za-z0-9._-]+['"]?)\b/gi,
    // Credit card numbers (basic pattern)
    /\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g,
    // Social Security Numbers
    /\b(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/g,
    // Phone numbers (various formats)
    /\b(\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
    // IP addresses (to anonymize)
    /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
    // AWS keys
    /\b(AKIA[A-Z0-9]{16})\b/gi,
    // Private keys
    /-----BEGIN [A-Z]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z]+ PRIVATE KEY-----/gi,
    // Database connection strings
    /\b(postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
    // JWT tokens
    /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
  ],
  REDACTION_PLACEHOLDER: '[REDACTED]',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate SHA256 hash
 */
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Sanitize sensitive data from error message
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text with sensitive data redacted
 */
function sanitizeSensitiveData(text) {
  if (!text || typeof text !== 'string') return text;
  
  let sanitized = text;
  
  for (const pattern of CONFIG.SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, CONFIG.REDACTION_PLACEHOLDER);
  }
  
  // Truncate if too long
  if (sanitized.length > CONFIG.MAX_RAW_ERROR_LENGTH) {
    sanitized = sanitized.substring(0, CONFIG.MAX_RAW_ERROR_LENGTH) + '... [TRUNCATED]';
  }
  
  return sanitized;
}

/**
 * Hash IP address for privacy while enabling abuse detection
 */
function hashIP(ip) {
  if (!ip) return null;
  // Add a secret salt for additional security
  const salt = process.env.IP_HASH_SALT || 'errorwise-default-salt';
  return sha256(ip + salt);
}

/**
 * Truncate user agent
 */
function truncateUserAgent(ua) {
  if (!ua) return null;
  return ua.substring(0, CONFIG.MAX_USER_AGENT_LENGTH);
}

/**
 * Generate error hash for pattern detection
 */
function generateErrorHash(errorMessage) {
  if (!errorMessage) return null;
  // Normalize the error message before hashing
  const normalized = errorMessage
    .toLowerCase()
    .replace(/\d+/g, 'N')  // Replace numbers
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();
  return sha256(normalized).substring(0, 32);
}

// ============================================================================
// MAIN LOGGING FUNCTIONS
// ============================================================================

/**
 * Log a query to the database
 * 
 * @param {Object} params - Query parameters
 * @param {string} params.userId - User ID (null for anonymous)
 * @param {string} params.anonymousId - Anonymous session ID
 * @param {string} params.rawError - Original error message
 * @param {string} params.model - AI model used
 * @param {string} params.provider - AI provider
 * @param {boolean} params.success - Whether query succeeded
 * @param {string} params.failureReason - Error message if failed
 * @param {number} params.confidence - AI confidence score (0-1)
 * @param {number} params.latencyMs - Request latency in ms
 * @param {string} params.subscriptionTier - User's subscription tier
 * @param {string} params.detectedLanguage - Detected programming language
 * @param {string} params.detectedErrorType - Detected error category
 * @param {boolean} params.cached - Whether response was cached
 * @param {string} params.ipAddress - Client IP address
 * @param {string} params.userAgent - Client user agent
 * @param {Object} params.metadata - Additional metadata
 * @param {boolean} params.fallbackUsed - A2: Whether fallback model was used
 * @param {string} params.primaryModelAttempted - A2: Primary model that was tried first
 * @param {number} params.retryCount - A2: Number of retry attempts
 * @param {string} params.errorCategory - A2: Categorized error type
 * @returns {Promise<Object>} Created log entry
 */
async function logQuery({
  userId = null,
  anonymousId = null,
  rawError,
  model,
  provider = 'anthropic',
  success = true,
  failureReason = null,
  confidence = null,
  latencyMs = null,
  subscriptionTier = 'free',
  detectedLanguage = null,
  detectedErrorType = null,
  cached = false,
  ipAddress = null,
  userAgent = null,
  metadata = {},
  // A2: Fallback tracking fields
  fallbackUsed = false,
  primaryModelAttempted = null,
  retryCount = 0,
  errorCategory = null
}) {
  try {
    // Sanitize sensitive data
    const sanitizedError = sanitizeSensitiveData(rawError);
    const sanitizedFailureReason = sanitizeSensitiveData(failureReason);
    
    // Calculate if low confidence
    const lowConfidence = confidence !== null && confidence < CONFIG.LOW_CONFIDENCE_THRESHOLD;
    
    // Create log entry
    const logEntry = await QueryLog.create({
      user_id: userId || null,
      anonymous_id: anonymousId || null,
      timestamp: new Date(),
      raw_error: sanitizedError,
      error_hash: generateErrorHash(rawError),
      model: model || 'unknown',
      provider: provider || 'unknown',
      success,
      failure_reason: sanitizedFailureReason,
      confidence: confidence,
      low_confidence: lowConfidence,
      latency_ms: latencyMs,
      subscription_tier: subscriptionTier,
      detected_language: detectedLanguage,
      detected_error_type: detectedErrorType,
      cached,
      // A2: Fallback tracking
      fallback_used: fallbackUsed,
      primary_model_attempted: primaryModelAttempted,
      retry_count: retryCount,
      error_category: errorCategory,
      ip_hash: hashIP(ipAddress),
      user_agent: truncateUserAgent(userAgent),
      metadata: {
        ...metadata,
        // Remove any potentially sensitive fields from metadata
        framework: metadata.framework,
        dependencies: metadata.dependencies,
        hasCodeSnippet: !!metadata.codeSnippet,
        hasStackTrace: !!metadata.stackTrace,
        // A2: Include fallback context in metadata
        fallbackContext: fallbackUsed ? {
          primaryModel: primaryModelAttempted,
          finalModel: model,
          retries: retryCount
        } : null
      }
    });
    
    // Log warning for failures or low confidence
    if (!success) {
      console.warn(`⚠️  Query failed: ${model} - ${sanitizedFailureReason?.substring(0, 100)}`);
    } else if (lowConfidence) {
      console.warn(`⚠️  Low confidence response: ${confidence} from ${model}`);
    }
    
    // A2: Log fallback usage
    if (fallbackUsed) {
      console.log(`🔄 Fallback used: ${primaryModelAttempted} → ${model}`);
    }
    
    return logEntry;
    
  } catch (error) {
    // Don't let logging failures break the main flow
    console.error('❌ Failed to log query:', error.message);
    return null;
  }
}

/**
 * Log a successful query
 */
async function logSuccess({
  userId,
  anonymousId,
  rawError,
  model,
  provider,
  confidence,
  latencyMs,
  subscriptionTier,
  detectedLanguage,
  detectedErrorType,
  cached,
  ipAddress,
  userAgent,
  metadata
}) {
  return logQuery({
    userId,
    anonymousId,
    rawError,
    model,
    provider,
    success: true,
    failureReason: null,
    confidence,
    latencyMs,
    subscriptionTier,
    detectedLanguage,
    detectedErrorType,
    cached,
    ipAddress,
    userAgent,
    metadata
  });
}

/**
 * Log a failed query
 */
async function logFailure({
  userId,
  anonymousId,
  rawError,
  model,
  provider,
  failureReason,
  latencyMs,
  subscriptionTier,
  detectedLanguage,
  detectedErrorType,
  ipAddress,
  userAgent,
  metadata
}) {
  return logQuery({
    userId,
    anonymousId,
    rawError,
    model,
    provider,
    success: false,
    failureReason,
    confidence: null,
    latencyMs,
    subscriptionTier,
    detectedLanguage,
    detectedErrorType,
    cached: false,
    ipAddress,
    userAgent,
    metadata
  });
}

/**
 * Log a low-confidence response
 */
async function logLowConfidence({
  userId,
  anonymousId,
  rawError,
  model,
  provider,
  confidence,
  latencyMs,
  subscriptionTier,
  detectedLanguage,
  detectedErrorType,
  ipAddress,
  userAgent,
  metadata
}) {
  return logQuery({
    userId,
    anonymousId,
    rawError,
    model,
    provider,
    success: true,
    failureReason: `Low confidence: ${confidence}`,
    confidence,
    latencyMs,
    subscriptionTier,
    detectedLanguage,
    detectedErrorType,
    cached: false,
    ipAddress,
    userAgent,
    metadata
  });
}

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

/**
 * Get last N query logs (for internal view)
 * @param {number} limit - Number of logs to retrieve
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Query logs
 */
async function getRecentLogs(limit = 100, filters = {}) {
  const where = {};
  
  if (filters.success !== undefined) {
    where.success = filters.success;
  }
  
  if (filters.lowConfidence !== undefined) {
    where.low_confidence = filters.lowConfidence;
  }
  
  if (filters.provider) {
    where.provider = filters.provider;
  }
  
  if (filters.subscriptionTier) {
    where.subscription_tier = filters.subscriptionTier;
  }
  
  if (filters.userId) {
    where.user_id = filters.userId;
  }
  
  if (filters.since) {
    const { Op } = require('sequelize');
    where.timestamp = { [Op.gte]: new Date(filters.since) };
  }
  
  return QueryLog.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit,
    attributes: {
      exclude: ['ip_hash']  // Don't expose IP hashes
    }
  });
}

/**
 * Get query statistics for monitoring
 * @param {string} period - Time period ('hour', 'day', 'week', 'month')
 * @returns {Promise<Object>} Statistics
 */
async function getStatistics(period = 'day') {
  const { Op, fn, col, literal } = require('sequelize');
  
  // Calculate time threshold
  const thresholds = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };
  
  const since = new Date(Date.now() - (thresholds[period] || thresholds.day));
  
  // Get basic counts
  const [totalCount, successCount, failureCount, lowConfidenceCount, fallbackCount] = await Promise.all([
    QueryLog.count({ where: { timestamp: { [Op.gte]: since } } }),
    QueryLog.count({ where: { timestamp: { [Op.gte]: since }, success: true } }),
    QueryLog.count({ where: { timestamp: { [Op.gte]: since }, success: false } }),
    QueryLog.count({ where: { timestamp: { [Op.gte]: since }, low_confidence: true } }),
    // A2: Count fallback usage
    QueryLog.count({ where: { timestamp: { [Op.gte]: since }, fallback_used: true } }),
  ]);
  
  // Get average confidence and latency
  const avgStats = await QueryLog.findOne({
    where: { timestamp: { [Op.gte]: since }, success: true },
    attributes: [
      [fn('AVG', col('confidence')), 'avgConfidence'],
      [fn('AVG', col('latency_ms')), 'avgLatency'],
      [fn('MAX', col('latency_ms')), 'maxLatency'],
      [fn('MIN', col('latency_ms')), 'minLatency'],
      // A2: Average retry count
      [fn('AVG', col('retry_count')), 'avgRetries'],
    ],
    raw: true,
  });
  
  // Get breakdown by provider
  const byProvider = await QueryLog.findAll({
    where: { timestamp: { [Op.gte]: since } },
    attributes: [
      'provider',
      [fn('COUNT', '*'), 'count'],
      [fn('SUM', literal("CASE WHEN success = true THEN 1 ELSE 0 END")), 'successCount'],
      // A2: Fallback count per provider
      [fn('SUM', literal("CASE WHEN fallback_used = true THEN 1 ELSE 0 END")), 'fallbackCount'],
    ],
    group: ['provider'],
    raw: true,
  });
  
  // Get breakdown by tier
  const byTier = await QueryLog.findAll({
    where: { timestamp: { [Op.gte]: since } },
    attributes: [
      'subscription_tier',
      [fn('COUNT', '*'), 'count'],
    ],
    group: ['subscription_tier'],
    raw: true,
  });
  
  // A2: Get breakdown by error category
  const byErrorCategory = await QueryLog.findAll({
    where: { 
      timestamp: { [Op.gte]: since },
      error_category: { [Op.ne]: null }
    },
    attributes: [
      'error_category',
      [fn('COUNT', '*'), 'count'],
    ],
    group: ['error_category'],
    raw: true,
  });
  
  // Calculate rates
  const successRate = totalCount > 0 ? (successCount / totalCount * 100).toFixed(2) : 0;
  const failureRate = totalCount > 0 ? (failureCount / totalCount * 100).toFixed(2) : 0;
  const lowConfidenceRate = totalCount > 0 ? (lowConfidenceCount / totalCount * 100).toFixed(2) : 0;
  const highQualityRate = totalCount > 0 ? 
    ((successCount - lowConfidenceCount) / totalCount * 100).toFixed(2) : 0;
  // A2: Fallback and fatal error rates
  const fallbackRate = totalCount > 0 ? (fallbackCount / totalCount * 100).toFixed(2) : 0;
  const fatalErrorRate = totalCount > 0 ? (failureCount / totalCount * 100).toFixed(2) : 0;
  
  return {
    period,
    since: since.toISOString(),
    total: totalCount,
    success: successCount,
    failures: failureCount,
    lowConfidence: lowConfidenceCount,
    // A2: Fallback metrics
    fallbackUsed: fallbackCount,
    rates: {
      success: parseFloat(successRate),
      failure: parseFloat(failureRate),
      lowConfidence: parseFloat(lowConfidenceRate),
      highQuality: parseFloat(highQualityRate),  // Success + High confidence
      // A2: Fallback and fatal error rates
      fallback: parseFloat(fallbackRate),
      fatalError: parseFloat(fatalErrorRate),
      target: 95,  // Our target is >95%
      meetsTarget: parseFloat(highQualityRate) >= 95,
    },
    averages: {
      confidence: avgStats?.avgConfidence ? parseFloat(avgStats.avgConfidence).toFixed(3) : null,
      latencyMs: avgStats?.avgLatency ? Math.round(parseFloat(avgStats.avgLatency)) : null,
      maxLatencyMs: avgStats?.maxLatency ? Math.round(parseFloat(avgStats.maxLatency)) : null,
      minLatencyMs: avgStats?.minLatency ? Math.round(parseFloat(avgStats.minLatency)) : null,
      // A2: Average retries
      retries: avgStats?.avgRetries ? parseFloat(avgStats.avgRetries).toFixed(2) : null,
    },
    byProvider: byProvider.reduce((acc, p) => {
      acc[p.provider] = {
        total: parseInt(p.count),
        success: parseInt(p.successCount),
        // A2: Fallback count
        fallback: parseInt(p.fallbackCount || 0),
      };
      return acc;
    }, {}),
    byTier: byTier.reduce((acc, t) => {
      acc[t.subscription_tier] = parseInt(t.count);
      return acc;
    }, {}),
    // A2: Error category breakdown
    byErrorCategory: byErrorCategory.reduce((acc, e) => {
      acc[e.error_category] = parseInt(e.count);
      return acc;
    }, {}),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get common error patterns
 * @param {number} limit - Number of patterns to return
 * @returns {Promise<Array>} Common error patterns
 */
async function getCommonPatterns(limit = 20) {
  const { fn, col, Op } = require('sequelize');
  
  // Get patterns from last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const patterns = await QueryLog.findAll({
    where: {
      timestamp: { [Op.gte]: since },
      error_hash: { [Op.ne]: null },
    },
    attributes: [
      'error_hash',
      'detected_error_type',
      'detected_language',
      [fn('COUNT', '*'), 'occurrences'],
      [fn('AVG', col('confidence')), 'avgConfidence'],
      [fn('MIN', col('raw_error')), 'sampleError'],
    ],
    group: ['error_hash', 'detected_error_type', 'detected_language'],
    order: [[fn('COUNT', '*'), 'DESC']],
    limit,
    raw: true,
  });
  
  return patterns.map(p => ({
    hash: p.error_hash,
    errorType: p.detected_error_type,
    language: p.detected_language,
    occurrences: parseInt(p.occurrences),
    avgConfidence: p.avgConfidence ? parseFloat(p.avgConfidence).toFixed(3) : null,
    sample: p.sampleError?.substring(0, 200) + (p.sampleError?.length > 200 ? '...' : ''),
  }));
}

/**
 * Get failures for debugging
 * @param {number} limit - Number of failures to return
 * @returns {Promise<Array>} Recent failures
 */
async function getRecentFailures(limit = 50) {
  return QueryLog.findAll({
    where: { success: false },
    order: [['timestamp', 'DESC']],
    limit,
    attributes: {
      exclude: ['ip_hash']
    }
  });
}

/**
 * Get low confidence responses for review
 * @param {number} limit - Number of responses to return
 * @returns {Promise<Array>} Low confidence responses
 */
async function getLowConfidenceResponses(limit = 50) {
  return QueryLog.findAll({
    where: { 
      success: true,
      low_confidence: true 
    },
    order: [['timestamp', 'DESC']],
    limit,
    attributes: {
      exclude: ['ip_hash']
    }
  });
}

/**
 * A2: Get fallback statistics from query logs
 * Shows how often fallback models are used vs primary model success
 * @param {Object} options - Time range options
 * @returns {Promise<Object>} Fallback statistics
 */
async function getFallbackStatistics(options = {}) {
  const { startDate, endDate } = options;
  
  const whereClause = {};
  if (startDate || endDate) {
    whereClause.timestamp = {};
    if (startDate) whereClause.timestamp[Op.gte] = startDate;
    if (endDate) whereClause.timestamp[Op.lte] = endDate;
  }
  
  try {
    const [totalQueries, fallbackQueries, primarySuccesses, retriedQueries] = await Promise.all([
      QueryLog.count({ where: whereClause }),
      QueryLog.count({ where: { ...whereClause, fallback_used: true } }),
      QueryLog.count({ where: { ...whereClause, fallback_used: false, success: true } }),
      QueryLog.count({ where: { ...whereClause, retry_count: { [Op.gt]: 0 } } })
    ]);
    
    const total = totalQueries || 1;
    
    // Get breakdown by error category
    const errorCategories = await QueryLog.findAll({
      where: { ...whereClause, success: false },
      attributes: [
        'error_category',
        [sequelize.fn('COUNT', sequelize.col('error_category')), 'count']
      ],
      group: ['error_category'],
      raw: true
    });
    
    // Get model usage when fallback was triggered
    const fallbackModels = await QueryLog.findAll({
      where: { ...whereClause, fallback_used: true },
      attributes: [
        'ai_model',
        [sequelize.fn('COUNT', sequelize.col('ai_model')), 'count']
      ],
      group: ['ai_model'],
      raw: true
    });
    
    return {
      totalQueries,
      fallbackQueries,
      primarySuccesses,
      retriedQueries,
      fallbackRate: ((fallbackQueries / total) * 100).toFixed(2) + '%',
      primarySuccessRate: ((primarySuccesses / total) * 100).toFixed(2) + '%',
      retryRate: ((retriedQueries / total) * 100).toFixed(2) + '%',
      errorCategories: errorCategories.reduce((acc, row) => {
        acc[row.error_category || 'unknown'] = parseInt(row.count);
        return acc;
      }, {}),
      fallbackModelUsage: fallbackModels.reduce((acc, row) => {
        acc[row.ai_model || 'unknown'] = parseInt(row.count);
        return acc;
      }, {}),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[QueryLogger] Failed to get fallback statistics:', error.message);
    return {
      error: 'Failed to retrieve fallback statistics',
      totalQueries: 0,
      fallbackQueries: 0,
      primarySuccesses: 0,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main logging functions
  logQuery,
  logSuccess,
  logFailure,
  logLowConfidence,
  
  // Analytics functions
  getRecentLogs,
  getStatistics,
  getCommonPatterns,
  getRecentFailures,
  getLowConfidenceResponses,
  getFallbackStatistics,  // A2: Fallback statistics
  
  // Utility functions
  sanitizeSensitiveData,
  generateErrorHash,
  
  // Configuration
  CONFIG,
};
