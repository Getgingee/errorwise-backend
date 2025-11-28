const express = require('express');
const router = express.Router();
const errorController = require('../controllers/errorController');
const { authMiddleware } = require('../middleware/auth');
const { checkUsageLimits, addUsageInfo, getUserUsageStats } = require('../middleware/usageLimits');
const { checkQueryLimit, addSubscriptionInfo, requireFeature } = require('../middleware/subscriptionMiddleware');

// All error routes require authentication
router.use(authMiddleware);
router.use(addSubscriptionInfo); // Add subscription info to all routes

// GET /api/errors/usage - Get user's usage statistics
router.get('/usage', getUserUsageStats);

// POST /api/errors/analyze - Analyze an error with AI (with subscription limits)
router.post('/analyze', checkQueryLimit, addUsageInfo, errorController.analyzeError);

// GET /api/errors/history - Get user's error query history
router.get('/history', errorController.getHistory);

// GET /api/errors/recent - Get user's recent error analyses
router.get('/recent', errorController.getRecentAnalyses);

// GET /api/errors/stats - Get user's error statistics
router.get('/stats', errorController.getStats);

// GET /api/errors/search - Search errors with advanced filtering
router.get('/search', errorController.searchErrors);

// GET /api/errors/export - Export error history (Pro/Team only)
router.get('/export', requireFeature('exportHistory'), errorController.exportHistory);

// GET /api/errors/:id - Get specific error query details
router.get('/:id', errorController.getErrorQuery);

// POST /api/errors/:id/feedback - Submit feedback on analysis result (B2)
router.post('/:id/feedback', errorController.submitResultFeedback);

// DELETE /api/errors/:id - Delete an error query
router.delete('/:id', errorController.deleteErrorQuery);

module.exports = router;
