const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ErrorQuery = sequelize.define('ErrorQuery', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  solution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  errorCategory: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'general'
  },
  aiProvider: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'mock'
  },
  userSubscriptionTier: {
    type: DataTypes.ENUM('free', 'pro', 'team'),
    allowNull: false,
    defaultValue: 'free'
  },
  responseTime: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  // B2: User feedback on result quality
  feedback: {
    type: DataTypes.ENUM('up', 'down'),
    allowNull: true
  },
  feedbackComment: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  feedbackAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['userId', 'createdAt'] },
    { fields: ['errorCategory'] }
  ],
  timestamps: true
});

module.exports = ErrorQuery;
