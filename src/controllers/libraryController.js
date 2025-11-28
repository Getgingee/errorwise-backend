/**
 * Error Library Controller
 * 
 * Handles browsing, searching, and saving errors to the library.
 * 
 * @ticket Error Library - Save solved issues as templates for reuse
 * @endpoints
 *   GET  /api/library - Browse/search library
 *   GET  /api/library/popular - Get popular entries
 *   GET  /api/library/categories - Get all categories
 *   GET  /api/library/:id - Get single entry
 *   POST /api/library/save - Save user template
 *   POST /api/library/:id/feedback - Submit helpful/not helpful
 *   GET  /api/library/match - Find matching solution for error
 */

const { Op } = require('sequelize');
const ErrorLibrary = require('../models/ErrorLibrary');
const ErrorQuery = require('../models/ErrorQuery');
const sequelize = require('../config/database');

// ============================================================================
// BROWSE & SEARCH
// ============================================================================

/**
 * Browse/search the error library
 * GET /api/library
 * Query params: category, q (search), page, limit, difficulty
 */
exports.browseLibrary = async (req, res) => {
  try {
    const {
      category,
      q,
      page = 1,
      limit = 20,
      difficulty,
      sort = 'popular' // popular, recent, helpful
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {
      isActive: true,
      type: 'system' // Only show system entries in browse (user templates are private by default)
    };
    
    // Category filter
    if (category && category !== 'all') {
      where.category = category;
    }
    
    // Difficulty filter
    if (difficulty) {
      where.difficulty = difficulty;
    }
    
    // Search filter
    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { errorMessage: { [Op.iLike]: `%${q}%` } },
        { errorCode: { [Op.iLike]: `%${q}%` } },
        { explanation: { [Op.iLike]: `%${q}%` } },
        sequelize.where(
          sequelize.cast(sequelize.col('tags'), 'text'),
          { [Op.iLike]: `%${q}%` }
        )
      ];
    }
    
    // Sorting
    let order;
    switch (sort) {
      case 'recent':
        order = [['createdAt', 'DESC']];
        break;
      case 'helpful':
        order = [['helpfulCount', 'DESC'], ['viewCount', 'DESC']];
        break;
      case 'popular':
      default:
        order = [['viewCount', 'DESC'], ['useCount', 'DESC']];
    }
    
    const { count, rows } = await ErrorLibrary.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset,
      attributes: [
        'id', 'errorCode', 'title', 'errorMessage', 'category', 
        'subcategory', 'explanation', 'difficulty', 'viewCount',
        'useCount', 'helpfulCount', 'tags', 'platforms', 'createdAt'
      ]
    });
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Library browse error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to browse library'
    });
  }
};

/**
 * Get popular library entries
 * GET /api/library/popular
 */
exports.getPopular = async (req, res) => {
  try {
    const { limit = 10, category } = req.query;
    
    const where = {
      isActive: true,
      type: 'system'
    };
    
    if (category && category !== 'all') {
      where.category = category;
    }
    
    const entries = await ErrorLibrary.findAll({
      where,
      order: [
        ['viewCount', 'DESC'],
        ['helpfulCount', 'DESC']
      ],
      limit: parseInt(limit),
      attributes: [
        'id', 'errorCode', 'title', 'errorMessage', 'category',
        'explanation', 'difficulty', 'viewCount', 'helpfulCount', 'tags'
      ]
    });
    
    res.json({
      success: true,
      data: entries
    });
  } catch (error) {
    console.error('Get popular error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get popular entries'
    });
  }
};

/**
 * Get all categories with counts
 * GET /api/library/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await ErrorLibrary.findAll({
      where: { isActive: true, type: 'system' },
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['category'],
      raw: true
    });
    
    // Add friendly labels
    const categoryLabels = {
      payment: { label: 'Payment Errors', icon: '💳' },
      website: { label: 'Website Errors', icon: '🌐' },
      gaming: { label: 'Gaming Errors', icon: '🎮' },
      mobile: { label: 'Mobile/App Errors', icon: '📱' },
      software: { label: 'Software Errors', icon: '💻' },
      network: { label: 'Network Errors', icon: '📶' },
      database: { label: 'Database Errors', icon: '🗄️' },
      authentication: { label: 'Login Errors', icon: '🔐' },
      api: { label: 'API Errors', icon: '🔌' },
      general: { label: 'General Errors', icon: '❓' }
    };
    
    const formattedCategories = categories.map(cat => ({
      id: cat.category,
      ...categoryLabels[cat.category] || { label: cat.category, icon: '📁' },
      count: parseInt(cat.count)
    }));
    
    res.json({
      success: true,
      data: formattedCategories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
};

/**
 * Get single library entry
 * GET /api/library/:id
 */
exports.getEntry = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await ErrorLibrary.findByPk(id);
    
    if (!entry || !entry.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    // Increment view count
    await entry.increment('viewCount');
    
    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Get entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get entry'
    });
  }
};

// ============================================================================
// SMART MATCHING
// ============================================================================

/**
 * Find matching solution for an error message
 * GET /api/library/match
 * Query params: error (the error message)
 */
exports.findMatch = async (req, res) => {
  try {
    const { error: errorMessage } = req.query;
    
    if (!errorMessage || errorMessage.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an error message'
      });
    }
    
    const searchTerm = errorMessage.toLowerCase().trim();
    
    // Try exact error code match first
    const errorCodeMatch = searchTerm.match(/\b([0-9a-z_-]+(?:error)?[0-9a-z_-]*)\b/gi);
    
    let matches = [];
    
    if (errorCodeMatch) {
      for (const code of errorCodeMatch.slice(0, 3)) {
        const exactMatch = await ErrorLibrary.findAll({
          where: {
            isActive: true,
            [Op.or]: [
              { errorCode: { [Op.iLike]: `%${code}%` } },
              { errorMessage: { [Op.iLike]: `%${code}%` } }
            ]
          },
          limit: 5,
          order: [['helpfulCount', 'DESC']]
        });
        matches.push(...exactMatch);
      }
    }
    
    // If no exact matches, do fuzzy search
    if (matches.length === 0) {
      // Extract key words (remove common words)
      const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'error', 'message', 'failed', 'cannot', 'could', 'not', 'your', 'has', 'have', 'been'];
      const keywords = searchTerm
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word))
        .slice(0, 5);
      
      if (keywords.length > 0) {
        matches = await ErrorLibrary.findAll({
          where: {
            isActive: true,
            [Op.or]: keywords.map(kw => ({
              [Op.or]: [
                { title: { [Op.iLike]: `%${kw}%` } },
                { errorMessage: { [Op.iLike]: `%${kw}%` } },
                { explanation: { [Op.iLike]: `%${kw}%` } },
                sequelize.where(
                  sequelize.cast(sequelize.col('tags'), 'text'),
                  { [Op.iLike]: `%${kw}%` }
                )
              ]
            }))
          },
          limit: 10,
          order: [['helpfulCount', 'DESC'], ['viewCount', 'DESC']]
        });
      }
    }
    
    // Remove duplicates
    const uniqueMatches = [...new Map(matches.map(m => [m.id, m])).values()];
    
    res.json({
      success: true,
      data: uniqueMatches.slice(0, 5),
      matchCount: uniqueMatches.length
    });
  } catch (error) {
    console.error('Find match error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find matches'
    });
  }
};

// ============================================================================
// USER TEMPLATES
// ============================================================================

/**
 * Save a solved error as a user template
 * POST /api/library/save
 * Body: { errorQueryId } or { title, errorMessage, explanation, solution, category }
 */
exports.saveTemplate = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { errorQueryId, title, errorMessage, explanation, solution, category, tags, isPublic } = req.body;
    
    let templateData;
    
    // If saving from an existing query
    if (errorQueryId) {
      const query = await ErrorQuery.findOne({
        where: { id: errorQueryId, userId }
      });
      
      if (!query) {
        return res.status(404).json({
          success: false,
          error: 'Query not found'
        });
      }
      
      templateData = {
        type: 'user',
        userId,
        title: title || `Saved: ${query.errorMessage.substring(0, 50)}...`,
        errorMessage: query.errorMessage,
        explanation: query.explanation,
        solution: query.solution || 'See explanation above',
        category: query.errorCategory || 'general',
        tags: query.tags || [],
        isPublic: false
      };
    } else {
      // Creating new template manually
      if (!title || !errorMessage || !explanation || !solution) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: title, errorMessage, explanation, solution'
        });
      }
      
      templateData = {
        type: 'user',
        userId,
        title,
        errorMessage,
        explanation,
        solution,
        category: category || 'general',
        tags: tags || [],
        isPublic: isPublic || false
      };
    }
    
    const template = await ErrorLibrary.create(templateData);
    
    res.status(201).json({
      success: true,
      message: 'Template saved successfully',
      data: template
    });
  } catch (error) {
    console.error('Save template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save template'
    });
  }
};

/**
 * Get user's saved templates
 * GET /api/library/my-templates
 */
exports.getMyTemplates = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { count, rows } = await ErrorLibrary.findAndCountAll({
      where: { userId, type: 'user' },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get my templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get templates'
    });
  }
};

/**
 * Delete a user template
 * DELETE /api/library/:id
 */
exports.deleteTemplate = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const template = await ErrorLibrary.findOne({
      where: { id, userId, type: 'user' }
    });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }
    
    await template.destroy();
    
    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template'
    });
  }
};

// ============================================================================
// FEEDBACK
// ============================================================================

/**
 * Submit feedback on a library entry
 * POST /api/library/:id/feedback
 * Body: { helpful: true/false }
 */
exports.submitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body;
    
    if (typeof helpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Please specify if the solution was helpful (true/false)'
      });
    }
    
    const entry = await ErrorLibrary.findByPk(id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    if (helpful) {
      await entry.increment('helpfulCount');
    } else {
      await entry.increment('notHelpfulCount');
    }
    
    res.json({
      success: true,
      message: 'Thank you for your feedback!'
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
};

/**
 * Mark a solution as used (applied)
 * POST /api/library/:id/use
 */
exports.markUsed = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await ErrorLibrary.findByPk(id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }
    
    await entry.increment('useCount');
    
    res.json({
      success: true,
      message: 'Usage recorded'
    });
  } catch (error) {
    console.error('Mark used error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record usage'
    });
  }
};
