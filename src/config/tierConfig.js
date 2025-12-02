/**
 * Tier Configuration - Single Source of Truth
 * 
 * Defines ALL features, limits, and capabilities by subscription tier.
 * Used by middleware, controllers, and frontend to enforce feature access.
 * 
 * TIERS:
 * - free: Basic features with limits
 * - pro: Advanced features, unlimited queries
 * - team: Everything + collaboration features
 * 
 * Updated: November 2025
 */

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

const TIERS = {
  free: {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    priceLabel: 'Free forever',
    description: 'Perfect for getting started',
    badge: '🆓',
    color: '#6b7280', // Gray
    
    // Query Limits
    limits: {
      queriesPerMonth: 50,
      queriesPerDay: 10,
      historyRetentionDays: 7,
      maxErrorLength: 5000,
      maxFollowUps: 3, // 3 follow-ups per conversation for free
      savedSolutionsLimit: 10
    },
    
    // Features
    features: {
      // Core Analysis
      basicAnalysis: true,
      advancedAnalysis: false,
      codeExamples: true, // Basic examples only
      stepByStep: true,
      
      // AI Models
      aiModelSelection: false, // No toggle, uses Fast only
      autoMode: false,
      fastModel: true,
      smartModel: false,
      geniusModel: false,
      
      // Conversational AI - OPEN TO ALL
      conversationalMode: true, // Everyone can chat with AI
      followUpQuestions: true, // Everyone can ask follow-ups
      contextMemory: true, // AI remembers conversation
      
      // History & Library
      errorHistory: true,
      searchHistory: true,
      exportHistory: false,
      solutionLibrary: false, // No access to shared library
      saveSolutions: true, // Can save, limited count
      
      // Team Features
      teamAccess: false,
      sharedLibrary: false,
      teamAnalytics: false,
      adminControls: false,
      
      // Support
      communitySupport: true,
      emailSupport: false,
      prioritySupport: false,
      
      // Integrations
      vscodeExtension: true,
      apiAccess: false,
      webhooks: false,
      
      // Trial
      canStartTrial: true
    }
  },
  
  pro: {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 3, yearly: 30 },
    priceLabel: '$3/month',
    yearlyPriceLabel: '$30/year (save 17%)',
    description: 'For serious developers',
    badge: '⭐',
    color: '#3b82f6', // Blue
    popular: true,
    
    // Query Limits
    limits: {
      queriesPerMonth: -1, // Unlimited
      queriesPerDay: -1, // Unlimited
      historyRetentionDays: -1, // Unlimited
      maxErrorLength: 15000,
      maxFollowUps: 10, // 10 follow-ups per conversation for Pro
      savedSolutionsLimit: -1 // Unlimited
    },
    
    // Features
    features: {
      // Core Analysis
      basicAnalysis: true,
      advancedAnalysis: true,
      codeExamples: true,
      stepByStep: true,
      
      // AI Models
      aiModelSelection: true, // Toggle enabled
      autoMode: true, // Smart auto-selection
      fastModel: true,
      smartModel: true,
      geniusModel: false, // Team only
      
      // Conversational AI
      conversationalMode: true,
      followUpQuestions: true,
      contextMemory: true, // Remembers conversation
      
      // History & Library
      errorHistory: true,
      searchHistory: true,
      exportHistory: true,
      solutionLibrary: true, // Read-only access
      saveSolutions: true,
      
      // Team Features
      teamAccess: false,
      sharedLibrary: false,
      teamAnalytics: false,
      adminControls: false,
      
      // Support
      communitySupport: true,
      emailSupport: true,
      prioritySupport: false,
      
      // Integrations
      vscodeExtension: true,
      apiAccess: true,
      webhooks: false,
      
      // Trial
      canStartTrial: false // Already pro
    }
  },
  
  team: {
    id: 'team',
    name: 'Team',
    price: { monthly: 8, yearly: 80 },
    priceLabel: '$8/month',
    yearlyPriceLabel: '$80/year (save 17%)',
    description: 'For teams up to 10',
    badge: '👥',
    color: '#8b5cf6', // Purple
    
    // Query Limits
    limits: {
      queriesPerMonth: -1, // Unlimited
      queriesPerDay: -1, // Unlimited
      historyRetentionDays: -1, // Unlimited
      maxErrorLength: 25000,
      maxFollowUps: -1, // Unlimited follow-ups for Team
      savedSolutionsLimit: -1, // Unlimited
      maxTeamMembers: 10
    },
    
    // Features (ALL features enabled)
    features: {
      // Core Analysis
      basicAnalysis: true,
      advancedAnalysis: true,
      codeExamples: true,
      stepByStep: true,
      
      // AI Models
      aiModelSelection: true,
      autoMode: true,
      fastModel: true,
      smartModel: true,
      geniusModel: true, // Full access
      
      // Conversational AI
      conversationalMode: true,
      followUpQuestions: true,
      contextMemory: true,
      
      // History & Library
      errorHistory: true,
      searchHistory: true,
      exportHistory: true,
      solutionLibrary: true,
      saveSolutions: true,
      
      // Team Features
      teamAccess: true,
      sharedLibrary: true,
      teamAnalytics: true,
      adminControls: true,
      
      // Support
      communitySupport: true,
      emailSupport: true,
      prioritySupport: true,
      
      // Integrations
      vscodeExtension: true,
      apiAccess: true,
      webhooks: true,
      
      // Trial
      canStartTrial: false
    }
  }
};

// ============================================================================
// FEATURE DISPLAY INFO (for frontend)
// ============================================================================

const FEATURE_DISPLAY = {
  // Core
  basicAnalysis: { name: 'Error Analysis', description: 'AI-powered error explanations', icon: '🔍' },
  advancedAnalysis: { name: 'Advanced Analysis', description: 'Deep multi-step analysis', icon: '🧠' },
  codeExamples: { name: 'Code Examples', description: 'Working code snippets', icon: '💻' },
  stepByStep: { name: 'Step-by-Step Fixes', description: 'Guided fix instructions', icon: '📝' },
  
  // AI Models
  aiModelSelection: { name: 'Model Selection', description: 'Choose your AI model', icon: '🎯' },
  autoMode: { name: 'Auto Mode', description: 'Smart model selection', icon: '✨' },
  fastModel: { name: 'Fast Mode', description: 'Quick responses', icon: '⚡' },
  smartModel: { name: 'Smart Mode', description: 'Better analysis', icon: '🧠' },
  geniusModel: { name: 'Genius Mode', description: 'Most intelligent', icon: '🚀' },
  
  // Conversational
  conversationalMode: { name: 'Conversational AI', description: 'Chat with AI assistant', icon: '💬' },
  followUpQuestions: { name: 'Follow-up Questions', description: 'Ask clarifying questions', icon: '❓' },
  contextMemory: { name: 'Context Memory', description: 'AI remembers conversation', icon: '🧠' },
  
  // History
  errorHistory: { name: 'Error History', description: 'View past analyses', icon: '📚' },
  searchHistory: { name: 'Search History', description: 'Find past errors', icon: '🔎' },
  exportHistory: { name: 'Export History', description: 'Download your data', icon: '📤' },
  solutionLibrary: { name: 'Solution Library', description: 'Pre-built solutions', icon: '📖' },
  saveSolutions: { name: 'Save Solutions', description: 'Bookmark fixes', icon: '💾' },
  
  // Team
  teamAccess: { name: 'Team Access', description: 'Collaborate with team', icon: '👥' },
  sharedLibrary: { name: 'Shared Library', description: 'Team solution library', icon: '📁' },
  teamAnalytics: { name: 'Team Analytics', description: 'Team usage insights', icon: '📊' },
  adminControls: { name: 'Admin Controls', description: 'Manage team settings', icon: '⚙️' },
  
  // Support
  communitySupport: { name: 'Community Support', description: 'Community forums', icon: '🌐' },
  emailSupport: { name: 'Email Support', description: 'Direct email help', icon: '📧' },
  prioritySupport: { name: 'Priority Support', description: 'Fast response times', icon: '🚨' },
  
  // Integrations
  vscodeExtension: { name: 'VS Code Extension', description: 'Analyze in editor', icon: '🔌' },
  apiAccess: { name: 'API Access', description: 'Programmatic access', icon: '🔗' },
  webhooks: { name: 'Webhooks', description: 'Event notifications', icon: '🪝' }
};

// ============================================================================
// COMPARISON TABLE (for pricing page)
// ============================================================================

const COMPARISON_TABLE = {
  headers: ['Feature', 'Free', 'Pro', 'Team'],
  categories: [
    {
      name: 'Queries',
      rows: [
        { feature: 'Monthly Queries', free: '50', pro: 'Unlimited', team: 'Unlimited' },
        { feature: 'Daily Limit', free: '10', pro: 'Unlimited', team: 'Unlimited' }
      ]
    },
    {
      name: 'AI Features',
      rows: [
        { feature: 'Conversational AI', free: '✅', pro: '✅', team: '✅' },
        { feature: 'Follow-up Questions', free: '3 per chat', pro: '10 per chat', team: 'Unlimited' },
        { feature: 'Context Memory', free: '✅', pro: '✅', team: '✅' },
        { feature: 'AI Model Selection', free: '❌', pro: '✅ Auto + Toggle', team: '✅ All Models' },
        { feature: 'Auto Mode', free: '❌', pro: '✅', team: '✅' }
      ]
    },
    {
      name: 'History & Storage',
      rows: [
        { feature: 'Error History', free: '7 days', pro: 'Unlimited', team: 'Unlimited' },
        { feature: 'Export History', free: '❌', pro: '✅', team: '✅' },
        { feature: 'Solution Library', free: '❌', pro: 'Read-only', team: 'Full access' }
      ]
    },
    {
      name: 'Team Features',
      rows: [
        { feature: 'Team Members', free: '1', pro: '1', team: 'Up to 10' },
        { feature: 'Shared Library', free: '❌', pro: '❌', team: '✅' },
        { feature: 'Team Analytics', free: '❌', pro: '❌', team: '✅' }
      ]
    },
    {
      name: 'Support',
      rows: [
        { feature: 'Community Support', free: '✅', pro: '✅', team: '✅' },
        { feature: 'Email Support', free: '❌', pro: '✅', team: '✅' },
        { feature: 'Priority Support', free: '❌', pro: '❌', team: '✅' }
      ]
    }
  ]
};

// ============================================================================
// UPGRADE PROMPTS (context-aware messages)
// ============================================================================

const UPGRADE_PROMPTS = {
  queryLimitReached: {
    title: 'Query Limit Reached',
    message: "You've used all your free queries this month",
    cta: 'Upgrade to Pro for unlimited queries',
    targetTier: 'pro'
  },
  followUpBlocked: {
    title: 'Follow-up Questions',
    message: 'Continue the conversation with follow-up questions',
    cta: 'Upgrade to Pro to ask follow-up questions',
    targetTier: 'pro'
  },
  advancedModelBlocked: {
    title: 'Advanced AI Model',
    message: 'Get smarter, more detailed analysis',
    cta: 'Upgrade to Pro for advanced AI models',
    targetTier: 'pro'
  },
  geniusModelBlocked: {
    title: 'Genius Mode',
    message: 'Access our most intelligent AI model',
    cta: 'Upgrade to Team for Genius mode',
    targetTier: 'team'
  },
  teamFeaturesBlocked: {
    title: 'Team Features',
    message: 'Collaborate with your team',
    cta: 'Upgrade to Team for collaboration features',
    targetTier: 'team'
  },
  exportBlocked: {
    title: 'Export History',
    message: 'Download your error history',
    cta: 'Upgrade to Pro to export your data',
    targetTier: 'pro'
  },
  trialEnding: {
    title: 'Trial Ending Soon',
    message: 'Your free trial ends in {days} days',
    cta: 'Upgrade now to keep Pro features',
    targetTier: 'pro'
  },
  trialExpired: {
    title: 'Trial Expired',
    message: 'Your Pro trial has ended',
    cta: 'Upgrade to continue using Pro features',
    targetTier: 'pro'
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get tier configuration
 */
function getTier(tierId = 'free') {
  return TIERS[tierId] || TIERS.free;
}

/**
 * Get all tiers
 */
function getAllTiers() {
  return Object.values(TIERS);
}

/**
 * Check if a feature is enabled for a tier
 */
function hasFeature(tierId, featureName) {
  const tier = getTier(tierId);
  return tier.features[featureName] === true;
}

/**
 * Get limit value for a tier
 */
function getLimit(tierId, limitName) {
  const tier = getTier(tierId);
  return tier.limits[limitName];
}

/**
 * Check if limit is unlimited (-1)
 */
function isUnlimited(tierId, limitName) {
  return getLimit(tierId, limitName) === -1;
}

/**
 * Get tier for a feature requirement
 * Returns the minimum tier that has this feature
 */
function getRequiredTierForFeature(featureName) {
  for (const tierId of ['free', 'pro', 'team']) {
    if (hasFeature(tierId, featureName)) {
      return tierId;
    }
  }
  return null; // Feature doesn't exist
}

/**
 * Get appropriate upgrade prompt for a blocked feature
 */
function getUpgradePrompt(reason, context = {}) {
  const prompt = UPGRADE_PROMPTS[reason];
  if (!prompt) return null;
  
  // Replace placeholders
  let message = prompt.message;
  for (const [key, value] of Object.entries(context)) {
    message = message.replace(`{${key}}`, value);
  }
  
  return { ...prompt, message };
}

/**
 * Get features comparison for frontend
 */
function getFeaturesForDisplay(tierId = 'free') {
  const tier = getTier(tierId);
  const features = [];
  
  for (const [key, enabled] of Object.entries(tier.features)) {
    const display = FEATURE_DISPLAY[key];
    if (display) {
      features.push({
        id: key,
        ...display,
        enabled,
        requiredTier: enabled ? null : getRequiredTierForFeature(key)
      });
    }
  }
  
  return features;
}

/**
 * Validate tier access for a request
 * Returns { allowed: boolean, reason?: string, prompt?: object }
 */
function validateTierAccess(effectiveTier, requiredFeature) {
  if (hasFeature(effectiveTier, requiredFeature)) {
    return { allowed: true };
  }
  
  const requiredTier = getRequiredTierForFeature(requiredFeature);
  const promptKey = `${requiredFeature}Blocked`;
  const prompt = getUpgradePrompt(promptKey) || {
    title: 'Upgrade Required',
    message: `This feature requires ${requiredTier} tier`,
    cta: `Upgrade to ${requiredTier}`,
    targetTier: requiredTier
  };
  
  return {
    allowed: false,
    reason: `Feature '${requiredFeature}' requires ${requiredTier} tier`,
    requiredTier,
    prompt
  };
}

/**
 * Get tier comparison data for pricing page
 */
function getTierComparison() {
  return {
    tiers: getAllTiers().map(tier => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      priceLabel: tier.priceLabel,
      yearlyPriceLabel: tier.yearlyPriceLabel,
      description: tier.description,
      badge: tier.badge,
      color: tier.color,
      popular: tier.popular || false,
      limits: tier.limits,
      featureHighlights: getFeatureHighlights(tier.id)
    })),
    comparisonTable: COMPARISON_TABLE
  };
}

/**
 * Get feature highlights for a tier (for cards)
 */
function getFeatureHighlights(tierId) {
  const highlights = {
    free: [
      { text: '50 queries/month', icon: '📊' },
      { text: 'Conversational AI', icon: '💬', highlight: true },
      { text: '3 follow-ups per chat', icon: '❓' },
      { text: 'Basic AI analysis', icon: '🔍' },
      { text: '7-day history', icon: '📚' }
    ],
    pro: [
      { text: 'Unlimited queries', icon: '♾️', highlight: true },
      { text: 'Conversational AI', icon: '💬', highlight: true },
      { text: 'Auto + Smart models', icon: '✨', highlight: true },
      { text: 'Follow-up questions', icon: '❓' },
      { text: 'Unlimited history', icon: '📚' },
      { text: 'Email support', icon: '📧' }
    ],
    team: [
      { text: 'Everything in Pro', icon: '⭐' },
      { text: 'Up to 10 team members', icon: '👥', highlight: true },
      { text: 'Shared solution library', icon: '📁', highlight: true },
      { text: 'Genius AI model', icon: '🚀', highlight: true },
      { text: 'Team analytics', icon: '📊' },
      { text: 'Priority support', icon: '🚨' }
    ]
  };
  
  return highlights[tierId] || highlights.free;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  TIERS,
  FEATURE_DISPLAY,
  COMPARISON_TABLE,
  UPGRADE_PROMPTS,
  getTier,
  getAllTiers,
  hasFeature,
  getLimit,
  isUnlimited,
  getRequiredTierForFeature,
  getUpgradePrompt,
  getFeaturesForDisplay,
  validateTierAccess,
  getTierComparison,
  getFeatureHighlights
};
