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

// Admin middleware
const isAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/digest/track/open/:token
 * Track email open via 1x1 pixel (public)
 */
router.get('/track/open/:token', weeklyDigestController.trackOpen);

/**
 * GET /api/digest/track/click
 * Track link click and redirect (public)
 * Query: token, url
 * Security: Validates redirect URL to prevent open redirect
 */
router.get('/track/click', (req, res, next) => {
  const { url } = req.query;
  const allowedDomains = [process.env.FRONTEND_URL, 'errorwise.tech', 'errorwise.com'];
  
  if (url) {
    const isAllowed = allowedDomains.some(domain => domain && url.startsWith(domain));
    if (!isAllowed && !url.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid redirect URL' });
    }
  }
  next();
}, weeklyDigestController.trackClick);

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
router.get('/analytics', isAdmin, weeklyDigestController.getDigestAnalytics);

/**
 * GET /api/digest/preview/:userId
 * Preview digest HTML for a user (admin only)
 */
router.get('/preview/:userId', isAdmin, weeklyDigestController.previewDigest);

module.exports = router;
