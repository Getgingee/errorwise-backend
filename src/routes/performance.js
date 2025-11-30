const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { CONFIG } = require('../services/aiService');

// ============================================================================
// PERFORMANCE MONITORING ENDPOINTS
// ============================================================================

// Track response times
const responseTimeStats = {
  total: 0,
  count: 0,
  min: Infinity,
  max: 0,
  buckets: {
    under100ms: 0,
    under200ms: 0,
    under500ms: 0,
    under1s: 0,
    under2s: 0,
    over2s: 0
  },
  lastReset: new Date().toISOString()
};

/**
 * Record a response time
 */
function recordResponseTime(ms) {
  responseTimeStats.total += ms;
  responseTimeStats.count++;
  responseTimeStats.min = Math.min(responseTimeStats.min, ms);
  responseTimeStats.max = Math.max(responseTimeStats.max, ms);
  
  if (ms < 100) responseTimeStats.buckets.under100ms++;
  else if (ms < 200) responseTimeStats.buckets.under200ms++;
  else if (ms < 500) responseTimeStats.buckets.under500ms++;
  else if (ms < 1000) responseTimeStats.buckets.under1s++;
  else if (ms < 2000) responseTimeStats.buckets.under2s++;
  else responseTimeStats.buckets.over2s++;
}

/**
 * Middleware to track response times
 */
const responseTimeMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    recordResponseTime(duration);
    
    // Log slow requests
    if (duration > 1000) {
      console.warn(`⚠️  Slow request: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  
  next();
};

/**
 * GET /api/performance/stats
 * Get performance statistics
 */
router.get('/stats', (req, res) => {
  const avg = responseTimeStats.count > 0 
    ? Math.round(responseTimeStats.total / responseTimeStats.count) 
    : 0;
  
  const under200Percent = responseTimeStats.count > 0
    ? ((responseTimeStats.buckets.under100ms + responseTimeStats.buckets.under200ms) / responseTimeStats.count * 100).toFixed(1)
    : 0;
  
  res.json({
    performance: {
      averageResponseTime: avg + 'ms',
      minResponseTime: responseTimeStats.min === Infinity ? 0 : responseTimeStats.min + 'ms',
      maxResponseTime: responseTimeStats.max + 'ms',
      totalRequests: responseTimeStats.count,
      under200msPercent: under200Percent + '%',
      distribution: responseTimeStats.buckets,
      lastReset: responseTimeStats.lastReset
    },
    config: {
      requestTimeout: CONFIG.REQUEST_TIMEOUT_MS + 'ms',
      maxRetries: CONFIG.MAX_RETRIES,
      cacheTTL: CONFIG.CACHE_TTL_MS / 1000 + 's',
      compressionEnabled: true
    },
    goals: {
      target: '200ms',
      status: parseFloat(under200Percent) >= 80 ? '✅ ACHIEVED' : '⚠️  NEEDS IMPROVEMENT'
    }
  });
});

/**
 * POST /api/performance/reset
 * Reset performance statistics (admin only)
 */
router.post('/reset', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  responseTimeStats.total = 0;
  responseTimeStats.count = 0;
  responseTimeStats.min = Infinity;
  responseTimeStats.max = 0;
  responseTimeStats.buckets = {
    under100ms: 0,
    under200ms: 0,
    under500ms: 0,
    under1s: 0,
    under2s: 0,
    over2s: 0
  };
  responseTimeStats.lastReset = new Date().toISOString();
  
  res.json({ message: 'Performance stats reset', timestamp: responseTimeStats.lastReset });
});

/**
 * GET /api/performance/health
 * Quick health check endpoint (should be ultra-fast)
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

module.exports = {
  router,
  responseTimeMiddleware,
  recordResponseTime
};
