const ErrorQuery = require('../models/ErrorQuery');
const User = require('../models/User');
const authService = require('../services/authService');
const aiService = require('../services/aiService');
const featureGating = require('../middleware/featureGating');
const { Op } = require('sequelize');
const { 
  enhanceResponseWithConfidence, 
  getConfidenceBucket, 
  isLowConfidence,
  LOW_CONFIDENCE_THRESHOLD 
} = require('../utils/confidenceMessaging');
const queryLogger = require('../services/queryLogger');
const { getLimit, hasFeature } = require('../config/tierConfig');
const { v4: uuidv4 } = require('uuid');
const { saveConversationContext } = require('./chatController');

// ============================================================================
// PERFORMANCE OPTIMIZATIONS
// ============================================================================

// In-memory cache for user tier lookup (reduces DB calls)
const userTierCache = new Map();
const USER_TIER_CACHE_TTL = 300000; // 5 minutes

/**
 * Get user tier from cache or DB (with caching)
 */
async function getCachedUserTier(userId, user) {
  const cached = userTierCache.get(userId);
  if (cached && Date.now() - cached.timestamp < USER_TIER_CACHE_TTL) {
    return cached;
  }
  
  const tier = user?.subscription_tier || 'free';
  const preferredModel = user?.preferred_ai_model || null;
  
  const data = { tier, preferredModel, timestamp: Date.now() };
  userTierCache.set(userId, data);
  
  // Cleanup old entries periodically
  if (userTierCache.size > 1000) {
    const oldestKey = userTierCache.keys().next().value;
    userTierCache.delete(oldestKey);
  }
  
  return data;
}

/**
 * Non-blocking database write for error queries
 * Returns immediately, writes to DB in background
 */
function saveErrorQueryAsync(data) {
  // Fire and forget - don't await
  setImmediate(async () => {
    try {
      await ErrorQuery.create(data);
    } catch (error) {
      console.error('Background DB write failed:', error.message);
    }
  });
}

/**
 * Non-blocking query logging
 */
function logQueryAsync(data) {
  setImmediate(async () => {
    try {
      await queryLogger.logQuery(data);
    } catch (error) {
      console.error('Background logging failed:', error.message);
    }
  });
}

/**
 * Generate engaging suggested follow-up questions
 * These appear as clickable chips for easy follow-up
 * Made friendly for non-tech users!
 * Now generates contextually relevant questions based on the specific error/query
 */
function generateSuggestedQuestions(errorMessage, analysis, turn = 1) {
  const suggestions = [];
  const errorLower = errorMessage.toLowerCase();
  const solutionLower = (analysis.solution || '').toLowerCase();
  const explanationLower = (analysis.explanation || '').toLowerCase();
  const category = (analysis.category || '').toLowerCase();
  
  // Extract key terms from the error for context-aware suggestions
  const keyTerms = extractKeyTerms(errorMessage);
  const hasCode = /```|function|const |let |var |import |require\(|class |def |public |private /.test(errorMessage);
  const isQuestion = /^(how|what|why|when|where|which|can|could|should|is|are|does|do)\b/i.test(errorMessage.trim());
  const hasStackTrace = /at\s+[\w.]+\s*\(|line\s+\d+|:\d+:\d+/i.test(errorMessage);

  // First turn - based on error type and context
  if (turn === 1) {
    
    // PROGRAMMING ERRORS - Context-aware follow-ups
    if (hasStackTrace || hasCode || category.includes('code') || category.includes('syntax') || category.includes('runtime')) {
      // Extract specific error type for targeted questions
      if (/undefined|null|NaN|not defined/i.test(errorLower)) {
        suggestions.push(`🔍 Why is ${keyTerms.variable || 'this'} undefined?`);
        suggestions.push("🛠️ How do I add a null check?");
      }
      if (/cannot read|property/i.test(errorLower)) {
        suggestions.push("🐛 How do I debug this property error?");
        suggestions.push("✅ Show safe property access pattern");
      }
      if (/import|require|module|export/i.test(errorLower)) {
        suggestions.push("📦 Is my import path correct?");
        suggestions.push("🔧 How do I fix module resolution?");
      }
      if (/async|await|promise|then|catch/i.test(errorLower)) {
        suggestions.push("⏳ How do I handle this async properly?");
        suggestions.push("🔄 Show try-catch pattern for this");
      }
      if (/type|string|number|boolean|array|object/i.test(errorLower)) {
        suggestions.push(`🔤 What type should ${keyTerms.variable || 'this'} be?`);
        suggestions.push("📋 How do I validate types?");
      }
      // Generic code follow-ups if none matched
      if (suggestions.length === 0) {
        suggestions.push("📝 Show me the correct code");
        suggestions.push("🐛 How do I debug this?");
      }
    }
    
    // DATABASE ERRORS
    if (/database|sql|query|postgres|mysql|mongo|connection refused|sequelize|prisma/i.test(errorLower)) {
      suggestions.push("🔌 Is my database connection correct?");
      suggestions.push("📊 Show me the correct query");
      if (/connection/i.test(errorLower)) {
        suggestions.push("🔐 Are my DB credentials right?");
      }
    }
    
    // API/HTTP ERRORS
    if (/api|http|fetch|axios|request|response|status|cors|401|403|404|500/i.test(errorLower)) {
      if (/401|unauthorized|auth/i.test(errorLower)) {
        suggestions.push("🔑 How do I fix authentication?");
        suggestions.push("🔐 Is my token valid?");
      }
      if (/404|not found/i.test(errorLower)) {
        suggestions.push("🔍 Is my endpoint URL correct?");
        suggestions.push("📍 Show me the right API path");
      }
      if (/cors/i.test(errorLower)) {
        suggestions.push("🌐 How do I fix CORS?");
        suggestions.push("⚙️ Show server-side CORS config");
      }
      if (/500|server error|internal/i.test(errorLower)) {
        suggestions.push("🔧 How do I check server logs?");
        suggestions.push("🐛 What's causing the server error?");
      }
    }
    
    // PACKAGE/DEPENDENCY ERRORS
    if (/npm|yarn|pnpm|package|dependency|version|install|node_modules/i.test(errorLower)) {
      suggestions.push("📦 How do I install the right version?");
      suggestions.push("🧹 Should I delete node_modules?");
      suggestions.push("📋 Are there peer dependency issues?");
    }
    
    // Payment/Banking errors (non-tech)
    if (errorLower.includes('payment') || errorLower.includes('card') || errorLower.includes('declined') || errorLower.includes('transaction')) {
      suggestions.push("💳 Why was my payment declined?");
      suggestions.push("🔒 Is my card info safe?");
      suggestions.push("📞 How do I contact support?");
    }

    // Login/Password issues
    if (errorLower.includes('password') || errorLower.includes('login') || errorLower.includes('sign in') || errorLower.includes('access')) {
      suggestions.push("🔑 How do I reset my password?");
      suggestions.push("📧 I forgot my email too!");
      suggestions.push("🔐 Is my account hacked?");
    }

    // App crashes
    if (errorLower.includes('crash') || errorLower.includes('stopped') || errorLower.includes('not responding') || errorLower.includes('frozen')) {
      suggestions.push("🔄 How do I restart the app?");
      suggestions.push("💾 Will I lose my data?");
      suggestions.push("📲 Should I reinstall?");
    }

    // Connection/Network issues
    if (errorLower.includes('connection') || errorLower.includes('network') || errorLower.includes('internet') || errorLower.includes('wifi') || errorLower.includes('offline')) {
      suggestions.push("📶 How do I fix my connection?");
      suggestions.push("🔌 Should I restart my router?");
      suggestions.push("📱 Is my device the problem?");
    }

    // Storage/Memory issues
    if (errorLower.includes('storage') || errorLower.includes('memory') || errorLower.includes('full') || errorLower.includes('space')) {
      suggestions.push("🗑️ What can I safely delete?");
      suggestions.push("☁️ How do I use cloud storage?");
      suggestions.push("📊 What's using all my space?");
    }
    
    // QUESTION/QUERY specific suggestions (not errors)
    if (isQuestion && !hasStackTrace) {
      if (/how to|how do i/i.test(errorLower)) {
        suggestions.push("📝 Show me step by step");
        suggestions.push("💻 Give me a code example");
      }
      if (/what is|what are|explain/i.test(errorLower)) {
        suggestions.push("🎯 Give me a simple example");
        suggestions.push("🔗 What are related concepts?");
      }
      if (/why|reason/i.test(errorLower)) {
        suggestions.push("📚 Explain in more detail");
        suggestions.push("🆚 What are the alternatives?");
      }
      if (/best practice|recommend|should i/i.test(errorLower)) {
        suggestions.push("⚖️ What are the tradeoffs?");
        suggestions.push("🏆 Show industry best practice");
      }
    }

    // Solution-based context follow-ups
    if (solutionLower.includes('npm install') || solutionLower.includes('yarn add')) {
      suggestions.push("📦 What version should I install?");
    }
    if (solutionLower.includes('restart') || solutionLower.includes('reboot')) {
      suggestions.push("🔄 Do I need to restart anything else?");
    }
    if (solutionLower.includes('environment') || solutionLower.includes('env')) {
      suggestions.push("⚙️ How do I set environment variables?");
    }

    // Generic helpful suggestions if nothing specific matched
    if (suggestions.length < 2) {
      if (hasCode || hasStackTrace) {
        suggestions.push("📝 Show me the correct code");
        suggestions.push("🐛 Help me debug step by step");
      } else {
        suggestions.push("🤔 Explain this simply please");
        suggestions.push("📝 Show me step by step");
      }
    }
  }

  // Later turns - conversation continuers based on context
  else {
    if (solutionLower.includes('```') || explanationLower.includes('```')) {
      suggestions.push("🔍 Explain this code line by line");
      suggestions.push("✏️ How do I modify this for my case?");
    }
    if (solutionLower.includes('click') || solutionLower.includes('tap') || solutionLower.includes('go to')) {
      suggestions.push("📍 Where exactly do I click?");
    }
    if (solutionLower.includes('download') || solutionLower.includes('install')) {
      suggestions.push("✅ Is this download safe?");
    }
    if (solutionLower.includes('try') || solutionLower.includes('should work')) {
      suggestions.push("🔄 What if that doesn't work?");
    }
    if (solutionLower.includes('error') || solutionLower.includes('exception')) {
      suggestions.push("🛡️ How do I prevent this error?");
    }
    
    // Always add these for follow-ups
    if (suggestions.length < 2) {
      suggestions.push("😕 I'm still confused");
      suggestions.push("💡 Any other solutions?");
    }
  }

  // Always add success option
  suggestions.push("✅ That fixed it, thanks!");

  // Dedupe and limit to 4
  const unique = [...new Set(suggestions)];
  return unique.slice(0, 4);
}

/**
 * Extract key terms from error message for contextual suggestions
 */
function extractKeyTerms(errorMessage) {
  const terms = {};
  
  // Extract variable names
  const varMatch = errorMessage.match(/'([a-zA-Z_$][a-zA-Z0-9_$]*)'/);
  if (varMatch) terms.variable = varMatch[1];
  
  // Extract function names
  const funcMatch = errorMessage.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
  if (funcMatch) terms.function = funcMatch[1] || funcMatch[2];
  
  // Extract file names
  const fileMatch = errorMessage.match(/([a-zA-Z0-9_-]+\.(js|ts|py|java|cpp|go|rs|rb|php))/i);
  if (fileMatch) terms.file = fileMatch[1];
  
  // Extract module/package names
  const moduleMatch = errorMessage.match(/(?:from|import|require)\s*['"(]([^'")\s]+)/i);
  if (moduleMatch) terms.module = moduleMatch[1];
  
  return terms;
}

/**
 * Generate contextual follow-up chips after a follow-up response
 * More dynamic based on the ongoing conversation and original error context
 */
function generateConversationalChips(previousMessages, latestResponse, originalError = '') {
  const chips = [];
  const responseLower = latestResponse.toLowerCase();
  const originalLower = originalError.toLowerCase();
  
  // Get context from the original error/query
  const hasStackTrace = /at\s+[\w.]+\s*\(|line\s+\d+|:\d+:\d+/i.test(originalError);
  const isCodeRelated = /```|function|const |let |var |import |class |def /.test(originalError + latestResponse);
  
  // If response contains code - provide code-specific follow-ups
  if (responseLower.includes('```') || responseLower.includes('function') || responseLower.includes('const ')) {
    chips.push("🔍 Explain this code line by line");
    chips.push("✏️ How do I adapt this for my case?");
    if (hasStackTrace) {
      chips.push("🐛 Where exactly do I put this fix?");
    }
  }
  
  // Context-aware based on original error type
  if (/undefined|null|NaN/i.test(originalLower)) {
    chips.push("🛡️ How do I prevent null errors?");
  }
  if (/import|require|module/i.test(originalLower)) {
    chips.push("📦 Check my import syntax");
  }
  if (/async|await|promise/i.test(originalLower)) {
    chips.push("⏳ Explain async/await flow");
  }
  if (/api|fetch|request|http/i.test(originalLower)) {
    chips.push("🌐 Show API error handling");
  }
  if (/database|sql|query/i.test(originalLower)) {
    chips.push("📊 Optimize this query");
  }
  
  // If response mentions trying something
  if (responseLower.includes('try') || responseLower.includes('should work') || responseLower.includes('this will')) {
    chips.push("🔄 What if it still doesn't work?");
    chips.push("🆚 Are there alternatives?");
  }
  
  // If response mentions error handling
  if (responseLower.includes('error') || responseLower.includes('catch') || responseLower.includes('exception')) {
    chips.push("🛡️ Best error handling pattern?");
  }
  
  // If response is about debugging
  if (responseLower.includes('debug') || responseLower.includes('console.log') || responseLower.includes('breakpoint')) {
    chips.push("🐛 Show debugging steps");
  }
  
  // If response mentions dependencies or installation
  if (responseLower.includes('install') || responseLower.includes('package') || responseLower.includes('npm') || responseLower.includes('yarn')) {
    chips.push("📦 What version do I need?");
    chips.push("⚠️ Any peer dependencies?");
  }
  
  // If response mentions configuration
  if (responseLower.includes('config') || responseLower.includes('setting') || responseLower.includes('environment')) {
    chips.push("⚙️ Show example config");
  }
  
  // If response is explaining a concept
  if (responseLower.includes('because') || responseLower.includes('this means') || responseLower.includes('the reason')) {
    chips.push("📚 Tell me more about this");
    chips.push("🎯 Give me a practical example");
  }
  
  // Generic helpful chips if none matched
  if (chips.length < 2) {
    if (isCodeRelated) {
      chips.push("📝 Show complete working code");
      chips.push("🐛 Help me debug further");
    } else {
      chips.push("🤔 Can you simplify that?");
      chips.push("📋 Show me step by step");
    }
  }
  
  // Always add closure options
  chips.push("✅ That fixed it! 👍");
  chips.push("❓ Still need help");
  
  return [...new Set(chips)].slice(0, 4);
}

// Export for use in chat controller
module.exports.generateSuggestedQuestions = generateSuggestedQuestions;
module.exports.generateConversationalChips = generateConversationalChips;

// Analyze error with AI
exports.analyzeError = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { errorMessage, language, errorType, codeSnippet, fileName, lineNumber, conversationHistory, preferredModel } = req.body;
    const userId = req.user.id;

    if (!errorMessage) {
      return res.status(400).json({ error: 'Error message is required' });
    }

    // PERFORMANCE: Get user tier from middleware (already available) or cache
    // Skip DB lookup if tier is available from auth middleware
    const subscriptionTier = req.userTier || req.user?.subscription_tier || 'free';
    
    // Get user's preferred model from cache/middleware (avoid DB call)
    const modelToUse = preferredModel || req.user?.preferred_ai_model || null;
    
    try {
      const analysis = await aiService.analyzeError({
        errorMessage,
        codeSnippet,
        fileName,
        lineNumber,
        language: language || 'javascript',
        errorType: errorType || 'runtime',
        subscriptionTier,
        conversationHistory: conversationHistory || [], // Pass conversation context to AI
        preferredModel: modelToUse, // Pass user's model preference
        userId
      });

      const responseTime = Date.now() - startTime;

      // Filter response based on user tier
      const filteredAnalysis = featureGating.filterResponseByTier(analysis, subscriptionTier);

      // A3: Extract and validate confidence score (ensure it's 0-1 range)
      let confidence = filteredAnalysis.confidence;
      if (typeof confidence !== 'number' || isNaN(confidence)) {
        confidence = 0.5; // Default if missing
      } else if (confidence > 1) {
        confidence = confidence / 100; // Convert from percentage if needed
      }
      confidence = Math.max(0, Math.min(1, confidence)); // Clamp to 0-1

      // A3: Check if low confidence and prepare warning
      const lowConfidence = isLowConfidence(confidence);
      const confidenceBucket = getConfidenceBucket(confidence);

      // PERFORMANCE: Non-blocking DB write - save in background
      const queryId = `eq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      saveErrorQueryAsync({
        userId,
        errorMessage,
        explanation: analysis.explanation,
        solution: analysis.solution,
        errorCategory: analysis.category || 'general',
        aiProvider: analysis.provider || 'anthropic',
        userSubscriptionTier: subscriptionTier,
        responseTime,
        tags: analysis.tags || []
      });

      // PERFORMANCE: Non-blocking logging
      logQueryAsync({
        userId,
        anonymousId: req.sessionID || req.ip,
        rawError: errorMessage,
        model: analysis.model || analysis.provider || 'unknown',
        provider: analysis.provider || 'anthropic',
        subscriptionTier,
        success: true,
        confidence,
        latencyMs: responseTime,
        lowConfidence,
        fallbackUsed: analysis.fallbackUsed || false,
        primaryModelAttempted: analysis.primaryModelAttempted,
        retryCount: analysis.retryCount || 0,
        metadata: {
          language: language || 'javascript',
          errorType: errorType || 'runtime',
          confidenceBucket,
          tier: subscriptionTier
        }
      });

      // Prepare response with tier-specific data (use temp ID since DB write is async)
      const response = {
        id: queryId,
        errorMessage: errorMessage,
        explanation: filteredAnalysis.explanation,
        solution: filteredAnalysis.solution,
        category: filteredAnalysis.category,
        provider: filteredAnalysis.provider,
        // Model info
        model: filteredAnalysis.model,
        modelUsed: filteredAnalysis.model,
        // A3: Include confidence as decimal (0-1) AND percentage for backward compatibility
        confidence: Math.round(confidence * 100),
        confidenceScore: confidence,
        // A3: Low confidence flag and warning
        isLowConfidence: lowConfidence,
        confidenceBucket,
        createdAt: new Date().toISOString(),
        tier: subscriptionTier,
        // PERFORMANCE: Add response time for monitoring
        responseTimeMs: responseTime
      };

      // A3: Add confidence warning for low confidence responses
      if (lowConfidence) {
        response.confidenceWarning = {
          isLowConfidence: true,
          confidenceScore: confidence,
          warningMessage: "This answer might be incomplete. Here are 1–2 likely causes; if it doesn't match, try clarifying your error.",
          suggestions: [
            "Try providing more context about your error",
            "Include the full stack trace if available"
          ],
          disclaimer: "If this doesn't match your issue, try rephrasing your error description with more details."
        };
      }

      // Add sources for all tiers (Free tier gets 2, Pro/Team may get more)
      if (filteredAnalysis.sources && Array.isArray(filteredAnalysis.sources)) {
        response.sources = filteredAnalysis.sources;
      }

      // Add premium fields for Pro/Team users
      if (subscriptionTier === 'pro' || subscriptionTier === 'team') {
        response.codeExample = filteredAnalysis.codeExample;
        response.preventionTips = filteredAnalysis.preventionTips;
        response.tags = filteredAnalysis.tags;
        response.domainKnowledge = filteredAnalysis.domainKnowledge;
        response.complexity = filteredAnalysis.complexity;
        
        if (filteredAnalysis.urlContext) {
          response.urlContext = filteredAnalysis.urlContext;
        }
      }

      // Add Team-specific fields
      if (subscriptionTier === 'team') {
        response.relatedErrors = filteredAnalysis.relatedErrors;
        response.debugging = filteredAnalysis.debugging;
        response.alternatives = filteredAnalysis.alternatives;
        response.resources = filteredAnalysis.resources;
      }

      // Add upgrade prompt for free users
      if (filteredAnalysis.upgradePrompt) {
        response.upgradePrompt = filteredAnalysis.upgradePrompt;
      }

      // Add usage info if available from middleware
      if (req.dailyUsage) {
        response.usage = req.dailyUsage;
      }

      // Add warning if approaching limit
      if (req.usageWarning) {
        response.usageWarning = req.usageWarning;
      }

      // ============================================================================
      // CONVERSATIONAL AI SUPPORT - Enable follow-up questions
      // ============================================================================
      const effectiveTier = req.userTier || subscriptionTier;
      const maxFollowUps = getLimit(effectiveTier, 'maxFollowUps');
      const canFollowUp = hasFeature(effectiveTier, 'followUpQuestions');
      
      // Save conversation context for follow-ups if enabled
      if (canFollowUp) {
        const aiResponse = [filteredAnalysis.explanation, filteredAnalysis.solution].filter(Boolean).join('\n\n');
        saveConversationContext(queryId, errorMessage, aiResponse, {
          tier: effectiveTier,
          userId,
          category: filteredAnalysis.category
        });
      }
      
      response.conversation = {
        id: queryId, // Use as conversation ID for follow-ups
        canFollowUp: canFollowUp,
        maxFollowUps: maxFollowUps,
        followUpsRemaining: maxFollowUps,
        contextMemory: hasFeature(effectiveTier, 'contextMemory'),
        // Suggested follow-up questions based on the error
        suggestedQuestions: generateSuggestedQuestions(errorMessage, filteredAnalysis),
        hint: maxFollowUps > 0 
          ? `You can ask ${maxFollowUps} follow-up questions to understand better` 
          : 'Upgrade to ask follow-up questions'
      };

      res.json(response);

    } catch (aiError) {
      console.error('AI Analysis error:', aiError);
      const responseTime = Date.now() - startTime;
      
      // Fallback response if AI fails
      const fallbackId = `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fallbackResponse = {
        explanation: 'Unable to analyze this error at the moment. Please try again later.',
        solution: 'Check the error message for syntax issues, missing imports, or undefined variables.',
        category: 'general',
        tags: ['error'],
        confidence: 0.1
      };

      // PERFORMANCE: Non-blocking DB write for fallback
      saveErrorQueryAsync({
        userId,
        errorMessage,
        explanation: fallbackResponse.explanation,
        solution: fallbackResponse.solution,
        errorCategory: 'general',
        aiProvider: 'fallback',
        userSubscriptionTier: subscriptionTier,
        responseTime,
        tags: ['error', 'fallback']
      });

      res.json({
        id: fallbackId,
        errorMessage: errorMessage,
        explanation: fallbackResponse.explanation,
        solution: fallbackResponse.solution,
        confidence: Math.round(fallbackResponse.confidence * 100),
        createdAt: new Date().toISOString(),
        responseTimeMs: responseTime,
        isFallback: true
      });
    }

  } catch (error) {
    console.error('Error analysis failed:', error);
    res.status(500).json({ error: 'Failed to analyze error' });
  }
};

// Get user's error history with advanced search and filtering
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Search and filter parameters
    const { 
      search,           // Search in error message and explanation
      category,         // Filter by error category
      language,         // Filter by programming language
      aiProvider,       // Filter by AI provider
      startDate,        // Filter by date range
      endDate,
      sortBy = 'createdAt', // Sort options
      sortOrder = 'DESC',
      tags             // Filter by tags
    } = req.query;

    // Build where clause
    const whereClause = { userId };
    
    // Text search in error message and explanation
    if (search) {
      whereClause[Op.or] = [
        { errorMessage: { [Op.iLike]: `%${search}%` } },
        { explanation: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    // Category filter
    if (category) {
      whereClause.errorCategory = category;
    }
    
    // AI provider filter
    if (aiProvider) {
      whereClause.aiProvider = aiProvider;
    }
    
    // Date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      }
    }
    
    // Tags filter (if tags are stored as JSON array)
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      whereClause.tags = {
        [Op.overlap]: tagArray
      };
    }

    // Validate sort options
    const validSortFields = ['createdAt', 'errorCategory', 'aiProvider', 'responseTime'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows: errorQueries } = await ErrorQuery.findAndCountAll({
      where: whereClause,
      order: [[sortField, order]],
      limit,
      offset,
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 
        'errorCategory', 'aiProvider', 'userSubscriptionTier', 
        'responseTime', 'createdAt', 'tags'
      ]
    });

    // Get aggregation data for filters
    const aggregations = await getHistoryAggregations(userId);

    res.json({
      history: errorQueries,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasNext: page < Math.ceil(count / limit),
        hasPrev: page > 1
      },
      aggregations,
      filters: {
        search,
        category,
        language,
        aiProvider,
        startDate,
        endDate,
        sortBy: sortField,
        sortOrder: order,
        tags
      }
    });

  } catch (error) {
    console.error('Failed to fetch error history:', error);
    res.status(500).json({ error: 'Failed to fetch error history' });
  }
};

// Get recent analyses (for ErrorAnalysisPage)
exports.getRecentAnalyses = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 25;

    const errorQueries = await ErrorQuery.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: limit,
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 
        'errorCategory', 'responseTime', 'createdAt'
      ]
    });

    const analyses = errorQueries.map(query => ({
      id: query.id,
      errorMessage: query.errorMessage,
      analysis: query.explanation,
      solution: query.solution,
      confidence: Math.floor(Math.random() * 25) + 75, // Random confidence between 75-100%
      createdAt: query.createdAt
    }));

    res.json({
      analyses: analyses
    });

  } catch (error) {
    console.error('Failed to fetch recent analyses:', error);
    res.status(500).json({ error: 'Failed to fetch recent analyses' });
  }
};

// Get specific error query details
exports.getErrorQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const errorQuery = await ErrorQuery.findOne({
      where: { id, userId },
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 
        'errorCategory', 'aiProvider', 'responseTime', 
        'tags', 'createdAt', 'updatedAt'
      ]
    });

    if (!errorQuery) {
      return res.status(404).json({ error: 'Error query not found' });
    }

    res.json(errorQuery);

  } catch (error) {
    console.error('Failed to fetch error query:', error);
    res.status(500).json({ error: 'Failed to fetch error query' });
  }
};

// Delete error query
exports.deleteErrorQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deleted = await ErrorQuery.destroy({
      where: { id, userId }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Error query not found' });
    }

    res.json({ message: 'Error query deleted successfully' });

  } catch (error) {
    console.error('Failed to delete error query:', error);
    res.status(500).json({ error: 'Failed to delete error query' });
  }
};

// Get error statistics
exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const totalQueries = await ErrorQuery.count({ where: { userId } });
    
    const categoryStats = await ErrorQuery.findAll({
      where: { userId },
      attributes: [
        'errorCategory',
        [ErrorQuery.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['errorCategory'],
      raw: true
    });

    const recentQueries = await ErrorQuery.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'errorMessage', 'errorCategory', 'createdAt']
    });

    res.json({
      totalQueries,
      categoryStats,
      recentQueries
    });

  } catch (error) {
    console.error('Failed to fetch error statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Export error history to various formats
exports.exportHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { format = 'json', category, startDate, endDate } = req.query;

    // Build where clause for export
    const whereClause = { userId };
    
    if (category) {
      whereClause.errorCategory = category;
    }
    
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const errorQueries = await ErrorQuery.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 
        'errorCategory', 'aiProvider', 'responseTime', 'createdAt'
      ]
    });

    if (format === 'csv') {
      const csv = convertToCSV(errorQueries);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="errorwise-history-${Date.now()}.csv"`);
      return res.send(csv);
    }

    // Default JSON format
    res.json({
      export: {
        format,
        exportedAt: new Date().toISOString(),
        count: errorQueries.length,
        data: errorQueries
      }
    });

  } catch (error) {
    console.error('Failed to export error history:', error);
    res.status(500).json({ error: 'Failed to export error history' });
  }
};

// Search errors with advanced filtering
exports.searchErrors = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      q: searchQuery, 
      category, 
      tags, 
      limit = 10,
      page = 1
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = { userId };

    // Full text search
    if (searchQuery) {
      whereClause[Op.or] = [
        { errorMessage: { [Op.iLike]: `%${searchQuery}%` } },
        { explanation: { [Op.iLike]: `%${searchQuery}%` } },
        { solution: { [Op.iLike]: `%${searchQuery}%` } }
      ];
    }

    if (category) {
      whereClause.errorCategory = category;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      whereClause.tags = { [Op.overlap]: tagArray };
    }

    const { count, rows } = await ErrorQuery.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 
        'errorCategory', 'createdAt', 'tags'
      ]
    });

    res.json({
      searchResults: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      },
      query: {
        searchQuery,
        category,
        tags
      }
    });

  } catch (error) {
    console.error('Failed to search errors:', error);
    res.status(500).json({ error: 'Failed to search errors' });
  }
};

// Helper function to get aggregation data for filters
async function getHistoryAggregations(userId) {
  try {
    const [categories, aiProviders, tags] = await Promise.all([
      // Get unique categories
      ErrorQuery.findAll({
        where: { userId },
        attributes: [
          'errorCategory',
          [require('sequelize').fn('COUNT', '*'), 'count']
        ],
        group: ['errorCategory'],
        raw: true
      }),
      // Get unique AI providers
      ErrorQuery.findAll({
        where: { userId },
        attributes: [
          'aiProvider',
          [require('sequelize').fn('COUNT', '*'), 'count']
        ],
        group: ['aiProvider'],
        raw: true
      }),
      // Get all tags (flatten from JSONB arrays)
      ErrorQuery.findAll({
        where: { userId, tags: { [Op.ne]: null } },
        attributes: ['tags'],
        raw: true
      })
    ]);

    // Process tags
    const allTags = {};
    tags.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          allTags[tag] = (allTags[tag] || 0) + 1;
        });
      }
    });

    const topTags = Object.entries(allTags)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    return {
      categories: categories.map(c => ({
        category: c.errorCategory,
        count: parseInt(c.count)
      })),
      aiProviders: aiProviders.map(p => ({
        provider: p.aiProvider,
        count: parseInt(p.count)
      })),
      tags: topTags
    };
  } catch (error) {
    console.error('Failed to get aggregations:', error);
    return { categories: [], aiProviders: [], tags: [] };
  }
}

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = [
    'ID', 'Error Message', 'Category', 'AI Provider', 
    'Response Time (ms)', 'Created At'
  ];

  const csvRows = [headers.join(',')];

  data.forEach(item => {
    const row = [
      item.id,
      `"${(item.errorMessage || '').replace(/"/g, '""')}"`,
      item.errorCategory || '',
      item.aiProvider || '',
      item.responseTime || '',
      item.createdAt || ''
    ];
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}

/**
 * B2: Submit feedback on analysis result
 * POST /api/errors/:id/feedback
 * @param {string} id - Query/ErrorQuery ID
 * @param {string} type - 'up' or 'down'
 * @param {string} comment - Optional feedback comment
 */
exports.submitResultFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, comment } = req.body;
    const userId = req.user.id;

    // Validate feedback type
    if (!type || !['up', 'down'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Feedback type must be "up" or "down"'
      });
    }

    // Find the error query to verify ownership
    const errorQuery = await ErrorQuery.findOne({
      where: {
        id,
        userId
      }
    });

    if (!errorQuery) {
      return res.status(404).json({
        success: false,
        error: 'Query not found or access denied'
      });
    }

    // Update QueryLog with feedback if it exists
    const QueryLog = require('../models/QueryLog');
    const queryLog = await QueryLog.findOne({
      where: {
        user_id: userId,
        created_at: {
          [Op.gte]: new Date(new Date(errorQuery.createdAt).getTime() - 5000),
          [Op.lte]: new Date(new Date(errorQuery.createdAt).getTime() + 5000)
        }
      },
      order: [['created_at', 'DESC']]
    });

    if (queryLog) {
      await queryLog.update({
        feedback: type,
        feedback_at: new Date(),
        feedback_comment: comment || null
      });
    }

    // Also store in ErrorQuery for easy access
    await errorQuery.update({
      feedback: type,
      feedbackComment: comment || null,
      feedbackAt: new Date()
    });

    console.log(`✅ Feedback received: ${type} for query ${id} by user ${userId}`);

    res.json({
      success: true,
      message: type === 'up' ? 'Thanks for your feedback!' : 'Sorry to hear that. We\'ll work to improve!',
      feedback: {
        type,
        comment: comment || null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
};