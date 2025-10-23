const express = require('express');
const router = express.Router();
const errorController = require('../controllers/errorController');
const { authMiddleware } = require('../middleware/auth');
const { checkUsageLimits, addUsageInfo, getUserUsageStats } = require('../middleware/usageLimits');

// All error routes require authentication
router.use(authMiddleware);

// GET /api/errors/usage - Get user's usage statistics
router.get('/usage', getUserUsageStats);

// POST /api/errors/analyze - Analyze an error with AI (with usage limits)
router.post('/analyze', checkUsageLimits, addUsageInfo, errorController.analyzeError);

// GET /api/errors/history - Get user's error query history with advanced filtering
router.get('/history', errorController.getHistory);

// GET /api/errors/recent - Get user's recent error analyses
router.get('/recent', errorController.getRecentAnalyses);

// GET /api/errors/stats - Get user's error statistics
router.get('/stats', errorController.getStats);

// GET /api/errors/search - Search errors with advanced filtering
router.get('/search', errorController.searchErrors);

// GET /api/errors/export - Export error history to CSV/JSON
router.get('/export', errorController.exportHistory);

// GET /api/errors/:id - Get specific error query details
router.get('/:id', errorController.getErrorQuery);

// DELETE /api/errors/:id - Delete an error query
router.delete('/:id', errorController.deleteErrorQuery);

module.exports = router;
