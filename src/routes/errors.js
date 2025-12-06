/**
 * Error Analysis Routes (Simplified)
 * 
 * SIMPLIFIED API STRUCTURE:
 * - POST /analyze - Analyze error with AI
 * - GET /history - Get past queries (with ?limit for recent)
 * - GET /usage - Get usage stats
 * - GET /:id - Get specific query
 * - POST /:id/feedback - Submit feedback
 * - DELETE /:id - Delete query
 * 
 * REMOVED redundant endpoints:
 * - /recent (use /history?limit=10 instead)
 * - /stats (merged into /usage)
 * - /search (use /history with search param)
 */

const express = require('express');
const router = express.Router();
const errorController = require('../controllers/errorController');
const { authMiddleware } = require('../middleware/auth');
const { checkUsageLimits, addUsageInfo, getUserUsageStats } = require('../middleware/usageLimits');
const { checkQueryLimit, addSubscriptionInfo, requireFeature } = require('../middleware/subscriptionMiddleware');
const { validateErrorAnalysis, validateFeedbackSubmission, validateUUID } = require('../middleware/validation');

// All error routes require authentication
router.use(authMiddleware);
router.use(addSubscriptionInfo);

// ============================================================================
// CORE ENDPOINTS (Simplified)
// ============================================================================

// POST /api/errors/analyze - Analyze an error with AI
router.post('/analyze', validateErrorAnalysis, checkQueryLimit, addUsageInfo, errorController.analyzeError);

// GET /api/errors/history - Get user's query history
// Supports: ?limit=10 (for recent), ?search=term, ?page=1
router.get('/history', errorController.getHistory);

// GET /api/errors/usage - Get usage stats + query count
router.get('/usage', getUserUsageStats);

// GET /api/errors/:id - Get specific query
router.get('/:id', validateUUID('id'), errorController.getErrorQuery);

// POST /api/errors/:id/feedback - Thumbs up/down on result
router.post('/:id/feedback', validateUUID('id'), validateFeedbackSubmission, errorController.submitResultFeedback);

// DELETE /api/errors/:id - Delete a query
router.delete('/:id', validateUUID('id'), errorController.deleteErrorQuery);

// ============================================================================
// LEGACY ENDPOINTS (Keep for backward compatibility, redirect internally)
// ============================================================================

// /recent -> /history?limit=25 (for existing frontend code)
router.get('/recent', (req, res, next) => {
  req.query.limit = req.query.limit || '25';
  errorController.getHistory(req, res, next);
});

// /stats -> merged into /usage
router.get('/stats', errorController.getStats);

// /search -> /history with search param
router.get('/search', (req, res, next) => {
  if (req.query.q) req.query.search = req.query.q;
  errorController.getHistory(req, res, next);
});

// /export -> Pro/Team only
router.get('/export', requireFeature('exportHistory'), errorController.exportHistory);

module.exports = router;
