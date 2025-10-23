const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authMiddleware } = require('../middleware/auth');

// All settings routes require authentication
router.use(authMiddleware);

// Get user settings
router.get('/', settingsController.getSettings);

// Update user settings
router.put('/', settingsController.updateSettings);

// Update notification settings
router.put('/notifications', settingsController.updateNotifications);

// Update privacy settings
router.put('/privacy', settingsController.updatePrivacy);

// Update AI preferences
router.put('/ai', settingsController.updateAiPreferences);

// Reset settings to default
router.post('/reset', settingsController.resetSettings);

module.exports = router;
