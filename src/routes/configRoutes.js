/**
 * Config Routes
 * 
 * Provides application configuration to frontend.
 * Frontend should fetch ALL config from these endpoints.
 */

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authenticateToken } = require('../middleware/auth');

// Public endpoints (no auth required)
router.get('/', configController.getConfig);
router.get('/plans', configController.getPlans);

// Protected endpoints (requires auth)
router.get('/user', authenticateToken, configController.getUserConfig);

module.exports = router;
