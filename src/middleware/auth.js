const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');
const { getSession } = require('./session');

// ============================================================================
// PERFORMANCE: User cache to avoid DB lookups on every request
// ============================================================================
const userCache = new Map();
const USER_CACHE_TTL = 60000; // 1 minute cache for user data

/**
 * Get user from cache or DB (with caching)
 */
async function getCachedUser(userId) {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    return cached.user;
  }
  
  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'username', 'isActive', 'role', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndDate', 'trialEndsAt', 'preferred_ai_model']
  });
  
  if (user) {
    userCache.set(userId, { user, timestamp: Date.now() });
    
    // Cleanup old entries
    if (userCache.size > 1000) {
      const oldestKey = userCache.keys().next().value;
      userCache.delete(oldestKey);
    }
  }
  
  return user;
}

/**
 * Invalidate user cache (call after user updates)
 */
function invalidateUserCache(userId) {
  userCache.delete(userId);
}

/**
 * Calculate trial status
 * @param {Date} trialEndsAt - Trial end date
 * @param {string} subscriptionTier - Current subscription tier
 * @returns {Object} Trial status info
 */
function getTrialStatus(trialEndsAt, subscriptionTier) {
  // If user already has a paid tier, no trial needed
  if (subscriptionTier && subscriptionTier !== 'free') {
    return { isInTrial: false, daysLeft: 0, expired: false };
  }
  
  // No trial date set
  if (!trialEndsAt) {
    return { isInTrial: false, daysLeft: 0, expired: false };
  }
  
  const now = new Date();
  const trialEnd = new Date(trialEndsAt);
  const diffMs = trialEnd - now;
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (daysLeft > 0) {
    // Still in trial
    return { isInTrial: true, daysLeft, expired: false };
  } else {
    // Trial expired
    return { isInTrial: false, daysLeft: 0, expired: true };
  }
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Main authentication middleware (PERFORMANCE OPTIMIZED)
const authMiddleware = async (req, res, next) => {
  try {
    // Try to get token from Authorization header first (Bearer token)
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // If no header token, try to get from cookies
    if (!token) {
      token = req.cookies.accessToken;
    }

    // If no token, try X-Auth-Token header
    if (!token) {
      token = req.headers['x-auth-token'];
    }

    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required. Please log in.' 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ===== SESSION VALIDATION (Single Session Enforcement) =====
    // Check if session still exists in Redis
    // If user logged in elsewhere, their old sessions are deleted
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      const sessionData = await getSession(refreshToken);
      if (!sessionData) {
        // Session was invalidated (user logged in elsewhere or session expired)
        logger.info('Session invalidated - user may have logged in elsewhere', { 
          userId: decoded.userId 
        });
        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(401).json({
          success: false,
          error: 'Session expired. You may have logged in from another device.',
          code: 'SESSION_INVALIDATED'
        });
      }
    }
    
    // PERFORMANCE: Check if user exists (with caching)
    const user = await getCachedUser(decoded.userId);

    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User no longer exists. Please log in again.' 
      });
    }

    // Check if user account is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        error: 'Account has been deactivated. Please contact support.' 
      });
    }

    // Check trial status
    const trialInfo = getTrialStatus(user.trialEndsAt, user.subscriptionTier);
    
    // Determine effective tier (trial users get 'pro' features)
    const effectiveTier = trialInfo.isInTrial ? 'pro' : (user.subscriptionTier || 'free');

    // Attach user to request object with FULL subscription data
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role || 'user',
      subscriptionTier: user.subscriptionTier || 'free',
      subscription_tier: user.subscriptionTier || 'free', // Alias for compatibility
      effectiveTier: effectiveTier, // The tier to use for feature access
      subscriptionStatus: user.subscriptionStatus || 'active',
      subscriptionEndDate: user.subscriptionEndDate,
      preferred_ai_model: user.preferred_ai_model, // For AI model selection
      // Trial info
      isInTrial: trialInfo.isInTrial,
      trialEndsAt: user.trialEndsAt,
      trialDaysLeft: trialInfo.daysLeft,
      trialExpired: trialInfo.expired
    };
    
    // Also set userTier for quick access (use effective tier)
    req.userTier = effectiveTier;

    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token. Please log in again.',
        code: 'INVALID_TOKEN'
      });
    } else {
      logger.error('Auth middleware error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Authentication error occurred.' 
      });
    }
  }
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      token = req.cookies.accessToken;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId, {
          attributes: ['id', 'email', 'username', 'isActive', 'role', 'subscriptionStatus']
        });

        if (user && user.isActive) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role || 'user',
            subscriptionStatus: user.subscriptionStatus || 'free'
          };
        }
      } catch (error) {
        // Silently fail for optional auth
        logger.debug('Optional auth failed:', error.message);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Admin role requirement middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false,
      error: 'Admin access required' 
    });
  }

  next();
};

// Premium subscription requirement middleware
const requirePremium = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
  }

  const premiumStatuses = ['premium', 'pro', 'enterprise'];
  if (!premiumStatuses.includes(req.user.subscriptionStatus)) {
    return res.status(403).json({ 
      success: false,
      error: 'Premium subscription required',
      code: 'PREMIUM_REQUIRED'
    });
  }

  next();
};

// Team owner/admin middleware
const requireTeamAccess = (minimumRole = 'member') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
      }

      const teamId = req.params.teamId;
      if (!teamId) {
        return res.status(400).json({ 
          success: false,
          error: 'Team ID required' 
        });
      }

      // Check team membership
      const TeamMember = require('../models/TeamMember');
      const membership = await TeamMember.findOne({
        where: {
          userId: req.user.id,
          teamId: teamId
        }
      });

      if (!membership) {
        return res.status(403).json({ 
          success: false,
          error: 'Access denied. You are not a member of this team.' 
        });
      }

      // Check role permissions
      const roleHierarchy = {
        'member': 1,
        'admin': 2,
        'owner': 3
      };

      const userRoleLevel = roleHierarchy[membership.role] || 0;
      const requiredRoleLevel = roleHierarchy[minimumRole] || 0;

      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({ 
          success: false,
          error: `${minimumRole} access required` 
        });
      }

      req.teamMembership = membership;
      next();

    } catch (error) {
      logger.error('Team access middleware error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Error checking team access' 
      });
    }
  };
};

module.exports = {
  authMiddleware,
  optionalAuth,
  requireAdmin,
  requirePremium,
  requireTeamAccess,
  authenticateToken,
  invalidateUserCache  // Export for use when user data changes
};  

