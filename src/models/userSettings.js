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
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  theme: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'light'
  },
  notificationsEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
    field: 'notifications_enabled'
  },
  emailNotifications: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
    field: 'email_notifications'
  },
  defaultLanguage: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'en',
    field: 'default_language'
  },
  autoSave: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
    field: 'auto_save'
  },
  preferences: {
    type: DataTypes.JSONB,
    allowNull: true,
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
        preferredProvider: 'auto',
        analysisDepth: 'standard',
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
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id']
    }
  ]
});

module.exports = UserSettings;
