/**
 * Tier Access Middleware
 * 
 * Validates feature access based on user's effective tier.
 * Handles trial users automatically.
 * Returns proper upgrade prompts when access is denied.
 * 
 * Usage:
 *   router.post('/follow-up', requireFeature('followUpQuestions'), handler)
 *   router.get('/export', requireFeature('exportHistory'), handler)
 */

const { hasFeature, getLimit, isUnlimited, validateTierAccess, getUpgradePrompt } = require('../config/tierConfig');

/**
 * Calculate effective tier for a user (handles trial)
 */
function getEffectiveTier(user) {
  const baseTier = user.subscriptionTier || 'free';
  
  // If already paid, use that
  if (baseTier !== 'free') {
    return { tier: baseTier, isTrial: false };
  }
  
  // Check for active trial
  if (user.trialEndsAt) {
    const now = new Date();
    const trialEnd = new Date(user.trialEndsAt);
    const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft > 0) {
      return { 
        tier: 'pro', 
        isTrial: true, 
        trialDaysLeft: daysLeft,
        trialEndsAt: user.trialEndsAt
      };
    } else {
      return { 
        tier: 'free', 
        isTrial: false, 
        trialExpired: true 
      };
    }
  }
  
  return { tier: 'free', isTrial: false, canStartTrial: true };
}

/**
 * Middleware: Require a specific feature
 * Blocks request if user's tier doesn't have the feature
 */
function requireFeature(featureName) {
  return async (req, res, next) => {
    try {
      // Get effective tier from request (set by auth middleware)
      const effectiveTier = req.userTier || req.user?.effectiveTier || 'free';
      
      const access = validateTierAccess(effectiveTier, featureName);
      
      if (access.allowed) {
        return next();
      }
      
      // Feature not allowed
      return res.status(403).json({
        success: false,
        error: access.reason,
        code: 'FEATURE_BLOCKED',
        feature: featureName,
        requiredTier: access.requiredTier,
        currentTier: effectiveTier,
        upgrade: access.prompt
      });
      
    } catch (error) {
      console.error('Tier access middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to validate feature access'
      });
    }
  };
}

/**
 * Middleware: Check query limit
 * Blocks request if user has exceeded their monthly/daily limit
 */
function checkQueryLimit(limitType = 'queriesPerMonth') {
  return async (req, res, next) => {
    try {
      const effectiveTier = req.userTier || 'free';
      
      // Check if unlimited
      if (isUnlimited(effectiveTier, limitType)) {
        req.queryLimitInfo = { unlimited: true };
        return next();
      }
      
      const limit = getLimit(effectiveTier, limitType);
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
      
      // Get current usage
      const ErrorQuery = require('../models/ErrorQuery');
      const { Op } = require('sequelize');
      
      let since;
      if (limitType === 'queriesPerDay') {
        since = new Date();
        since.setHours(0, 0, 0, 0);
      } else {
        // Monthly
        since = new Date();
        since.setDate(1);
        since.setHours(0, 0, 0, 0);
      }
      
      const usedQueries = await ErrorQuery.count({
        where: {
          userId,
          createdAt: { [Op.gte]: since }
        }
      });
      
      req.queryLimitInfo = {
        unlimited: false,
        limit,
        used: usedQueries,
        remaining: Math.max(0, limit - usedQueries)
      };
      
      if (usedQueries >= limit) {
        const prompt = getUpgradePrompt('queryLimitReached');
        
        return res.status(403).json({
          success: false,
          error: 'Query limit reached',
          code: 'QUERY_LIMIT_REACHED',
          limitType,
          limit,
          used: usedQueries,
          upgrade: prompt
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Query limit check error:', error);
      // Don't block on error, let the request through
      next();
    }
  };
}

/**
 * Middleware: Check follow-up limit within a conversation
 */
function checkFollowUpLimit() {
  return async (req, res, next) => {
    try {
      const effectiveTier = req.userTier || 'free';
      const { conversationId } = req.body;
      
      // Check if follow-ups are allowed at all
      if (!hasFeature(effectiveTier, 'followUpQuestions')) {
        const prompt = getUpgradePrompt('followUpBlocked');
        
        return res.status(403).json({
          success: false,
          error: 'Follow-up questions require Pro or Team',
          code: 'FOLLOWUP_BLOCKED',
          upgrade: prompt
        });
      }
      
      const maxFollowUps = getLimit(effectiveTier, 'maxFollowUps');
      
      if (maxFollowUps === -1) {
        // Unlimited
        return next();
      }
      
      // Count follow-ups in this conversation
      const ErrorQuery = require('../models/ErrorQuery');
      
      const followUpCount = await ErrorQuery.count({
        where: {
          userId: req.user.id,
          parentId: conversationId
        }
      });
      
      if (followUpCount >= maxFollowUps) {
        return res.status(403).json({
          success: false,
          error: `Maximum ${maxFollowUps} follow-up questions per conversation`,
          code: 'FOLLOWUP_LIMIT_REACHED',
          limit: maxFollowUps,
          used: followUpCount
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Follow-up limit check error:', error);
      next();
    }
  };
}

/**
 * Middleware: Attach tier info to request
 * Use this on all authenticated routes for easy access
 */
function attachTierInfo() {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        req.tierInfo = { tier: 'free', isTrial: false };
        return next();
      }
      
      // Get user with trial info
      const User = require('../models/User');
      const user = await User.findByPk(req.user.id, {
        attributes: ['id', 'subscriptionTier', 'trialEndsAt']
      });
      
      if (!user) {
        req.tierInfo = { tier: 'free', isTrial: false };
        return next();
      }
      
      req.tierInfo = getEffectiveTier(user);
      req.userTier = req.tierInfo.tier;
      
      next();
      
    } catch (error) {
      console.error('Attach tier info error:', error);
      req.tierInfo = { tier: 'free', isTrial: false };
      next();
    }
  };
}

/**
 * Middleware: Require minimum tier level
 */
function requireTier(minimumTier) {
  const tierLevels = { free: 0, pro: 1, team: 2 };
  
  return (req, res, next) => {
    const effectiveTier = req.userTier || 'free';
    const effectiveLevel = tierLevels[effectiveTier] || 0;
    const requiredLevel = tierLevels[minimumTier] || 0;
    
    if (effectiveLevel >= requiredLevel) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      error: `This feature requires ${minimumTier} tier`,
      code: 'TIER_REQUIRED',
      requiredTier: minimumTier,
      currentTier: effectiveTier,
      upgrade: {
        title: `${minimumTier.charAt(0).toUpperCase() + minimumTier.slice(1)} Required`,
        message: `Upgrade to ${minimumTier} to access this feature`,
        cta: `Upgrade to ${minimumTier}`,
        targetTier: minimumTier
      }
    });
  };
}

module.exports = {
  getEffectiveTier,
  requireFeature,
  checkQueryLimit,
  checkFollowUpLimit,
  attachTierInfo,
  requireTier
};
