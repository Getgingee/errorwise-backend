const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SharedError = sequelize.define('SharedError', {
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
  shared_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  error_query_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'error_queries',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(500), // Increased for encrypted data
    allowNull: false,
    validate: {
      len: [5, 500]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // E2E encryption flag
  is_encrypted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.ENUM('open', 'discussing', 'resolved', 'archived'),
    defaultValue: 'open'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  discussion_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  votes: {
    type: DataTypes.JSON,
    defaultValue: {
      upvotes: [],
      downvotes: []
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
  tableName: 'shared_errors',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SharedError;