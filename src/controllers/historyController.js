const ErrorQuery = require('../models/ErrorQuery');
const { Op } = require('sequelize');

// GET /api/history - Optimized with cursor pagination
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, cursor, category } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 50);
    
    const where = { userId };
    if (cursor) {
      where.id = { [Op.lt]: cursor };
    }
    if (category) {
      where.errorCategory = category;
    }
    
    const history = await ErrorQuery.findAll({
      where,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: parsedLimit + 1,
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 'errorCategory',
        'aiProvider', 'userSubscriptionTier', 'responseTime', 'tags', 'createdAt'
      ]
    });
    
    const hasMore = history.length > parsedLimit;
    if (hasMore) history.pop();
    
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ 
      history,
      pagination: {
        hasMore,
        nextCursor: hasMore && history.length > 0 ? history[history.length - 1].id : null
      }
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch query history' });
  }
};

// GET /api/history/user - Optimized pagination
exports.getUserHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 15, 
      search = '', 
      category = '', 
      sortBy = 'createdAt', 
      sortOrder = 'DESC',
      cursor 
    } = req.query;
    
    const parsedLimit = Math.min(parseInt(limit) || 15, 50);
    const offset = cursor ? 0 : (parseInt(page) - 1) * parsedLimit;
    const whereClause = { userId };

    if (cursor) {
      whereClause.id = { [Op.lt]: cursor };
    }
    
    if (search.trim()) {
      whereClause[Op.or] = [
        { errorMessage: { [Op.iLike]: `%${search}%` } },
        { explanation: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (category.trim()) {
      whereClause.errorCategory = category;
    }
    
    // Only count on first page
    let total = null;
    if (!cursor && parseInt(page) === 1) {
      total = await ErrorQuery.count({ where: { userId } });
    }
    
    const queries = await ErrorQuery.findAll({
      where: whereClause,
      order: [[sortBy, sortOrder.toUpperCase()], ['id', 'DESC']],
      limit: parsedLimit + 1,
      offset: cursor ? 0 : offset,
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 'errorCategory',
        'aiProvider', 'userSubscriptionTier', 'responseTime', 'tags', 'createdAt'
      ]
    });

    const hasMore = queries.length > parsedLimit;
    if (hasMore) queries.pop();
    
    const nextCursor = hasMore && queries.length > 0 ? queries[queries.length - 1].id : null;

    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      queries,
      pagination: {
        currentPage: parseInt(page),
        ...(total !== null && { totalPages: Math.ceil(total / parsedLimit) }),
        ...(total !== null && { totalQueries: total }),
        hasNextPage: hasMore,
        hasPrevPage: parseInt(page) > 1,
        nextCursor
      }
    });
  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({ error: 'Failed to fetch query history' });
  }
};

// GET /api/history/:queryId
exports.getQueryById = async (req, res) => {
  try {
    const { queryId } = req.params;
    const userId = req.user.id;
    const query = await ErrorQuery.findOne({
      where: { id: queryId, userId },
      attributes: [
        'id', 'errorMessage', 'explanation', 'solution', 'errorCategory',
        'aiProvider', 'userSubscriptionTier', 'responseTime', 'tags', 'createdAt', 'updatedAt'
      ]
    });
    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }
    res.json(query);
  } catch (error) {
    console.error('Error fetching query by ID:', error);
    res.status(500).json({ error: 'Failed to fetch query details' });
  }
};

// DELETE /api/history/:queryId
exports.deleteQuery = async (req, res) => {
  try {
    const { queryId } = req.params;
    const userId = req.user.id;
    const deleted = await ErrorQuery.destroy({
      where: { id: queryId, userId }
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Query not found' });
    }
    res.json({ message: 'Query deleted successfully' });
  } catch (error) {
    console.error('Error deleting query:', error);
    res.status(500).json({ error: 'Failed to delete query' });
  }
};

// GET /api/history/stats
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const totalQueries = await ErrorQuery.count({ where: { userId } });
    
    // Get queries from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const queriesThisWeek = await ErrorQuery.count({
      where: {
        userId,
        createdAt: { [Op.gte]: sevenDaysAgo }
      }
    });

    // Get queries from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const queriesThisMonth = await ErrorQuery.count({
      where: {
        userId,
        createdAt: { [Op.gte]: thirtyDaysAgo }
      }
    });

    // Get category breakdown
    const categoryStats = await ErrorQuery.findAll({
      where: { userId },
      attributes: [
        'errorCategory',
        [ErrorQuery.sequelize.fn('COUNT', ErrorQuery.sequelize.col('errorCategory')), 'count']
      ],
      group: ['errorCategory'],
      raw: true
    });

    res.json({
      totalQueries,
      queriesThisWeek,
      queriesThisMonth,
      categoriesBreakdown: categoryStats
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// GET /api/history/export
exports.exportHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const tier = req.user.subscriptionTier || 'free';
    const { format = 'json' } = req.query;

    // Pro/Team only feature
    if (tier === 'free') {
      return res.status(403).json({
        error: 'Export feature requires Pro or Team subscription',
        message: 'Upgrade to Pro to export your error history as JSON or CSV',
        upgrade: true,
        requiredTier: 'pro',
        upgradeUrl: `${process.env.FRONTEND_URL}/pricing`
      });
    }

    // Fetch all user's error history
    const history = await ErrorQuery.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'errorMessage',
        'explanation',
        'solution',
        'errorCategory',
        'aiProvider',
        'userSubscriptionTier',
        'responseTime',
        'tags',
        'createdAt'
      ]
    });

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['ID', 'Error Message', 'Category', 'AI Provider', 'Subscription Tier', 'Response Time (ms)', 'Created At'];
      const rows = history.map(h => [
        h.id,
        `"${(h.errorMessage || '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`, // Escape quotes and remove linebreaks
        h.errorCategory || 'Unknown',
        h.aiProvider || 'N/A',
        h.userSubscriptionTier || 'free',
        h.responseTime || 0,
        new Date(h.createdAt).toISOString()
      ]);

      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="errorwise-history-${Date.now()}.csv"`);
      return res.send(csv);
    }

    // JSON format (default)
    const jsonData = {
      exportedAt: new Date().toISOString(),
      userId,
      tier,
      totalQueries: history.length,
      history: history.map(h => ({
        id: h.id,
        errorMessage: h.errorMessage,
        explanation: h.explanation,
        solution: h.solution,
        category: h.errorCategory,
        aiProvider: h.aiProvider,
        subscriptionTier: h.userSubscriptionTier,
        responseTime: h.responseTime,
        tags: h.tags,
        createdAt: h.createdAt
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="errorwise-history-${Date.now()}.json"`);
    res.json(jsonData);

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export history' });
  }
};