/**
 * Usage Reset Job (C1 - Plan Model & Usage Counters)
 * 
 * Resets monthly query counters for all users on the 1st of each month.
 * Also handles trial expiration logic.
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Reset monthly query counters for all users
 * Runs at 00:00 on the 1st of every month
 */
function scheduleMonthlyReset() {
  // Cron expression: 0 0 1 * * = At 00:00 on day-of-month 1
  cron.schedule('0 0 1 * *', async () => {
    logger.info('[UsageResetJob] Starting monthly usage reset...');
    
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      // Reset counters for all users
      const [affectedRows] = await User.update(
        {
          queriesUsedThisPeriod: 0,
          periodStartDate: startOfMonth
        },
        {
          where: {} // All users
        }
      );
      
      logger.info(`[UsageResetJob] Monthly reset complete. Reset ${affectedRows} users.`);
      
    } catch (error) {
      logger.error('[UsageResetJob] Monthly reset failed:', error);
    }
  }, {
    timezone: 'UTC'
  });
  
  logger.info('[UsageResetJob] Monthly reset job scheduled (1st of each month at 00:00 UTC)');
}

/**
 * Check and expire trials daily
 * Runs at 00:00 every day
 */
function scheduleTrialExpirationCheck() {
  // Cron expression: 0 0 * * * = At 00:00 every day
  cron.schedule('0 0 * * *', async () => {
    logger.info('[UsageResetJob] Checking for expired trials...');
    
    try {
      const now = new Date();
      const Subscription = require('../models/Subscription');
      
      // Find users with trial_active status whose trial has expired
      const expiredTrialUsers = await User.findAll({
        where: {
          [Op.or]: [
            // New Dodo trial flow - trial_active with expired trialEndsAt
            {
              subscriptionStatus: 'trial_active',
              trialEndsAt: {
                [Op.lt]: now,
                [Op.ne]: null
              }
            },
            // Legacy trial flow - free tier with expired trialEndsAt
            {
              trialEndsAt: {
                [Op.lt]: now,
                [Op.ne]: null
              },
              subscriptionTier: 'free',
              subscriptionStatus: {
                [Op.notIn]: ['trial_cancelled', 'expired', 'active']
              }
            }
          ]
        },
        attributes: ['id', 'email', 'trialEndsAt', 'subscriptionStatus', 'subscriptionTier']
      });
      
      logger.info(`[UsageResetJob] Found ${expiredTrialUsers.length} users with expired trials`);
      
      // Process expired trials
      for (const user of expiredTrialUsers) {
        try {
          // Downgrade user to free
          await user.update({
            subscriptionTier: 'free',
            subscriptionStatus: 'expired',
            trialEndedNotified: true
          });
          
          // Also update Subscription record if exists
          await Subscription.update(
            {
              status: 'expired',
              isTrial: false
            },
            {
              where: { userId: user.id, status: 'trial_active' }
            }
          );
          
          logger.info(`[UsageResetJob] Trial expired and downgraded user ${user.id} (${user.email})`);
          
          // Send trial expired email
          const emailService = require('../services/emailService');
          await emailService.sendTrialExpiredEmail(user.email);
          
        } catch (userError) {
          logger.error(`[UsageResetJob] Failed to process expired trial for user ${user.id}:`, userError);
        }
      }
      
      // Also handle cancelled trials that have ended
      const cancelledTrials = await User.findAll({
        where: {
          subscriptionStatus: 'trial_cancelled',
          trialEndsAt: {
            [Op.lt]: now,
            [Op.ne]: null
          }
        },
        attributes: ['id', 'email', 'trialEndsAt']
      });
      
      for (const user of cancelledTrials) {
        try {
          await user.update({
            subscriptionTier: 'free',
            subscriptionStatus: 'expired'
          });
          
          await Subscription.update(
            { status: 'expired' },
            { where: { userId: user.id, status: 'trial_cancelled' } }
          );
          
          logger.info(`[UsageResetJob] Cancelled trial ended for user ${user.id} (${user.email})`);
        } catch (userError) {
          logger.error(`[UsageResetJob] Failed to expire cancelled trial for user ${user.id}:`, userError);
        }
      }
      
    } catch (error) {
      logger.error('[UsageResetJob] Trial expiration check failed:', error);
    }
  }, {
    timezone: 'UTC'
  });
  
  logger.info('[UsageResetJob] Trial expiration check scheduled (daily at 00:00 UTC)');
}

/**
 * Get usage statistics for metrics (C1)
 */
async function getUsageMetrics() {
  try {
    const now = new Date();
    
    // Count active free users
    const activeFreeUsers = await User.count({
      where: {
        subscriptionTier: 'free',
        isActive: true
      }
    });
    
    // Count users currently in trial
    const usersInTrial = await User.count({
      where: {
        trialEndsAt: {
          [Op.gt]: now
        },
        subscriptionTier: 'free'
      }
    });
    
    // Average queries per user during trial (last 30 days)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const trialUsers = await User.findAll({
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo
        },
        subscriptionTier: 'free'
      },
      attributes: ['queriesUsedThisPeriod']
    });
    
    const avgQueriesPerTrialUser = trialUsers.length > 0
      ? trialUsers.reduce((sum, u) => sum + (u.queriesUsedThisPeriod || 0), 0) / trialUsers.length
      : 0;
    
    return {
      activeFreeUsers,
      usersInTrial,
      avgQueriesPerTrialUser: Math.round(avgQueriesPerTrialUser * 100) / 100,
      timestamp: now.toISOString()
    };
    
  } catch (error) {
    logger.error('[UsageResetJob] Failed to get usage metrics:', error);
    return null;
  }
}

/**
 * Initialize all scheduled jobs
 */
function initializeJobs() {
  scheduleMonthlyReset();
  scheduleTrialExpirationCheck();
  logger.info('[UsageResetJob] All usage jobs initialized');
}

module.exports = {
  initializeJobs,
  scheduleMonthlyReset,
  scheduleTrialExpirationCheck,
  getUsageMetrics
};
