/**
 * AI Models Routes (SIMPLIFIED)
 * 
 * Simple toggle-based model selection:
 * - Free: No toggle (uses Fast/Haiku)
 * - Pro: Fast ↔ Smart toggle
 * - Team: Fast ↔ Smart ↔ Genius toggle
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const {
  getModelsForTier,
  getAllModels,
  getModelById,
  isModelAllowedForTier,
  getDefaultModelForTier,
  getToggleConfig,
  shouldShowToggle
} = require('../config/modelConfig');

// Rate limiter for model preference changes
const modelPreferenceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many model changes. Please try again later.' }
});

/**
 * GET /api/models/toggle
 * Get simple toggle configuration for the user's tier
 * This is the main endpoint the frontend should use
 */
router.get('/toggle', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['id', 'subscription_tier', 'preferred_ai_model', 'trialEndsAt']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate effective tier (trial users get pro features)
    const baseTier = user.subscription_tier || 'free';
    let effectiveTier = baseTier;
    let trialInfo = null;
    
    if (baseTier === 'free' && user.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(user.trialEndsAt);
      const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
      
      if (daysLeft > 0) {
        effectiveTier = 'pro'; // Trial users get Pro features
        trialInfo = {
          active: true,
          daysLeft,
          endsAt: user.trialEndsAt,
          showUpgradePrompt: daysLeft <= 2
        };
      } else {
        trialInfo = {
          active: false,
          expired: true,
          showUpgradePrompt: true,
          message: 'Trial ended - upgrade to Pro!'
        };
      }
    } else if (baseTier === 'free') {
      trialInfo = {
        active: false,
        canStart: true,
        message: 'Start your 7-day Pro trial!'
      };
    }
    
    const toggleConfig = getToggleConfig(effectiveTier);
    const currentModel = user.preferred_ai_model || toggleConfig.default;
    
    res.json({
      success: true,
      tier: baseTier,
      effectiveTier, // The tier being used for features
      showToggle: toggleConfig.show,
      currentModel,
      models: toggleConfig.models,
      defaultModel: toggleConfig.default,
      trial: trialInfo
    });
  } catch (error) {
    console.error('Error fetching toggle config:', error);
    // Return fallback data so frontend doesn't crash
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch model settings',
      // Include fallback models to prevent frontend TypeError
      models: [{
        id: 'haiku',
        name: 'Fast',
        icon: '⚡',
        color: '#22c55e',
        description: 'Quick responses for simple errors'
      }],
      showToggle: false,
      tier: 'free',
      effectiveTier: 'free',
      currentModel: 'haiku',
      defaultModel: 'haiku'
    });
  }
});

/**
 * PUT /api/models/toggle
 * Set user's model preference via simple toggle
 */
router.put('/toggle', authMiddleware, modelPreferenceLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { modelId } = req.body;
    
    if (!modelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate effective tier (trial users get pro features)
    const baseTier = user.subscription_tier || 'free';
    let effectiveTier = baseTier;
    
    if (baseTier === 'free' && user.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(user.trialEndsAt);
      if (trialEnd > now) {
        effectiveTier = 'pro'; // Trial active
      }
    }
    
    // Check if toggle is allowed for this effective tier
    if (!shouldShowToggle(effectiveTier)) {
      return res.status(403).json({
        error: 'Model selection not available for free tier',
        suggestion: 'Start your 7-day trial or upgrade to Pro to choose between Fast and Smart modes',
        canStartTrial: baseTier === 'free' && !user.trialEndsAt
      });
    }
    
    // Validate model against effective tier
    if (!isModelAllowedForTier(modelId, effectiveTier)) {
      const defaultModel = getDefaultModelForTier(effectiveTier);
      return res.status(403).json({
        error: 'Model not available for your tier',
        currentModel: defaultModel.id
      });
    }
    
    const model = getModelById(modelId);
    await user.update({ preferred_ai_model: modelId });
    
    res.json({
      success: true,
      message: `Switched to ${model.name} mode`,
      model: {
        id: model.id,
        name: model.name,
        icon: model.icon,
        description: model.description
      }
    });
  } catch (error) {
    console.error('Error setting model:', error);
    res.status(500).json({ error: 'Failed to update model' });
  }
});

// ============================================================================
// LEGACY ENDPOINTS (for backward compatibility)
// ============================================================================

/**
 * GET /api/models
 * Legacy: Get all models (redirects to toggle internally)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscription_tier || 'free';
    const models = getModelsForTier(tier);
    const toggleConfig = getToggleConfig(tier);
    const defaultModel = getDefaultModelForTier(tier);
    
    res.json({
      success: true,
      tier,
      currentModel: user.preferred_ai_model || defaultModel.id,
      defaultModel: defaultModel.id,
      models,
      toggle: toggleConfig, // New simplified toggle config
      totalModels: models.length
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

/**
 * PUT /api/models/preference
 * Legacy: Set model preference (redirects to toggle)
 */
router.put('/preference', authMiddleware, modelPreferenceLimiter, async (req, res) => {
  // Redirect to new toggle endpoint
  req.url = '/toggle';
  router.handle(req, res);
});

/**
 * GET /api/models/all
 * Get all models (for comparison)
 */
router.get('/all', async (req, res) => {
  try {
    const models = getAllModels();
    res.json({ success: true, models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// ============================================================================
// ADDITIONAL ENDPOINTS (for frontend compatibility)
// ============================================================================

/**
 * GET /api/models/available
 * Alias for /toggle - returns available models for user
 */
router.get('/available', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['id', 'subscription_tier', 'preferred_ai_model', 'trialEndsAt']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const baseTier = user.subscription_tier || 'free';
    let effectiveTier = baseTier;
    
    if (baseTier === 'free' && user.trialEndsAt) {
      const trialEnd = new Date(user.trialEndsAt);
      if (trialEnd > new Date()) {
        effectiveTier = 'pro';
      }
    }
    
    const toggleConfig = getToggleConfig(effectiveTier);
    const currentModel = user.preferred_ai_model || toggleConfig.default;
    
    res.json({
      success: true,
      tier: baseTier,
      effectiveTier,
      showToggle: toggleConfig.show,
      currentModel,
      models: toggleConfig.models,
      available: toggleConfig.models, // Frontend compatibility
      defaultModel: toggleConfig.default
    });
  } catch (error) {
    console.error('Error fetching available models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

/**
 * POST /api/models/select
 * Select/set model preference (POST version for frontend compatibility)
 */
router.post('/select', authMiddleware, modelPreferenceLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { modelId } = req.body;
    
    if (!modelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const baseTier = user.subscription_tier || 'free';
    let effectiveTier = baseTier;
    
    if (baseTier === 'free' && user.trialEndsAt) {
      const trialEnd = new Date(user.trialEndsAt);
      if (trialEnd > new Date()) {
        effectiveTier = 'pro';
      }
    }
    
    if (!shouldShowToggle(effectiveTier)) {
      return res.status(403).json({
        error: 'Model selection not available for free tier',
        suggestion: 'Start your 7-day trial or upgrade to Pro'
      });
    }
    
    if (!isModelAllowedForTier(modelId, effectiveTier)) {
      return res.status(403).json({
        error: 'Model not available for your tier'
      });
    }
    
    const model = getModelById(modelId);
    await user.update({ preferred_ai_model: modelId });
    
    res.json({
      success: true,
      message: `Model changed to ${model.name}`,
      model: {
        id: model.id,
        name: model.name,
        icon: model.icon
      }
    });
  } catch (error) {
    console.error('Error selecting model:', error);
    res.status(500).json({ error: 'Failed to select model' });
  }
});

/**
 * GET /api/models/current
 * Get current model for user
 */
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: ['id', 'subscription_tier', 'preferred_ai_model', 'trialEndsAt']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const baseTier = user.subscription_tier || 'free';
    let effectiveTier = baseTier;
    
    if (baseTier === 'free' && user.trialEndsAt) {
      const trialEnd = new Date(user.trialEndsAt);
      if (trialEnd > new Date()) {
        effectiveTier = 'pro';
      }
    }
    
    const defaultModel = getDefaultModelForTier(effectiveTier);
    const currentModelId = user.preferred_ai_model || defaultModel.id;
    const model = getModelById(currentModelId) || defaultModel;
    
    res.json({
      success: true,
      model: {
        id: model.id,
        name: model.name,
        icon: model.icon,
        description: model.description
      },
      tier: baseTier,
      effectiveTier
    });
  } catch (error) {
    console.error('Error fetching current model:', error);
    res.status(500).json({ error: 'Failed to fetch current model' });
  }
});

module.exports = router;
