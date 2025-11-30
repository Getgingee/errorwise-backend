/**
 * Referral Routes (F3)
 * 
 * Referral program with viral loop.
 * 
 * @ticket F3 - Referral Program
 * @epic EPIC F — Early Retention Hooks
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const referralController = require('../controllers/referralController');

/**
 * GET /api/referral/validate/:code
 * Validate a referral code (public)
 */
router.get('/validate/:code', referralController.validateReferralCode);

/**
 * POST /api/referral/click
 * Track referral link click (public)
 * Body: { referralCode }
 */
router.post('/click', referralController.trackReferralClick);

/**
 * GET /api/referral/leaderboard
 * Get top referrers leaderboard (public)
 * Query: limit (optional)
 */
router.get('/leaderboard', referralController.getReferralLeaderboard);

// Authenticated routes
router.use(authenticateToken);

/**
 * GET /api/referral/link
 * Get or create referral link for user
 */
router.get('/link', referralController.getReferralLink);

/**
 * GET /api/referral/dashboard
 * Get referral dashboard with stats
 */
router.get('/dashboard', referralController.getReferralDashboard);

module.exports = router;
