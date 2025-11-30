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
// EMAIL TEMPLATES - Matching ErrorWise OTP/Verification style
// ============================================================================

const EMAIL_STYLES = `
  body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 0;
    background-color: #f4f4f4;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 40px 30px;
    text-align: center;
    border-radius: 10px 10px 0 0;
  }
  .header h1 {
    margin: 0;
    font-size: 28px;
  }
  .header p {
    margin: 10px 0 0 0;
    opacity: 0.9;
    font-size: 16px;
  }
  .content {
    background: #ffffff;
    padding: 40px 30px;
    border-radius: 0 0 10px 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  .stats-box {
    background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
    border: 2px solid #667eea;
    border-radius: 12px;
    padding: 25px;
    text-align: center;
    margin: 25px 0;
  }
  .stat-number {
    font-size: 48px;
    font-weight: bold;
    color: #667eea;
    line-height: 1.2;
  }
  .stat-label {
    color: #666;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 5px;
  }
  .stats-row {
    display: table;
    width: 100%;
    margin: 20px 0;
  }
  .stats-col {
    display: table-cell;
    width: 50%;
    padding: 15px;
    text-align: center;
    background: #f9f9f9;
    border-radius: 8px;
  }
  .trial-badge {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #78350f;
    padding: 12px 24px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: bold;
    display: inline-block;
    margin: 15px 0;
  }
  .warning-badge {
    background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%);
    color: #991b1b;
    padding: 12px 24px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: bold;
    display: inline-block;
    margin: 15px 0;
  }
  .button {
    display: inline-block;
    padding: 16px 40px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white !important;
    text-decoration: none;
    border-radius: 8px;
    font-weight: bold;
    font-size: 16px;
    margin: 20px 0;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  }
  .button:hover {
    opacity: 0.9;
  }
  .button-secondary {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  }
  .progress-container {
    background: #e5e7eb;
    border-radius: 10px;
    height: 24px;
    overflow: hidden;
    margin: 20px 0;
  }
  .progress-bar {
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    height: 100%;
    border-radius: 10px;
    transition: width 0.3s ease;
  }
  .feature-list {
    text-align: left;
    margin: 20px 0;
  }
  .feature-item {
    padding: 10px 0;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
  }
  .feature-icon {
    font-size: 20px;
    margin-right: 12px;
  }
  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, #667eea, transparent);
    margin: 30px 0;
  }
  .footer {
    text-align: center;
    color: #999;
    font-size: 12px;
    margin-top: 30px;
    padding: 20px;
  }
  .footer a {
    color: #667eea;
    text-decoration: none;
  }
  .social-links {
    margin: 20px 0;
  }
  .social-links a {
    display: inline-block;
    margin: 0 10px;
    color: #667eea;
    text-decoration: none;
  }
`;

async function sendWeeklyDigestEmail(user, stats) {
  const email = getEmailService();
  const frontendUrl = process.env.FRONTEND_URL || 'https://errorwise.tech';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${EMAIL_STYLES}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Your Weekly Summary</h1>
          <p>Here's what you accomplished this week!</p>
        </div>
        <div class="content">
          <p style="font-size: 18px;">Hi <strong>${user.username}</strong>,</p>
          
          <p>Great job using ErrorWise this week! Here's a quick look at your progress:</p>
          
          ${stats.isInTrial ? `
            <div style="text-align: center;">
              <span class="trial-badge">🎉 ${stats.daysLeftInTrial} Days Left in Free Trial</span>
            </div>
          ` : ''}
          
          <div class="stats-box">
            <div class="stat-number">${stats.queriesUsed}</div>
            <div class="stat-label">Problems Solved This Month</div>
          </div>
          
          <table style="width: 100%; border-collapse: separate; border-spacing: 10px;">
            <tr>
              <td style="width: 50%; background: #f5f7fa; padding: 20px; border-radius: 8px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: ${stats.isInTrial ? '#10b981' : '#667eea'};">
                  ${stats.queriesRemaining}
                </div>
                <div style="color: #666; font-size: 12px; text-transform: uppercase;">Queries Left</div>
              </td>
              <td style="width: 50%; background: #f5f7fa; padding: 20px; border-radius: 8px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #764ba2;">
                  ${stats.monthlyLimit}
                </div>
                <div style="color: #666; font-size: 12px; text-transform: uppercase;">Monthly Limit</div>
              </td>
            </tr>
          </table>

          ${!stats.isInTrial && stats.queriesRemaining !== 'Unlimited' && stats.queriesRemaining < 20 ? `
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
              <strong style="color: #991b1b;">⚠️ Running Low!</strong>
              <p style="margin: 8px 0 0 0; color: #7f1d1d;">You have only ${stats.queriesRemaining} queries left. Upgrade to Pro for unlimited access!</p>
            </div>
          ` : ''}

          <div class="divider"></div>

          <div style="text-align: center;">
            <p style="color: #666; margin-bottom: 20px;">Ready to solve more problems?</p>
            <a href="${frontendUrl}/dashboard" class="button">
              Go to Dashboard →
            </a>
          </div>

          ${stats.isInTrial ? `
            <div class="divider"></div>
            <div style="text-align: center; background: #f5f3ff; padding: 25px; border-radius: 12px; margin-top: 20px;">
              <p style="margin: 0 0 15px 0; color: #5b21b6; font-weight: bold;">Loving ErrorWise?</p>
              <p style="margin: 0 0 20px 0; color: #666;">Upgrade now and keep unlimited access forever!</p>
              <a href="${frontendUrl}/pricing" class="button button-secondary">
                Upgrade to Pro - $3/month
              </a>
            </div>
          ` : ''}
          
          <p style="margin-top: 30px; color: #666;">Keep up the great work! 🚀</p>
          
          <p style="color: #666;">Best regards,<br><strong>The ErrorWise Team</strong></p>
        </div>
        <div class="footer">
          <div class="social-links">
            <a href="#">Twitter</a> • <a href="#">LinkedIn</a> • <a href="#">Blog</a>
          </div>
          <p>You're receiving this because you have an ErrorWise account.</p>
          <p><a href="${frontendUrl}/settings">Manage email preferences</a> • <a href="${frontendUrl}">Visit ErrorWise</a></p>
          <p>&copy; 2025 ErrorWise. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return email.sendEmail({
    to: user.email,
    subject: `📊 Weekly Summary: ${stats.queriesUsed} problems solved! - ErrorWise`,
    html,
    text: `Hi ${user.username}! This week you solved ${stats.queriesUsed} problems with ErrorWise. ${stats.isInTrial ? `You have ${stats.daysLeftInTrial} days left in your free trial.` : `You have ${stats.queriesRemaining} queries remaining this month.`}`
  });
}

async function sendTrialEndingEmail(user) {
  const email = getEmailService();
  const frontendUrl = process.env.FRONTEND_URL || 'https://errorwise.tech';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${EMAIL_STYLES}</style>
    </head>
    <body>
      <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%);">
          <h1>⏰ Trial Ending Soon!</h1>
          <p>Only 2 days left to enjoy unlimited access</p>
        </div>
        <div class="content">
          <p style="font-size: 18px;">Hi <strong>${user.username}</strong>,</p>
          
          <p>Your free trial is ending in <strong>2 days</strong>! We hope you've been enjoying ErrorWise.</p>
          
          <div class="stats-box" style="border-color: #f59e0b;">
            <div class="stat-number" style="color: #f59e0b;">${user.trialQueriesUsed || 0}</div>
            <div class="stat-label">Problems Solved During Trial 🎉</div>
          </div>
          
          <p>After your trial ends, you'll be on the <strong>Free Plan</strong> with 50 queries/month.</p>
          
          <div style="background: #fef3c7; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <p style="margin: 0; color: #92400e; font-weight: bold;">Want to keep unlimited access?</p>
            <p style="margin: 10px 0 0 0; color: #78350f;">Upgrade to Pro for just $3/month and never worry about limits!</p>
          </div>

          <div class="divider"></div>
          
          <h3 style="color: #667eea; margin-bottom: 20px;">✨ What you'll get with Pro:</h3>
          
          <div class="feature-list">
            <div class="feature-item">
              <span class="feature-icon">✅</span>
              <span><strong>Unlimited</strong> error solutions</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🤖</span>
              <span><strong>Advanced AI</strong> analysis with Claude</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">💡</span>
              <span><strong>Fix suggestions</strong> & code examples</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📚</span>
              <span><strong>Complete history</strong> access</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📧</span>
              <span><strong>Email support</strong> from our team</span>
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/pricing" class="button">
              Upgrade to Pro - $3/month →
            </a>
            <p style="margin-top: 15px; color: #999; font-size: 14px;">
              Or continue with 50 free queries/month - no action needed!
            </p>
          </div>
          
          <p style="color: #666;">Thanks for trying ErrorWise! 🙏</p>
          
          <p style="color: #666;">Best regards,<br><strong>The ErrorWise Team</strong></p>
        </div>
        <div class="footer">
          <p>You're receiving this because your ErrorWise trial is ending soon.</p>
          <p><a href="${frontendUrl}/settings">Manage email preferences</a></p>
          <p>&copy; 2025 ErrorWise. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return email.sendEmail({
    to: user.email,
    subject: `⏰ Your ErrorWise trial ends in 2 days - Keep unlimited access!`,
    html,
    text: `Hi ${user.username}! Your ErrorWise free trial ends in 2 days. You've solved ${user.trialQueriesUsed || 0} problems! Upgrade to Pro ($3/month) to keep unlimited access, or continue with 50 free queries/month.`
  });
}

async function sendLimitApproachingEmail(user, stats) {
  const email = getEmailService();
  const frontendUrl = process.env.FRONTEND_URL || 'https://errorwise.tech';
  const percentUsed = Math.round((stats.used / stats.limit) * 100);
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${EMAIL_STYLES}</style>
    </head>
    <body>
      <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
          <h1>⚠️ Running Low on Queries</h1>
          <p>You've used ${percentUsed}% of your monthly limit</p>
        </div>
        <div class="content">
          <p style="font-size: 18px;">Hi <strong>${user.username}</strong>,</p>
          
          <p>Heads up! You're running low on queries this month.</p>
          
          <div class="stats-box" style="border-color: #f97316;">
            <div style="display: flex; justify-content: space-around; flex-wrap: wrap;">
              <div style="padding: 10px 20px;">
                <div style="font-size: 36px; font-weight: bold; color: #f97316;">${stats.used}</div>
                <div style="color: #666; font-size: 12px;">USED</div>
              </div>
              <div style="padding: 10px 20px;">
                <div style="font-size: 36px; font-weight: bold; color: #dc2626;">${stats.remaining}</div>
                <div style="color: #666; font-size: 12px;">REMAINING</div>
              </div>
              <div style="padding: 10px 20px;">
                <div style="font-size: 36px; font-weight: bold; color: #667eea;">${stats.limit}</div>
                <div style="color: #666; font-size: 12px;">LIMIT</div>
              </div>
            </div>
          </div>
          
          <div class="progress-container">
            <div class="progress-bar" style="width: ${percentUsed}%; background: linear-gradient(90deg, #f97316 0%, #dc2626 100%);"></div>
          </div>
          <p style="text-align: center; color: #666; margin-top: -10px;">
            <strong>${stats.remaining}</strong> queries remaining this month
          </p>

          <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
            <strong style="color: #c2410c;">Don't get stuck mid-debug!</strong>
            <p style="margin: 8px 0 0 0; color: #9a3412;">Upgrade to Pro and never worry about limits again.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/pricing" class="button button-secondary">
              Get Unlimited Queries →
            </a>
            <p style="margin-top: 15px; color: #667eea; font-weight: bold;">
              Just $3/month for unlimited access!
            </p>
          </div>
          
          <p style="color: #666;">Keep debugging! 🐛</p>
          
          <p style="color: #666;">Best regards,<br><strong>The ErrorWise Team</strong></p>
        </div>
        <div class="footer">
          <p>You're receiving this because you're approaching your monthly limit.</p>
          <p><a href="${frontendUrl}/settings">Manage email preferences</a></p>
          <p>&copy; 2025 ErrorWise. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return email.sendEmail({
    to: user.email,
    subject: `⚠️ Only ${stats.remaining} queries left this month - ErrorWise`,
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
