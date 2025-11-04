const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authMiddleware } = require('../middleware/auth');

// Public endpoints (no auth required)
router.post('/webhook', subscriptionController.handleWebhook);
router.get('/plans', subscriptionController.getPlans);

// All other subscription routes require authentication
router.use(authMiddleware);

// Get current subscription
router.get('/', subscriptionController.getSubscription);
router.get('/current', subscriptionController.getSubscription);

// Create subscription
router.post('/', subscriptionController.createSubscription);

// Checkout session (for Stripe-like flow)
router.post('/checkout', subscriptionController.createCheckout);

// Update subscription (legacy)
router.put('/', subscriptionController.updateSubscription);

// Cancel subscription (support both POST and DELETE)
router.delete('/', subscriptionController.cancelSubscription);
router.post('/cancel', subscriptionController.cancelSubscription);

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

module.exports = router;
