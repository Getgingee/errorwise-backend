/**
 * Plans Routes (E2)
 * 
 * Compare plans modal API endpoints.
 * 
 * @ticket E2 – Compare Plans Modal
 * @epic EPIC E — Conversion Optimisation
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const comparePlansController = require('../controllers/comparePlansController');

/**
 * GET /api/plans/compare
 * Get plan comparison data (works for both authenticated and anonymous users)
 */
router.get('/compare', optionalAuth, comparePlansController.getPlansComparison);

/**
 * POST /api/plans/track-modal-open
 * Track when compare modal is opened
 * Body: { source, page }
 */
router.post('/track-modal-open', optionalAuth, comparePlansController.trackModalOpen);

/**
 * POST /api/plans/track-select
 * Track when user selects/hovers a plan
 * Body: { planId, billingCycle }
 */
router.post('/track-select', optionalAuth, comparePlansController.trackPlanSelected);

/**
 * POST /api/plans/track-upgrade-click
 * Track when user clicks upgrade from comparison
 * Body: { planId, billingCycle, isQueryPack, packId }
 */
router.post('/track-upgrade-click', optionalAuth, comparePlansController.trackUpgradeFromComparison);

/**
 * GET /api/plans/analytics
 * Get compare modal analytics (admin only)
 * Query: period (optional) - 'day', 'week', 'month'
 */
router.get('/analytics', authenticateToken, comparePlansController.getCompareAnalytics);

module.exports = router;
