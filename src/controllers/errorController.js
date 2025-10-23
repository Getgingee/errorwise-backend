const ErrorQuery = require('../models/ErrorQuery');
const User = require('../models/User');
const authService = require('../services/authService');
const aiService = require('../services/aiService');
const { Op } = require('sequelize');

// Analyze error with AI
exports.analyzeError = async (req, res) => {
  try {
    const { errorMessage, language, errorType, codeSnippet, fileName, lineNumber } = req.body;
    const userId = req.user.id;

    if (!errorMessage) {
      return res.status(400).json({ error: 'Error message is required' });
    }

    // Get user's subscription tier
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's subscription tier from middleware
    const subscriptionTier = req.userTier || 'free';

    // Call AI service to analyze the error
    const startTime = Date.now();
    
    try {
      const analysis = await aiService.analyzeError({
        errorMessage,
        codeSnippet,
        fileName,
        lineNumber,
        language: language || 'javascript',
        errorType: errorType || 'runtime',
        subscriptionTier
      });

      const responseTime = Date.now() - startTime;

      // Save the query to database
      const errorQuery = await ErrorQuery.create({
        userId,
        errorMessage,
        explanation: analysis.explanation,
        solution: analysis.solution,
        errorCategory: analysis.category || 'general',
        aiProvider: analysis.provider || 'openai',
        userSubscriptionTier: subscriptionTier,
        responseTime,
        tags: analysis.tags || []
      });

      res.json({
        analysis: {
          id: errorQuery.id,
          errorMessage: errorMessage,
          analysis: analysis.explanation,
          solution: analysis.solution,
          confidence: Math.round(analysis.confidence * 100) || 85,
          createdAt: errorQuery.createdAt
        }
      });

    } catch (aiError) {
      console.error('AI Analysis error:', aiError);
      
      // Fallback response if AI fails
      const fallbackResponse = {
        explanation: 'Unable to analyze this error at the moment. Please try again later.',
        solution: 'Check the error message for syntax issues, missing imports, or undefined variables.',
        category: 'general',
        tags: ['error'],
        confidence: 0.1
      };

      // Still save to database for tracking
      const fallbackQuery = await ErrorQuery.create({
        userId,
        errorMessage,
        explanation: fallbackResponse.explanation,
        solution: fallbackResponse.solution,
        errorCategory: 'general',
        aiProvider: 'fallback',
        userSubscriptionTier: subscriptionTier,
        responseTime: Date.now() - startTime,
        tags: ['error', 'fallback']
      });

      res.json({
        analysis: {
          id: fallbackQuery.id,
          errorMessage: errorMessage,
          analysis: fallbackResponse.explanation,
          solution: fallbackResponse.solution,
          confidence: Math.round(fallbackResponse.confidence * 100),
          createdAt: fallbackQuery.createdAt
        }
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
    const limit = parseInt(req.query.limit) || 10;

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
