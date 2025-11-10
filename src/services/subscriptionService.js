/**
 * Subscription Service
 * Handles subscription business logic, edge cases, and payment processing
 */

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const logger = require('../utils/logger');
const emailService = require('../utils/emailService');
const { redisClient } = require('../utils/redisClient');

// Tier pricing configuration
const TIER_PRICES = {
  free: 0,
  pro: 3,
  team: 8
};

const TIER_FEATURES = {
  free: {
    monthlyQueries: 50,
    dailyQueries: -1,
    teamMembers: 1,
    supportLevel: 'community'
  },
  pro: {
    monthlyQueries: -1, // unlimited
    dailyQueries: -1,
    teamMembers: 1,
    supportLevel: 'email'
  },
  team: {
    monthlyQueries: -1, // unlimited
    dailyQueries: -1,
    teamMembers: 10,
    supportLevel: 'priority'
  }
};

// Webhook idempotency tracking (Redis for production, Map for fallback)
const processedWebhooks = new Map();

/**
 * Check if webhook was already processed (idempotency)
 */
exports.isWebhookProcessed = async (webhookId) => {
  try {
    if (redisClient) {
      const exists = await redisClient.exists(`webhook:${webhookId}`);
      return exists === 1;
    }
    return processedWebhooks.has(webhookId);
  } catch (error) {
    logger.error('Error checking webhook idempotency:', error);
    return false;
  }
};

/**
 * Mark webhook as processed (24-hour expiry)
 */
exports.markWebhookProcessed = async (webhookId, data = {}) => {
  try {
    if (redisClient) {
      await redisClient.setex(
        `webhook:${webhookId}`,
        24 * 60 * 60, // 24 hours
        JSON.stringify({
          processedAt: new Date().toISOString(),
          ...data
        })
      );
    } else {
      processedWebhooks.set(webhookId, {
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ...data
      });
    }
  } catch (error) {
    logger.error('Error marking webhook as processed:', error);
  }
};

/**
 * Calculate prorated amount for subscription changes
 */
exports.calculateProration = (currentTier, newTier, daysRemaining, billingPeriod = 'month') => {
  const currentPrice = TIER_PRICES[currentTier] || 0;
  const newPrice = TIER_PRICES[newTier] || 0;
  const daysInPeriod = billingPeriod === 'year' ? 365 : 30;
  
  // Calculate unused credit from current subscription
  const unusedCredit = (currentPrice / daysInPeriod) * daysRemaining;
  
  // Calculate new charge (difference between new price and unused credit)
  const newCharge = Math.max(0, newPrice - unusedCredit);
  
  // Calculate next billing date
  const nextBillingDate = new Date();
  if (billingPeriod === 'year') {
    nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  } else {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }
  
  return {
    currentTier,
    newTier,
    currentPrice,
    newPrice,
    daysRemaining,
    unusedCredit: parseFloat(unusedCredit.toFixed(2)),
    newCharge: parseFloat(newCharge.toFixed(2)),
    effectiveDate: new Date(),
    nextBillingDate,
    billingPeriod
  };
};

/**
 * Apply grace period for expired subscriptions
 */
exports.applyGracePeriod = async (subscription, user) => {
  const gracePeriodDays = 3; // 3-day grace period
  const gracePeriodEnd = new Date(subscription.endDate || Date.now());
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
  
  try {
    // Update subscription status
    await subscription.update({
      status: 'grace_period',
      gracePeriodEndsAt: gracePeriodEnd
    });
    
    // Send grace period notification email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Subscription Payment Failed - Grace Period Active',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Your subscription payment failed</h2>
          <p>Hi ${user.username},</p>
          <p>We couldn't process your recent payment for your ${subscription.tier} subscription.</p>
          <p><strong>Grace Period:</strong> Your access will continue until ${gracePeriodEnd.toLocaleDateString()}</p>
          <p>Please update your payment method to avoid service interruption.</p>
          <p><a href="${process.env.FRONTEND_URL}/billing" style="background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Update Payment Method</a></p>
          <p>If you have any questions, please contact support.</p>
        </div>
      `
    });
    
    logger.info(`Grace period applied for subscription ${subscription.id}`, {
      userId: user.id,
      gracePeriodEnd
    });
    
    return { success: true, gracePeriodEnd };
  } catch (error) {
    logger.error('Failed to apply grace period:', error);
    throw error;
  }
};

/**
 * Handle payment failure with retry logic
 */
exports.handlePaymentFailure = async (subscription, user, error, attemptNumber = 1) => {
  const maxAttempts = 3;
  
  try {
    // Update subscription status
    await subscription.update({
      status: 'payment_failed',
      lastPaymentError: error.message,
      paymentAttempts: attemptNumber
    });
    
    // Send notification email
    await emailService.sendEmail({
      to: user.email,
      subject: `Payment Failed - Attempt ${attemptNumber}/${maxAttempts}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Payment Failed</h2>
          <p>Hi ${user.username},</p>
          <p>We couldn't process your payment for your ${subscription.tier} subscription.</p>
          <p><strong>Error:</strong> ${error.message}</p>
          ${attemptNumber < maxAttempts 
            ? `<p>We'll automatically retry in ${attemptNumber === 1 ? '1 day' : '3 days'}.</p>` 
            : '<p>This was the final retry attempt. Your subscription will be downgraded to Free.</p>'
          }
          <p><a href="${process.env.FRONTEND_URL}/billing">Update Payment Method</a></p>
        </div>
      `
    });
    
    // Schedule retry if not at max attempts
    if (attemptNumber < maxAttempts) {
      const retryDelay = attemptNumber === 1 ? 1 : 3; // 1 day, then 3 days
      await this.schedulePaymentRetry(subscription.id, retryDelay);
    } else {
      // Final attempt failed - apply grace period or downgrade
      await this.applyGracePeriod(subscription, user);
    }
    
    logger.warn(`Payment failure handled for subscription ${subscription.id}`, {
      userId: user.id,
      attemptNumber,
      error: error.message
    });
    
    return { success: true, attemptNumber, willRetry: attemptNumber < maxAttempts };
  } catch (err) {
    logger.error('Failed to handle payment failure:', err);
    throw err;
  }
};

/**
 * Schedule payment retry (using Redis or background job)
 */
exports.schedulePaymentRetry = async (subscriptionId, delayDays) => {
  try {
    const retryAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
    
    if (redisClient) {
      await redisClient.setex(
        `payment:retry:${subscriptionId}`,
        delayDays * 24 * 60 * 60,
        JSON.stringify({ subscriptionId, retryAt })
      );
    }
    
    logger.info(`Payment retry scheduled for subscription ${subscriptionId}`, {
      retryAt,
      delayDays
    });
  } catch (error) {
    logger.error('Failed to schedule payment retry:', error);
  }
};

/**
 * Process upgrade with proration
 */
exports.processUpgrade = async (user, currentTier, newTier, paymentMethod) => {
  const sequelize = require('../config/database');
  const transaction = await sequelize.transaction();
  
  try {
    // Get current subscription
    const subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active' },
      transaction
    });
    
    // Calculate proration
    const daysRemaining = subscription 
      ? Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const proration = this.calculateProration(currentTier, newTier, daysRemaining);
    
    // Process payment for prorated amount (if > 0)
    let paymentResult = null;
    if (proration.newCharge > 0) {
      paymentResult = await this.processPayment(user, proration.newCharge, paymentMethod);
      
      if (!paymentResult.success) {
        throw new Error('Payment failed: ' + paymentResult.error);
      }
    }
    
    // Update user tier
    await user.update({
      subscriptionTier: newTier,
      subscriptionStatus: 'active',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: proration.nextBillingDate
    }, { transaction });
    
    // Create or update subscription record
    if (subscription) {
      await subscription.update({
        tier: newTier,
        status: 'active',
        startDate: new Date(),
        endDate: proration.nextBillingDate,
        lastPaymentAmount: proration.newCharge,
        lastPaymentDate: new Date()
      }, { transaction });
    } else {
      await Subscription.create({
        userId: user.id,
        tier: newTier,
        status: 'active',
        startDate: new Date(),
        endDate: proration.nextBillingDate,
        lastPaymentAmount: proration.newCharge,
        lastPaymentDate: new Date()
      }, { transaction });
    }
    
    await transaction.commit();
    
    // Send confirmation email
    await emailService.sendEmail({
      to: user.email,
      subject: `Subscription Upgraded to ${newTier.toUpperCase()}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Upgrade Successful! 🎉</h2>
          <p>Hi ${user.username},</p>
          <p>Your subscription has been upgraded to <strong>${newTier.toUpperCase()}</strong>.</p>
          ${proration.newCharge > 0 ? `<p><strong>Amount Charged:</strong> $${proration.newCharge}</p>` : ''}
          ${proration.unusedCredit > 0 ? `<p><strong>Credit Applied:</strong> $${proration.unusedCredit}</p>` : ''}
          <p><strong>Next Billing Date:</strong> ${proration.nextBillingDate.toLocaleDateString()}</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription">View Subscription Details</a></p>
        </div>
      `
    });
    
    logger.info(`Subscription upgraded successfully`, {
      userId: user.id,
      fromTier: currentTier,
      toTier: newTier,
      charge: proration.newCharge
    });
    
    return {
      success: true,
      proration,
      paymentResult
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Upgrade failed:', error);
    throw error;
  }
};

/**
 * Process downgrade (immediate or end-of-period)
 */
exports.processDowngrade = async (user, currentTier, newTier, immediate = false, reason = null) => {
  const sequelize = require('../config/database');
  const transaction = await sequelize.transaction();
  
  try {
    const subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active' },
      transaction
    });
    
    if (immediate) {
      // Immediate downgrade
      await user.update({
        subscriptionTier: newTier,
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date()
      }, { transaction });
      
      if (subscription) {
        await subscription.update({
          tier: newTier,
          downgradedFrom: currentTier,
          downgradeReason: reason,
          status: 'active'
        }, { transaction });
      }
      
      await transaction.commit();
      
      // Send confirmation
      await emailService.sendEmail({
        to: user.email,
        subject: `Subscription Downgraded to ${newTier.toUpperCase()}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Downgrade Complete</h2>
            <p>Hi ${user.username},</p>
            <p>Your subscription has been downgraded to <strong>${newTier.toUpperCase()}</strong>.</p>
            <p>The change is effective immediately.</p>
            <p><a href="${process.env.FRONTEND_URL}/subscription">View Subscription Details</a></p>
          </div>
        `
      });
    } else {
      // Schedule downgrade for end of billing period
      if (subscription) {
        await subscription.update({
          scheduledDowngradeTo: newTier,
          downgradeReason: reason,
          cancelAtPeriodEnd: true
        }, { transaction });
      }
      
      await transaction.commit();
      
      // Send confirmation
      const endDate = user.subscriptionEndDate || new Date();
      await emailService.sendEmail({
        to: user.email,
        subject: `Subscription Downgrade Scheduled`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Downgrade Scheduled</h2>
            <p>Hi ${user.username},</p>
            <p>Your subscription will be downgraded to <strong>${newTier.toUpperCase()}</strong> at the end of your current billing period.</p>
            <p><strong>Downgrade Date:</strong> ${endDate.toLocaleDateString()}</p>
            <p>You'll continue to have access to ${currentTier.toUpperCase()} features until then.</p>
            <p><a href="${process.env.FRONTEND_URL}/subscription">Cancel Downgrade</a></p>
          </div>
        `
      });
    }
    
    logger.info(`Subscription ${immediate ? 'downgraded' : 'downgrade scheduled'}`, {
      userId: user.id,
      fromTier: currentTier,
      toTier: newTier,
      immediate,
      reason
    });
    
    return {
      success: true,
      immediate,
      effectiveDate: immediate ? new Date() : user.subscriptionEndDate
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Downgrade failed:', error);
    throw error;
  }
};

/**
 * Process payment through payment provider (DodoPayments or mock)
 */
exports.processPayment = async (user, amount, paymentMethod) => {
  try {
    // TODO: Integrate with actual payment provider (DodoPayments)
    // For now, return mock success
    
    logger.info(`Processing payment`, {
      userId: user.id,
      amount,
      paymentMethod: paymentMethod?.type || 'default'
    });
    
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock: 95% success rate
    const success = Math.random() > 0.05;
    
    if (success) {
      return {
        success: true,
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        amount,
        processedAt: new Date()
      };
    } else {
      return {
        success: false,
        error: 'Payment declined by bank'
      };
    }
  } catch (error) {
    logger.error('Payment processing error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Pause subscription (maintain access until end of paid period)
 */
exports.pauseSubscription = async (subscription, user) => {
  try {
    await subscription.update({
      status: 'paused',
      pausedAt: new Date(),
      pausedUntil: subscription.endDate
    });
    
    await emailService.sendEmail({
      to: user.email,
      subject: 'Subscription Paused',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Subscription Paused</h2>
          <p>Hi ${user.username},</p>
          <p>Your ${subscription.tier} subscription has been paused.</p>
          <p>You'll maintain access until ${subscription.endDate.toLocaleDateString()}.</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription">Resume Subscription</a></p>
        </div>
      `
    });
    
    logger.info(`Subscription paused`, {
      userId: user.id,
      subscriptionId: subscription.id
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to pause subscription:', error);
    throw error;
  }
};

/**
 * Resume paused subscription
 */
exports.resumeSubscription = async (subscription, user) => {
  try {
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    
    await subscription.update({
      status: 'active',
      pausedAt: null,
      pausedUntil: null,
      endDate: nextBillingDate
    });
    
    await emailService.sendEmail({
      to: user.email,
      subject: 'Subscription Resumed',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Subscription Resumed</h2>
          <p>Hi ${user.username},</p>
          <p>Your ${subscription.tier} subscription has been resumed.</p>
          <p><strong>Next Billing Date:</strong> ${nextBillingDate.toLocaleDateString()}</p>
          <p><a href="${process.env.FRONTEND_URL}/subscription">View Details</a></p>
        </div>
      `
    });
    
    logger.info(`Subscription resumed`, {
      userId: user.id,
      subscriptionId: subscription.id
    });
    
    return { success: true, nextBillingDate };
  } catch (error) {
    logger.error('Failed to resume subscription:', error);
    throw error;
  }
};

/**
 * Clean up expired grace periods
 * Run this periodically (e.g., daily cron job)
 */
exports.cleanupExpiredGracePeriods = async () => {
  try {
    const expiredSubscriptions = await Subscription.findAll({
      where: {
        status: 'grace_period',
        gracePeriodEndsAt: { [require('sequelize').Op.lt]: new Date() }
      },
      include: [{ model: User, as: 'user' }]
    });
    
    for (const subscription of expiredSubscriptions) {
      // Downgrade to free
      await subscription.user.update({
        subscriptionTier: 'free',
        subscriptionStatus: 'expired'
      });
      
      await subscription.update({
        status: 'expired',
        tier: 'free'
      });
      
      // Send notification
      await emailService.sendEmail({
        to: subscription.user.email,
        subject: 'Subscription Expired - Downgraded to Free',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Subscription Expired</h2>
            <p>Hi ${subscription.user.username},</p>
            <p>Your grace period has ended and your subscription has been downgraded to Free.</p>
            <p>You can upgrade anytime to restore your premium features.</p>
            <p><a href="${process.env.FRONTEND_URL}/pricing">Upgrade Now</a></p>
          </div>
        `
      });
      
      logger.info(`Grace period expired, downgraded to free`, {
        userId: subscription.user.id,
        subscriptionId: subscription.id
      });
    }
    
    return { cleaned: expiredSubscriptions.length };
  } catch (error) {
    logger.error('Failed to cleanup expired grace periods:', error);
    throw error;
  }
};

module.exports = exports;
