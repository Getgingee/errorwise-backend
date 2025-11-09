/**
 * Feature Gating Middleware
 * 
 * Controls access to premium features based on subscription tier.
 * Ensures only authorized users can access Pro and Team features.
 */

const Subscription = require('../models/Subscription');

// Feature tier requirements
const FEATURE_TIERS = {
  // Free tier features (available to all)
  errorExplanation: ['free', 'pro', 'team'],
  indianLanguages: ['free', 'pro', 'team'],
  basicAnalysis: ['free', 'pro', 'team'],
  
  // Pro tier features
  fixSuggestions: ['pro', 'team'],
  codeExamples: ['pro', 'team'],
  documentationLinks: ['pro', 'team'],
  errorHistory: ['pro', 'team'],
  unlimitedQueries: ['pro', 'team'],
  urlScraping: ['pro', 'team'],
  advancedAnalysis: ['pro', 'team'],
  emailSupport: ['pro', 'team'],
  
  // Team tier features
  teamFeatures: ['team'],
  sharedHistory: ['team'],
  teamDashboard: ['team'],
  teamMembers: ['team'],
  prioritySupport: ['team'],
  teamAnalytics: ['team'],
  sharedWorkspaces: ['team']
};

/**
 * Get user's subscription tier
 */
async function getUserTier(userId) {
  try {
    const subscription = await Subscription.findOne({
      where: { 
        userId,
        status: 'active'
      }
    });

    // Return tier or default to free
    return subscription ? subscription.tier : 'free';
  } catch (error) {
    console.error('Error fetching user tier:', error);
    return 'free'; // Default to free on error
  }
}

/**
 * Check if user has access to a feature
 */
function hasFeatureAccess(userTier, feature) {
  const requiredTiers = FEATURE_TIERS[feature];
  
  if (!requiredTiers) {
    // Feature not defined, allow access by default
    return true;
  }
  
  return requiredTiers.includes(userTier);
}

/**
 * Get required tier for a feature
 */
function getRequiredTier(feature) {
  const requiredTiers = FEATURE_TIERS[feature];
  
  if (!requiredTiers || requiredTiers.length === 0) {
    return 'free';
  }
  
  // Return the lowest tier that has access
  if (requiredTiers.includes('free')) return 'free';
  if (requiredTiers.includes('pro')) return 'pro';
  return 'team';
}

/**
 * Middleware: Require specific features
 * Usage: featureGating.requireFeatures(['fixSuggestions', 'codeExamples'])
 */
function requireFeatures(features) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userTier = await getUserTier(userId);
      
      // Check each feature
      const deniedFeatures = [];
      const requiredUpgrades = {};
      
      for (const feature of features) {
        if (!hasFeatureAccess(userTier, feature)) {
          deniedFeatures.push(feature);
          requiredUpgrades[feature] = getRequiredTier(feature);
        }
      }
      
      // If any feature is denied, return 403
      if (deniedFeatures.length > 0) {
        return res.status(403).json({
          error: 'Premium feature access required',
          code: 'FEATURE_LOCKED',
          currentTier: userTier,
          deniedFeatures,
          requiredUpgrades,
          message: `Upgrade to ${Object.values(requiredUpgrades)[0].toUpperCase()} to access this feature`,
          upgradeUrl: '/pricing'
        });
      }
      
      // Attach tier to request for downstream use
      req.userTier = userTier;
      next();
      
    } catch (error) {
      console.error('Feature gating error:', error);
      res.status(500).json({ 
        error: 'Failed to verify feature access',
        code: 'FEATURE_CHECK_ERROR'
      });
    }
  };
}

/**
 * Middleware: Require Pro tier
 */
function requirePro() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userTier = await getUserTier(userId);
      
      if (userTier === 'free') {
        return res.status(403).json({
          error: 'Pro or Team subscription required',
          code: 'PRO_REQUIRED',
          currentTier: userTier,
          requiredTier: 'pro',
          message: 'Upgrade to Pro or Team to access this feature',
          upgradeUrl: '/pricing',
          benefits: [
            'Unlimited error queries',
            'Advanced AI analysis',
            'Fix suggestions & code examples',
            'Complete error history',
            'URL scraping & documentation',
            'Email support'
          ]
        });
      }
      
      req.userTier = userTier;
      next();
      
    } catch (error) {
      console.error('Pro check error:', error);
      res.status(500).json({ 
        error: 'Failed to verify subscription',
        code: 'TIER_CHECK_ERROR'
      });
    }
  };
}

/**
 * Middleware: Require Team tier
 */
function requireTeam() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userTier = await getUserTier(userId);
      
      if (userTier !== 'team') {
        return res.status(403).json({
          error: 'Team subscription required',
          code: 'TEAM_REQUIRED',
          currentTier: userTier,
          requiredTier: 'team',
          message: 'Upgrade to Team to access collaboration features',
          upgradeUrl: '/pricing',
          benefits: [
            'All Pro features',
            'Up to 10 team members',
            'Shared error history',
            'Team dashboard & analytics',
            'Collaborative workspaces',
            'Priority support'
          ]
        });
      }
      
      req.userTier = userTier;
      next();
      
    } catch (error) {
      console.error('Team check error:', error);
      res.status(500).json({ 
        error: 'Failed to verify subscription',
        code: 'TIER_CHECK_ERROR'
      });
    }
  };
}

/**
 * Middleware: Attach user tier to request (non-blocking)
 */
async function attachUserTier(req, res, next) {
  try {
    const userId = req.user?.id;
    
    if (userId) {
      req.userTier = await getUserTier(userId);
    } else {
      req.userTier = 'free';
    }
    
    next();
  } catch (error) {
    console.error('Error attaching user tier:', error);
    req.userTier = 'free';
    next();
  }
}

/**
 * Filter response based on user tier
 * Removes premium fields from response if user doesn't have access
 */
function filterResponseByTier(data, userTier) {
  const filtered = { ...data };
  
  // Free tier limitations
  if (userTier === 'free') {
    // Remove premium fields
    delete filtered.fixSuggestions;
    delete filtered.codeExample;
    delete filtered.documentationLinks;
    delete filtered.relatedErrors;
    delete filtered.debugging;
    delete filtered.alternatives;
    delete filtered.resources;
    delete filtered.preventionTips;
    delete filtered.urlContext;
    
    // Add upgrade prompt
    filtered.upgradePrompt = {
      message: 'Upgrade to Pro for detailed solutions, code examples, and unlimited queries',
      tier: 'pro',
      price: '$3/month',
      features: ['Unlimited queries', 'Fix suggestions', 'Code examples', 'Error history'],
      upgradeUrl: '/pricing'
    };
  }
  
  // Pro tier limitations (no team features)
  if (userTier === 'pro') {
    delete filtered.teamInsights;
    delete filtered.sharedWorkspace;
    delete filtered.collaborators;
  }
  
  return filtered;
}

/**
 * Get feature comparison for all tiers
 */
function getFeatureComparison() {
  return {
    free: {
      name: 'Free',
      price: 0,
      interval: 'month',
      features: Object.keys(FEATURE_TIERS).filter(f => FEATURE_TIERS[f].includes('free'))
    },
    pro: {
      name: 'Pro',
      price: 3,
      interval: 'month',
      features: Object.keys(FEATURE_TIERS).filter(f => FEATURE_TIERS[f].includes('pro'))
    },
    team: {
      name: 'Team',
      price: 8,
      interval: 'month',
      features: Object.keys(FEATURE_TIERS).filter(f => FEATURE_TIERS[f].includes('team'))
    }
  };
}

module.exports = {
  getUserTier,
  hasFeatureAccess,
  getRequiredTier,
  requireFeatures,
  requirePro,
  requireTeam,
  attachUserTier,
  filterResponseByTier,
  getFeatureComparison,
  FEATURE_TIERS
};
