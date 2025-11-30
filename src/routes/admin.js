const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { authMiddleware } = require('../middleware/auth');
const sequelize = require('../config/database');

// Admin Controller (A1 - Query Logs)
const adminController = require('../controllers/adminController');

// Metrics Controller (D2, D3 - Analytics Dashboard)
const metricsController = require('../controllers/metricsController');

// Newsletter Job (moved to top to avoid dynamic require)
const newsletterJob = require('../jobs/newsletterJob');

// Audit Logger for PII access and security events
const { 
  logPiiAccess, 
  logSecurityEvent, 
  canViewPii, 
  hasPermission,
  ADMIN_PERMISSIONS,
  maskEmail 
} = require('../utils/auditLogger');

// Admin middleware - check if user is admin
const isAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    logSecurityEvent({
      eventType: 'AUTHORIZATION_FAILED',
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'ADMIN_ACCESS_ATTEMPT',
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
      success: false,
      reason: 'Insufficient role'
    });
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

// Check users endpoint (admin only - protected)
router.get('/check-users', authMiddleware, isAdmin, async (req, res) => {
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

// Admin upgrade endpoint (protected)
router.post('/upgrade-hi-user', authMiddleware, isAdmin, async (req, res) => {
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
// METRICS & ANALYTICS ROUTES (D2, D3)
// ============================================================================

// Internal metrics dashboard (D2) - JSON API
router.get('/metrics/dashboard', authMiddleware, isAdmin, metricsController.getDashboard);

// Month-1 success criteria (D3)
router.get('/metrics/month-1', authMiddleware, isAdmin, metricsController.getMonth1Criteria);

// Upgrade funnel metrics
router.get('/metrics/upgrade-funnel', authMiddleware, isAdmin, metricsController.getUpgradeFunnel);

// Event counts breakdown
router.get('/metrics/events', authMiddleware, isAdmin, metricsController.getEventBreakdown);

// Retention metrics
router.get('/metrics/retention', authMiddleware, isAdmin, metricsController.getRetention);

// Activity heatmap
router.get('/metrics/activity-heatmap', authMiddleware, isAdmin, metricsController.getActivityHeatmap);

// Simple HTML dashboard (D2 - very simple internal view)
router.get('/metrics/html', authMiddleware, isAdmin, metricsController.getHtmlDashboard);

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
// RBAC: Only admins with VIEW_PII permission can see email addresses
router.get('/newsletter/subscribers', authMiddleware, isAdmin, async (req, res) => {
  try {
    // Parse pagination params with defaults
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    
    const result = await newsletterJob.getActiveSubscribers({ limit, offset });
    
    // Check if admin has permission to view PII (emails)
    const adminCanViewPii = canViewPii(req.user);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    
    // Normalize and sanitize subscriber data
    // Support both snake_case (from DB) and camelCase (from ORM)
    const sanitizedSubscribers = (result.subscribers || []).map(sub => {
      const normalized = {
        id: sub.id,
        // Only include name if present (support both cases)
        name: sub.name || null,
        // Normalize status field (snake_case || camelCase)
        status: sub.status || 'active',
        // Normalize subscriptionType (snake_case || camelCase)
        subscriptionType: sub.subscription_type || sub.subscriptionType || 'general',
        // Normalize createdAt (snake_case || camelCase)
        createdAt: sub.created_at || sub.createdAt || null
      };
      
      // Only include email if admin has VIEW_PII permission
      if (adminCanViewPii) {
        normalized.email = sub.email;
      } else {
        // Provide masked email for identification without full PII exposure
        normalized.emailMasked = maskEmail(sub.email);
      }
      
      return normalized;
    });
    
    // Emit audit log for PII access
    logPiiAccess({
      action: adminCanViewPii ? 'VIEW_SUBSCRIBER_EMAILS' : 'VIEW_SUBSCRIBER_LIST',
      admin: req.user,
      resource: 'newsletter_subscribers',
      recordCount: sanitizedSubscribers.length,
      ipAddress,
      success: true,
      metadata: {
        page,
        limit,
        piiIncluded: adminCanViewPii
      }
    });
    
    res.json({
      success: true,
      pagination: {
        page,
        limit,
        offset,
        hasMore: offset + limit < result.total
      },
      count: sanitizedSubscribers.length,
      total: result.total,
      piiIncluded: adminCanViewPii,
      subscribers: sanitizedSubscribers
    });
  } catch (error) {
    // Log full error server-side, return generic message to client
    console.error('Error fetching newsletter subscribers:', error);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

module.exports = router;
