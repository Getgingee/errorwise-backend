/**
 * Usage Notification Job
 * 
 * Sends email notifications for:
 * - Weekly usage digest (every Monday)
 * - Trial ending warning (2 days before trial ends)
 * - Limit approaching warning (when 80% of monthly limit used)
 * - Limit reached notification
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/User');
const logger = require('../utils/logger');

// Import email service dynamically to avoid circular deps
let emailService;
const getEmailService = () => {
  if (!emailService) {
    emailService = require('../utils/emailService');
  }
  return emailService;
};

/**
 * Send weekly usage digest every Monday at 9:00 AM UTC
 */
function scheduleWeeklyDigest() {
  // Cron: 0 9 * * 1 = At 09:00 on Monday
  cron.schedule('0 9 * * 1', async () => {
    logger.info('[UsageNotification] Starting weekly usage digest...');
    
    try {
      const users = await User.findAll({
        where: {
          isActive: true,
          subscriptionTier: 'free',
          // Only users who opted in (default: true)
          usageEmailsEnabled: { [Op.ne]: false }
        },
        attributes: ['id', 'email', 'username', 'queriesUsedThisPeriod', 'trialEndsAt', 'trialQueriesUsed', 'subscriptionTier']
      });

      let sentCount = 0;
      const now = new Date();

      for (const user of users) {
        const isInTrial = user.trialEndsAt && new Date(user.trialEndsAt) > now;
        const daysLeftInTrial = isInTrial 
          ? Math.ceil((new Date(user.trialEndsAt) - now) / (1000 * 60 * 60 * 24))
          : 0;

        const monthlyLimit = 50;
        const used = user.queriesUsedThisPeriod || 0;
        const remaining = isInTrial ? 'Unlimited' : Math.max(0, monthlyLimit - used);

        await sendWeeklyDigestEmail(user, {
          isInTrial,
          daysLeftInTrial,
          queriesUsed: used,
          queriesRemaining: remaining,
          monthlyLimit: isInTrial ? 'Unlimited' : monthlyLimit
        });

        sentCount++;
      }

      logger.info(`[UsageNotification] Weekly digest sent to ${sentCount} users`);

    } catch (error) {
      logger.error('[UsageNotification] Weekly digest failed:', error);
    }
  }, { timezone: 'UTC' });

  logger.info('[UsageNotification] Weekly digest scheduled (Monday 9:00 AM UTC)');
}

/**
 * Check for trial ending soon (daily at 10:00 AM UTC)
 */
function scheduleTrialEndingWarning() {
  // Cron: 0 10 * * * = At 10:00 every day
  cron.schedule('0 10 * * *', async () => {
    logger.info('[UsageNotification] Checking for trials ending soon...');
    
    try {
      const now = new Date();
      const twoDaysFromNow = new Date(now);
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      
      const oneDayFromNow = new Date(now);
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      // Users whose trial ends in 2 days (haven't been notified)
      const users = await User.findAll({
        where: {
          isActive: true,
          subscriptionTier: 'free',
          trialEndsAt: {
            [Op.gt]: oneDayFromNow,
            [Op.lte]: twoDaysFromNow
          },
          trialEndingNotified: { [Op.ne]: true },
          usageEmailsEnabled: { [Op.ne]: false }
        },
        attributes: ['id', 'email', 'username', 'trialEndsAt', 'trialQueriesUsed']
      });

      for (const user of users) {
        await sendTrialEndingEmail(user);
        await user.update({ trialEndingNotified: true });
      }

      logger.info(`[UsageNotification] Trial ending warnings sent to ${users.length} users`);

    } catch (error) {
      logger.error('[UsageNotification] Trial ending check failed:', error);
    }
  }, { timezone: 'UTC' });

  logger.info('[UsageNotification] Trial ending warning scheduled (daily 10:00 AM UTC)');
}

/**
 * Check for limit approaching (daily at 11:00 AM UTC)
 */
function scheduleLimitWarning() {
  // Cron: 0 11 * * * = At 11:00 every day
  cron.schedule('0 11 * * *', async () => {
    logger.info('[UsageNotification] Checking for users approaching limit...');
    
    try {
      const now = new Date();
      const monthlyLimit = 50;
      const warningThreshold = Math.floor(monthlyLimit * 0.8); // 80% = 40 queries

      // Users who have used 80%+ of their limit (free tier, not in trial)
      const users = await User.findAll({
        where: {
          isActive: true,
          subscriptionTier: 'free',
          trialEndsAt: { [Op.lte]: now }, // Trial has ended
          queriesUsedThisPeriod: { [Op.gte]: warningThreshold },
          limitWarningNotified: { [Op.ne]: true },
          usageEmailsEnabled: { [Op.ne]: false }
        },
        attributes: ['id', 'email', 'username', 'queriesUsedThisPeriod']
      });

      for (const user of users) {
        const remaining = Math.max(0, monthlyLimit - user.queriesUsedThisPeriod);
        await sendLimitApproachingEmail(user, {
          used: user.queriesUsedThisPeriod,
          remaining,
          limit: monthlyLimit
        });
        await user.update({ limitWarningNotified: true });
      }

      logger.info(`[UsageNotification] Limit warnings sent to ${users.length} users`);

    } catch (error) {
      logger.error('[UsageNotification] Limit warning check failed:', error);
    }
  }, { timezone: 'UTC' });

  logger.info('[UsageNotification] Limit warning scheduled (daily 11:00 AM UTC)');
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

async function sendWeeklyDigestEmail(user, stats) {
  const email = getEmailService();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
        .stats-card { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 32px; font-weight: bold; color: #3b82f6; }
        .stat-label { color: #64748b; font-size: 14px; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
        .trial-badge { background: #fef3c7; color: #92400e; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; }
        .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">📊 Your Weekly ErrorWise Summary</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Hi ${user.username}!</p>
        </div>
        <div class="content">
          ${stats.isInTrial ? `
            <div style="text-align: center; margin-bottom: 20px;">
              <span class="trial-badge">🎉 ${stats.daysLeftInTrial} days left in your free trial</span>
            </div>
          ` : ''}
          
          <div class="stats-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div class="stat-number">${stats.queriesUsed}</div>
                <div class="stat-label">Problems Solved This Month</div>
              </div>
              <div style="text-align: right;">
                <div class="stat-number" style="color: ${stats.isInTrial ? '#10b981' : '#f59e0b'};">${stats.queriesRemaining}</div>
                <div class="stat-label">Queries Remaining</div>
              </div>
            </div>
          </div>

          ${!stats.isInTrial && stats.queriesRemaining !== 'Unlimited' && stats.queriesRemaining < 20 ? `
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <strong>⚠️ Running low on queries!</strong>
              <p style="margin: 5px 0 0 0;">You have ${stats.queriesRemaining} queries left this month. Upgrade to Pro for unlimited access!</p>
            </div>
          ` : ''}

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/dashboard" class="cta-button">
              Go to Dashboard →
            </a>
          </div>

          ${stats.isInTrial ? `
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #64748b;">Loving ErrorWise? <a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/pricing" style="color: #3b82f6;">Upgrade to Pro</a> for unlimited queries!</p>
            </div>
          ` : ''}
        </div>
        <div class="footer">
          <p>You're receiving this because you have an ErrorWise account.</p>
          <p><a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/settings" style="color: #94a3b8;">Manage email preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return email.sendEmail({
    to: user.email,
    subject: `📊 Your Weekly ErrorWise Summary - ${stats.queriesUsed} problems solved!`,
    html,
    text: `Hi ${user.username}! This week you solved ${stats.queriesUsed} problems with ErrorWise. ${stats.isInTrial ? `You have ${stats.daysLeftInTrial} days left in your free trial.` : `You have ${stats.queriesRemaining} queries remaining this month.`}`
  });
}

async function sendTrialEndingEmail(user) {
  const email = getEmailService();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; }
        .benefit { display: flex; align-items: center; margin: 10px 0; }
        .benefit-icon { font-size: 20px; margin-right: 10px; }
        .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">⏰ Your Free Trial Ends in 2 Days!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Don't lose your unlimited access, ${user.username}</p>
        </div>
        <div class="content">
          <p>You've solved <strong>${user.trialQueriesUsed || 0} problems</strong> during your trial! 🎉</p>
          
          <p>After your trial ends, you'll be limited to <strong>50 queries/month</strong> on the free plan.</p>

          <h3 style="margin-top: 30px;">Upgrade to Pro ($3/month) and keep:</h3>
          <div class="benefit"><span class="benefit-icon">✅</span> Unlimited error solutions</div>
          <div class="benefit"><span class="benefit-icon">✅</span> Advanced AI analysis</div>
          <div class="benefit"><span class="benefit-icon">✅</span> Fix suggestions & code examples</div>
          <div class="benefit"><span class="benefit-icon">✅</span> Complete history access</div>
          <div class="benefit"><span class="benefit-icon">✅</span> Email support</div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/pricing" class="cta-button">
              Upgrade to Pro - $3/month →
            </a>
          </div>

          <p style="text-align: center; margin-top: 20px; color: #64748b; font-size: 14px;">
            Or continue with 50 free queries/month - no action needed!
          </p>
        </div>
        <div class="footer">
          <p><a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/settings" style="color: #94a3b8;">Unsubscribe from these emails</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return email.sendEmail({
    to: user.email,
    subject: `⏰ Your ErrorWise trial ends in 2 days - Upgrade to keep unlimited access`,
    html,
    text: `Hi ${user.username}! Your ErrorWise free trial ends in 2 days. You've solved ${user.trialQueriesUsed || 0} problems! Upgrade to Pro ($3/month) to keep unlimited access, or continue with 50 free queries/month.`
  });
}

async function sendLimitApproachingEmail(user, stats) {
  const email = getEmailService();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
        .progress-bar { background: #e2e8f0; border-radius: 10px; height: 20px; overflow: hidden; margin: 20px 0; }
        .progress-fill { background: linear-gradient(90deg, #f59e0b 0%, #ef4444 100%); height: 100%; border-radius: 10px; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; }
        .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">⚠️ You're Running Low on Queries</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${stats.remaining} queries left this month</p>
        </div>
        <div class="content">
          <p>Hi ${user.username},</p>
          <p>You've used <strong>${stats.used} of ${stats.limit}</strong> free queries this month.</p>
          
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(100, (stats.used / stats.limit) * 100)}%"></div>
          </div>
          
          <p style="text-align: center; color: #64748b;">
            <strong>${stats.remaining}</strong> queries remaining
          </p>

          <p>Upgrade to Pro for <strong>unlimited queries</strong> at just $3/month!</p>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/pricing" class="cta-button">
              Get Unlimited Queries →
            </a>
          </div>
        </div>
        <div class="footer">
          <p><a href="${process.env.FRONTEND_URL || 'https://errorwise.tech'}/settings" style="color: #94a3b8;">Manage email preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  return email.sendEmail({
    to: user.email,
    subject: `⚠️ Only ${stats.remaining} queries left this month - Upgrade for unlimited`,
    html,
    text: `Hi ${user.username}! You've used ${stats.used} of ${stats.limit} free queries this month. Only ${stats.remaining} remaining. Upgrade to Pro ($3/month) for unlimited queries!`
  });
}

/**
 * Initialize all notification jobs
 */
function initializeNotificationJobs() {
  scheduleWeeklyDigest();
  scheduleTrialEndingWarning();
  scheduleLimitWarning();
  logger.info('[UsageNotification] All notification jobs initialized');
}

module.exports = {
  initializeNotificationJobs,
  scheduleWeeklyDigest,
  scheduleTrialEndingWarning,
  scheduleLimitWarning,
  // Export for manual testing
  sendWeeklyDigestEmail,
  sendTrialEndingEmail,
  sendLimitApproachingEmail
};
