const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');


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

// Main authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    // Try to get token from Authorization header first (Bearer token)
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Debug logging
    logger.info('🔐 Auth middleware check', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
      authHeaderPreview: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
      hasToken: !!token
    });

    // If no header token, try to get from cookies
    if (!token) {
      token = req.cookies.accessToken;
    }

    // If no token, try X-Auth-Token header
    if (!token) {
      token = req.headers['x-auth-token'];
    }

    if (!token) {
      logger.warn('❌ No token found in request', {
        path: req.path,
        headers: Object.keys(req.headers)
      });
      return res.status(401).json({ 
        success: false,
        error: 'Access token required. Please log in.' 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'username', 'isActive', 'role', 'subscriptionStatus']
    });

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

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role || 'user',
      subscriptionStatus: user.subscriptionStatus || 'free'
    };

    // Log successful authentication
    logger.info('User authenticated successfully', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    next();

  } catch (error) {
    logger.error('❌ Auth middleware error:', {
      errorName: error.name,
      errorMessage: error.message,
      path: req.path
    });

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
  authenticateToken
};  

