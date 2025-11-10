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
    allowNull: false
  },
  tier: { 
    type: DataTypes.ENUM('free', 'pro', 'team'), 
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
    allowNull: true,
    comment: 'Dodo Payments subscription ID'
  },
  dodoCustomerId: { 
    type: DataTypes.STRING, 
    allowNull: true,
    comment: 'Dodo Payments customer ID'
  },
  dodoSessionId: { 
    type: DataTypes.STRING, 
    allowNull: true,
    comment: 'Dodo Payments session ID'
  },
  legacyStripeId: { 
    type: DataTypes.STRING, 
    allowNull: true,
    comment: 'Legacy Stripe subscription ID (deprecated)'
  },
  lastPaymentDate: { 
    type: DataTypes.DATE, 
    allowNull: true 
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Payment method (e.g., card, upi)'
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether subscription will cancel at period end'
  }
}, {
  indexes: [
    { fields: ['userId', 'tier'] },
    { fields: ['status'] }
  ],
  timestamps: true
});

module.exports = Subscription;
