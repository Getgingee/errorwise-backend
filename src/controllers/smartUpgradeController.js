/**
 * Smart Upgrade Prompts Controller (E1)
 * 
 * Triggers upgrade banners based on:
 * - 3 successful queries
 * - Very high-confidence answer
 * - Follow-up attempt (locked for Pro)
 * 
 * Tracks: smart_upgrade_shown, smart_upgrade_clicked
 * 
 * @ticket E1 – Smart Upgrade Prompts
 * @epic EPIC E — Conversion Optimisation
 */

const User = require('../models/User');
const Event = require('../models/Event');
const eventTracking = require('../services/eventTrackingService');
const { Op } = require('sequelize');

// Smart upgrade trigger conditions
const TRIGGER_CONDITIONS = {
  QUERY_MILESTONE: 3,       // Show after N successful queries
  HIGH_CONFIDENCE: 0.85,    // Confidence threshold
  FOLLOW_UP_LOCKED: true    // Follow-ups locked for free tier
};

// Event constants for E1
const SMART_EVENTS = {
  SMART_UPGRADE_SHOWN: 'smart_upgrade_shown',
  SMART_UPGRADE_CLICKED: 'smart_upgrade_clicked',
  SMART_UPGRADE_DISMISSED: 'smart_upgrade_dismissed'
};

/**
 * Check if smart upgrade should be shown
 * GET /api/smart-upgrade/check
 * 
 * Returns trigger info based on user's activity and context
 */
async function checkSmartUpgrade(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { context } = req.query; // 'after_query', 'high_confidence', 'follow_up'
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Skip for paid users
    if (user.subscriptionTier !== 'free') {
      return res.json({
        shouldShow: false,
        reason: 'User is on paid plan'
      });
    }
    
    // Check if already shown today (rate limit)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const shownToday = await Event.count({
      where: {
        user_id: userId,
        event_name: SMART_EVENTS.SMART_UPGRADE_SHOWN,
        timestamp: { [Op.gte]: today }
      }
    });
    
    // Max 3 smart prompts per day to avoid annoyance
    if (shownToday >= 3) {
      return res.json({
        shouldShow: false,
        reason: 'Daily limit reached',
        shownToday
      });
    }
    
    // Get user's successful query count today
    const successfulQueries = await Event.count({
      where: {
        user_id: userId,
        event_name: 'query_success',
        timestamp: { [Op.gte]: today }
      }
    });
    
    // Determine which triggers apply
    const triggers = [];
    let shouldShow = false;
    let promptType = null;
    let promptMessage = null;
    
    // Trigger 1: After N successful queries
    if (successfulQueries >= TRIGGER_CONDITIONS.QUERY_MILESTONE && 
        successfulQueries % TRIGGER_CONDITIONS.QUERY_MILESTONE === 0) {
      triggers.push('query_milestone');
      shouldShow = true;
      promptType = 'milestone';
      promptMessage = `🎉 You've solved ${successfulQueries} errors today! Upgrade to Pro for unlimited queries.`;
    }
    
    // Trigger 2: High confidence answer (passed via context)
    if (context === 'high_confidence') {
      triggers.push('high_confidence');
      shouldShow = true;
      promptType = 'high_confidence';
      promptMessage = '✨ That was a high-quality solution! Pro users get even better AI models.';
    }
    
    // Trigger 3: Follow-up locked
    if (context === 'follow_up') {
      triggers.push('follow_up_locked');
      shouldShow = true;
      promptType = 'follow_up';
      promptMessage = '🔒 Follow-up questions are a Pro feature. Upgrade to dig deeper!';
    }
    
    // Check usage percentage
    const usagePercent = (user.queriesUsedThisPeriod / 50) * 100;
    if (usagePercent >= 60 && usagePercent < 80) {
      triggers.push('usage_warning');
      if (!shouldShow) {
        shouldShow = true;
        promptType = 'usage_warning';
        promptMessage = `⚡ You've used ${Math.round(usagePercent)}% of your free queries. Upgrade for unlimited!`;
      }
    }
    
    res.json({
      shouldShow,
      promptType,
      promptMessage,
      triggers,
      userData: {
        queriesUsed: user.queriesUsedThisPeriod,
        queryLimit: 50,
        successfulQueriestoday: successfulQueries,
        shownToday
      },
      cta: {
        text: 'Upgrade to Pro - $3/month',
        url: '/upgrade'
      }
    });
    
  } catch (error) {
    console.error('Error checking smart upgrade:', error);
    res.status(500).json({ error: 'Failed to check smart upgrade' });
  }
}

/**
 * Track smart upgrade banner shown
 * POST /api/smart-upgrade/shown
 */
async function trackSmartUpgradeShown(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { promptType, triggers, page } = req.body;
    
    await eventTracking.trackEvent({
      eventName: SMART_EVENTS.SMART_UPGRADE_SHOWN,
      userId,
      properties: {
        promptType,
        triggers: triggers || [],
        page: page || 'unknown'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id'],
      page
    });
    
    res.json({
      success: true,
      message: 'Smart upgrade shown tracked'
    });
    
  } catch (error) {
    console.error('Error tracking smart upgrade shown:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Track smart upgrade banner clicked
 * POST /api/smart-upgrade/clicked
 */
async function trackSmartUpgradeClicked(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { promptType, triggers, page } = req.body;
    
    await eventTracking.trackEvent({
      eventName: SMART_EVENTS.SMART_UPGRADE_CLICKED,
      userId,
      properties: {
        promptType,
        triggers: triggers || [],
        page: page || 'unknown'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id'],
      page
    });
    
    // Also track as regular upgrade click for funnel
    await eventTracking.trackUpgradeClicked(userId, {
      source: `smart_upgrade_${promptType}`,
      currentTier: 'free',
      targetTier: 'pro'
    }, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });
    
    res.json({
      success: true,
      message: 'Smart upgrade clicked tracked'
    });
    
  } catch (error) {
    console.error('Error tracking smart upgrade clicked:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Track smart upgrade banner dismissed
 * POST /api/smart-upgrade/dismissed
 */
async function trackSmartUpgradeDismissed(req, res) {
  try {
    const userId = req.user.id || req.user.userId;
    const { promptType, reason } = req.body;
    
    await eventTracking.trackEvent({
      eventName: SMART_EVENTS.SMART_UPGRADE_DISMISSED,
      userId,
      properties: {
        promptType,
        reason: reason || 'no_reason'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });
    
    res.json({
      success: true,
      message: 'Smart upgrade dismissed tracked'
    });
    
  } catch (error) {
    console.error('Error tracking smart upgrade dismissed:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Get smart upgrade analytics (admin)
 * GET /api/smart-upgrade/analytics
 */
async function getSmartUpgradeAnalytics(req, res) {
  try {
    // Admin only
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const period = req.query.period || 'week';
    const thresholds = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    
    const since = new Date(Date.now() - (thresholds[period] || thresholds.week));
    
    // Get counts for each smart upgrade event
    const [shown, clicked, dismissed] = await Promise.all([
      Event.count({
        where: {
          event_name: SMART_EVENTS.SMART_UPGRADE_SHOWN,
          timestamp: { [Op.gte]: since }
        }
      }),
      Event.count({
        where: {
          event_name: SMART_EVENTS.SMART_UPGRADE_CLICKED,
          timestamp: { [Op.gte]: since }
        }
      }),
      Event.count({
        where: {
          event_name: SMART_EVENTS.SMART_UPGRADE_DISMISSED,
          timestamp: { [Op.gte]: since }
        }
      })
    ]);
    
    // Get breakdown by prompt type
    const shownByType = await Event.findAll({
      where: {
        event_name: SMART_EVENTS.SMART_UPGRADE_SHOWN,
        timestamp: { [Op.gte]: since }
      },
      attributes: [
        [Event.sequelize.literal("properties->>'promptType'"), 'promptType'],
        [Event.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [Event.sequelize.literal("properties->>'promptType'")],
      raw: true
    });
    
    const clickedByType = await Event.findAll({
      where: {
        event_name: SMART_EVENTS.SMART_UPGRADE_CLICKED,
        timestamp: { [Op.gte]: since }
      },
      attributes: [
        [Event.sequelize.literal("properties->>'promptType'"), 'promptType'],
        [Event.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [Event.sequelize.literal("properties->>'promptType'")],
      raw: true
    });
    
    // Calculate conversion rates
    const clickRate = shown > 0 ? ((clicked / shown) * 100).toFixed(2) + '%' : '0%';
    const dismissRate = shown > 0 ? ((dismissed / shown) * 100).toFixed(2) + '%' : '0%';
    
    res.json({
      success: true,
      period,
      since: since.toISOString(),
      metrics: {
        shown,
        clicked,
        dismissed,
        clickRate,
        dismissRate
      },
      byPromptType: {
        shown: shownByType.reduce((acc, r) => { acc[r.promptType] = parseInt(r.count); return acc; }, {}),
        clicked: clickedByType.reduce((acc, r) => { acc[r.promptType] = parseInt(r.count); return acc; }, {})
      }
    });
    
  } catch (error) {
    console.error('Error getting smart upgrade analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
}

module.exports = {
  checkSmartUpgrade,
  trackSmartUpgradeShown,
  trackSmartUpgradeClicked,
  trackSmartUpgradeDismissed,
  getSmartUpgradeAnalytics,
  SMART_EVENTS,
  TRIGGER_CONDITIONS
};
