/**
 * Weekly Digest Controller (F1)
 * 
 * Sends personalized weekly summary emails to users:
 * - # queries solved
 * - Top error categories
 * - Usage stats
 * 
 * Tracks: email open rate, clickthrough
 * 
 * @ticket F1 – Weekly Email Digest (MVP)
 * @epic EPIC F — Early Retention Hooks
 */

const User = require('../models/User');
const Event = require('../models/Event');
const ErrorQuery = require('../models/ErrorQuery');
const emailService = require('../utils/emailService');
const eventTracking = require('../services/eventTrackingService');
const { Op } = require('sequelize');
const crypto = require('crypto');

// Event constants for F1
const DIGEST_EVENTS = {
  DIGEST_SENT: 'weekly_digest_sent',
  DIGEST_OPENED: 'weekly_digest_opened',
  DIGEST_CLICKED: 'weekly_digest_clicked',
  DIGEST_UNSUBSCRIBED: 'weekly_digest_unsubscribed'
};

/**
 * Get user's weekly stats
 */
async function getUserWeeklyStats(userId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  try {
    // Get queries submitted this week
    const queriesSubmitted = await Event.count({
      where: {
        user_id: userId,
        event_name: 'query_submitted',
        timestamp: { [Op.gte]: weekAgo }
      }
    });
    
    // Get successful queries
    const queriesSuccess = await Event.count({
      where: {
        user_id: userId,
        event_name: 'query_success',
        timestamp: { [Op.gte]: weekAgo }
      }
    });
    
    // Get top categories from ErrorQuery
    const topCategories = await ErrorQuery.findAll({
      where: {
        userId,
        createdAt: { [Op.gte]: weekAgo }
      },
      attributes: [
        'errorCategory',
        [ErrorQuery.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['errorCategory'],
      order: [[ErrorQuery.sequelize.fn('COUNT', '*'), 'DESC']],
      limit: 3,
      raw: true
    });
    
    // Get thumbs up/down
    const [thumbsUp, thumbsDown] = await Promise.all([
      Event.count({
        where: {
          user_id: userId,
          event_name: 'thumbs_up',
          timestamp: { [Op.gte]: weekAgo }
        }
      }),
      Event.count({
        where: {
          user_id: userId,
          event_name: 'thumbs_down',
          timestamp: { [Op.gte]: weekAgo }
        }
      })
    ]);
    
    // Calculate time saved (estimate 15 mins per query)
    const minutesSaved = queriesSuccess * 15;
    
    return {
      queriesSubmitted,
      queriesSolved: queriesSuccess,
      topCategories: topCategories.map(c => ({
        name: c.errorCategory || 'General',
        count: parseInt(c.count)
      })),
      thumbsUp,
      thumbsDown,
      satisfactionRate: thumbsUp + thumbsDown > 0 
        ? Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100) 
        : null,
      timeSaved: {
        minutes: minutesSaved,
        hours: Math.round(minutesSaved / 60 * 10) / 10
      }
    };
  } catch (error) {
    console.error('Error getting weekly stats:', error);
    return {
      queriesSubmitted: 0,
      queriesSolved: 0,
      topCategories: [],
      thumbsUp: 0,
      thumbsDown: 0,
      satisfactionRate: null,
      timeSaved: { minutes: 0, hours: 0 }
    };
  }
}

/**
 * Generate digest email HTML
 */
function generateDigestHTML(user, stats, trackingPixel, unsubscribeUrl) {
  const safeName = user.username || 'Developer';
  const weekOf = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  // Category icons
  const categoryIcons = {
    'syntax': '📝',
    'runtime': '⚡',
    'TypeError': '🔤',
    'ReferenceError': '🔗',
    'Network': '🌐',
    'database': '🗄️',
    'api': '🔌',
    'General': '🐛'
  };
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 0 0 20px 20px;">
      <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 12px; border-radius: 12px; margin-bottom: 15px;">
        <span style="font-size: 28px;">📊</span>
      </div>
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">
        Your Weekly Digest
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">
        Week of ${weekOf}
      </p>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px; background-color: #1e293b; margin: 20px; border-radius: 16px;">
      
      <p style="color: #e2e8f0; font-size: 16px; margin: 0 0 25px 0;">
        Hi ${safeName}! 👋
      </p>
      
      <p style="color: #94a3b8; font-size: 15px; margin: 0 0 30px 0; line-height: 1.6;">
        Here's a summary of your debugging activity this week:
      </p>
      
      <!-- Stats Cards -->
      <div style="display: flex; gap: 15px; margin-bottom: 30px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(34, 211, 238, 0.05) 100%); border: 1px solid rgba(34, 211, 238, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
          <div style="color: #22d3ee; font-size: 32px; font-weight: bold;">${stats.queriesSolved}</div>
          <div style="color: #94a3b8; font-size: 13px;">Errors Solved</div>
        </div>
        
        <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
          <div style="color: #a855f7; font-size: 32px; font-weight: bold;">${stats.timeSaved.hours}h</div>
          <div style="color: #94a3b8; font-size: 13px;">Time Saved</div>
        </div>
        
        ${stats.satisfactionRate !== null ? `
        <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; padding: 20px; text-align: center;">
          <div style="color: #22c55e; font-size: 32px; font-weight: bold;">${stats.satisfactionRate}%</div>
          <div style="color: #94a3b8; font-size: 13px;">Helpful Rate</div>
        </div>
        ` : ''}
      </div>
      
      ${stats.topCategories.length > 0 ? `
      <!-- Top Categories -->
      <div style="margin-bottom: 30px;">
        <h2 style="color: #f1f5f9; font-size: 16px; margin: 0 0 15px 0;">
          🏷️ Your Top Error Categories
        </h2>
        
        ${stats.topCategories.map((cat, i) => `
          <div style="display: flex; align-items: center; padding: 12px; background-color: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px;">
            <span style="font-size: 20px; margin-right: 12px;">${categoryIcons[cat.name] || '🐛'}</span>
            <span style="color: #e2e8f0; flex: 1;">${cat.name}</span>
            <span style="color: #94a3b8; font-size: 14px;">${cat.count} ${cat.count === 1 ? 'error' : 'errors'}</span>
          </div>
        `).join('')}
      </div>
      ` : `
      <div style="text-align: center; padding: 20px; background-color: rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 30px;">
        <span style="font-size: 40px;">🎯</span>
        <p style="color: #94a3b8; margin: 10px 0 0 0;">No errors this week! You're on fire! 🔥</p>
      </div>
      `}
      
      <!-- Motivation / CTA -->
      <div style="background: linear-gradient(135deg, rgba(250, 204, 21, 0.1) 0%, rgba(251, 146, 60, 0.1) 100%); border: 1px solid rgba(250, 204, 21, 0.3); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 25px;">
        <p style="color: #fbbf24; font-size: 15px; margin: 0 0 10px 0; font-weight: bold;">
          💡 Keep the momentum going!
        </p>
        <p style="color: #94a3b8; font-size: 14px; margin: 0;">
          ${stats.queriesSolved > 5 
            ? 'Great week! You\'re becoming a debugging pro.'
            : 'Every error solved is a step forward. Keep learning!'}
        </p>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center;">
        <a href="https://errorwise.tech/dashboard?utm_source=digest&utm_medium=email&utm_campaign=weekly" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 30px; font-weight: 600; font-size: 16px;">
          View Full Dashboard →
        </a>
      </div>
      
    </div>
    
    <!-- Footer -->
    <div style="padding: 30px; text-align: center;">
      <p style="color: #475569; font-size: 12px; margin: 0 0 15px 0;">
        You're receiving this because you have usage email updates enabled.
      </p>
      
      <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline; font-size: 12px;">
        Unsubscribe from weekly digests
      </a>
      
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
        <p style="color: #475569; font-size: 11px; margin: 0;">
          © ${new Date().getFullYear()} ErrorWise. All rights reserved.
        </p>
      </div>
    </div>
    
    <!-- Tracking pixel for open rate -->
    ${trackingPixel ? `<img src="${trackingPixel}" width="1" height="1" style="display:none;" />` : ''}
    
  </div>
</body>
</html>
  `;
}

/**
 * Generate plain text version
 */
function generateDigestText(user, stats, unsubscribeUrl) {
  const safeName = user.username || 'Developer';
  const weekOf = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  let text = `
Hi ${safeName}!

📊 YOUR WEEKLY DIGEST - Week of ${weekOf}

STATS:
- Errors Solved: ${stats.queriesSolved}
- Time Saved: ${stats.timeSaved.hours} hours
${stats.satisfactionRate !== null ? `- Helpful Rate: ${stats.satisfactionRate}%` : ''}
`;

  if (stats.topCategories.length > 0) {
    text += `
TOP ERROR CATEGORIES:
${stats.topCategories.map(c => `- ${c.name}: ${c.count} errors`).join('\n')}
`;
  }

  text += `
${stats.queriesSolved > 5 
  ? 'Great week! You\'re becoming a debugging pro.'
  : 'Every error solved is a step forward. Keep learning!'}

View your full dashboard: https://errorwise.tech/dashboard

---
Unsubscribe from weekly digests: ${unsubscribeUrl}

© ${new Date().getFullYear()} ErrorWise. All rights reserved.
`;

  return text;
}

/**
 * Send weekly digest to a user
 */
async function sendWeeklyDigest(userId) {
  try {
    const user = await User.findByPk(userId);
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    // Check if user has digest enabled
    if (user.usageEmailsEnabled === false) {
      return { success: false, error: 'Digest disabled by user' };
    }
    
    // Get user's weekly stats
    const stats = await getUserWeeklyStats(userId);
    
    // Skip if no activity
    if (stats.queriesSubmitted === 0) {
      return { success: false, error: 'No activity this week' };
    }
    
    // Generate tracking token for open tracking
    const trackingToken = crypto.randomBytes(16).toString('hex');
    const trackingPixel = `https://errorwise.tech/api/digest/track/open/${trackingToken}`;
    
    // Generate unsubscribe URL
    const unsubToken = crypto.createHash('sha256').update(userId + 'digest-unsub').digest('hex').substring(0, 32);
    const unsubscribeUrl = `https://errorwise.tech/api/digest/unsubscribe/${unsubToken}`;
    
    // Generate email content
    const html = generateDigestHTML(user, stats, trackingPixel, unsubscribeUrl);
    const text = generateDigestText(user, stats, unsubscribeUrl);
    
    // Send email
    await emailService.sendEmail({
      to: user.email,
      subject: `📊 Your ErrorWise Weekly - ${stats.queriesSolved} errors solved!`,
      html,
      text
    });
    
    // Track digest sent event
    await eventTracking.trackEvent({
      eventName: DIGEST_EVENTS.DIGEST_SENT,
      userId,
      properties: {
        queriesSolved: stats.queriesSolved,
        timeSaved: stats.timeSaved.hours,
        trackingToken
      }
    });
    
    return { 
      success: true, 
      stats,
      trackingToken 
    };
    
  } catch (error) {
    console.error('Error sending weekly digest:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send weekly digests to all eligible users
 */
async function sendAllWeeklyDigests() {
  console.log('\n📊 Starting weekly digest send...');
  
  try {
    // Get users with digest enabled and activity this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Find users who submitted queries this week
    const activeUserIds = await Event.findAll({
      where: {
        event_name: 'query_submitted',
        timestamp: { [Op.gte]: weekAgo },
        user_id: { [Op.ne]: null }
      },
      attributes: ['user_id'],
      group: ['user_id'],
      raw: true
    });
    
    const userIds = [...new Set(activeUserIds.map(e => e.user_id))];
    
    console.log(`📧 Found ${userIds.length} active users`);
    
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const userId of userIds) {
      const result = await sendWeeklyDigest(userId);
      
      if (result.success) {
        sent++;
      } else if (result.error === 'Digest disabled by user' || result.error === 'No activity this week') {
        skipped++;
      } else {
        failed++;
      }
      
      // Rate limit: 100ms between emails
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`\n📊 Digest Summary:`);
    console.log(`   ✅ Sent: ${sent}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    return { sent, skipped, failed, total: userIds.length };
    
  } catch (error) {
    console.error('Error sending weekly digests:', error);
    return { sent: 0, skipped: 0, failed: 0, error: error.message };
  }
}

/**
 * Track email open via tracking pixel
 * GET /api/digest/track/open/:token
 */
async function trackOpen(req, res) {
  try {
    const { token } = req.params;
    
    // Find event with this tracking token
    const event = await Event.findOne({
      where: {
        event_name: DIGEST_EVENTS.DIGEST_SENT,
        [Op.and]: [
          Event.sequelize.where(
            Event.sequelize.literal("properties->>'trackingToken'"),
            token
          )
        ]
      }
    });
    
    if (event && event.user_id) {
      // Track open event
      await eventTracking.trackEvent({
        eventName: DIGEST_EVENTS.DIGEST_OPENED,
        userId: event.user_id,
        properties: { trackingToken: token }
      });
    }
    
    // Return 1x1 transparent GIF
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(pixel);
    
  } catch (error) {
    // Return pixel anyway
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.send(pixel);
  }
}

/**
 * Track link click
 * GET /api/digest/track/click
 */
async function trackClick(req, res) {
  try {
    const { token, url } = req.query;
    
    if (token) {
      // Find original event
      const event = await Event.findOne({
        where: {
          event_name: DIGEST_EVENTS.DIGEST_SENT,
          [Op.and]: [
            Event.sequelize.where(
              Event.sequelize.literal("properties->>'trackingToken'"),
              token
            )
          ]
        }
      });
      
      if (event && event.user_id) {
        await eventTracking.trackEvent({
          eventName: DIGEST_EVENTS.DIGEST_CLICKED,
          userId: event.user_id,
          properties: { 
            trackingToken: token,
            clickedUrl: url 
          }
        });
      }
    }
    
    // Redirect to actual URL
    res.redirect(url || 'https://errorwise.tech/dashboard');
    
  } catch (error) {
    res.redirect('https://errorwise.tech/dashboard');
  }
}

/**
 * Unsubscribe from digest
 * GET /api/digest/unsubscribe/:token
 */
async function unsubscribe(req, res) {
  try {
    const { token } = req.params;
    
    // Find user by hashed token
    const users = await User.findAll();
    
    for (const user of users) {
      const expectedToken = crypto.createHash('sha256').update(user.id + 'digest-unsub').digest('hex').substring(0, 32);
      
      if (expectedToken === token) {
        // Disable digest emails
        await user.update({ usageEmailsEnabled: false });
        
        // Track unsubscribe
        await eventTracking.trackEvent({
          eventName: DIGEST_EVENTS.DIGEST_UNSUBSCRIBED,
          userId: user.id
        });
        
        return res.send(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
              <h1>✅ Unsubscribed</h1>
              <p>You've been unsubscribed from weekly digests.</p>
              <p>You can re-enable them in your <a href="https://errorwise.tech/settings" style="color: #22d3ee;">settings</a>.</p>
            </body>
          </html>
        `);
      }
    }
    
    res.status(404).send('Invalid unsubscribe link');
    
  } catch (error) {
    res.status(500).send('Error processing unsubscribe');
  }
}

/**
 * Get digest analytics (admin)
 * GET /api/digest/analytics
 */
async function getDigestAnalytics(req, res) {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const period = req.query.period || 'month';
    const thresholds = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    
    const since = new Date(Date.now() - (thresholds[period] || thresholds.month));
    
    const [sent, opened, clicked, unsubscribed] = await Promise.all([
      Event.count({ where: { event_name: DIGEST_EVENTS.DIGEST_SENT, timestamp: { [Op.gte]: since } } }),
      Event.count({ where: { event_name: DIGEST_EVENTS.DIGEST_OPENED, timestamp: { [Op.gte]: since } } }),
      Event.count({ where: { event_name: DIGEST_EVENTS.DIGEST_CLICKED, timestamp: { [Op.gte]: since } } }),
      Event.count({ where: { event_name: DIGEST_EVENTS.DIGEST_UNSUBSCRIBED, timestamp: { [Op.gte]: since } } })
    ]);
    
    const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(2) + '%' : '0%';
    const clickRate = opened > 0 ? ((clicked / opened) * 100).toFixed(2) + '%' : '0%';
    const unsubRate = sent > 0 ? ((unsubscribed / sent) * 100).toFixed(2) + '%' : '0%';
    
    res.json({
      success: true,
      period,
      metrics: {
        sent,
        opened,
        clicked,
        unsubscribed,
        openRate,
        clickRate,
        unsubRate
      }
    });
    
  } catch (error) {
    console.error('Error getting digest analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
}

/**
 * Preview digest for a user (admin)
 * GET /api/digest/preview/:userId
 */
async function previewDigest(req, res) {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { userId } = req.params;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const stats = await getUserWeeklyStats(userId);
    const html = generateDigestHTML(user, stats, null, '#');
    
    res.send(html);
    
  } catch (error) {
    console.error('Error previewing digest:', error);
    res.status(500).json({ error: 'Failed to preview digest' });
  }
}

/**
 * Send test digest to self
 * POST /api/digest/send-test
 */
async function sendTestDigest(req, res) {
  try {
    const result = await sendWeeklyDigest(req.user.id);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Test digest sent!',
        stats: result.stats
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Error sending test digest:', error);
    res.status(500).json({ error: 'Failed to send test digest' });
  }
}

module.exports = {
  sendWeeklyDigest,
  sendAllWeeklyDigests,
  getUserWeeklyStats,
  trackOpen,
  trackClick,
  unsubscribe,
  getDigestAnalytics,
  previewDigest,
  sendTestDigest,
  DIGEST_EVENTS
};
