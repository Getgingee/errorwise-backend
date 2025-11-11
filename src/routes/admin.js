const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { authMiddleware } = require('../middleware/auth');
const sequelize = require('../config/database');

// Admin middleware - check if user is admin
const isAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

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
      message: 'Hi@getgingee.com upgraded to Pro',
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

module.exports = router;
