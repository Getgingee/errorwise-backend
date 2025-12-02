/**
 * Config Controller
 * 
 * Provides application configuration to frontend.
 * ALL tier configurations, AI models, and limits come from here.
 * Frontend should NOT have any hardcoded values.
 */

const { getTier, getAllTiers, getTierComparison, TIERS, FEATURE_DISPLAY } = require('../config/tierConfig');
const modelConfig = require('../config/modelConfig');

/**
 * Get all application configuration
 * GET /api/config
 * 
 * This is the SINGLE SOURCE OF TRUTH for frontend.
 * All tier info, models, limits should come from here.
 */
exports.getConfig = async (req, res) => {
  try {
    // Get tier comparison data (for pricing page)
    const tierComparison = getTierComparison();
    
    // Get all AI models info
    const aiModels = {
      available: Object.entries(modelConfig.CLAUDE_MODELS).map(([key, model]) => ({
        id: key,
        name: model.displayName,
        apiId: model.apiId,
        description: model.description,
        tier: model.tier,
        recommended: key === 'haiku'
      })),
      defaultByTier: modelConfig.TIER_MODEL_DEFAULTS
    };

    // Get tier-specific limits
    const tierLimits = {};
    for (const tierKey of ['free', 'pro', 'team']) {
      const tier = getTier(tierKey);
      tierLimits[tierKey] = {
        ...tier.limits,
        maxTokens: modelConfig.getMaxTokensForTier(tierKey)
      };
    }

    res.json({
      success: true,
      data: {
        // Tier information
        tiers: tierComparison.tiers,
        comparisonTable: tierComparison.comparisonTable,
        tierLimits,
        
        // AI Models
        aiModels,
        
        // Features display info
        features: FEATURE_DISPLAY,
        
        // App version info
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    });

  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch configuration' 
    });
  }
};

/**
 * Get user-specific configuration (with their tier applied)
 * GET /api/config/user
 * Requires authentication
 */
exports.getUserConfig = async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userTier = user.subscriptionTier || 'free';
    const tierConfig = getTier(userTier);
    
    // Check trial status
    const now = new Date();
    const isInTrial = user.trialEndsAt && new Date(user.trialEndsAt) > now;
    const trialExpired = user.trialEndsAt && new Date(user.trialEndsAt) <= now;
    const hasUsedTrial = user.hasUsedTrial === true || user.trialEndsAt !== null;

    // Get available models for user's tier
    const availableModels = Object.entries(modelConfig.CLAUDE_MODELS)
      .filter(([key, model]) => {
        const tierOrder = { free: 0, pro: 1, team: 2 };
        return tierOrder[model.tier] <= tierOrder[userTier];
      })
      .map(([key, model]) => ({
        id: key,
        name: model.displayName,
        apiId: model.apiId,
        description: model.description,
        available: true
      }));

    // All models with availability flag
    const allModels = Object.entries(modelConfig.CLAUDE_MODELS).map(([key, model]) => {
      const tierOrder = { free: 0, pro: 1, team: 2 };
      return {
        id: key,
        name: model.displayName,
        apiId: model.apiId,
        description: model.description,
        tier: model.tier,
        available: tierOrder[model.tier] <= tierOrder[userTier]
      };
    });

    res.json({
      success: true,
      data: {
        // User subscription info
        subscription: {
          tier: userTier,
          status: user.subscriptionStatus,
          startDate: user.subscriptionStartDate,
          endDate: user.subscriptionEndDate,
          isActive: user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial'
        },
        
        // Trial info
        trial: {
          isInTrial,
          trialExpired,
          hasUsedTrial,
          trialEndsAt: user.trialEndsAt,
          canStartTrial: !hasUsedTrial && userTier === 'free'
        },
        
        // Tier limits for THIS user
        limits: {
          ...tierConfig.limits,
          maxTokens: modelConfig.getMaxTokensForTier(userTier)
        },
        
        // Features for THIS user
        features: tierConfig.features,
        
        // AI Models for THIS user
        models: {
          available: availableModels,
          all: allModels,
          default: modelConfig.TIER_MODEL_DEFAULTS[userTier],
          autoModeAvailable: tierConfig.features.autoMode
        },
        
        // Upgrade info
        upgrade: {
          canUpgrade: userTier !== 'team',
          nextTier: userTier === 'free' ? 'pro' : userTier === 'pro' ? 'team' : null,
          requiresPayment: hasUsedTrial // If trial used, payment required
        }
      }
    });

  } catch (error) {
    console.error('User config fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user configuration' 
    });
  }
};

/**
 * Get plans for pricing page
 * GET /api/config/plans
 * Public endpoint (no auth required)
 */
exports.getPlans = async (req, res) => {
  try {
    const allTiers = getAllTiers();
    
    const plans = allTiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      price: tier.price.monthly,
      yearlyPrice: tier.price.yearly,
      priceLabel: tier.priceLabel,
      yearlyPriceLabel: tier.yearlyPriceLabel,
      description: tier.description,
      badge: tier.badge,
      color: tier.color,
      popular: tier.popular || false,
      limits: tier.limits,
      features: tier.features,
      highlights: require('../config/tierConfig').getFeatureHighlights(tier.id)
    }));

    res.json({
      success: true,
      data: { plans }
    });

  } catch (error) {
    console.error('Plans fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch plans' 
    });
  }
};
