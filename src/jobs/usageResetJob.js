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
      
      // Find users with expired trials who are still on free tier
      // These users' trial period has ended, they're now on regular free limits
      const expiredTrialUsers = await User.findAll({
        where: {
          trialEndsAt: {
            [Op.lt]: now,
            [Op.ne]: null
          },
          subscriptionTier: 'free'
        },
        attributes: ['id', 'email', 'trialEndsAt']
      });
      
      logger.info(`[UsageResetJob] Found ${expiredTrialUsers.length} users with expired trials`);
      
      // Log for metrics (can be enhanced to send email reminders)
      for (const user of expiredTrialUsers) {
        logger.info(`[UsageResetJob] Trial expired for user ${user.id} (${user.email})`);
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
