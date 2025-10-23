const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  userId: { 
    type: DataTypes.UUID, 
    allowNull: false,
    field: 'user_id' // Map to database column
  },
  tier: { 
    type: DataTypes.ENUM('free', 'pro', 'enterprise'), 
    defaultValue: 'free' 
  },
  status: { 
    type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial', 'past_due'), 
    defaultValue: 'active' 
  },
  startDate: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  endDate: { 
    type: DataTypes.DATE, 
    allowNull: true 
  },
  dodoSubscriptionId: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  dodoSessionId: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  lastPaymentDate: { 
    type: DataTypes.DATE, 
    allowNull: true 
  }
}, {
  indexes: [
    { fields: ['userId', 'tier'] },
    { fields: ['status'] }
  ],
  timestamps: true
});

module.exports = Subscription;
