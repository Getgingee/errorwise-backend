/**
 * Usage Controller (C3)
 * 
 * Provides usage meter data and limit enforcement for the frontend.
 * Tracks usage against plan limits and triggers events for analytics.
 * 
 * @ticket C3 – Add usage meter and limit banners
 * @epic EPIC C — Plans Limits & Upgrade Path (MVP)
 */

const User = require('../models/User');
const eventTracking = require('../services/eventTrackingService');
const { Op } = require('sequelize');

// Plan limits configuration
const PLAN_LIMITS = {
  free: {
    monthlyQueries: 50,
    dailyQueries: -1, // unlimited
    features: ['basic_ai', 'history_7days']
  },
  pro: {
    monthlyQueries: -1, // unlimited
    dailyQueries: -1,
    features: ['basic_ai', 'advanced_ai', 'history_unlimited', 'priority_support']
  },
  team: {
    monthlyQueries: -1, // unlimited
    dailyQueries: -1,
    teamMembers: 10,
    features: ['basic_ai', 'advanced_ai', 'history_unlimited', 'priority_support', 'team_features']
  }
};

// Warning thresholds
const WARNING_THRESHOLD = 0.8; // 80%
const CRITICAL_THRESHOLD = 1.0; // 100%

/**
 * Get usage stats for a user
 * GET /api/usage/stats
 */
async function getUsageStats(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscriptionTier || 'free';
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;
    
    // Get current period usage
    const queriesUsed = user.queriesUsedThisPeriod || 0;
    const periodStartDate = user.periodStartDate || user.createdAt;
    
    // Calculate period end (monthly reset)
    const periodStart = new Date(periodStartDate);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    
    // Calculate usage percentage
    const monthlyLimit = limits.monthlyQueries;
    const isUnlimited = monthlyLimit === -1;
    const percentUsed = isUnlimited ? 0 : Math.min((queriesUsed / monthlyLimit) * 100, 100);
    const remaining = isUnlimited ? -1 : Math.max(monthlyLimit - queriesUsed, 0);
    
    // Check thresholds
    const isWarning = !isUnlimited && percentUsed >= (WARNING_THRESHOLD * 100);
    const isLimitReached = !isUnlimited && percentUsed >= (CRITICAL_THRESHOLD * 100);
    
    // Calculate days until reset
    const now = new Date();
    const daysUntilReset = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
    
    res.json({
      success: true,
      usage: {
        queriesUsed,
        monthlyLimit: isUnlimited ? 'unlimited' : monthlyLimit,
        remaining: isUnlimited ? 'unlimited' : remaining,
        percentUsed: isUnlimited ? 0 : Math.round(percentUsed),
        isUnlimited,
        isWarning,
        isLimitReached
      },
      period: {
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
        daysUntilReset: Math.max(daysUntilReset, 0)
      },
      plan: {
        tier,
        features: limits.features
      }
    });
    
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Failed to fetch usage stats' });
  }
}

/**
 * Check if user can make a query (called before each query)
 * GET /api/usage/can-query
 */
async function canQuery(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscriptionTier || 'free';
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;
    
    const queriesUsed = user.queriesUsedThisPeriod || 0;
    const monthlyLimit = limits.monthlyQueries;
    const isUnlimited = monthlyLimit === -1;
    
    // Check if within limits
    const canProceed = isUnlimited || queriesUsed < monthlyLimit;
    
    // Calculate how many queries remaining
    const remaining = isUnlimited ? -1 : Math.max(monthlyLimit - queriesUsed, 0);
    
    res.json({
      success: true,
      canQuery: canProceed,
      remaining: isUnlimited ? 'unlimited' : remaining,
      reason: canProceed ? null : 'Monthly query limit reached'
    });
    
  } catch (error) {
    console.error('Error checking query allowance:', error);
    res.status(500).json({ error: 'Failed to check query allowance' });
  }
}

/**
 * Increment usage counter (called after successful query)
 * POST /api/usage/increment
 */
async function incrementUsage(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscriptionTier || 'free';
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;
    
    // Check if period needs reset (monthly)
    let periodStartDate = user.periodStartDate;
    if (!periodStartDate) {
      periodStartDate = new Date();
      await user.update({ periodStartDate });
    }
    
    const periodStart = new Date(periodStartDate);
    const now = new Date();
    const monthsSinceStart = (now.getFullYear() - periodStart.getFullYear()) * 12 + 
                             (now.getMonth() - periodStart.getMonth());
    
    if (monthsSinceStart > 0) {
      // Reset counter for new period
      await user.update({
        queriesUsedThisPeriod: 1,
        periodStartDate: new Date()
      });
    } else {
      // Increment counter
      await user.increment('queriesUsedThisPeriod');
    }
    
    // Reload to get updated count
    await user.reload();
    
    const queriesUsed = user.queriesUsedThisPeriod;
    const monthlyLimit = limits.monthlyQueries;
    const isUnlimited = monthlyLimit === -1;
    const percentUsed = isUnlimited ? 0 : (queriesUsed / monthlyLimit) * 100;
    
    // Check if thresholds crossed and track events
    const context = {
      subscriptionTier: tier,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    };
    
    // Track 80% threshold (only once)
    if (!isUnlimited && percentUsed >= 80 && percentUsed < 82 && !user.limitWarningNotified) {
      await eventTracking.trackLimit80Percent(userId, {
        currentUsage: queriesUsed,
        limit: monthlyLimit,
        percentUsed: Math.round(percentUsed)
      }, context);
      
      await user.update({ limitWarningNotified: true });
    }
    
    // Track 100% limit reached
    if (!isUnlimited && queriesUsed >= monthlyLimit) {
      await eventTracking.trackLimitReached(userId, {
        currentUsage: queriesUsed,
        limit: monthlyLimit
      }, context);
    }
    
    res.json({
      success: true,
      queriesUsed,
      monthlyLimit: isUnlimited ? 'unlimited' : monthlyLimit,
      remaining: isUnlimited ? 'unlimited' : Math.max(monthlyLimit - queriesUsed, 0),
      percentUsed: isUnlimited ? 0 : Math.round(percentUsed),
      isWarning: !isUnlimited && percentUsed >= 80,
      isLimitReached: !isUnlimited && queriesUsed >= monthlyLimit
    });
    
  } catch (error) {
    console.error('Error incrementing usage:', error);
    res.status(500).json({ error: 'Failed to increment usage' });
  }
}

/**
 * Record that 80% warning banner was shown (to avoid spam)
 * POST /api/usage/warning-shown
 */
async function recordWarningShown(req, res) {
  try {
    const userId = req.user.id;
    const { warningType } = req.body; // '80_percent' or 'limit_reached'
    
    // Track event
    await eventTracking.trackEvent({
      eventName: eventTracking.EVENTS.USAGE_WARNING_SHOWN,
      userId,
      subscriptionTier: req.user.subscriptionTier,
      properties: {
        warningType
      },
      sessionId: req.headers['x-session-id'],
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error recording warning shown:', error);
    res.status(500).json({ error: 'Failed to record warning' });
  }
}

/**
 * Get usage summary for display widget
 * GET /api/usage/widget
 */
async function getUsageWidget(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscriptionTier || 'free';
    const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;
    
    const queriesUsed = user.queriesUsedThisPeriod || 0;
    const monthlyLimit = limits.monthlyQueries;
    const isUnlimited = monthlyLimit === -1;
    const percentUsed = isUnlimited ? 0 : Math.min((queriesUsed / monthlyLimit) * 100, 100);
    
    // Generate display text
    let displayText;
    let status; // 'normal', 'warning', 'critical'
    
    if (isUnlimited) {
      displayText = `${queriesUsed} queries this month`;
      status = 'normal';
    } else if (queriesUsed >= monthlyLimit) {
      displayText = `${queriesUsed}/${monthlyLimit} queries used (Limit reached)`;
      status = 'critical';
    } else if (percentUsed >= 80) {
      displayText = `${queriesUsed}/${monthlyLimit} queries used`;
      status = 'warning';
    } else {
      displayText = `${queriesUsed}/${monthlyLimit} queries used`;
      status = 'normal';
    }
    
    // Upgrade CTA based on status
    let upgradeCta = null;
    if (tier === 'free' && (status === 'warning' || status === 'critical')) {
      upgradeCta = {
        show: true,
        text: status === 'critical' 
          ? 'Upgrade to Pro for unlimited queries!' 
          : 'Running low? Upgrade to Pro for unlimited queries',
        urgency: status
      };
    }
    
    res.json({
      success: true,
      widget: {
        displayText,
        status,
        queriesUsed,
        monthlyLimit: isUnlimited ? null : monthlyLimit,
        percentUsed: Math.round(percentUsed),
        tier,
        upgradeCta
      }
    });
    
  } catch (error) {
    console.error('Error fetching usage widget:', error);
    res.status(500).json({ error: 'Failed to fetch usage widget' });
  }
}

module.exports = {
  getUsageStats,
  canQuery,
  incrementUsage,
  recordWarningShown,
  getUsageWidget,
  PLAN_LIMITS
};
