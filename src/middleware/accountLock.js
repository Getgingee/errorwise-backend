/**
 * Account Lockout Protection Middleware
 * Prevents brute force attacks by locking accounts after failed login attempts
 */

const redisService = require('../services/redisService');

// Helper to get Redis client safely
const getRedisClient = () => {
  if (!redisService.isConnected || !redisService.client) {
    console.warn('⚠️  Redis client not available - account lockout features disabled');
    return null;
  }
  return redisService.client;
};

/**
 * Configuration
 */
const CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,           // Lock after 5 failed attempts
  LOCKOUT_DURATION: 900,             // 15 minutes (in seconds)
  EXTENDED_LOCKOUT_DURATION: 3600,   // 1 hour (in seconds)
  PERMANENT_LOCKOUT_THRESHOLD: 10,   // Permanent lock after 10 lockouts
  
  // Escalating lockout durations
  LOCKOUT_ESCALATION: {
    1: 900,      // 1st lockout: 15 minutes
    2: 1800,     // 2nd lockout: 30 minutes
    3: 3600,     // 3rd lockout: 1 hour
    4: 7200,     // 4th lockout: 2 hours
    5: 14400,    // 5th lockout: 4 hours
    6: 28800,    // 6th lockout: 8 hours
    7: 86400,    // 7th lockout: 24 hours
  },
  
  // Redis key prefixes
  ATTEMPTS_KEY: 'login_attempts',
  LOCKOUT_KEY: 'account_locked',
  LOCKOUT_COUNT_KEY: 'lockout_count',
  
  // Expiry times
  ATTEMPTS_EXPIRY: 900,   // 15 minutes
};

/**
 * Get Redis keys for a user
 */
function getKeys(identifier) {
  return {
    attempts: `${CONFIG.ATTEMPTS_KEY}:${identifier}`,
    locked: `${CONFIG.LOCKOUT_KEY}:${identifier}`,
    lockoutCount: `${CONFIG.LOCKOUT_COUNT_KEY}:${identifier}`
  };
}

/**
 * Track failed login attempt
 * @param {string} identifier - User email or username
 * @returns {Promise<{attempts: number, locked: boolean, lockoutInfo: object}>}
 */
async function trackFailedAttempt(identifier) {
  try {
    const redis = getRedisClient();
    if (!redis) {
      // Redis not available - skip tracking but allow login attempt
      return { attempts: 0, locked: false, lockoutInfo: null };
    }
    
    const keys = getKeys(identifier);
    
    // Increment failed attempts
    const attempts = await redis.incr(keys.attempts);
    
    // Set expiry on first attempt
    if (attempts === 1) {
      await redis.expire(keys.attempts, CONFIG.ATTEMPTS_EXPIRY);
    }
    
    console.warn(`⚠️  Failed login attempt ${attempts}/${CONFIG.MAX_FAILED_ATTEMPTS} for: ${identifier}`);
    
    // Check if should lock account
    if (attempts >= CONFIG.MAX_FAILED_ATTEMPTS) {
      // Get lockout count to determine duration
      let lockoutCount = await redis.get(keys.lockoutCount);
      lockoutCount = lockoutCount ? parseInt(lockoutCount, 10) : 0;
      lockoutCount += 1;
      
      // Store updated lockout count (permanent)
      await redis.set(keys.lockoutCount, lockoutCount);
      
      // Determine lockout duration based on history
      let lockoutDuration = CONFIG.LOCKOUT_ESCALATION[lockoutCount] || CONFIG.EXTENDED_LOCKOUT_DURATION;
      
      // Permanent lockout after threshold
      if (lockoutCount >= CONFIG.PERMANENT_LOCKOUT_THRESHOLD) {
        lockoutDuration = 31536000; // 1 year (effectively permanent)
      }
      
      // Create lockout info
      const lockoutInfo = {
        lockedAt: new Date().toISOString(),
        expiresAt: Date.now() + (lockoutDuration * 1000),
        duration: lockoutDuration,
        reason: 'Too many failed login attempts',
        attempts,
        lockoutCount,
        permanent: lockoutCount >= CONFIG.PERMANENT_LOCKOUT_THRESHOLD
      };
      
      // Lock the account
      await redis.setex(keys.locked, lockoutDuration, JSON.stringify(lockoutInfo));
      
      // Reset attempt counter
      await redis.del(keys.attempts);
      
      console.error(`🔒 Account locked: ${identifier} | Lockout #${lockoutCount} | Duration: ${lockoutDuration}s | Permanent: ${lockoutInfo.permanent}`);
      
      // TODO: Send email notification to user
      
      return {
        attempts: 0,
        locked: true,
        lockoutInfo
      };
    }
    
    return {
      attempts,
      locked: false,
      remainingAttempts: CONFIG.MAX_FAILED_ATTEMPTS - attempts
    };
  } catch (error) {
    console.error('❌ Failed attempt tracking error:', error);
    throw error;
  }
}

/**
 * Check if account is locked
 * @param {string} identifier - User email or username
 * @returns {Promise<{locked: boolean, lockoutInfo: object}>}
 */
async function isAccountLocked(identifier) {
  try {
    const redis = getRedisClient();
    if (!redis) {
      // Redis not available - allow login
      return { locked: false };
    }
    
    const keys = getKeys(identifier);
    const lockoutData = await redis.get(keys.locked);
    
    if (lockoutData) {
      const lockoutInfo = JSON.parse(lockoutData);
      
      // Check if lockout has expired
      if (lockoutInfo.expiresAt < Date.now()) {
        // Lockout expired, clean up
        await redis.del(keys.locked);
        return { locked: false };
      }
      
      return {
        locked: true,
        lockoutInfo
      };
    }
    
    return { locked: false };
  } catch (error) {
    console.error('❌ Account lock check error:', error);
    return { locked: false }; // Fail open to not block legitimate users
  }
}

/**
 * Reset failed attempts (on successful login)
 * @param {string} identifier - User email or username
 */
async function resetFailedAttempts(identifier) {
  try {
    const redis = getRedisClient();
    if (!redis) return; // Redis not available - skip
    const keys = getKeys(identifier);
    await redis.del(keys.attempts);
    
    console.log(`✅ Reset failed attempts for: ${identifier}`);
  } catch (error) {
    console.error('❌ Reset attempts error:', error);
  }
}

/**
 * Unlock account manually (admin action)
 * @param {string} identifier - User email or username
 */
async function unlockAccount(identifier) {
  try {
    const redis = getRedisClient();
    if (!redis) return; // Redis not available - skip
    
    const keys = getKeys(identifier);
    await redis.del(keys.locked);
    await redis.del(keys.attempts);
    
    console.log(`🔓 Account unlocked: ${identifier}`);
    
    return { success: true, message: 'Account unlocked successfully' };
  } catch (error) {
    console.error('❌ Account unlock error:', error);
    throw error;
  }
}

/**
 * Get account lockout statistics
 * @param {string} identifier - User email or username
 */
async function getLockoutStats(identifier) {
  try {
    const keys = getKeys(identifier);
    
    const [attempts, lockoutData, lockoutCount] = await Promise.all([
      redis.get(keys.attempts),
      redis.get(keys.locked),
      redis.get(keys.lockoutCount)
    ]);
    
    const stats = {
      identifier,
      currentAttempts: attempts ? parseInt(attempts, 10) : 0,
      maxAttempts: CONFIG.MAX_FAILED_ATTEMPTS,
      locked: !!lockoutData,
      totalLockouts: lockoutCount ? parseInt(lockoutCount, 10) : 0,
      lockoutInfo: null
    };
    
    if (lockoutData) {
      stats.lockoutInfo = JSON.parse(lockoutData);
      stats.remainingTime = Math.ceil((stats.lockoutInfo.expiresAt - Date.now()) / 1000 / 60); // minutes
    }
    
    return stats;
  } catch (error) {
    console.error('❌ Get lockout stats error:', error);
    throw error;
  }
}

/**
 * Middleware to check account lockout before login
 */
const accountLockoutMiddleware = async (req, res, next) => {
  try {
    const identifier = req.body.email || req.body.username;
    
    if (!identifier) {
      return next(); // No identifier, let validation handle it
    }
    
    // Check if account is locked
    const { locked, lockoutInfo } = await isAccountLocked(identifier);
    
    if (locked) {
      const remainingMinutes = Math.ceil((lockoutInfo.expiresAt - Date.now()) / 1000 / 60);
      
      console.warn(`🔒 Locked account login attempt: ${identifier} | Remaining: ${remainingMinutes} min`);
      
      return res.status(423).json({ // 423 Locked
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: lockoutInfo.permanent
          ? 'Your account has been permanently locked due to too many failed login attempts. Please contact support.'
          : `Your account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minutes.`,
        locked: true,
        lockoutInfo: {
          expiresAt: lockoutInfo.expiresAt,
          remainingMinutes,
          permanent: lockoutInfo.permanent,
          lockoutCount: lockoutInfo.lockoutCount
        }
      });
    }
    
    // Attach identifier to request for use in controller
    req.loginIdentifier = identifier;
    
    next();
  } catch (error) {
    console.error('❌ Account lockout middleware error:', error);
    next(); // Don't block on error
  }
};

module.exports = {
  trackFailedAttempt,
  isAccountLocked,
  resetFailedAttempts,
  unlockAccount,
  getLockoutStats,
  accountLockoutMiddleware,
  CONFIG
};



