/**
 * AI Model Configuration (SIMPLIFIED)
 * 
 * Simplified to just 2-3 choices per tier to reduce user confusion.
 * Users don't need to see 12+ models - they want a simple toggle.
 * 
 * SIMPLIFIED MODEL TIERS:
 * - Free: Haiku (fast) - no choice needed
 * - Pro: Haiku (fast) ↔ Sonnet (smart) toggle
 * - Team: Haiku ↔ Sonnet ↔ Opus toggle
 * 
 * Updated: November 2025
 */

// ============================================================================
// SIMPLIFIED MODEL SELECTION (2-3 per tier max)
// ============================================================================

const CLAUDE_MODELS = {
  // ==================== FAST MODEL (All tiers) ====================
  'haiku': {
    id: 'haiku',
    apiId: 'claude-3-5-haiku-20241022',
    name: 'Fast',
    shortName: 'Fast',
    description: 'Quick responses for simple errors',
    speed: 'fastest',
    intelligence: 'good',
    maxTokens: 8192,
    contextWindow: 200000,
    inputPricePerMTok: 1,
    outputPricePerMTok: 5,
    features: ['fast-responses', 'coding'],
    tiers: ['free', 'pro', 'team'],
    icon: '⚡',
    color: '#22c55e' // Green
  },
  
  // ==================== SMART MODEL (Pro + Team) ====================
  'sonnet': {
    id: 'sonnet',
    apiId: 'claude-sonnet-4-20250514',
    name: 'Smart',
    shortName: 'Smart',
    description: 'Better analysis for complex errors',
    speed: 'fast',
    intelligence: 'high',
    maxTokens: 8192,
    contextWindow: 200000,
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    features: ['coding', 'analysis', 'detailed-explanations'],
    tiers: ['pro', 'team'],
    icon: '🧠',
    color: '#3b82f6' // Blue
  },
  
  // ==================== GENIUS MODEL (Team only) ====================
  'opus': {
    id: 'opus',
    apiId: 'claude-sonnet-4-5-20250929',
    name: 'Genius',
    shortName: 'Genius',
    description: 'Most intelligent for complex problems',
    speed: 'moderate',
    intelligence: 'highest',
    maxTokens: 64000,
    contextWindow: 200000,
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    features: ['extended-thinking', 'complex-reasoning', 'agents'],
    tiers: ['team'],
    icon: '🚀',
    color: '#8b5cf6' // Purple
  }
};

// ============================================================================
// TIER-SPECIFIC DEFAULTS (Simplified)
// ============================================================================

const TIER_MODEL_DEFAULTS = {
  free: {
    default: 'haiku',
    allowedModels: ['haiku'],
    maxTokensAllowed: 2000,
    showToggle: false // Free users don't see toggle
  },
  pro: {
    default: 'sonnet',
    allowedModels: ['haiku', 'sonnet'],
    maxTokensAllowed: 4000,
    showToggle: true // Pro users see Fast ↔ Smart toggle
  },
  team: {
    default: 'sonnet',
    allowedModels: ['haiku', 'sonnet', 'opus'],
    maxTokensAllowed: 8000,
    showToggle: true // Team sees 3-way toggle
  }
};

// ============================================================================
// LEGACY MODEL MAPPING (for backward compatibility)
// ============================================================================

const LEGACY_MODEL_MAP = {
  // Map old model IDs to new simplified ones
  'claude-haiku-4-5': 'haiku',
  'claude-3-5-haiku': 'haiku',
  'claude-3-5-haiku-20241022': 'haiku',
  'claude-3-haiku': 'haiku',
  'claude-3-haiku-20240307': 'haiku',
  'claude-sonnet-4': 'sonnet',
  'claude-sonnet-4-20250514': 'sonnet',
  'claude-3-5-sonnet': 'sonnet',
  'claude-3-5-sonnet-20241022': 'sonnet',
  'claude-3-sonnet': 'sonnet',
  'claude-sonnet-4-5': 'opus',
  'claude-sonnet-4-5-20250929': 'opus',
  'claude-opus-4-5': 'opus',
  'claude-3-opus': 'opus'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get models for a tier (simplified list)
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
 * Get all models with tier availability
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
 * Get model by ID (handles legacy IDs)
 */
function getModelById(modelId) {
  // First check direct match
  if (CLAUDE_MODELS[modelId]) {
    return CLAUDE_MODELS[modelId];
  }
  
  // Check legacy mapping
  const mappedId = LEGACY_MODEL_MAP[modelId];
  if (mappedId && CLAUDE_MODELS[mappedId]) {
    return CLAUDE_MODELS[mappedId];
  }
  
  return null;
}

/**
 * Get API model ID from simplified ID
 */
function getModelApiId(modelId) {
  const model = getModelById(modelId);
  return model ? model.apiId : null;
}

/**
 * Check if model is allowed for tier
 */
function isModelAllowedForTier(modelId, tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  const normalizedId = LEGACY_MODEL_MAP[modelId] || modelId;
  return tierConfig.allowedModels.includes(normalizedId);
}

/**
 * Get default model for tier
 */
function getDefaultModelForTier(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return CLAUDE_MODELS[tierConfig.default];
}

/**
 * Get fallback model for tier
 */
function getFallbackModelForTier(tier = 'free') {
  // Always fallback to haiku (fastest/cheapest)
  return CLAUDE_MODELS['haiku'];
}

/**
 * Get max tokens for tier
 */
function getMaxTokensForTier(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return tierConfig.maxTokensAllowed;
}

/**
 * Should show model toggle for this tier?
 */
function shouldShowToggle(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  return tierConfig.showToggle;
}

/**
 * Resolve model for request (handles legacy + tier validation)
 */
function resolveModelForRequest(preferredModelId, tier = 'free') {
  if (!preferredModelId) {
    return getDefaultModelForTier(tier);
  }
  
  // Handle legacy IDs
  const normalizedId = LEGACY_MODEL_MAP[preferredModelId] || preferredModelId;
  
  if (isModelAllowedForTier(normalizedId, tier)) {
    return CLAUDE_MODELS[normalizedId] || getDefaultModelForTier(tier);
  }
  
  // Fall back to tier default
  return getDefaultModelForTier(tier);
}

/**
 * Get toggle data for frontend
 * Returns simple toggle config based on tier
 */
function getToggleConfig(tier = 'free') {
  const tierConfig = TIER_MODEL_DEFAULTS[tier] || TIER_MODEL_DEFAULTS.free;
  
  if (!tierConfig.showToggle) {
    return {
      show: false,
      models: [],
      default: tierConfig.default
    };
  }
  
  return {
    show: true,
    models: tierConfig.allowedModels.map(id => ({
      id: CLAUDE_MODELS[id].id,
      name: CLAUDE_MODELS[id].shortName,
      icon: CLAUDE_MODELS[id].icon,
      color: CLAUDE_MODELS[id].color,
      description: CLAUDE_MODELS[id].description
    })),
    default: tierConfig.default
  };
}

/**
 * Get models grouped by category (for backward compatibility)
 */
function getModelsGroupedByCategory(tier = 'free') {
  const models = getModelsForTier(tier);
  return {
    latest: models, // All our models are "latest" now
    current: [],
    legacy: []
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CLAUDE_MODELS,
  TIER_MODEL_DEFAULTS,
  LEGACY_MODEL_MAP,
  getModelsForTier,
  getAllModels,
  getModelById,
  getModelApiId,
  isModelAllowedForTier,
  getDefaultModelForTier,
  getFallbackModelForTier,
  getMaxTokensForTier,
  shouldShowToggle,
  resolveModelForRequest,
  getToggleConfig,
  getModelsGroupedByCategory
};
