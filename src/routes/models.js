/**
 * AI Models Routes
 * 
 * Endpoints for managing AI model selection and preferences
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
  getModelsGroupedByCategory
} = require('../config/modelConfig');

// Rate limiter for model preference changes
const modelPreferenceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 changes per 15 minutes
  message: { error: 'Too many model preference changes. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * GET /api/models
 * Get all available AI models for the current user's tier
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
    const grouped = getModelsGroupedByCategory(tier);
    const defaultModel = getDefaultModelForTier(tier);
    
    res.json({
      success: true,
      tier,
      currentModel: user.preferred_ai_model || defaultModel.id,
      defaultModel: defaultModel.id,
      models,
      grouped,
      totalModels: models.length
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

/**
 * GET /api/models/all
 * Get all models (for comparison/upgrade prompts)
 */
router.get('/all', async (req, res) => {
  try {
    const models = getAllModels();
    
    res.json({
      success: true,
      models,
      categories: {
        latest: models.filter(m => m.category === 'latest'),
        current: models.filter(m => m.category === 'current'),
        legacy: models.filter(m => m.category === 'legacy')
      }
    });
  } catch (error) {
    console.error('Error fetching all models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

/**
 * GET /api/models/:modelId
 * Get details for a specific model
 */
router.get('/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const model = getModelById(modelId);
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    res.json({
      success: true,
      model
    });
  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: 'Failed to fetch model' });
  }
});

/**
 * PUT /api/models/preference
 * Set user's preferred AI model
 */
router.put('/preference', authMiddleware, modelPreferenceLimiter, async (req, res) => {
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
    
    // Validate model is allowed for user's tier
    if (!isModelAllowedForTier(modelId, tier)) {
      const defaultModel = getDefaultModelForTier(tier);
      return res.status(403).json({
        error: 'Model not available for your subscription tier',
        suggestion: `Upgrade to access this model. Your current tier allows: ${getModelsForTier(tier).map(m => m.name).join(', ')}`,
        allowedModels: getModelsForTier(tier),
        defaultModel: defaultModel.id
      });
    }
    
    // Get model details
    const model = getModelById(modelId);
    if (!model) {
      return res.status(404).json({ error: 'Invalid model ID' });
    }
    
    // Update user's preferred model
    await user.update({ preferred_ai_model: modelId });
    
    res.json({
      success: true,
      message: `AI model changed to ${model.name}`,
      model: {
        id: model.id,
        name: model.name,
        description: model.description,
        badge: model.badge
      }
    });
  } catch (error) {
    console.error('Error setting model preference:', error);
    res.status(500).json({ error: 'Failed to update model preference' });
  }
});

/**
 * DELETE /api/models/preference
 * Reset to default model for tier
 */
router.delete('/preference', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tier = user.subscription_tier || 'free';
    const defaultModel = getDefaultModelForTier(tier);
    
    // Reset to null (will use tier default)
    await user.update({ preferred_ai_model: null });
    
    res.json({
      success: true,
      message: `Reset to default model: ${defaultModel.name}`,
      defaultModel: {
        id: defaultModel.id,
        name: defaultModel.name,
        description: defaultModel.description
      }
    });
  } catch (error) {
    console.error('Error resetting model preference:', error);
    res.status(500).json({ error: 'Failed to reset model preference' });
  }
});

/**
 * GET /api/models/compare
 * Compare models for upgrade prompts
 */
router.get('/compare/:model1/:model2', async (req, res) => {
  try {
    const { model1, model2 } = req.params;
    
    const modelA = getModelById(model1);
    const modelB = getModelById(model2);
    
    if (!modelA || !modelB) {
      return res.status(404).json({ error: 'One or both models not found' });
    }
    
    res.json({
      success: true,
      comparison: {
        model1: {
          id: modelA.id,
          name: modelA.name,
          speed: modelA.speed,
          intelligence: modelA.intelligence,
          inputCost: modelA.inputPricePerMTok,
          outputCost: modelA.outputPricePerMTok,
          features: modelA.features,
          tiers: modelA.tiers
        },
        model2: {
          id: modelB.id,
          name: modelB.name,
          speed: modelB.speed,
          intelligence: modelB.intelligence,
          inputCost: modelB.inputPricePerMTok,
          outputCost: modelB.outputPricePerMTok,
          features: modelB.features,
          tiers: modelB.tiers
        },
        recommendation: modelA.recommended ? model1 : (modelB.recommended ? model2 : null)
      }
    });
  } catch (error) {
    console.error('Error comparing models:', error);
    res.status(500).json({ error: 'Failed to compare models' });
  }
});

module.exports = router;
