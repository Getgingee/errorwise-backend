const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Team = sequelize.define('Team', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [3, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  owner_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  subscription_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'subscriptions',
      key: 'id'
    }
  },
  max_members: {
    type: DataTypes.INTEGER,
    defaultValue: -1, // -1 means unlimited
    allowNull: false
  },
  video_room_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      allow_guest_access: false,
      require_approval: true,
      enable_video_chat: true,
      enable_screen_sharing: true,
      video_session_duration_minutes: 30,
      unlimited_participants: true
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'teams',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Team;