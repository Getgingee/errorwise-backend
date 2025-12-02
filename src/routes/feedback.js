/**
 * Feedback Routes (F2)
 * 
 * "Did this help?" feedback system with sharing bonus.
 * 
 * @ticket F2 – Simple Success Feedback
 * @epic EPIC F — Early Retention Hooks
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const feedbackController = require('../controllers/feedbackController');

// All routes require authentication (use authMiddleware for proper tier info)
router.use(authMiddleware);

/**
 * POST /api/feedback
 * Submit feedback for a query result
 * Body: { queryId, feedback: 'yes'|'no'|'partial', reason?, wouldShare? }
 */
router.post('/', feedbackController.submitFeedback);

/**
 * POST /api/feedback/claim-bonus
 * Claim sharing bonus queries
 * Body: { queryId, shareMethod: 'twitter'|'linkedin'|'copy' }
 */
router.post('/claim-bonus', feedbackController.claimShareBonus);

/**
 * GET /api/feedback/share-content
 * Get pre-written share content for social media
 * Query: queryId, errorType
 */
router.get('/share-content', feedbackController.getShareContent);

/**
 * GET /api/feedback/stats
 * Get feedback statistics (Yes rate as quality signal)
 * Query: period (optional) - 'day', 'week', 'month'
 */
router.get('/stats', feedbackController.getFeedbackStats);

/**
 * GET /api/feedback/history
 * Get user's feedback history
 * Query: limit (optional)
 */
router.get('/history', feedbackController.getUserFeedbackHistory);

module.exports = router;
