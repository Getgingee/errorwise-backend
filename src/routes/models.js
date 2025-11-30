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
      attributes: ['id', 'subscription_tier', 'preferred_ai_model']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscription_tier || 'free';
    const toggleConfig = getToggleConfig(tier);
    const currentModel = user.preferred_ai_model || toggleConfig.default;
    
    res.json({
      success: true,
      tier,
      showToggle: toggleConfig.show,
      currentModel,
      models: toggleConfig.models,
      defaultModel: toggleConfig.default
    });
  } catch (error) {
    console.error('Error fetching toggle config:', error);
    res.status(500).json({ error: 'Failed to fetch model settings' });
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
    
    const tier = user.subscription_tier || 'free';
    
    // Check if toggle is allowed for this tier
    if (!shouldShowToggle(tier)) {
      return res.status(403).json({
        error: 'Model selection not available for free tier',
        suggestion: 'Upgrade to Pro to choose between Fast and Smart modes'
      });
    }
    
    // Validate model
    if (!isModelAllowedForTier(modelId, tier)) {
      const defaultModel = getDefaultModelForTier(tier);
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

module.exports = router;
