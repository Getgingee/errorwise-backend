/**
 * UserLearningLibrary Model
 * 
 * Stores user-specific learned errors and solutions.
 * Separate from the global system library - each user has their own personal knowledge base.
 * 
 * This allows:
 * - Users to build their own personal error solutions database
 * - Personalized recommendations based on what they've solved
 * - Quick lookups for errors they've encountered before
 * - Privacy: users don't see other users' solutions unless explicitly shared
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserLearningLibrary = sequelize.define('UserLearningLibrary', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Owner of this learning entry
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'User who learned/solved this error'
  },
  
  // Error identifier for matching
  errorCode: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Error code like E402, 404, ECONNREFUSED etc.'
  },
  
  // Normalized error pattern key
  errorPattern: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Normalized pattern to match similar errors'
  },
  
  // Display title
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'User-friendly title for this solution'
  },
  
  // Sample error message
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Original error message the user encountered'
  },
  
  // Category
  category: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'general',
    comment: 'Category for organizing user solutions'
  },
  
  // Subcategory for filtering
  subcategory: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Subcategory within main category'
  },
  
  // Programming language
  language: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Programming language (javascript, python, etc)'
  },
  
  // Framework or platform
  framework: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Framework or platform (React, Django, etc)'
  },
  
  // Plain English explanation
  explanation: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'User\'s explanation of why this error occurred'
  },
  
  // Step-by-step solution
  solution: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'User\'s solution that worked'
  },
  
  // Code example (if applicable)
  codeExample: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Code snippet showing the solution'
  },
  
  // Common causes specific to this user
  commonCauses: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Causes specific to this user\'s error'
  },
  
  // Prevention tips
  preventionTips: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Tips to prevent this error in future'
  },
  
  // Difficulty level (beginner, intermediate, advanced)
  difficulty: {
    type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
    defaultValue: 'intermediate',
    comment: 'Difficulty of solving this error'
  },
  
  // Time to solve (in minutes)
  timeToSolve: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'How long it took user to solve (minutes)'
  },
  
  // Source of solution
  source: {
    type: DataTypes.ENUM('ai', 'forum', 'documentation', 'stackoverflow', 'personal'),
    allowNull: true,
    comment: 'Where the solution came from'
  },
  
  // Reference URL if applicable
  sourceUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Link to forum/documentation where solution was found'
  },
  
  // Tags for better organization
  tags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'User-defined tags for categorization'
  },
  
  // Platforms affected
  platforms: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Platforms where this error occurred (Windows, Mac, Linux, etc)'
  },
  
  // How many times user has referred to this solution
  referenceCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'How many times user looked up this solution'
  },
  
  // User's rating of how helpful this solution is
  userRating: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    validate: {
      min: 1,
      max: 5
    },
    comment: 'User\'s 1-5 rating of this solution'
  },
  
  // Last time user referenced this
  lastReferencedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When user last looked up this solution'
  },
  
  // Whether this has been verified to still work
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'User has confirmed this solution still works'
  },
  
  // Whether to share with community (future feature)
  isShared: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether to share this solution with community'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('active', 'archived', 'deprecated'),
    defaultValue: 'active',
    comment: 'Status of this solution'
  },
  
  // Notes added by user
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes or variations'
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_learning_libraries',
  timestamps: true,
  indexes: [
    {
      fields: ['userId'],
      name: 'idx_user_learning_userId'
    },
    {
      fields: ['userId', 'category'],
      name: 'idx_user_learning_userId_category'
    },
    {
      fields: ['userId', 'status'],
      name: 'idx_user_learning_userId_status'
    },
    {
      fields: ['userId', 'errorPattern'],
      name: 'idx_user_learning_userId_pattern'
    },
    {
      fields: ['errorCode'],
      name: 'idx_user_learning_errorCode'
    }
  ]
});

module.exports = UserLearningLibrary;
