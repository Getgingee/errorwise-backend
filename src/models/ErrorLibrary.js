/**
 * ErrorLibrary Model
 * 
 * Stores pre-built error solutions and user-saved templates.
 * Part of the Error Library feature (P1) for quick error lookup.
 * 
 * @ticket Error Library - Save solved issues as templates for reuse
 * @impact Increases stickiness and long-term retention
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ErrorLibrary = sequelize.define('ErrorLibrary', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Type: 'system' = pre-built, 'user' = user-saved template
  type: {
    type: DataTypes.ENUM('system', 'user'),
    allowNull: false,
    defaultValue: 'system'
  },
  
  // Owner (null for system entries)
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Error identifier (for matching)
  errorCode: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Error code like E402, 404, ECONNREFUSED etc.'
  },
  
  // Error pattern (regex-safe pattern for matching)
  errorPattern: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Pattern to match similar errors'
  },
  
  // Display title
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  
  // Sample error message
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  
  // Category for filtering - Smart categorization covering all domains
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'general',
    comment: 'Main category for the error/solution'
  },
  
  // Subcategory for more granular filtering
  subcategory: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Subcategory within main category'
  },
  
  // Input type detection - was this an error or a question/query?
  inputType: {
    type: DataTypes.ENUM('error', 'query', 'mixed'),
    allowNull: true,
    defaultValue: 'error',
    comment: 'Type of input: error with stack trace, query/question, or mixed'
  },
  
  // Is this an error input (has error codes, stack traces, etc.)
  isErrorInput: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
    comment: 'True if input contained error patterns (vs just a question)'
  },
  
  // Plain English explanation
  explanation: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  
  // Step-by-step solution
  solution: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  
  // Common causes
  commonCauses: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  
  // Prevention tips
  preventionTips: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  
  // Tags for search
  tags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  
  // Platforms affected
  platforms: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'e.g., ["Windows", "Mac", "Chrome", "Firefox"]'
  },
  
  // Popularity metrics
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  useCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'How many times this solution was applied'
  },
  
  helpfulCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  notHelpfulCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  
  // Visibility for user templates
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'User templates can be shared publicly'
  },
  
  // Active status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Difficulty level
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    defaultValue: 'easy',
    comment: 'How technical the fix is'
  },
  
  // Source reference
  sourceUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Primary external documentation/forum link'
  },
  
  // Web sources (scraped from forums)
  webSources: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of web sources with title, url, source, score'
  },
  
  // Code example
  codeExample: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Code example to fix the error'
  },
  
  // Last verified date
  lastVerified: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'error_library',
  timestamps: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['type'] },
    { fields: ['userId'] },
    { fields: ['errorCode'] },
    { fields: ['isActive'] },
    { fields: ['viewCount'] },
    { fields: ['useCount'] },
    { 
      fields: ['title', 'errorMessage'],
      type: 'FULLTEXT',
      name: 'error_library_search_idx'
    }
  ]
});

module.exports = ErrorLibrary;
