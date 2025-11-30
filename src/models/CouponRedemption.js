const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponRedemption = sequelize.define('CouponRedemption', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Foreign keys
  couponId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'coupon_id',
    references: {
      model: 'coupons',
      key: 'id'
    }
  },
  
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Subscription/payment reference
  subscriptionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'subscription_id',
    references: {
      model: 'subscriptions',
      key: 'id'
    }
  },
  
  // Plan that was purchased
  planId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'plan_id'
  },
  
  // Original price before discount
  originalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'original_price'
  },
  
  // Discount amount applied
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'discount_amount'
  },
  
  // Final price after discount
  finalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'final_price'
  },
  
  // Payment session ID (for tracking)
  paymentSessionId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'payment_session_id'
  },
  
  // Status of the redemption
  status: {
    type: DataTypes.ENUM('pending', 'applied', 'refunded', 'expired'),
    allowNull: false,
    defaultValue: 'pending'
  },
  
  // Duration info (for repeating discounts)
  remainingCycles: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'remaining_cycles'
  },
  
  // IP address for fraud detection
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'ip_address'
  },
  
  // User agent for tracking
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent'
  },
  
  // When the discount was applied to payment
  appliedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'applied_at'
  },
  
  // Additional metadata
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'coupon_redemptions',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['coupon_id'] },
    { fields: ['user_id'] },
    { fields: ['subscription_id'] },
    { fields: ['status'] },
    { fields: ['coupon_id', 'user_id'] }
  ]
});

module.exports = CouponRedemption;
