/**
 * QueryLog Model - Central Error Logging (A1)
 * 
 * Records all AI queries for monitoring, debugging, and analytics.
 * Tracks success/failure rates, confidence scores, and latency.
 * 
 * @ticket A1 – Implement structured error logging for all queries
 * @epic EPIC A — Reliability & Error Handling
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QueryLog = sequelize.define('QueryLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // User identification (null for anonymous)
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'User ID or null for anonymous queries'
  },
  
  // Anonymous session tracking when not logged in
  anonymous_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Session/fingerprint ID for anonymous users'
  },
  
  // Timestamp of the query
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  
  // Sanitized error message (sensitive data redacted)
  raw_error: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Sanitized error message (emails/tokens redacted)'
  },
  
  // Original error hash for deduplication
  error_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'SHA256 hash of original error for pattern detection'
  },
  
  // AI model used
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'AI model used (e.g., claude-3-haiku-20240307)'
  },
  
  // AI provider
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'anthropic',
    comment: 'AI provider (anthropic, gemini, openai, mock)'
  },
  
  // Query result status
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the query succeeded'
  },
  
  // Failure reason if not successful
  failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if query failed'
  },
  
  // AI confidence score (0-1)
  confidence: {
    type: DataTypes.DECIMAL(4, 3),
    allowNull: true,
    validate: {
      min: 0,
      max: 1
    },
    comment: 'AI confidence score (0.0 - 1.0)'
  },
  
  // Low confidence flag for quick filtering
  low_confidence: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'True if confidence < 0.6'
  },
  
  // Request latency in milliseconds
  latency_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Request processing time in milliseconds'
  },
  
  // Subscription tier
  subscription_tier: {
    type: DataTypes.ENUM('free', 'pro', 'team'),
    allowNull: false,
    defaultValue: 'free'
  },
  
  // Detected language
  detected_language: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Detected programming language'
  },
  
  // Detected error type
  detected_error_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Detected error category'
  },
  
  // Whether response was cached
  cached: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  
  // A2: Fallback tracking
  fallback_used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'True if fallback model was used instead of primary'
  },
  
  // A2: Primary model that was attempted first
  primary_model_attempted: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'The primary model that was tried first'
  },
  
  // A2: Number of retry attempts before success/failure
  retry_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of retry attempts made'
  },
  
  // A2: Error type categorization
  error_category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Categorized error type (TIMEOUT, RATE_LIMIT, INVALID_JSON, etc.)'
  },
  
  // IP address (hashed for privacy)
  ip_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'SHA256 hash of IP for abuse detection'
  },
  
  // User agent (truncated)
  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Additional metadata (JSON)
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional context: framework, dependencies, etc.'
  },
  
  // B2: User feedback on result quality
  feedback: {
    type: DataTypes.ENUM('up', 'down'),
    allowNull: true,
    comment: 'User feedback: up = helpful, down = not helpful'
  },
  
  // B2: Timestamp when feedback was given
  feedback_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When user provided feedback'
  },
  
  // B2: Optional feedback comment
  feedback_comment: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional comment explaining feedback'
  }
}, {
  tableName: 'query_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    // Index for querying by user
    { fields: ['user_id'] },
    // Index for time-based queries
    { fields: ['timestamp'] },
    // Index for failure analysis
    { fields: ['success'] },
    // Index for low confidence filtering
    { fields: ['low_confidence'] },
    // Index for provider/model analytics
    { fields: ['provider', 'model'] },
    // Index for subscription tier analytics
    { fields: ['subscription_tier'] },
    // Index for error pattern detection
    { fields: ['error_hash'] },
    // A2: Index for fallback tracking
    { fields: ['fallback_used'] },
    // A2: Index for error category analysis
    { fields: ['error_category'] },
    // Composite index for common queries
    { fields: ['timestamp', 'success', 'low_confidence'] },
    // A2: Composite index for fallback analysis
    { fields: ['timestamp', 'fallback_used', 'success'] }
  ]
});

module.exports = QueryLog;
