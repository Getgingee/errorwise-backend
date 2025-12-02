const User = require('../models/User');
const ErrorQuery = require('../models/ErrorQuery');
const authService = require('../services/authService');
const { invalidateUserCache } = require('../middleware/auth');

// ============================================================================
// TRIAL MANAGEMENT
// ============================================================================

const TRIAL_DURATION_DAYS = 7;

/**
 * Get trial status for current user
 */
exports.getTrialStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'trialEndsAt', 'createdAt']
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Already a paid user
    if (user.subscriptionTier && user.subscriptionTier !== 'free') {
      return res.json({
        success: true,
        trial: {
          status: 'not_needed',
          message: 'You already have a paid subscription',
          tier: user.subscriptionTier,
          canStartTrial: false
        }
      });
    }

    // Check trial status
    if (!user.trialEndsAt) {
      return res.json({
        success: true,
        trial: {
          status: 'not_started',
          message: 'Start your 7-day free trial to unlock Pro features!',
          canStartTrial: true,
          features: [
            'Auto mode - Intelligent model selection',
            'Fast ↔ Smart model toggle',
            'Unlimited error analyses',
            'Advanced explanations'
          ]
        }
      });
    }

    const now = new Date();
    const trialEnd = new Date(user.trialEndsAt);
    const diffMs = trialEnd - now;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysLeft > 0) {
      return res.json({
        success: true,
        trial: {
          status: 'active',
          daysLeft,
          endsAt: user.trialEndsAt,
          message: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your Pro trial`,
          canStartTrial: false,
          showUpgradePrompt: daysLeft <= 2 // Show upgrade prompt when 2 days or less
        }
      });
    } else {
      return res.json({
        success: true,
        trial: {
          status: 'expired',
          expiredAt: user.trialEndsAt,
          message: 'Your trial has ended. Upgrade to Pro to continue using advanced features!',
          canStartTrial: false,
          showUpgradePrompt: true
        }
      });
    }
  } catch (error) {
    console.error('Failed to get trial status:', error);
    res.status(500).json({ success: false, error: 'Failed to get trial status' });
  }
};

/**
 * Start 7-day trial for current user
 */
exports.startTrial = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'trialEndsAt', 'email']
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Already a paid user
    if (user.subscriptionTier && user.subscriptionTier !== 'free') {
      return res.status(400).json({
        success: false,
        error: 'You already have a paid subscription. No trial needed!'
      });
    }

    // Already used trial
    if (user.trialEndsAt) {
      const trialEnd = new Date(user.trialEndsAt);
      const now = new Date();
      
      if (trialEnd > now) {
        return res.status(400).json({
          success: false,
          error: 'You already have an active trial',
          daysLeft: Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'You have already used your trial. Upgrade to Pro to continue!',
          showUpgradePrompt: true
        });
      }
    }

    // Start trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

    await User.update(
      { trialEndsAt },
      { where: { id: req.user.id } }
    );

    // Invalidate user cache so new requests get updated trial status
    invalidateUserCache(req.user.id);

    res.json({
      success: true,
      message: `🎉 Your ${TRIAL_DURATION_DAYS}-day Pro trial has started!`,
      trial: {
        status: 'active',
        daysLeft: TRIAL_DURATION_DAYS,
        endsAt: trialEndsAt,
        features: [
          'Auto mode - Intelligent model selection',
          'Fast ↔ Smart model toggle',
          'Unlimited error analyses',
          'Advanced explanations'
        ]
      }
    });
  } catch (error) {
    console.error('Failed to start trial:', error);
    res.status(500).json({ success: false, error: 'Failed to start trial' });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findByPk(userId, {
      attributes: [
        'id', 'username', 'email', 'createdAt', 
        'subscriptionTier', 'subscriptionStatus', 
        'subscriptionStartDate', 'subscriptionEndDate', 
        'trialEndsAt'
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine effective subscription status
    const now = new Date();
    let effectiveTier = user.subscriptionTier || 'free';
    let effectiveStatus = user.subscriptionStatus || 'active';
    
    // Check if subscription/trial has expired
    if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) < now) {
      if (effectiveTier !== 'free') {
        // Subscription expired - should downgrade
        effectiveStatus = 'expired';
      }
    }
    
    // Check trial expiry
    if (user.trialEndsAt && new Date(user.trialEndsAt) < now && effectiveStatus === 'trial') {
      effectiveStatus = 'expired';
    }

    // Get user statistics
    const totalQueries = await ErrorQuery.count({ where: { userId } });
    const thisMonthQueries = await ErrorQuery.count({
      where: {
        userId,
        createdAt: {
          [require('sequelize').Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    });

    // Calculate days remaining (for trial or subscription)
    let daysRemaining = null;
    if (effectiveStatus === 'trial' && user.trialEndsAt) {
      daysRemaining = Math.max(0, Math.ceil((new Date(user.trialEndsAt) - now) / (1000 * 60 * 60 * 24)));
    } else if (effectiveStatus === 'active' && user.subscriptionEndDate) {
      daysRemaining = Math.max(0, Math.ceil((new Date(user.subscriptionEndDate) - now) / (1000 * 60 * 60 * 24)));
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        memberSince: user.createdAt
      },
      stats: {
        totalQueries,
        thisMonthQueries
      },
      subscription: {
        tier: effectiveTier,
        status: effectiveStatus,
        startDate: user.subscriptionStartDate,
        endDate: user.subscriptionEndDate,
        trialEndsAt: user.trialEndsAt,
        daysRemaining,
        isActive: effectiveStatus === 'active' || effectiveStatus === 'trial',
        isTrial: effectiveStatus === 'trial'
      }
    });

  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email } = req.body;

    // Validate input
    if (!username && !email) {
      return res.status(400).json({ error: 'At least one field must be provided' });
    }

    const updateData = {};
    if (username) updateData.username = username.trim();
    if (email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({
        where: { 
          email: email.trim(),
          id: { [require('sequelize').Op.ne]: userId }
        }
      });
      
      if (existingUser) {
        return res.status(409).json({ error: 'Email is already taken' });
      }
      
      updateData.email = email.trim();
    }

    await User.update(updateData, { where: { id: userId } });

    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'createdAt']
    });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Failed to update user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get user with password
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await authService.comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const hashedNewPassword = await authService.hashPassword(newPassword);
    await User.update({ password: hashedNewPassword }, { where: { id: userId } });

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Failed to change password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Delete user account
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    // Get user with password
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const isValidPassword = await authService.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Delete user's error queries first (due to foreign key constraint)
    await ErrorQuery.destroy({ where: { userId } });
    
    // Delete user account
    await User.destroy({ where: { id: userId } });

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    console.error('Failed to delete account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

// Get user dashboard data
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get recent error queries
    const recentQueries = await ErrorQuery.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'errorMessage', 'errorCategory', 'createdAt', 'tags']
    });

    // Get error categories statistics
    const categoryStats = await ErrorQuery.findAll({
      where: { userId },
      attributes: [
        'errorCategory',
        [ErrorQuery.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['errorCategory'],
      raw: true
    });

    // Get monthly query count for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await ErrorQuery.findAll({
      where: {
        userId,
        createdAt: { [require('sequelize').Op.gte]: sixMonthsAgo }
      },
      attributes: [
        [ErrorQuery.sequelize.fn('DATE_TRUNC', 'month', ErrorQuery.sequelize.col('createdAt')), 'month'],
        [ErrorQuery.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [ErrorQuery.sequelize.fn('DATE_TRUNC', 'month', ErrorQuery.sequelize.col('createdAt'))],
      order: [[ErrorQuery.sequelize.fn('DATE_TRUNC', 'month', ErrorQuery.sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    // Get total statistics
    const totalQueries = await ErrorQuery.count({ where: { userId } });
    const thisWeekQueries = await ErrorQuery.count({
      where: {
        userId,
        createdAt: {
          [require('sequelize').Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    res.json({
      summary: {
        totalQueries,
        thisWeekQueries,
        categoriesCount: categoryStats.length,
        subscriptionTier: 'free'
      },
      recentQueries,
      categoryStats,
      monthlyStats
    });

  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};
