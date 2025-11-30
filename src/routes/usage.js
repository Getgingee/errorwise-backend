/**
 * Usage Routes (C3)
 * 
 * Endpoints for usage meter and limit enforcement.
 * 
 * @ticket C3 – Add usage meter and limit banners
 * @epic EPIC C — Plans Limits & Upgrade Path (MVP)
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const usageController = require('../controllers/usageController');

// All routes require authentication
router.use(authMiddleware);

// GET /api/usage/stats - Get full usage statistics
router.get('/stats', usageController.getUsageStats);

// GET /api/usage/can-query - Check if user can make a query
router.get('/can-query', usageController.canQuery);

// POST /api/usage/increment - Increment usage counter after query
router.post('/increment', usageController.incrementUsage);

// POST /api/usage/warning-shown - Record that warning was shown (avoid spam)
router.post('/warning-shown', usageController.recordWarningShown);

// GET /api/usage/widget - Get compact widget data for display
router.get('/widget', usageController.getUsageWidget);

module.exports = router;
