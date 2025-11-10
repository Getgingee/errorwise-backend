const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  email: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    unique: true 
  },
  password: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'reset_password_token'
  },
  resetPasswordExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reset_password_expires'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  role: {
    type: DataTypes.STRING(50),
    defaultValue: 'user'
  },
  subscriptionTier: {
    type: DataTypes.STRING(50),
    defaultValue: 'free',
    field: 'subscription_tier'
  },
  subscriptionStatus: {
    type: DataTypes.STRING(50),
    defaultValue: 'active',
    field: 'subscription_status'
  },
  subscriptionEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'subscription_end_date'
  },
  subscriptionStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'subscription_start_date'
  },
  trialEndsAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'trial_ends_at'
  },
  // Soft delete support
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at'
  },
  // Email verification
  emailVerificationToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'email_verification_token'
  },
  emailVerificationExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'email_verification_expires'
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_email_verified'
  },
  // Email change workflow
  pendingEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'pending_email'
  },
  emailChangeToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'email_change_token'
  },
  emailChangeTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'email_change_token_expiry'
  },
  // Account deletion
  deletionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'deletion_reason'
  },
  restorationDeadline: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'restoration_deadline'
  },
  // OAuth providers
  googleId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'google_id'
  },
  // Phone verification
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'phone_number'
  },
  isPhoneVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_phone_verified'
  },
  phoneVerificationToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'phone_verification_token'
  },
  phoneVerificationExpires: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'phone_verification_expires'
  },
  // Track original registration to prevent abuse
  originalRegistrationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'original_registration_date'
  },
  accountRecreationCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'account_recreation_count'
  },
  // Last login tracking
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at'
  },
  // Login OTP
  loginOTP: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'login_otp'
  },
  loginOTPExpires: {
    type: DataTypes.BIGINT,  // Changed from DATE to BIGINT to store raw timestamp
    allowNull: true,
    field: 'login_otp_expires'
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updated_at'
  }
}, {
  tableName: 'users',
  timestamps: true,
  paranoid: true, // Enable soft deletes
  underscored: true // Use snake_case for automatically generated columns
});

module.exports = User;
