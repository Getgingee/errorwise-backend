/**
 * Subscription Middleware
 * Handles tier-based feature access control and usage limits
 */

const User = require('../models/User');
const ErrorQuery = require('../models/ErrorQuery');
const { Op } = require('sequelize');

// Subscription tier configuration - matches pricing page exactly
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free Plan',
    price: 0,
    dailyQueries: -1, // No daily limit
    monthlyQueries: 50, // 50 queries per month
    historyDays: 7, // 7-day error history
    aiModel: 'gemini-2.0-flash-exp',
    maxTokens: 800,
    features: {
      // Basic features
      errorExplanation: true,
      basicErrorExplanations: true,
      
      // Disabled features (Pro/Team only)
      fixSuggestions: false,
      fullErrorExplanations: false,
      codeExamples: false,
      preventionTips: false,
      advancedAnalysis: false,
      unlimitedHistory: false,
      exportToJSON: false,
      exportToCSV: false,
      urlScrapingContext: false,
      multiLanguageSupport: false,
      emailSupport: false,
      
      // Team features (disabled)
      teamFeatures: false,
      sharedErrorHistory: false,
      teamDashboard: false,
      teamAnalytics: false,
      advancedDebuggingTools: false,
      prioritySupport: false,
      apiAccess: false,
      customIntegrations: false
    },
    support: 'community'
  },
  pro: {
    name: 'Pro Plan',
    price: 3,
    interval: 'month',
    dailyQueries: -1, // unlimited
    monthlyQueries: -1, // unlimited
    historyDays: -1, // unlimited error history
    aiModel: 'claude-3-5-haiku-20241022',
    maxTokens: 1200,
    features: {
      // All Free features
      errorExplanation: true,
      basicErrorExplanations: true,
      
      // Pro features enabled
      unlimitedQueries: true,
      fullErrorExplanations: true,
      fixSuggestions: true,
      codeExamples: true,
      preventionTips: true,
      advancedAnalysis: true,
      unlimitedHistory: true,
      exportToJSON: true,
      exportToCSV: true,
      urlScrapingContext: true,
      multiLanguageSupport: true,
      emailSupport: true,
      
      // Team features (disabled)
      teamFeatures: false,
      sharedErrorHistory: false,
      teamDashboard: false,
      teamAnalytics: false,
      teamMembers: false,
      advancedDebuggingTools: false,
      prioritySupport: false,
      apiAccess: false,
      customIntegrations: false
    },
    support: 'email'
  },
  team: {
    name: 'Team Plan',
    price: 8,
    interval: 'month',
    dailyQueries: -1, // unlimited
    monthlyQueries: -1, // unlimited
    historyDays: -1, // unlimited error history
    aiModel: 'claude-3-5-sonnet-20241022',
    maxTokens: 2000,
    maxTeamMembers: 10,
    features: {
      // All Pro features
      errorExplanation: true,
      basicErrorExplanations: true,
      unlimitedQueries: true,
      fullErrorExplanations: true,
      fixSuggestions: true,
      codeExamples: true,
      preventionTips: true,
      advancedAnalysis: true,
      unlimitedHistory: true,
      exportToJSON: true,
      exportToCSV: true,
      urlScrapingContext: true,
      multiLanguageSupport: true,
      
      // Team features enabled
      teamFeatures: true,
      everythingInPro: true,
      sharedErrorHistory: true,
      teamDashboard: true,
      teamAnalytics: true,
      teamMembers: true,
      collaborativeFeatures: true,
      advancedDebuggingTools: true,
      prioritySupport: true,
      apiAccess: true,
      customIntegrations: true
    },
    support: 'priority'
  }
};

/**
 * Check if user has reached their query limit
 */
async function checkQueryLimit(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Get user subscription info
    const user = await User.findByPk(userId, {
      attributes: ['id', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndDate']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tier = user.subscriptionTier || 'free';
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    // Check if subscription is expired
    const now = new Date();
    if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) < now && tier !== 'free') {
      // Auto-downgrade to free
      await user.update({
        subscriptionTier: 'free',
        subscriptionStatus: 'expired'
      });
      
      return res.status(403).json({
        error: 'Subscription expired',
        message: 'Your subscription has expired. You have been downgraded to the Free plan.',
        upgrade: true,
        currentTier: 'free'
      });
    }

    // Unlimited queries for pro and team
    if (tierConfig.monthlyQueries === -1) {
      req.subscriptionTier = tier;
      req.subscriptionFeatures = tierConfig.features;
      return next();
    }

    // Check monthly limit for free tier
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const monthlyUsed = await ErrorQuery.count({
      where: {
        userId,
        createdAt: {
          [Op.gte]: startOfMonth,
          [Op.lt]: endOfMonth
        }
      }
    });

    if (monthlyUsed >= tierConfig.monthlyQueries) {
      return res.status(429).json({
        error: 'Monthly query limit reached',
        message: `You have reached your monthly limit of ${tierConfig.monthlyQueries} queries. Upgrade to Pro for unlimited queries!`,
        upgrade: true,
        currentUsage: monthlyUsed,
        limit: tierConfig.monthlyQueries,
        resetTime: endOfMonth.toISOString()
      });
    }

    // Pass subscription info to next middleware/controller
    req.subscriptionTier = tier;
    req.subscriptionFeatures = tierConfig.features;
    req.queriesRemaining = tierConfig.monthlyQueries - monthlyUsed - 1; // -1 for current query

    next();

  } catch (error) {
    console.error('Query limit check failed:', error);
    res.status(500).json({ error: 'Failed to check query limit' });
  }
}

/**
 * Check if user has access to a specific feature
 */
function requireFeature(featureName) {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      
      const user = await User.findByPk(userId, {
        attributes: ['id', 'subscriptionTier', 'subscriptionStatus']
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const tier = user.subscriptionTier || 'free';
      const tierConfig = SUBSCRIPTION_TIERS[tier];

      // Check if feature is available in current tier
      if (!tierConfig.features[featureName]) {
        const requiredTier = getRequiredTierForFeature(featureName);
        
        return res.status(403).json({
          error: 'Feature not available',
          message: `This feature is only available in ${requiredTier} plan. Upgrade to access ${featureName}.`,
          upgrade: true,
          currentTier: tier,
          requiredTier,
          feature: featureName
        });
      }

      req.subscriptionTier = tier;
      req.subscriptionFeatures = tierConfig.features;
      next();

    } catch (error) {
      console.error('Feature access check failed:', error);
      res.status(500).json({ error: 'Failed to check feature access' });
    }
  };
}

/**
 * Check minimum subscription tier required
 */
function requireTier(minimumTier) {
  const tierHierarchy = { free: 0, pro: 1, team: 2 };

  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      
      const user = await User.findByPk(userId, {
        attributes: ['id', 'subscriptionTier', 'subscriptionStatus']
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentTier = user.subscriptionTier || 'free';
      
      if (tierHierarchy[currentTier] < tierHierarchy[minimumTier]) {
        return res.status(403).json({
          error: 'Insufficient subscription tier',
          message: `This feature requires ${minimumTier} plan or higher. Please upgrade your subscription.`,
          upgrade: true,
          currentTier,
          requiredTier: minimumTier
        });
      }

      req.subscriptionTier = currentTier;
      next();

    } catch (error) {
      console.error('Tier check failed:', error);
      res.status(500).json({ error: 'Failed to check subscription tier' });
    }
  };
}

/**
 * Add subscription info to request
 */
async function addSubscriptionInfo(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndDate']
    });

    if (user) {
      req.subscriptionTier = user.subscriptionTier || 'free';
      req.subscriptionStatus = user.subscriptionStatus || 'active';
      req.subscriptionFeatures = SUBSCRIPTION_TIERS[req.subscriptionTier]?.features || {};
    }

    next();

  } catch (error) {
    console.error('Failed to add subscription info:', error);
    next(); // Continue even if this fails
  }
}

/**
 * Helper: Get required tier for a specific feature
 */
function getRequiredTierForFeature(featureName) {
  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (config.features[featureName]) {
      return tier;
    }
  }
  return 'pro'; // Default to pro if feature not found
}

/**
 * Get usage statistics for current user
 */
async function getUserUsage(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['subscriptionTier']
  });

  const tier = user?.subscriptionTier || 'free';
  const tierConfig = SUBSCRIPTION_TIERS[tier];

  // For unlimited plans
  if (tierConfig.dailyQueries === -1) {
    return {
      used: 0,
      remaining: 'unlimited',
      limit: 'unlimited',
      resetTime: null
    };
  }

  // For limited plans (free)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dailyUsed = await ErrorQuery.count({
    where: {
      userId,
      createdAt: {
        [Op.gte]: today,
        [Op.lt]: tomorrow
      }
    }
  });

  return {
    used: dailyUsed,
    remaining: Math.max(0, tierConfig.dailyQueries - dailyUsed),
    limit: tierConfig.dailyQueries,
    resetTime: tomorrow.toISOString()
  };
}

module.exports = {
  checkQueryLimit,
  requireFeature,
  requireTier,
  addSubscriptionInfo,
  getUserUsage,
  SUBSCRIPTION_TIERS
};
