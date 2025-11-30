/**
 * AI Model Configuration
 * 
 * This file contains all available Claude/Anthropic models that users can select.
 * Models are organized by tier availability and use case.
 * 
 * Updated: November 2025 with latest Claude 4.5 models
 */

// ============================================================================
// AVAILABLE CLAUDE MODELS
// ============================================================================

const CLAUDE_MODELS = {
  // ==================== LATEST MODELS (Claude 4.5) ====================
  'claude-sonnet-4-5': {
    id: 'claude-sonnet-4-5',
    apiId: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Smartest model for complex agents and coding',
    category: 'latest',
    speed: 'fast',
    intelligence: 'highest',
    maxTokens: 64000,
    contextWindow: 200000,
    extendedContext: 1000000, // 1M beta
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    knowledgeCutoff: 'January 2025',
    features: ['extended-thinking', 'vision', 'coding', 'agents'],
    tiers: ['team'], // Most expensive - team only
    recommended: true,
    badge: '🚀 Latest'
  },
  
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    apiId: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fastest model with near-frontier intelligence',
    category: 'latest',
    speed: 'fastest',
    intelligence: 'high',
    maxTokens: 64000,
    contextWindow: 200000,
    inputPricePerMTok: 1,
    outputPricePerMTok: 5,
    knowledgeCutoff: 'February 2025',
    features: ['extended-thinking', 'vision', 'fast-responses'],
    tiers: ['free', 'pro', 'team'], // Available to all tiers
    recommended: true,
    badge: '⚡ Fast'
  },
  
  'claude-opus-4-5': {
    id: 'claude-opus-4-5',
    apiId: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Premium model - maximum intelligence with practical performance',
    category: 'latest',
    speed: 'moderate',
    intelligence: 'maximum',
    maxTokens: 64000,
    contextWindow: 200000,
    inputPricePerMTok: 5,
    outputPricePerMTok: 25,
    knowledgeCutoff: 'March 2025',
    features: ['extended-thinking', 'vision', 'complex-reasoning', 'premium'],
    tiers: ['team'], // Premium - team only
    recommended: false,
    badge: '👑 Premium'
  },
  
  'claude-opus-4-1': {
    id: 'claude-opus-4-1',
    apiId: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    description: 'Exceptional model for specialized reasoning tasks',
    category: 'latest',
    speed: 'moderate',
    intelligence: 'exceptional',
    maxTokens: 32000,
    contextWindow: 200000,
    inputPricePerMTok: 15,
    outputPricePerMTok: 75,
    knowledgeCutoff: 'January 2025',
    features: ['extended-thinking', 'vision', 'specialized-reasoning'],
    tiers: ['team'], // Most expensive - team only
    recommended: false,
    badge: '🧠 Reasoning'
  },

  // ==================== CLAUDE 4 MODELS ====================
  'claude-sonnet-4': {
    id: 'claude-sonnet-4',
    apiId: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Excellent balance of speed and intelligence',
    category: 'current',
    speed: 'fast',
    intelligence: 'very-high',
    maxTokens: 8192,
    contextWindow: 200000,
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    knowledgeCutoff: 'April 2024',
    features: ['vision', 'coding', 'general-purpose'],
    tiers: ['pro', 'team'],
    recommended: true,
    badge: '⭐ Balanced'
  },

  // ==================== CLAUDE 3.5 MODELS ====================
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    apiId: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Previous generation - great for most tasks',
    category: 'legacy',
    speed: 'fast',
    intelligence: 'high',
    maxTokens: 8192,
    contextWindow: 200000,
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    knowledgeCutoff: 'April 2024',
    features: ['vision', 'coding', 'general-purpose'],
    tiers: ['pro', 'team'],
    recommended: false,
    badge: null
  },
  
  'claude-3-5-haiku': {
    id: 'claude-3-5-haiku',
    apiId: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    description: 'Fast and efficient for quick tasks',
    category: 'legacy',
    speed: 'fastest',
    intelligence: 'good',
    maxTokens: 8192,
    contextWindow: 200000,
    inputPricePerMTok: 1,
    outputPricePerMTok: 5,
    knowledgeCutoff: 'July 2024',
    features: ['vision', 'fast-responses'],
    tiers: ['free', 'pro', 'team'],
    recommended: false,
    badge: null
  },

  // ==================== CLAUDE 3 MODELS (Legacy) ====================
  'claude-3-haiku': {
    id: 'claude-3-haiku',
    apiId: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    description: 'Budget-friendly option for simple tasks',
    category: 'legacy',
    speed: 'fastest',
    intelligence: 'moderate',
    maxTokens: 4096,
    contextWindow: 200000,
    inputPricePerMTok: 0.25,
    outputPricePerMTok: 1.25,
    knowledgeCutoff: 'August 2023',
    features: ['vision', 'budget-friendly'],
    tiers: ['free', 'pro', 'team'],
    recommended: false,
    badge: '💰 Budget',
    deprecationWarning: 'This model will be deprecated. Consider upgrading to Claude Haiku 4.5.'
  },
  
  'claude-3-opus': {
    id: 'claude-3-opus',
    apiId: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    description: 'Previous flagship - powerful reasoning',
    category: 'legacy',
    speed: 'slow',
    intelligence: 'very-high',
    maxTokens: 4096,
    contextWindow: 200000,
    inputPricePerMTok: 15,
    outputPricePerMTok: 75,
    knowledgeCutoff: 'August 2023',
    features: ['vision', 'complex-reasoning'],
    tiers: ['team'],
    recommended: false,
    badge: null,
    deprecationWarning: 'This model will be deprecated. Consider upgrading to Claude Opus 4.5.'
  },
  
  'claude-3-sonnet': {
    id: 'claude-3-sonnet',
    apiId: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    description: 'Previous balanced option',
    category: 'legacy',
    speed: 'moderate',
    intelligence: 'high',
    maxTokens: 4096,
    contextWindow: 200000,
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    knowledgeCutoff: 'August 2023',
    features: ['vision', 'general-purpose'],
    tiers: ['pro', 'team'],
    recommended: false,
    badge: null,
    deprecationWarning: 'This model will be deprecated. Consider upgrading to Claude Sonnet 4.5.'
  }
};

// ============================================================================
// TIER-SPECIFIC MODEL DEFAULTS
// ============================================================================

const TIER_MODEL_DEFAULTS = {
  free: {
    default: 'claude-haiku-4-5',
    fallback: 'claude-3-5-haiku',
    maxTokensAllowed: 2000,
    allowedModels: ['claude-haiku-4-5', 'claude-3-5-haiku', 'claude-3-haiku']
  },
  pro: {
    default: 'claude-sonnet-4',
    fallback: 'claude-3-5-sonnet',
    maxTokensAllowed: 4000,
    allowedModels: ['claude-haiku-4-5', 'claude-3-5-haiku', 'claude-3-haiku', 'claude-sonnet-4', 'claude-3-5-sonnet', 'claude-3-sonnet']
  },
  team: {
    default: 'claude-sonnet-4-5',
    fallback: 'claude-sonnet-4',
    maxTokensAllowed: 8000,
    allowedModels: Object.keys(CLAUDE_MODELS) // All models available
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all available models for a specific tier
 */
function getModelsForTier(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  
  return tierConfig.allowedModels
    .map(id => CLAUDE_MODELS[id])
    .filter(Boolean)
    .map(model => ({
      ...model,
      isDefault: model.id === tierConfig.default,
      isAllowed: true
    }));
}

/**
 * Get all models with tier availability info
 */
function getAllModels() {
  return Object.values(CLAUDE_MODELS).map(model => ({
    ...model,
    tierAvailability: {
      free: model.tiers.includes('free'),
      pro: model.tiers.includes('pro'),
      team: model.tiers.includes('team')
    }
  }));
}

/**
 * Get model by ID
 */
function getModelById(modelId) {
  return CLAUDE_MODELS[modelId] || null;
}

/**
 * Get model API ID from short ID
 */
function getModelApiId(modelId) {
  const model = CLAUDE_MODELS[modelId];
  return model ? model.apiId : null;
}

/**
 * Check if a model is allowed for a tier
 */
function isModelAllowedForTier(modelId, tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return tierConfig.allowedModels.includes(modelId);
}

/**
 * Get default model for a tier
 */
function getDefaultModelForTier(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return CLAUDE_MODELS[tierConfig.default];
}

/**
 * Get fallback model for a tier
 */
function getFallbackModelForTier(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return CLAUDE_MODELS[tierConfig.fallback];
}

/**
 * Get max tokens allowed for a tier
 */
function getMaxTokensForTier(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return tierConfig.maxTokensAllowed;
}

/**
 * Validate and resolve model selection
 * Returns the model to use based on user preference and tier
 */
function resolveModelForRequest(preferredModelId, tier = 'free') {
  // If no preference, use tier default
  if (!preferredModelId) {
    return getDefaultModelForTier(tier);
  }
  
  // Check if preferred model exists and is allowed
  const preferredModel = CLAUDE_MODELS[preferredModelId];
  if (preferredModel && isModelAllowedForTier(preferredModelId, tier)) {
    return preferredModel;
  }
  
  // Fall back to tier default if not allowed
  console.warn(`Model ${preferredModelId} not allowed for ${tier} tier, using default`);
  return getDefaultModelForTier(tier);
}

/**
 * Get models grouped by category
 */
function getModelsGroupedByCategory(tier = 'free') {
  const models = getModelsForTier(tier);
  
  return {
    latest: models.filter(m => m.category === 'latest'),
    current: models.filter(m => m.category === 'current'),
    legacy: models.filter(m => m.category === 'legacy')
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CLAUDE_MODELS,
  TIER_MODEL_DEFAULTS,
  getModelsForTier,
  getAllModels,
  getModelById,
  getModelApiId,
  isModelAllowedForTier,
  getDefaultModelForTier,
  getFallbackModelForTier,
  getMaxTokensForTier,
  resolveModelForRequest,
  getModelsGroupedByCategory
};
