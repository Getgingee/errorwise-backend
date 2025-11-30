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
  // ==================== AUTO MODE (Intelligent Selection) ====================
  'auto': {
    id: 'auto',
    apiId: null, // Resolved dynamically based on error complexity
    name: 'Auto',
    shortName: 'Auto',
    description: 'Automatically picks the best model for your error',
    speed: 'adaptive',
    intelligence: 'adaptive',
    maxTokens: 8192,
    contextWindow: 200000,
    inputPricePerMTok: 0, // Varies based on actual model used
    outputPricePerMTok: 0,
    features: ['smart-routing', 'cost-optimization', 'adaptive'],
    tiers: ['pro', 'team'], // Not for free - they only have haiku
    icon: '✨',
    color: '#f59e0b', // Amber
    isAuto: true
  },

  // ==================== FAST MODEL (All tiers) ====================
  'haiku': {
    id: 'haiku',
    apiId: 'claude-3-5-haiku-latest',  // Using latest alias for stability
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
    apiId: 'claude-3-5-sonnet-latest',  // Using latest alias for stability
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
    apiId: 'claude-3-5-sonnet-latest',  // Using Sonnet as Opus isn't available yet
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
    showToggle: false // Free users just get Fast, no toggle needed
  },
  pro: {
    default: 'auto',
    allowedModels: ['auto', 'haiku', 'sonnet'],
    maxTokensAllowed: 4000,
    showToggle: true // Pro users see Auto ↔ Fast ↔ Smart
  },
  team: {
    default: 'auto',
    allowedModels: ['auto', 'haiku', 'sonnet', 'opus'],
    maxTokensAllowed: 8000,
    showToggle: true // Team sees Auto ↔ Fast ↔ Smart ↔ Genius
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
 * SMART AUTO MODE: Analyze error complexity to pick best model
 * Returns the actual model to use based on error characteristics
 */
function resolveAutoModel(errorText, tier = 'free') {
  if (!errorText) {
    return 'haiku'; // Default to fast for empty/unknown
  }

  const text = errorText.toLowerCase();
  const length = errorText.length;
  
  // Complexity indicators
  const complexityScore = calculateComplexityScore(text, length);
  
  // Tier-based model selection based on complexity
  if (tier === 'team' && complexityScore >= 8) {
    return 'opus'; // Genius for very complex errors
  }
  
  if ((tier === 'pro' || tier === 'team') && complexityScore >= 4) {
    return 'sonnet'; // Smart for moderately complex errors
  }
  
  return 'haiku'; // Fast for simple errors
}

/**
 * Calculate complexity score (0-10) based on error characteristics
 */
function calculateComplexityScore(text, length) {
  let score = 0;
  
  // Length-based scoring
  if (length > 2000) score += 2;
  else if (length > 500) score += 1;
  
  // Stack trace depth
  const stackLines = (text.match(/at\s+[\w.]+/gi) || []).length;
  if (stackLines > 10) score += 2;
  else if (stackLines > 5) score += 1;
  
  // Multiple file references
  const fileRefs = (text.match(/\.(js|ts|py|java|cpp|go|rs|rb)[:(\d]/gi) || []).length;
  if (fileRefs > 5) score += 1;
  
  // Complex error patterns
  const complexPatterns = [
    /memory\s*(leak|overflow|corruption)/i,
    /deadlock|race\s*condition/i,
    /segmentation\s*fault|sigsegv/i,
    /heap|stack\s*overflow/i,
    /async|await|promise.*reject/i,
    /circular\s*(dependency|reference|import)/i,
    /webpack|babel|typescript.*config/i,
    /docker|kubernetes|k8s/i,
    /database|sql.*injection|orm/i,
    /authentication|authorization|jwt|oauth/i,
    /ssl|tls|certificate|https/i,
    /cors|csp|security/i,
    /graphql|apollo|relay/i,
    /microservice|distributed/i,
    /concurrency|thread|mutex/i
  ];
  
  for (const pattern of complexPatterns) {
    if (pattern.test(text)) score += 1;
  }
  
  // Cap at 10
  return Math.min(score, 10);
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
 * Resolve model for request (handles legacy + tier validation + AUTO mode)
 */
function resolveModelForRequest(preferredModelId, tier = 'free', errorText = null) {
  // Handle AUTO mode - intelligently pick based on error complexity
  if (!preferredModelId || preferredModelId === 'auto') {
    const autoResolvedId = resolveAutoModel(errorText, tier);
    return {
      ...CLAUDE_MODELS[autoResolvedId],
      wasAuto: true,
      autoReason: getAutoReason(autoResolvedId, errorText)
    };
  }
  
  // Handle legacy IDs
  const normalizedId = LEGACY_MODEL_MAP[preferredModelId] || preferredModelId;
  
  if (isModelAllowedForTier(normalizedId, tier)) {
    return CLAUDE_MODELS[normalizedId] || getDefaultModelForTier(tier);
  }
  
  // Fall back to tier default (which is now auto)
  const autoResolvedId = resolveAutoModel(errorText, tier);
  return {
    ...CLAUDE_MODELS[autoResolvedId],
    wasAuto: true,
    autoReason: 'Fallback: requested model not available for your tier'
  };
}

/**
 * Get human-readable reason for auto model selection
 */
function getAutoReason(modelId, errorText) {
  if (!errorText) return 'Using Fast mode for quick response';
  
  const reasons = {
    'haiku': 'Simple error detected - using Fast mode',
    'sonnet': 'Moderate complexity - using Smart mode for better analysis',
    'opus': 'Complex issue detected - using Genius mode for deep analysis'
  };
  
  return reasons[modelId] || 'Auto-selected based on error complexity';
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
  resolveAutoModel,
  calculateComplexityScore,
  getMaxTokensForTier,
  shouldShowToggle,
  resolveModelForRequest,
  getToggleConfig,
  getModelsGroupedByCategory
};
