const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TeamMember = sequelize.define('TeamMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('owner', 'admin', 'member'),
    defaultValue: 'member',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'suspended'),
    defaultValue: 'pending',
    allowNull: false
  },
  invited_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  invited_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  joined_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: {
      can_invite_members: false,
      can_manage_errors: true,
      can_start_video_chat: true,
      can_view_analytics: false
    }
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
  tableName: 'team_members',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['team_id', 'user_id']
    }
  ]
});

module.exports = TeamMember;