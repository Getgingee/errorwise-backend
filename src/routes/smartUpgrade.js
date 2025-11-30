/**
 * Smart Upgrade Routes (E1)
 * 
 * Provides non-intrusive upgrade prompts based on user behavior.
 * 
 * @ticket E1 – Smart Upgrade Prompts
 * @epic EPIC E — Conversion Optimisation
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const smartUpgradeController = require('../controllers/smartUpgradeController');

// Admin middleware
const isAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/smart-upgrade/check
 * Check if smart upgrade banner should be shown
 * Query: context (optional) - 'after_query', 'high_confidence', 'follow_up'
 */
router.get('/check', smartUpgradeController.checkSmartUpgrade);

/**
 * POST /api/smart-upgrade/shown
 * Track when smart upgrade banner is displayed
 * Body: { promptType, triggers, page }
 */
router.post('/shown', smartUpgradeController.trackSmartUpgradeShown);

/**
 * POST /api/smart-upgrade/clicked
 * Track when user clicks smart upgrade banner
 * Body: { promptType, triggers, page }
 */
router.post('/clicked', smartUpgradeController.trackSmartUpgradeClicked);

/**
 * POST /api/smart-upgrade/dismissed
 * Track when user dismisses smart upgrade banner
 * Body: { promptType, reason }
 */
router.post('/dismissed', smartUpgradeController.trackSmartUpgradeDismissed);

/**
 * GET /api/smart-upgrade/analytics
 * Get smart upgrade analytics (admin only)
 * Query: period (optional) - 'day', 'week', 'month'
 */
router.get('/analytics', isAdmin, smartUpgradeController.getSmartUpgradeAnalytics);

module.exports = router;
