const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { authMiddleware } = require('../middleware/auth');
const sequelize = require('../config/database');

// Admin Controller (A1 - Query Logs)
const adminController = require('../controllers/adminController');

// Newsletter Job (moved to top to avoid dynamic require)
const newsletterJob = require('../jobs/newsletterJob');

// Admin middleware - check if user is admin
const isAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ============================================================================
// QUERY LOGS ROUTES (A1 - Central Error Logging & Monitoring)
// ============================================================================

// Get query logs dashboard (summary view)
router.get('/query-logs/dashboard', authMiddleware, isAdmin, adminController.getDashboard);

// Get query statistics
router.get('/query-logs/stats', authMiddleware, isAdmin, adminController.getQueryStats);

// Get common error patterns
router.get('/query-logs/patterns', authMiddleware, isAdmin, adminController.getErrorPatterns);

// Get recent failures
router.get('/query-logs/failures', authMiddleware, isAdmin, adminController.getRecentFailures);

// Get low confidence responses
router.get('/query-logs/low-confidence', authMiddleware, isAdmin, adminController.getLowConfidenceResponses);

// A2: Get fallback statistics
router.get('/query-logs/fallback-stats', authMiddleware, isAdmin, adminController.getFallbackStats);

// Get all query logs (with filtering)
router.get('/query-logs', authMiddleware, isAdmin, adminController.getQueryLogs);

// ============================================================================
// EXISTING ADMIN ROUTES
// ============================================================================

// TEMPORARY: Check users endpoint (no auth for debugging)
router.get('/check-users', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'username', 'subscriptionTier', 'subscriptionStatus'],
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    res.json({ count: users.length, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TEMPORARY: One-time upgrade endpoint (remove after use)
router.post('/upgrade-hi-user', async (req, res) => {
  try {
    const email = 'Hi@getgingee.com';
    
    // Try case-insensitive search
    const user = await User.findOne({ 
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('email')), 
        email.toLowerCase()
      )
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user subscription - just update the User table
    await user.update({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    res.json({
      success: true,
      message: 'User upgraded to Pro',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndDate: user.subscriptionEndDate
      }
    });

  } catch (error) {
    console.error('Error upgrading user:', error);
    res.status(500).json({ error: 'Failed to upgrade user', details: error.message });
  }
});

// Upgrade user to Pro
router.post('/upgrade-user', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user subscription
    await user.update({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    // Create or update subscription record
    const [subscription, created] = await Subscription.findOrCreate({
      where: { userId: user.id },
      defaults: {
        userId: user.id,
        tier: 'pro',
        status: 'active',
        stripeCustomerId: `admin_upgrade_${user.id}`,
        stripeSubscriptionId: `admin_sub_${user.id}_${Date.now()}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      }
    });

    if (!created) {
      await subscription.update({
        tier: 'pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      });
    }

    res.json({
      success: true,
      message: 'User upgraded to Pro',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndDate: user.subscriptionEndDate
      }
    });

  } catch (error) {
    console.error('Error upgrading user:', error);
    res.status(500).json({ error: 'Failed to upgrade user' });
  }
});

// List all users (admin only)
router.get('/users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'username', 'subscriptionTier', 'subscriptionStatus', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ============================================================================
// NEWSLETTER ADMIN ROUTES
// ============================================================================

// Manual trigger for weekly newsletter (admin only)
router.post('/newsletter/send', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await newsletterJob.triggerNewsletterManually();
    
    res.json({
      success: true,
      message: 'Newsletter send triggered',
      result
    });
  } catch (error) {
    // Log full error server-side, return generic message to client
    console.error('Error triggering newsletter:', error);
    res.status(500).json({ error: 'Failed to trigger newsletter' });
  }
});

// Get newsletter subscribers list with pagination (admin only)
router.get('/newsletter/subscribers', authMiddleware, isAdmin, async (req, res) => {
  try {
    // Parse pagination params with defaults
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    
    const result = await newsletterJob.getActiveSubscribers({ limit, offset });
    
    // Sanitize subscriber data - only include non-sensitive fields needed by admins
    const sanitizedSubscribers = (result.subscribers || []).map(sub => ({
      id: sub.id,
      email: sub.email,
      name: sub.name || null,
      status: sub.status || 'active',
      subscriptionType: sub.subscription_type || 'general',
      createdAt: sub.created_at
    }));
    
    res.json({
      success: true,
      pagination: {
        page,
        limit,
        offset,
        hasMore: sanitizedSubscribers.length === limit
      },
      count: sanitizedSubscribers.length,
      total: result.total,
      subscribers: sanitizedSubscribers
    });
  } catch (error) {
    // Log full error server-side, return generic message to client
    console.error('Error fetching newsletter subscribers:', error);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

module.exports = router;
