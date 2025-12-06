const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserSettings = sequelize.define('UserSettings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id', // Map to database column
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  preferences: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {
      notifications: {
        email: true,
        push: false,
        errorAlerts: true,
        weeklyReports: true
      },
      privacy: {
        shareAnalytics: false,
        publicProfile: false
      },
      ai: {
        preferredProvider: 'auto',  // auto, anthropic (system uses Claude)
        analysisDepth: 'standard',  // standard, detailed
        codeContext: true
      },
      display: {
        theme: 'light',
        language: 'en',
        timezone: 'UTC'
      }
    }
  }
}, {
  tableName: 'user_settings',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id'] // Use actual database column name
    }
  ]
});

module.exports = UserSettings;
