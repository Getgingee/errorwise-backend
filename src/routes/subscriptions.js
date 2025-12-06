const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const subscriptionController = require('../controllers/subscriptionController');
const { authMiddleware } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');

// Checkout validation
const validateCheckout = [
  body('planId')
    .notEmpty().withMessage('Plan ID is required')
    .isIn(['free', 'pro', 'team', 'pro_yearly', 'team_yearly'])
    .withMessage('Invalid plan ID'),
  handleValidationErrors
];

// Rate limiters for subscription operations (fraud prevention)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 checkout attempts per hour
  message: { error: 'Too many checkout attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const subscriptionChangeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // 10 subscription changes per day
  message: { error: 'Too many subscription changes. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Public endpoints (no auth required)
router.post('/webhook', subscriptionController.handleWebhook);
router.get('/plans', subscriptionController.getPlans);

// All other subscription routes require authentication
router.use(authMiddleware);

// Get current subscription
router.get('/', subscriptionController.getSubscription);
router.get('/current', subscriptionController.getSubscription);

// Create subscription (with rate limiting)
router.post('/', subscriptionChangeLimiter, subscriptionController.createSubscription);

// Checkout session (with fraud prevention rate limiting and validation)
router.post('/checkout', checkoutLimiter, validateCheckout, subscriptionController.createCheckout);

// Update subscription (with rate limiting)
router.put('/', subscriptionChangeLimiter, subscriptionController.updateSubscription);

// Cancel subscription (support both POST and DELETE)
router.delete('/', subscriptionChangeLimiter, subscriptionController.cancelSubscription);
router.post('/cancel', subscriptionChangeLimiter, subscriptionController.cancelSubscription);

// Subscription usage
router.get('/usage', subscriptionController.getUsage);

// Billing information
router.get('/billing', subscriptionController.getBillingInfo);

// Subscription history
router.get('/history', subscriptionController.getHistory);

// Upgrade options
router.get('/upgrade-options', subscriptionController.getUpgradeOptions);

// Verify payment
router.post('/verify-payment', subscriptionController.verifyPayment);

// ============================================================================
// EDGE CASE ENDPOINTS - Upgrade, Downgrade, Pause, Resume
// ============================================================================

// Upgrade subscription with proration
router.post('/upgrade', subscriptionController.upgradeSubscription);

// Downgrade subscription (immediate or end-of-period)
router.post('/downgrade', subscriptionController.downgradeSubscription);

// Get proration preview before upgrade
router.get('/proration-preview', subscriptionController.getProrationPreview);

// Pause subscription (maintain access until end of paid period)
router.post('/pause', subscriptionController.pauseSubscription);

// Resume paused subscription
router.post('/resume', subscriptionController.resumeSubscription);

// Handle payment failure (webhook or manual retry)
router.post('/payment-failure', subscriptionController.handlePaymentFailureEndpoint);

module.exports = router;
