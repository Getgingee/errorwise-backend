const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

// All user routes require authentication
router.use(authMiddleware);

// Get user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put('/profile', userController.updateProfile);

// Change password
router.put('/password', userController.changePassword);

// Delete account
router.delete('/account', userController.deleteAccount);

// Get dashboard data
router.get('/dashboard', userController.getDashboard);

module.exports = router;
