const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { accountLockoutMiddleware } = require('../middleware/accountLock');
const { validateRegistration, validateLogin } = require('../middleware/validation');

// Rate limiters for security
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per 15 minutes
  message: { error: 'Too many password reset attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const refreshTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 refreshes per 15 minutes
  message: { error: 'Too many token refresh attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Public routes with rate limiting and validation
router.post('/register', registerLimiter, validateRegistration, authController.register);

// Login with account lockout protection and validation
router.post('/login', accountLockoutMiddleware, validateLogin, authController.login);

router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);
router.post('/refresh-token', refreshTokenLimiter, authController.refreshToken);

// Protected routes (require authentication)
router.post('/logout', authMiddleware, authController.logout);
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
