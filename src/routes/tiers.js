/**
 * Tier Routes
 * 
 * Provides tier information, feature access validation,
 * and comparison data for pricing pages.
 * 
 * Routes:
 * - GET /api/tiers - Get all tier information
 * - GET /api/tiers/current - Get current user's tier and features
 * - GET /api/tiers/compare - Get comparison table
 * - POST /api/tiers/check-feature - Check if user has feature access
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { 
  getTier, 
  getAllTiers, 
  hasFeature, 
  getLimit,
  getTierComparison,
  getFeaturesForDisplay,
  validateTierAccess
} = require('../config/tierConfig');
const { getEffectiveTier } = require('../middleware/tierAccess');
const User = require('../models/User');

/**
 * GET /api/tiers
 * Get all tier information (public for pricing page)
 */
router.get('/', async (req, res) => {
  try {
    const comparison = getTierComparison();
    
    res.json({
      success: true,
      ...comparison
    });
  } catch (error) {
    console.error('Get tiers error:', error);
    res.status(500).json({ success: false, error: 'Failed to get tiers' });
  }
});

/**
 * GET /api/tiers/current
 * Get current user's tier, features, and limits
 */
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'trialEndsAt', 'subscriptionEndDate']
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const tierInfo = getEffectiveTier(user);
    const tier = getTier(tierInfo.tier);
    const features = getFeaturesForDisplay(tierInfo.tier);
    
    res.json({
      success: true,
      user: {
        baseTier: user.subscriptionTier || 'free',
        effectiveTier: tierInfo.tier,
        isTrial: tierInfo.isTrial,
        trialDaysLeft: tierInfo.trialDaysLeft,
        trialEndsAt: tierInfo.isTrial ? user.trialEndsAt : null,
        trialExpired: tierInfo.trialExpired,
        canStartTrial: tierInfo.canStartTrial,
        subscriptionEndDate: user.subscriptionEndDate
      },
      tier: {
        id: tier.id,
        name: tier.name,
        badge: tier.badge,
        color: tier.color
      },
      limits: tier.limits,
      features,
      upgradeAvailable: tierInfo.tier !== 'team',
      nextTier: tierInfo.tier === 'free' ? 'pro' : (tierInfo.tier === 'pro' ? 'team' : null)
    });
  } catch (error) {
    console.error('Get current tier error:', error);
    res.status(500).json({ success: false, error: 'Failed to get tier info' });
  }
});

/**
 * GET /api/tiers/compare
 * Get comparison table for pricing page
 */
router.get('/compare', async (req, res) => {
  try {
    const comparison = getTierComparison();
    
    res.json({
      success: true,
      ...comparison
    });
  } catch (error) {
    console.error('Get comparison error:', error);
    res.status(500).json({ success: false, error: 'Failed to get comparison' });
  }
});

/**
 * POST /api/tiers/check-feature
 * Check if current user has access to a feature
 */
router.post('/check-feature', authMiddleware, async (req, res) => {
  try {
    const { feature } = req.body;
    
    if (!feature) {
      return res.status(400).json({ success: false, error: 'Feature name required' });
    }
    
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'trialEndsAt']
    });
    
    const tierInfo = getEffectiveTier(user);
    const access = validateTierAccess(tierInfo.tier, feature);
    
    res.json({
      success: true,
      feature,
      access: access.allowed,
      currentTier: tierInfo.tier,
      isTrial: tierInfo.isTrial,
      ...(!access.allowed && { upgrade: access.prompt })
    });
  } catch (error) {
    console.error('Check feature error:', error);
    res.status(500).json({ success: false, error: 'Failed to check feature' });
  }
});

// ============================================================================
// ADDITIONAL ENDPOINTS (for frontend compatibility)
// Must be defined BEFORE /:tierId catch-all route
// ============================================================================

/**
 * GET /api/tiers/features
 * Alias for /current - returns features for current user
 */
router.get('/features', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'trialEndsAt']
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const tierInfo = getEffectiveTier(user);
    const tier = getTier(tierInfo.tier);
    const features = getFeaturesForDisplay(tierInfo.tier);
    
    res.json({
      success: true,
      tier: tierInfo.tier,
      features: Object.keys(tier.features || {}).filter(f => tier.features[f]),
      limits: tier.limits,
      comparison: getTierComparison()
    });
  } catch (error) {
    console.error('Get features error:', error);
    res.status(500).json({ success: false, error: 'Failed to get features' });
  }
});

/**
 * GET /api/tiers/limits
 * Get limits for current user's tier
 */
router.get('/limits', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'trialEndsAt']
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const tierInfo = getEffectiveTier(user);
    const tier = getTier(tierInfo.tier);
    
    res.json({
      success: true,
      tier: tierInfo.tier,
      limits: tier.limits
    });
  } catch (error) {
    console.error('Get limits error:', error);
    res.status(500).json({ success: false, error: 'Failed to get limits' });
  }
});

/**
 * POST /api/tiers/trial/start
 * Start 7-day Pro trial for free users
 */
router.post('/trial/start', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if user already has subscription or trial
    if (user.subscriptionTier !== 'free' && user.subscriptionTier !== null) {
      return res.status(400).json({ 
        success: false, 
        error: 'You already have an active subscription' 
      });
    }
    
    if (user.trialEndsAt) {
      const trialEnd = new Date(user.trialEndsAt);
      if (trialEnd > new Date()) {
        return res.status(400).json({ 
          success: false, 
          error: 'You already have an active trial',
          trialEndsAt: user.trialEndsAt
        });
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'You have already used your trial. Please upgrade to Pro.' 
        });
      }
    }
    
    // Start 7-day trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);
    
    await user.update({ trialEndsAt });
    
    res.json({
      success: true,
      message: 'Your 7-day Pro trial has started! Enjoy all Pro features.',
      trialEndsAt: trialEndsAt.toISOString()
    });
  } catch (error) {
    console.error('Start trial error:', error);
    res.status(500).json({ success: false, error: 'Failed to start trial' });
  }
});

// ============================================================================
// DYNAMIC ROUTES (must be last!)
// ============================================================================

/**
 * GET /api/tiers/:tierId
 * Get specific tier details
 */
router.get('/:tierId', async (req, res) => {
  try {
    const { tierId } = req.params;
    const tier = getTier(tierId);
    
    if (!tier || tier.id !== tierId) {
      return res.status(404).json({ success: false, error: 'Tier not found' });
    }
    
    const features = getFeaturesForDisplay(tierId);
    
    res.json({
      success: true,
      tier: {
        ...tier,
        features: undefined // Don't expose raw features object
      },
      featuresDisplay: features
    });
  } catch (error) {
    console.error('Get tier error:', error);
    res.status(500).json({ success: false, error: 'Failed to get tier' });
  }
});

module.exports = router;
