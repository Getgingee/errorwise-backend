const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { accountLockoutMiddleware } = require('../middleware/accountLock');

// Public routes
router.post('/register', authController.register);

// Login with account lockout protection
router.post('/login', accountLockoutMiddleware, authController.login);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);

// Protected routes (require authentication)
router.post('/logout', authMiddleware, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
