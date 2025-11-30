/**
 * Weekly Digest Routes (F1)
 * 
 * User-specific weekly email summaries.
 * 
 * @ticket F1 – Weekly Email Digest (MVP)
 * @epic EPIC F — Early Retention Hooks
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const weeklyDigestController = require('../controllers/weeklyDigestController');

/**
 * GET /api/digest/track/open/:token
 * Track email open via 1x1 pixel (public)
 */
router.get('/track/open/:token', weeklyDigestController.trackOpen);

/**
 * GET /api/digest/track/click
 * Track link click and redirect (public)
 * Query: token, url
 */
router.get('/track/click', weeklyDigestController.trackClick);

/**
 * GET /api/digest/unsubscribe/:token
 * Unsubscribe from weekly digest (public)
 */
router.get('/unsubscribe/:token', weeklyDigestController.unsubscribe);

// Authenticated routes
router.use(authenticateToken);

/**
 * POST /api/digest/send-test
 * Send test digest to yourself
 */
router.post('/send-test', weeklyDigestController.sendTestDigest);

/**
 * GET /api/digest/analytics
 * Get digest analytics (admin only)
 * Query: period (optional) - 'week', 'month'
 */
router.get('/analytics', weeklyDigestController.getDigestAnalytics);

/**
 * GET /api/digest/preview/:userId
 * Preview digest HTML for a user (admin only)
 */
router.get('/preview/:userId', weeklyDigestController.previewDigest);

module.exports = router;
