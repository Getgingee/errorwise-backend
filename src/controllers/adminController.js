/**
 * Admin Controller - Query Logs & Analytics (A1)
 * 
 * Provides admin endpoints for viewing query logs, statistics,
 * and error patterns for monitoring and debugging.
 * 
 * @ticket A1 – Implement structured error logging for all queries
 * @epic EPIC A — Reliability & Error Handling
 */

const queryLogger = require('../services/queryLogger');

/**
 * Get recent query logs
 * GET /api/admin/query-logs
 * 
 * Query params:
 * - limit: Number of logs (default 100, max 500)
 * - success: Filter by success (true/false)
 * - lowConfidence: Filter by low confidence (true/false)
 * - provider: Filter by provider
 * - tier: Filter by subscription tier
 * - since: Filter by timestamp (ISO string)
 */
async function getQueryLogs(req, res) {
  try {
    const {
      limit = 100,
      success,
      lowConfidence,
      provider,
      tier,
      since
    } = req.query;
    
    // Parse and validate limit
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    
    // Build filters
    const filters = {};
    if (success !== undefined) {
      filters.success = success === 'true';
    }
    if (lowConfidence !== undefined) {
      filters.lowConfidence = lowConfidence === 'true';
    }
    if (provider) {
      filters.provider = provider;
    }
    if (tier) {
      filters.subscriptionTier = tier;
    }
    if (since) {
      filters.since = since;
    }
    
    const logs = await queryLogger.getRecentLogs(parsedLimit, filters);
    
    res.json({
      success: true,
      count: logs.length,
      limit: parsedLimit,
      filters,
      logs
    });
    
  } catch (error) {
    console.error('Error fetching query logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch query logs',
      message: error.message
    });
  }
}

/**
 * Get query statistics
 * GET /api/admin/query-logs/stats
 * 
 * Query params:
 * - period: Time period (hour, day, week, month) - default: day
 */
async function getQueryStats(req, res) {
  try {
    const { period = 'day' } = req.query;
    
    const validPeriods = ['hour', 'day', 'week', 'month'];
    const validPeriod = validPeriods.includes(period) ? period : 'day';
    
    const stats = await queryLogger.getStatistics(validPeriod);
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('Error fetching query stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
}

/**
 * Get common error patterns
 * GET /api/admin/query-logs/patterns
 * 
 * Query params:
 * - limit: Number of patterns (default 20, max 100)
 */
async function getErrorPatterns(req, res) {
  try {
    const { limit = 20 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    
    const patterns = await queryLogger.getCommonPatterns(parsedLimit);
    
    res.json({
      success: true,
      count: patterns.length,
      patterns
    });
    
  } catch (error) {
    console.error('Error fetching error patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error patterns',
      message: error.message
    });
  }
}

/**
 * Get recent failures
 * GET /api/admin/query-logs/failures
 * 
 * Query params:
 * - limit: Number of failures (default 50, max 200)
 */
async function getRecentFailures(req, res) {
  try {
    const { limit = 50 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    
    const failures = await queryLogger.getRecentFailures(parsedLimit);
    
    res.json({
      success: true,
      count: failures.length,
      failures
    });
    
  } catch (error) {
    console.error('Error fetching failures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch failures',
      message: error.message
    });
  }
}

/**
 * Get low confidence responses
 * GET /api/admin/query-logs/low-confidence
 * 
 * Query params:
 * - limit: Number of responses (default 50, max 200)
 */
async function getLowConfidenceResponses(req, res) {
  try {
    const { limit = 50 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    
    const responses = await queryLogger.getLowConfidenceResponses(parsedLimit);
    
    res.json({
      success: true,
      count: responses.length,
      threshold: queryLogger.CONFIG.LOW_CONFIDENCE_THRESHOLD,
      responses
    });
    
  } catch (error) {
    console.error('Error fetching low confidence responses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch low confidence responses',
      message: error.message
    });
  }
}

/**
 * Get dashboard summary
 * GET /api/admin/query-logs/dashboard
 * 
 * Returns a comprehensive dashboard view with:
 * - Current statistics
 * - Recent failures
 * - Low confidence responses
 * - Common patterns
 */
async function getDashboard(req, res) {
  try {
    // Fetch all data in parallel
    const [
      dayStats,
      hourStats,
      recentFailures,
      lowConfidence,
      patterns,
      fallbackStats
    ] = await Promise.all([
      queryLogger.getStatistics('day'),
      queryLogger.getStatistics('hour'),
      queryLogger.getRecentFailures(10),
      queryLogger.getLowConfidenceResponses(10),
      queryLogger.getCommonPatterns(10),
      queryLogger.getFallbackStatistics()  // A2: Include fallback stats
    ]);
    
    res.json({
      success: true,
      dashboard: {
        summary: {
          last24Hours: dayStats,
          lastHour: hourStats
        },
        alerts: {
          recentFailures: recentFailures.length,
          lowConfidenceResponses: lowConfidence.length,
          meetsTarget: dayStats.rates.meetsTarget
        },
        fallbackStats,  // A2: Fallback statistics
        recentFailures,
        lowConfidenceResponses: lowConfidence,
        commonPatterns: patterns,
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard',
      message: error.message
    });
  }
}

/**
 * A2: Get fallback statistics
 * GET /api/admin/query-logs/fallback-stats
 * 
 * Returns statistics about model fallback usage:
 * - Fallback rate
 * - Primary success rate
 * - Error categories
 * - Fallback model usage breakdown
 */
async function getFallbackStats(req, res) {
  try {
    const { startDate, endDate } = req.query;
    
    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    
    const stats = await queryLogger.getFallbackStatistics(options);
    
    res.json({
      success: true,
      fallbackStats: stats
    });
    
  } catch (error) {
    console.error('Error fetching fallback statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fallback statistics',
      message: error.message
    });
  }
}

module.exports = {
  getQueryLogs,
  getQueryStats,
  getErrorPatterns,
  getRecentFailures,
  getLowConfidenceResponses,
  getDashboard,
  getFallbackStats  // A2: Fallback statistics endpoint
};
