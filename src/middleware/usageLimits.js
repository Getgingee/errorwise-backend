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

    // Get user first
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's subscription details separately
    const subscription = await Subscription.findOne({
      where: { userId },
      attributes: ['tier', 'status', 'endDate']
    });

    // Determine user's subscription tier
    let tier = 'free';
    if (subscription && subscription.status === 'active') {
      // Check if subscription hasn't expired
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      
      if (endDate > now) {
        tier = subscription.tier;
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

      const dailyLimit = 3; // Free tier limit (as per pricing: 3/day)
      const remainingQueries = dailyLimit - queriesUsedToday;

      // Add usage info to request for response
      req.userTier = tier;
      req.hasUnlimitedQueries = false;
      req.dailyUsage = {
        used: queriesUsedToday,
        limit: dailyLimit,
        remaining: remainingQueries,
        resetTime: tomorrow.toISOString(),
        percentage: Math.round((queriesUsedToday / dailyLimit) * 100)
      };

      // Check if user has exceeded daily limit
      if (queriesUsedToday >= dailyLimit) {
        return res.status(429).json({
          error: 'Daily query limit exceeded',
          code: 'DAILY_LIMIT_EXCEEDED',
          message: `You've used all ${dailyLimit} free queries today. Upgrade to Pro for unlimited access!`,
          usage: {
            used: queriesUsedToday,
            limit: dailyLimit,
            remaining: 0,
            resetTime: tomorrow.toISOString(),
            percentage: 100
          },
          upgrade: {
            message: 'Upgrade to Pro for unlimited queries + advanced features',
            recommendedPlan: 'pro',
            proPlan: {
              name: 'Pro Plan',
              price: '$3/month',
              yearlyPrice: '$30/year (Save $6!)',
              trialDays: 7,
              features: [
                '✅ Unlimited error queries',
                '✅ Advanced AI analysis (GPT-3.5 + Claude)',
                '✅ Fix suggestions & code examples',
                '✅ Complete error history',
                '✅ URL scraping & documentation',
                '✅ All Indian languages supported',
                '✅ Email support'
              ]
            },
            teamPlan: {
              name: 'Team Plan',
              price: '$8/month',
              yearlyPrice: '$80/year (Save $16!)',
              trialDays: 14,
              features: [
                '✅ Everything in Pro',
                '✅ Up to 10 team members',
                '✅ Shared error history',
                '✅ Team dashboard & analytics',
                '✅ Premium AI models (GPT-4 + Claude Sonnet)',
                '✅ Priority support'
              ]
            },
            upgradeUrl: `${process.env.FRONTEND_URL}/pricing`,
            ctaText: 'Upgrade Now - 7 Day Free Trial'
          }
        });
      }

      // Add warning if approaching limit
      if (remainingQueries <= 1) {
        req.usageWarning = {
          message: `Only ${remainingQueries} query remaining today. Upgrade to Pro for unlimited access!`,
          upgradeUrl: `${process.env.FRONTEND_URL}/pricing`
        };
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
 * Updated for C2: Trial Logic (7-Day Unlimited → 50/Month)
 */
const getUserUsageStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Import models inside function to avoid circular dependency
    const User = require('../models/User');
    const Subscription = require('../models/Subscription');
    const ErrorQuery = require('../models/ErrorQuery');

    // Get user with all usage fields
    const user = await User.findByPk(userId, {
      attributes: ['id', 'subscriptionTier', 'subscriptionStatus', 'trialEndsAt', 'queriesUsedThisPeriod', 'periodStartDate', 'trialQueriesUsed', 'trialEndedNotified', 'createdAt']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's subscription separately
    const subscription = await Subscription.findOne({
      where: { userId },
      attributes: ['tier', 'status', 'endDate', 'startDate']
    });

    // Determine current tier
    let tier = user.subscriptionTier || 'free';
    let activeSubscription = null;
    
    if (subscription && subscription.status === 'active') {
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      
      if (endDate > now) {
        tier = subscription.tier;
        activeSubscription = subscription;
      }
    }

    const now = new Date();
    
    // C2: Calculate trial status
    const isInTrial = user.trialEndsAt && new Date(user.trialEndsAt) > now;
    const trialEnded = user.trialEndsAt && new Date(user.trialEndsAt) <= now;
    const trialEndsAt = user.trialEndsAt;
    const daysLeftInTrial = isInTrial 
      ? Math.ceil((new Date(user.trialEndsAt) - now) / (1000 * 60 * 60 * 24))
      : 0;

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
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

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

    // C2: Determine limits based on trial status
    const monthlyLimit = (tier === 'free' && !isInTrial) ? 50 : -1; // -1 = unlimited
    const monthlyUsed = user.queriesUsedThisPeriod || 0;
    const monthlyRemaining = monthlyLimit === -1 ? -1 : Math.max(0, monthlyLimit - monthlyUsed);

    const response = {
      tier,
      // C2: Trial information
      trial: {
        isActive: isInTrial,
        hasEnded: trialEnded,
        endsAt: trialEndsAt,
        daysLeft: daysLeftInTrial,
        queriesUsedDuringTrial: user.trialQueriesUsed || 0,
        // Friendly message for frontend
        message: isInTrial 
          ? `You have ${daysLeftInTrial} day${daysLeftInTrial !== 1 ? 's' : ''} left in your free trial with unlimited queries!`
          : (trialEnded && tier === 'free')
            ? 'Your free trial has ended. You now have 50 queries/month.'
            : null
      },
      subscription: activeSubscription ? {
        tier: activeSubscription.tier,
        status: activeSubscription.status,
        startDate: activeSubscription.startDate,
        endDate: activeSubscription.endDate
      } : null,
      usage: {
        // C2: Monthly usage (primary limit for free users post-trial)
        monthly: {
          used: monthlyUsed,
          limit: monthlyLimit,
          remaining: monthlyRemaining,
          resetTime: thisMonthEnd.toISOString(),
          daysUntilReset: Math.ceil((thisMonthEnd - now) / (1000 * 60 * 60 * 24)),
          percentage: monthlyLimit > 0 ? Math.round((monthlyUsed / monthlyLimit) * 100) : 0
        },
        // Additional stats
        daily: dailyQueries,
        weekly: weeklyQueries,
        total: totalQueries
      },
      features: getFeaturesByTier(tier),
      // C2: Show upgrade prompt if approaching limit
      upgradePrompt: (tier === 'free' && !isInTrial && monthlyRemaining <= 10 && monthlyRemaining > 0) ? {
        message: `Only ${monthlyRemaining} queries left this month. Upgrade to Pro for unlimited access!`,
        urgency: monthlyRemaining <= 5 ? 'high' : 'medium'
      } : null
    };

    res.json(response);

  } catch (error) {
    console.error('Failed to get usage stats - DETAILED ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to get usage statistics' });
  }
};

// Helper function to get features by tier
function getFeaturesByTier(tier) {
  const features = {
    free: {
      dailyQueries: 25,
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