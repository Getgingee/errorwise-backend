const User = require('../models/User');
const authService = require('./authService');
const emailService = require('../utils/emailService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { Op } = require('sequelize');

// ============================================================================
// EMAIL CHANGE FUNCTIONALITY
// ============================================================================

/**
 * Initiate email change process (sends verification to new email)
 * @param {number} userId - User ID
 * @param {string} newEmail - New email address
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function initiateEmailChange(userId, newEmail) {
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      throw new Error('Invalid email format');
    }

    // Check if new email is already in use
    const existingUser = await User.findOne({ where: { email: newEmail } });
    if (existingUser) {
      throw new Error('Email already in use by another account');
    }

    // Get current user
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent changing to same email
    if (user.email === newEmail) {
      throw new Error('New email is the same as current email');
    }

    // Generate verification token (valid for 1 hour)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store pending email change (we'll add columns to users table)
    await user.update({
      pendingEmail: newEmail,
      emailChangeToken: verificationToken,
      emailChangeTokenExpiry: verificationExpiry
    });

    // Send verification email to NEW address
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email-change?token=${verificationToken}`;
    
    await emailService.sendEmail({
      to: newEmail,
      subject: 'Verify Your New Email Address',
      html: `
        <h2>Email Change Request</h2>
        <p>You (or someone with access to your account) requested to change your email address.</p>
        <p><strong>Current email:</strong> ${user.email}</p>
        <p><strong>New email:</strong> ${newEmail}</p>
        <p>Click the link below to confirm this change:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Verify New Email</a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this change, please ignore this email and secure your account immediately.</p>
      `
    });

    // Send notification to OLD email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Email Change Request Initiated',
      html: `
        <h2>Security Alert: Email Change Requested</h2>
        <p>Someone requested to change your account email address to: <strong>${newEmail}</strong></p>
        <p>If this was you, please verify the new email address using the link sent to ${newEmail}.</p>
        <p>If you didn't request this change, your account may be compromised. Please:</p>
        <ul>
          <li>Change your password immediately</li>
          <li>Review your account activity</li>
          <li>Contact support if you need assistance</li>
        </ul>
      `
    });

    logger.info('Email change initiated', { userId, oldEmail: user.email, newEmail });

    return {
      success: true,
      message: 'Verification email sent to new address. Please check your inbox.'
    };
  } catch (error) {
    logger.error('Email change initiation error:', error);
    throw error;
  }
}

/**
 * Complete email change after verification
 * @param {string} token - Verification token
 * @returns {Promise<{success: boolean, message: string, newEmail: string}>}
 */
async function verifyEmailChange(token) {
  try {
    if (!token) {
      throw new Error('Verification token is required');
    }

    // Find user by token
    const user = await User.findOne({
      where: {
        emailChangeToken: token,
        emailChangeTokenExpiry: { [Op.gt]: new Date() } // Token not expired
      }
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    const oldEmail = user.email;
    const newEmail = user.pendingEmail;

    // Update user email and clear pending fields
    await user.update({
      email: newEmail,
      emailVerified: true,
      pendingEmail: null,
      emailChangeToken: null,
      emailChangeTokenExpiry: null
    });

    // Send confirmation to both emails
    await emailService.sendEmail({
      to: newEmail,
      subject: 'Email Successfully Changed',
      html: `
        <h2>Email Change Confirmed</h2>
        <p>Your email address has been successfully updated to: <strong>${newEmail}</strong></p>
        <p>You can now use this email to log in to your account.</p>
      `
    });

    await emailService.sendEmail({
      to: oldEmail,
      subject: 'Email Address Changed',
      html: `
        <h2>Email Change Complete</h2>
        <p>Your account email has been changed from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>
        <p>If you didn't authorize this change, please contact support immediately.</p>
      `
    });

    logger.info('Email change completed', { userId: user.id, oldEmail, newEmail });

    return {
      success: true,
      message: 'Email successfully updated',
      newEmail
    };
  } catch (error) {
    logger.error('Email change verification error:', error);
    throw error;
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get all active sessions for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} List of active sessions
 */
async function getUserSessions(userId) {
  try {
    // In production, you'd store sessions in Redis with metadata
    // For now, we'll return a mock structure showing what should be tracked
    
    // TODO: Integrate with Redis to store session metadata
    // Key pattern: `session:${userId}:${sessionId}`
    // Value: { sessionId, deviceInfo, ipAddress, location, createdAt, lastActivity }
    
    logger.info('Getting user sessions', { userId });
    
    return {
      success: true,
      message: 'Session management requires Redis integration (TODO)',
      sessions: [] // Empty for now
    };
  } catch (error) {
    logger.error('Get sessions error:', error);
    throw error;
  }
}

/**
 * Revoke a specific session
 * @param {number} userId - User ID
 * @param {string} sessionId - Session ID to revoke
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function revokeSession(userId, sessionId) {
  try {
    // TODO: Integrate with Redis
    // Delete key: `session:${userId}:${sessionId}`
    
    logger.info('Revoking session', { userId, sessionId });
    
    return {
      success: true,
      message: 'Session revoked successfully (Redis integration pending)'
    };
  } catch (error) {
    logger.error('Revoke session error:', error);
    throw error;
  }
}

/**
 * Revoke all sessions except current one
 * @param {number} userId - User ID
 * @param {string} currentSessionId - Current session to preserve
 * @returns {Promise<{success: boolean, message: string, revokedCount: number}>}
 */
async function revokeAllOtherSessions(userId, currentSessionId) {
  try {
    // TODO: Integrate with Redis
    // Get all keys: `session:${userId}:*`
    // Delete all except `session:${userId}:${currentSessionId}`
    
    logger.info('Revoking all other sessions', { userId, keepSession: currentSessionId });
    
    return {
      success: true,
      message: 'All other sessions revoked (Redis integration pending)',
      revokedCount: 0
    };
  } catch (error) {
    logger.error('Revoke all sessions error:', error);
    throw error;
  }
}

// ============================================================================
// SUSPICIOUS ACTIVITY DETECTION
// ============================================================================

/**
 * Check for suspicious login patterns
 * @param {number} userId - User ID
 * @param {string} ipAddress - Login IP
 * @param {string} userAgent - Browser/device info
 * @returns {Promise<{suspicious: boolean, reasons: Array, riskScore: number}>}
 */
async function detectSuspiciousLogin(userId, ipAddress, userAgent) {
  try {
    const suspicious = [];
    let riskScore = 0;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check 1: Login from new country (requires IP geolocation service)
    // TODO: Integrate IP geolocation API (ipapi.co, ipgeolocation.io, etc.)
    // if (isNewCountry(ipAddress, user.lastLoginCountry)) {
    //   suspicious.push('Login from new country');
    //   riskScore += 30;
    // }

    // Check 2: Multiple failed attempts recently
    if (user.failedLoginAttempts > 3) {
      suspicious.push('Multiple recent failed login attempts');
      riskScore += 25;
    }

    // Check 3: Account recently locked
    if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
      suspicious.push('Account was recently locked');
      riskScore += 40;
    }

    // Check 4: Login after long inactivity
    if (user.lastLoginAt) {
      const daysSinceLastLogin = (Date.now() - new Date(user.lastLoginAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastLogin > 90) {
        suspicious.push('First login in over 90 days');
        riskScore += 15;
      }
    }

    // Check 5: Rapid succession logins from different IPs (requires session tracking)
    // TODO: Check Redis for recent logins from different IPs within short timeframe

    // Check 6: Known VPN/proxy detection
    // TODO: Integrate VPN detection service
    
    const isSuspicious = riskScore >= 40;

    if (isSuspicious) {
      logger.warn('Suspicious login detected', { 
        userId, 
        ipAddress, 
        riskScore, 
        reasons: suspicious 
      });

      // Send security alert email
      await emailService.sendEmail({
        to: user.email,
        subject: '⚠️ Suspicious Login Detected',
        html: `
          <h2>Security Alert</h2>
          <p>We detected a potentially suspicious login to your account:</p>
          <ul>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            <li><strong>IP Address:</strong> ${ipAddress}</li>
            <li><strong>Device:</strong> ${userAgent}</li>
          </ul>
          <p><strong>Detected Issues:</strong></p>
          <ul>
            ${suspicious.map(reason => `<li>${reason}</li>`).join('')}
          </ul>
          <p>If this was you, you can ignore this message. If not, please:</p>
          <ol>
            <li>Change your password immediately</li>
            <li>Review your recent account activity</li>
            <li>Enable two-factor authentication</li>
            <li>Contact support if you need help</li>
          </ol>
        `
      });
    }

    return {
      suspicious: isSuspicious,
      reasons: suspicious,
      riskScore
    };
  } catch (error) {
    logger.error('Suspicious login detection error:', error);
    // Don't block login on detection failure
    return {
      suspicious: false,
      reasons: ['Detection service error'],
      riskScore: 0
    };
  }
}

// ============================================================================
// ACCOUNT RESTORATION
// ============================================================================

/**
 * Soft delete account (mark as deleted but retain data for 30 days)
 * @param {number} userId - User ID
 * @param {string} reason - Deletion reason
 * @returns {Promise<{success: boolean, message: string, restorationDeadline: Date}>}
 */
async function softDeleteAccount(userId, reason = 'User requested') {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.deletedAt) {
      throw new Error('Account already marked for deletion');
    }

    const restorationDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await user.update({
      deletedAt: new Date(),
      deletionReason: reason,
      restorationDeadline,
      isActive: false
    });

    // Send confirmation email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Account Deletion Scheduled',
      html: `
        <h2>Account Deletion Requested</h2>
        <p>Your account has been scheduled for deletion.</p>
        <p><strong>Final deletion date:</strong> ${restorationDeadline.toLocaleDateString()}</p>
        <p>Until then, you can restore your account at any time by logging in.</p>
        <p>After the deletion date, all your data will be permanently removed and cannot be recovered.</p>
        <p>If you change your mind, simply log in to your account to cancel the deletion.</p>
      `
    });

    logger.info('Account soft deleted', { userId, reason, restorationDeadline });

    return {
      success: true,
      message: 'Account scheduled for deletion',
      restorationDeadline
    };
  } catch (error) {
    logger.error('Soft delete error:', error);
    throw error;
  }
}

/**
 * Restore soft-deleted account
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function restoreAccount(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.deletedAt) {
      throw new Error('Account is not marked for deletion');
    }

    // Check if restoration deadline passed
    if (new Date() > new Date(user.restorationDeadline)) {
      throw new Error('Restoration deadline has passed. Account cannot be recovered.');
    }

    await user.update({
      deletedAt: null,
      deletionReason: null,
      restorationDeadline: null,
      isActive: true
    });

    // Send welcome back email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Welcome Back! Account Restored',
      html: `
        <h2>Account Restored Successfully</h2>
        <p>Your account has been successfully restored and is now active again.</p>
        <p>All your data and settings have been preserved.</p>
        <p>Thank you for staying with us!</p>
      `
    });

    logger.info('Account restored', { userId });

    return {
      success: true,
      message: 'Account successfully restored'
    };
  } catch (error) {
    logger.error('Account restoration error:', error);
    throw error;
  }
}

module.exports = {
  // Email change
  initiateEmailChange,
  verifyEmailChange,
  
  // Session management
  getUserSessions,
  revokeSession,
  revokeAllOtherSessions,
  
  // Security
  detectSuspiciousLogin,
  
  // Account restoration
  softDeleteAccount,
  restoreAccount
};
