const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  subscriptionId: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    field: 'subscription_id'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'plan_id'
  },
  tier: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'subscription_tier'
  },
  status: {
    type: DataTypes.STRING,
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
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'trial_start'
  },
  trialEnd: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'trial_end'
  },
  nextBillingDate: {
    type: DataTypes.DATEONLY,
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
    type: DataTypes.STRING,
    allowNull: true,
    field: 'dodo_subscription_id'
  },
  dodoCustomerId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'dodo_customer_id'
  },
  paymentMethod: {
    type: DataTypes.STRING,
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
  // Note: Indexes already exist in database, don't define here to avoid duplicate creation errors
  // Existing indexes: subscriptions_user_id, subscriptions_status, subscriptions_dodo_subscription_id
});

module.exports = Subscription;
