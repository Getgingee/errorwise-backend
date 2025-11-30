const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Coupon code (e.g., "LAUNCH25", "WELCOME50")
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    set(value) {
      // Always store uppercase for consistent matching
      this.setDataValue('code', value ? value.toUpperCase().trim() : value);
    }
  },
  
  // Display name for the coupon
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  // Description for admin/marketing purposes
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Discount type: 'percentage' or 'fixed'
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: false,
    defaultValue: 'percentage',
    field: 'discount_type'
  },
  
  // Discount value (percentage 0-100 or fixed amount in dollars)
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'discount_value',
    validate: {
      min: 0
    }
  },
  
  // Minimum purchase amount required (in dollars)
  minimumPurchase: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    field: 'minimum_purchase'
  },
  
  // Maximum discount amount (for percentage discounts)
  maxDiscountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'max_discount_amount'
  },
  
  // Which plans this coupon applies to (null = all plans)
  applicablePlans: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
    field: 'applicable_plans',
    comment: 'Array of plan IDs: ["pro", "team"] or null for all'
  },
  
  // Duration type for recurring discounts
  durationType: {
    type: DataTypes.ENUM('once', 'repeating', 'forever'),
    allowNull: false,
    defaultValue: 'once',
    field: 'duration_type'
  },
  
  // Number of billing cycles for 'repeating' duration
  durationMonths: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_months'
  },
  
  // Total usage limit across all users
  maxRedemptions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_redemptions'
  },
  
  // Current redemption count
  redemptionCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'redemption_count'
  },
  
  // Per-user usage limit
  maxRedemptionsPerUser: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'max_redemptions_per_user'
  },
  
  // First-time users only
  firstTimeOnly: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'first_time_only'
  },
  
  // New users only (accounts created within X days)
  newUserDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'new_user_days',
    comment: 'If set, only users whose account was created within this many days can use the coupon'
  },
  
  // Active status
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  
  // Start date (coupon becomes valid)
  startsAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'starts_at'
  },
  
  // Expiry date
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  },
  
  // Campaign/source tracking
  campaign: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  // Created by (admin user ID)
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by'
  },
  
  // Metadata for additional properties
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'coupons',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['code'] },
    { fields: ['is_active'] },
    { fields: ['expires_at'] },
    { fields: ['campaign'] }
  ]
});

// Instance methods
Coupon.prototype.isValid = function() {
  const now = new Date();
  
  // Check if active
  if (!this.isActive) return false;
  
  // Check start date
  if (this.startsAt && new Date(this.startsAt) > now) return false;
  
  // Check expiry
  if (this.expiresAt && new Date(this.expiresAt) < now) return false;
  
  // Check max redemptions
  if (this.maxRedemptions && this.redemptionCount >= this.maxRedemptions) return false;
  
  return true;
};

Coupon.prototype.calculateDiscount = function(originalPrice) {
  if (this.discountType === 'percentage') {
    let discount = (originalPrice * this.discountValue) / 100;
    
    // Apply max discount cap if set
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = parseFloat(this.maxDiscountAmount);
    }
    
    return Math.round(discount * 100) / 100;
  } else {
    // Fixed amount discount
    return Math.min(parseFloat(this.discountValue), originalPrice);
  }
};

Coupon.prototype.toPublicJSON = function() {
  return {
    code: this.code,
    name: this.name,
    discountType: this.discountType,
    discountValue: parseFloat(this.discountValue),
    description: this.description,
    applicablePlans: this.applicablePlans,
    minimumPurchase: parseFloat(this.minimumPurchase) || 0,
    expiresAt: this.expiresAt
  };
};

module.exports = Coupon;
