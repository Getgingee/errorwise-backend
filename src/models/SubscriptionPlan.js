const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
  plan_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  price: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  features: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  limits: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  max_users: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  max_team_members: {
    type: DataTypes.INTEGER,
    defaultValue: -1 // -1 = unlimited
  },
  video_session_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 30 // minutes
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dodo_plan_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Dodo Payments plan ID'
  },
  dodo_product_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Dodo Payments product ID'
  },
  stripe_plan_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Legacy Stripe plan ID (deprecated)'
  },
  billing_interval: {
    type: DataTypes.ENUM('day', 'month', 'year'),
    defaultValue: 'month'
  },
  trial_period_days: {
    type: DataTypes.INTEGER,
    defaultValue: 0
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
  tableName: 'subscription_plans',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SubscriptionPlan;