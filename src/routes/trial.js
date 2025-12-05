/**
 * Trial Routes
 * 
 * Handles the 7-day trial flow with Dodo Payments:
 * 
 * POST /api/trial/start      - Start trial checkout (captures payment method)
 * GET  /api/trial/status     - Get current trial status
 * POST /api/trial/cancel     - Cancel trial before it converts
 * POST /api/trial/verify     - Verify checkout completion
 * GET  /api/trial/eligibility - Check if user can start trial
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authMiddleware } = require('../middleware/auth');
const trialController = require('../controllers/trialController');

// Rate limiting for trial operations
const trialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 trial starts per hour
  message: { 
    error: 'Too many trial requests', 
    message: 'Please try again later',
    code: 'RATE_LIMITED'
  }
});

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   POST /api/trial/start
 * @desc    Start 7-day trial with payment method capture
 * @body    { planId: 'pro' | 'team' }
 * @returns { checkoutUrl, sessionId, plan }
 */
router.post('/start', trialLimiter, trialController.startTrial);

/**
 * @route   GET /api/trial/status
 * @desc    Get current trial status and remaining days
 * @returns { trial: { hasActiveTrial, daysRemaining, trialEndDate, ... } }
 */
router.get('/status', trialController.getTrialStatus);

/**
 * @route   POST /api/trial/cancel
 * @desc    Cancel active trial (no charge)
 * @body    { reason?: string }
 * @returns { success, message, newTier }
 */
router.post('/cancel', trialController.cancelTrial);

/**
 * @route   POST /api/trial/verify
 * @desc    Verify trial checkout completion (called after Dodo redirect)
 * @body    { sessionId: string }
 * @returns { success, trial: { status, plan, endDate } }
 */
router.post('/verify', trialController.verifyTrialCheckout);

/**
 * @route   GET /api/trial/eligibility
 * @desc    Check if user is eligible for free trial
 * @returns { eligible, reason, plans }
 */
router.get('/eligibility', trialController.checkEligibility);

module.exports = router;
