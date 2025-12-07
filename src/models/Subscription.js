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
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  planId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'free',
    field: 'plan_id'
  },
  tier: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'free'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  trialStart: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'trial_start'
  },
  trialEnd: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'trial_end'
  },
  nextBillingDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_billing_date'
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'cancel_at_period_end'
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'cancelled_at'
  },
  dodoSubscriptionId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'dodo_subscription_id'
  },
  dodoCustomerId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'dodo_customer_id'
  },
  paymentMethod: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'payment_method'
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'auto_renew'
  }
}, {
  tableName: 'subscriptions',
  timestamps: true,
  underscored: true
  // Note: Indexes created in database migration, not defined here to avoid duplicate creation errors
});

module.exports = Subscription;
