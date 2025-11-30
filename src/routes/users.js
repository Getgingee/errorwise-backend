const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

// Rate limiters for sensitive operations
const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 password changes per hour
  message: { error: 'Too many password change attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const profileUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 updates per 15 minutes
  message: { error: 'Too many profile updates. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const accountDeleteLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // 3 delete attempts per day
  message: { error: 'Too many account deletion attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// All user routes require authentication
router.use(authMiddleware);

// Get user profile
router.get('/profile', userController.getProfile);

// Update user profile (with rate limiting)
router.put('/profile', profileUpdateLimiter, userController.updateProfile);

// Change password (with strict rate limiting)
router.put('/password', passwordChangeLimiter, userController.changePassword);

// Delete account (with rate limiting)
router.delete('/account', accountDeleteLimiter, userController.deleteAccount);

// Get dashboard data
router.get('/dashboard', userController.getDashboard);

module.exports = router;
