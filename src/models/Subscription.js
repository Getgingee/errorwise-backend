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
    type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial', 'trial_pending', 'past_due', 'pending'),
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

  // ============================================================================
  // TRIAL FIELDS - 7-day trial with payment capture
  // ============================================================================
  trialStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the trial period started'
  },
  trialEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the trial period ends (7 days from start)'
  },
  trialStatus: {
    type: DataTypes.ENUM('none', 'pending', 'active', 'converted', 'cancelled', 'expired'),
    defaultValue: 'none',
    comment: 'Trial state machine: none -> pending -> active -> converted/cancelled/expired'
  },
  paymentMethodCaptured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether payment method was captured during trial checkout'
  },
  trialPlanId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'The plan (pro/team) user is trialing'
  },
  trialCancelledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When user cancelled the trial (if they did)'
  },
  trialConvertedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When trial converted to paid subscription'
  },

  // ============================================================================
  // DODO PAYMENTS INTEGRATION
  // ============================================================================
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
  dodoPaymentMethodId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Captured payment method ID for future billing'
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
    comment: 'Payment method type (e.g., card, upi)'
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether subscription will cancel at period end'
  },
  cancelReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason provided when cancelling'
  }
}, {
  indexes: [
    { fields: ['userId', 'tier'] },
    { fields: ['status'] },
    { fields: ['trialStatus'] },
    { fields: ['trialEndDate'] },
    { fields: ['dodoSubscriptionId'] }
  ],
  timestamps: true,
  underscored: true // Use snake_case for automatically generated columns
});

module.exports = Subscription;
