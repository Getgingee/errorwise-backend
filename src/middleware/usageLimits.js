const { Op } = require('sequelize');

/**
 * Middleware to check user's daily query limits based on subscription tier
 * Free tier: 3 queries per day
 * Pro/Team tiers: Unlimited queries
 */
const checkUsageLimits = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Import models inside function to avoid circular dependency
    const User = require('../models/User');
    const Subscription = require('../models/Subscription');
    const ErrorQuery = require('../models/ErrorQuery');

    // Get user's subscription details
    const user = await User.findByPk(userId, {
      include: [{
        model: Subscription,
        attributes: ['tier', 'status', 'endDate']
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine user's subscription tier
    let tier = 'free';
    if (user.Subscription && user.Subscription.status === 'active') {
      // Check if subscription hasn't expired
      const now = new Date();
      const endDate = new Date(user.Subscription.endDate);
      
      if (endDate > now) {
        tier = user.Subscription.tier;
      }
    }

    // If user has pro or team tier, allow unlimited queries
    if (tier === 'pro' || tier === 'team') {
      req.userTier = tier;
      req.hasUnlimitedQueries = true;
      return next();
    }

    // For free tier, check daily limits
    if (tier === 'free') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Count queries used today
      const queriesUsedToday = await ErrorQuery.count({
        where: {
          userId: userId,
          createdAt: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          }
        }
      });

      const dailyLimit = 3; // Free tier limit
      const remainingQueries = dailyLimit - queriesUsedToday;

      // Add usage info to request for response
      req.userTier = tier;
      req.hasUnlimitedQueries = false;
      req.dailyUsage = {
        used: queriesUsedToday,
        limit: dailyLimit,
        remaining: remainingQueries,
        resetTime: tomorrow.toISOString()
      };

      // Check if user has exceeded daily limit
      if (queriesUsedToday >= dailyLimit) {
        return res.status(429).json({
          error: 'Daily query limit exceeded',
          message: `You've reached your daily limit of ${dailyLimit} error queries. Upgrade to Pro plan for unlimited queries!`,
          usage: {
            used: queriesUsedToday,
            limit: dailyLimit,
            remaining: 0,
            resetTime: tomorrow.toISOString()
          },
          upgrade: {
            message: 'Upgrade to Pro Plan for unlimited queries',
            proPlan: {
              price: '$2/month',
              features: ['Unlimited queries', 'Detailed solutions', 'Complete history', '7-day free trial']
            },
            upgradeUrl: `${process.env.FRONTEND_URL}/pricing`
          }
        });
      }

      return next();
    }

    // Default case (shouldn't reach here)
    req.userTier = 'free';
    req.hasUnlimitedQueries = false;
    return next();

  } catch (error) {
    console.error('Usage limits check failed:', error);
    res.status(500).json({ error: 'Failed to check usage limits' });
  }
};

/**
 * Middleware to add usage information to successful responses
 */
const addUsageInfo = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to add usage info
  res.json = function(data) {
    // Add usage information to response
    if (req.userTier && typeof data === 'object' && data !== null) {
      data.usage = {
        tier: req.userTier,
        unlimited: req.hasUnlimitedQueries || false
      };

      // Add detailed usage for free tier
      if (req.dailyUsage) {
        data.usage.daily = req.dailyUsage;
      }

      // Add upgrade suggestion for free users near limit
      if (req.userTier === 'free' && req.dailyUsage && req.dailyUsage.remaining <= 1) {
        data.usage.suggestion = {
          message: 'You\'re almost at your daily limit! Upgrade to Pro for unlimited queries.',
          upgradeUrl: `${process.env.FRONTEND_URL}/pricing`
        };
      }
    }

    // Call original json method
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Get user's current usage statistics
 */
const getUserUsageStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Import models inside function to avoid circular dependency
    const User = require('../models/User');
    const Subscription = require('../models/Subscription');
    const ErrorQuery = require('../models/ErrorQuery');

    // Get user's subscription
    const user = await User.findByPk(userId, {
      include: [{
        model: Subscription,
        attributes: ['tier', 'status', 'endDate', 'startDate']
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine current tier
    let tier = 'free';
    let subscription = null;
    
    if (user.Subscription && user.Subscription.status === 'active') {
      const now = new Date();
      const endDate = new Date(user.Subscription.endDate);
      
      if (endDate > now) {
        tier = user.Subscription.tier;
        subscription = user.Subscription;
      }
    }

    // Get usage statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // This week
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());

    // This month
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [dailyQueries, weeklyQueries, monthlyQueries, totalQueries] = await Promise.all([
      ErrorQuery.count({
        where: {
          userId,
          createdAt: { [Op.gte]: today, [Op.lt]: tomorrow }
        }
      }),
      ErrorQuery.count({
        where: {
          userId,
          createdAt: { [Op.gte]: thisWeekStart }
        }
      }),
      ErrorQuery.count({
        where: {
          userId,
          createdAt: { [Op.gte]: thisMonthStart }
        }
      }),
      ErrorQuery.count({ where: { userId } })
    ]);

    const response = {
      tier,
      subscription: subscription ? {
        tier: subscription.tier,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate
      } : null,
      usage: {
        daily: {
          used: dailyQueries,
          limit: tier === 'free' ? 3 : -1, // -1 means unlimited
          remaining: tier === 'free' ? Math.max(0, 3 - dailyQueries) : -1
        },
        weekly: weeklyQueries,
        monthly: monthlyQueries,
        total: totalQueries
      },
      features: getFeaturesByTier(tier)
    };

    // Add reset time for free tier
    if (tier === 'free') {
      response.usage.daily.resetTime = tomorrow.toISOString();
    }

    res.json(response);

  } catch (error) {
    console.error('Failed to get usage stats:', error);
    res.status(500).json({ error: 'Failed to get usage statistics' });
  }
};

// Helper function to get features by tier
function getFeaturesByTier(tier) {
  const features = {
    free: {
      dailyQueries: 3,
      errorExplanation: true,
      fixSuggestions: false,
      documentationLinks: false,
      errorHistory: false,
      teamFeatures: false,
      supportLevel: 'community'
    },
    pro: {
      dailyQueries: 'unlimited',
      errorExplanation: true,
      fixSuggestions: true,
      documentationLinks: true,
      errorHistory: true,
      teamFeatures: false,
      supportLevel: 'email',
      advancedAnalysis: true
    },
    team: {
      dailyQueries: 'unlimited',
      errorExplanation: true,
      fixSuggestions: true,
      documentationLinks: true,
      errorHistory: true,
      teamFeatures: true,
      sharedHistory: true,
      teamDashboard: true,
      supportLevel: 'priority',
      advancedAnalysis: true,
      teamCollaboration: true
    }
  };

  return features[tier] || features.free;
}

module.exports = {
  checkUsageLimits,
  addUsageInfo,
  getUserUsageStats
};