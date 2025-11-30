/**
 * Upgrade Routes (C4)
 * 
 * Endpoints for Pro upgrade flow with DodoPayments.
 * 
 * @ticket C4 – Implement minimal Pro upgrade flow
 * @epic EPIC C — Plans Limits & Upgrade Path (MVP)
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const upgradeController = require('../controllers/upgradeController');

// Public endpoint (no auth) - Get Pro features for marketing
router.get('/pro-features', upgradeController.getProFeatures);

// Protected endpoints
router.use(authMiddleware);

// GET /api/upgrade/options - Get available upgrade options
router.get('/options', upgradeController.getUpgradeOptions);

// POST /api/upgrade/click - Track upgrade button click
router.post('/click', upgradeController.trackUpgradeClick);

// GET /api/upgrade/checkout-url - Get checkout URL for specific plan
router.get('/checkout-url', upgradeController.getCheckoutUrl);

// POST /api/upgrade/complete-manual - Manual upgrade completion (admin only)
router.post('/complete-manual', upgradeController.completeUpgradeManual);

module.exports = router;
