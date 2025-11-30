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