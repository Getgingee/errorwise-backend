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

// ============================================================================
// EMAIL CHANGE ROUTES (Edge Cases)
// ============================================================================
router.post('/change-email', authMiddleware, authController.changeEmail);
router.get('/verify-email-change', authController.verifyEmailChange);

// ============================================================================
// SESSION MANAGEMENT ROUTES (Edge Cases)
// ============================================================================
router.get('/sessions', authMiddleware, authController.getSessions);
router.delete('/sessions/:sessionId', authMiddleware, authController.revokeSession);
router.post('/revoke-all-sessions', authMiddleware, authController.revokeAllOtherSessions);

// ============================================================================
// ACCOUNT MANAGEMENT ROUTES (Edge Cases)
// ============================================================================
router.delete('/account', authMiddleware, authController.deleteAccount);
router.post('/restore-account', authController.restoreAccount);

module.exports = router;
