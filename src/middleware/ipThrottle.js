/**
 * IP-Based Throttling Middleware
 * Track and block IPs with suspicious activity
 * Uses Redis for distributed tracking
 */

const redis = require('../config/redis');

/**
 * Configuration
 */
const CONFIG = {
  // Thresholds
  MAX_ATTEMPTS_PER_HOUR: 20,         // Max attempts from same IP per hour
  MAX_ATTEMPTS_PER_DAY: 100,         // Max attempts from same IP per day
  MAX_FAILED_ATTEMPTS: 10,           // Failed attempts before temporary ban
  
  // Ban durations (in seconds)
  TEMP_BAN_DURATION: 3600,           // 1 hour
  EXTENDED_BAN_DURATION: 86400,      // 24 hours
  PERMANENT_BAN_DURATION: 2592000,   // 30 days
  
  // Redis key prefixes
  KEY_PREFIX: 'ip_throttle',
  ATTEMPTS_HOUR: 'attempts_hour',
  ATTEMPTS_DAY: 'attempts_day',
  FAILED_ATTEMPTS: 'failed',
  BANNED: 'banned',
  WHITELIST: 'whitelist',
  
  // Time windows (in seconds)
  HOUR_WINDOW: 3600,
  DAY_WINDOW: 86400
};

/**
 * Get client IP address
 * Handles proxies and load balancers
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * Generate Redis keys
 */
function getKeys(ip) {
  return {
    hourlyAttempts: `${CONFIG.KEY_PREFIX}:${CONFIG.ATTEMPTS_HOUR}:${ip}`,
    dailyAttempts: `${CONFIG.KEY_PREFIX}:${CONFIG.ATTEMPTS_DAY}:${ip}`,
    failedAttempts: `${CONFIG.KEY_PREFIX}:${CONFIG.FAILED_ATTEMPTS}:${ip}`,
    banned: `${CONFIG.KEY_PREFIX}:${CONFIG.BANNED}:${ip}`,
    whitelist: `${CONFIG.KEY_PREFIX}:${CONFIG.WHITELIST}:${ip}`
  };
}

/**
 * Check if IP is whitelisted
 */
async function isWhitelisted(ip) {
  try {
    const keys = getKeys(ip);
    const whitelisted = await redis.get(keys.whitelist);
    return whitelisted === '1';
  } catch (error) {
    console.error('❌ Whitelist check error:', error);
    return false;
  }
}

/**
 * Check if IP is banned
 */
async function isBanned(ip) {
  try {
    const keys = getKeys(ip);
    const banned = await redis.get(keys.banned);
    
    if (banned) {
      const banInfo = JSON.parse(banned);
      return {
        banned: true,
        reason: banInfo.reason,
        expiresAt: banInfo.expiresAt,
        duration: banInfo.duration
      };
    }
    
    return { banned: false };
  } catch (error) {
    console.error('❌ Ban check error:', error);
    return { banned: false };
  }
}

/**
 * Ban an IP address
 */
async function banIP(ip, reason = 'Suspicious activity', duration = CONFIG.TEMP_BAN_DURATION) {
  try {
    const keys = getKeys(ip);
    const expiresAt = Date.now() + (duration * 1000);
    
    const banInfo = {
      ip,
      reason,
      bannedAt: new Date().toISOString(),
      expiresAt,
      duration
    };
    
    await redis.setex(keys.banned, duration, JSON.stringify(banInfo));
    
    console.warn(`🚫 IP banned: ${ip} | Reason: ${reason} | Duration: ${duration}s`);
    
    return banInfo;
  } catch (error) {
    console.error('❌ IP ban error:', error);
    throw error;
  }
}

/**
 * Track request attempt
 */
async function trackAttempt(ip, success = true) {
  try {
    const keys = getKeys(ip);
    
    // Increment hourly counter
    const hourlyCount = await redis.incr(keys.hourlyAttempts);
    if (hourlyCount === 1) {
      await redis.expire(keys.hourlyAttempts, CONFIG.HOUR_WINDOW);
    }
    
    // Increment daily counter
    const dailyCount = await redis.incr(keys.dailyAttempts);
    if (dailyCount === 1) {
      await redis.expire(keys.dailyAttempts, CONFIG.DAY_WINDOW);
    }
    
    // Track failed attempts
    if (!success) {
      const failedCount = await redis.incr(keys.failedAttempts);
      if (failedCount === 1) {
        await redis.expire(keys.failedAttempts, CONFIG.HOUR_WINDOW);
      }
      
      // Auto-ban after too many failures
      if (failedCount >= CONFIG.MAX_FAILED_ATTEMPTS) {
        const banDuration = failedCount > CONFIG.MAX_FAILED_ATTEMPTS * 2 
          ? CONFIG.EXTENDED_BAN_DURATION 
          : CONFIG.TEMP_BAN_DURATION;
        
        await banIP(ip, `${failedCount} failed attempts`, banDuration);
      }
      
      return { hourlyCount, dailyCount, failedCount };
    } else {
      // Reset failed attempts on success
      await redis.del(keys.failedAttempts);
    }
    
    return { hourlyCount, dailyCount };
  } catch (error) {
    console.error('❌ Attempt tracking error:', error);
    // Don't block on error
    return { hourlyCount: 0, dailyCount: 0 };
  }
}

/**
 * IP Throttling Middleware
 * @param {Object} options - Configuration options
 */
function ipThrottleMiddleware(options = {}) {
  const {
    maxPerHour = CONFIG.MAX_ATTEMPTS_PER_HOUR,
    maxPerDay = CONFIG.MAX_ATTEMPTS_PER_DAY,
    trackFailures = true,
    customMessage
  } = options;
  
  return async (req, res, next) => {
    try {
      const ip = getClientIP(req);
      
      // Skip for localhost in development
      if (process.env.NODE_ENV === 'development' && (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost')) {
        return next();
      }
      
      // Check whitelist
      if (await isWhitelisted(ip)) {
        return next();
      }
      
      // Check if banned
      const banStatus = await isBanned(ip);
      if (banStatus.banned) {
        const remainingTime = Math.ceil((banStatus.expiresAt - Date.now()) / 1000 / 60); // minutes
        
        return res.status(403).json({
          success: false,
          code: 'IP_BANNED',
          message: customMessage || `Your IP address has been temporarily banned due to ${banStatus.reason}. Please try again in ${remainingTime} minutes.`,
          expiresAt: banStatus.expiresAt,
          remainingMinutes: remainingTime
        });
      }
      
      // Track this attempt
      const { hourlyCount, dailyCount } = await trackAttempt(ip, true);
      
      // Check hourly limit
      if (hourlyCount > maxPerHour) {
        console.warn(`⚠️  IP exceeded hourly limit: ${ip} | Count: ${hourlyCount}/${maxPerHour}`);
        
        // Temporary ban
        await banIP(ip, 'Exceeded hourly rate limit', CONFIG.TEMP_BAN_DURATION);
        
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from your IP address. Please try again later.',
          retryAfter: CONFIG.TEMP_BAN_DURATION
        });
      }
      
      // Check daily limit
      if (dailyCount > maxPerDay) {
        console.warn(`⚠️  IP exceeded daily limit: ${ip} | Count: ${dailyCount}/${maxPerDay}`);
        
        // Extended ban
        await banIP(ip, 'Exceeded daily rate limit', CONFIG.EXTENDED_BAN_DURATION);
        
        return res.status(429).json({
          success: false,
          code: 'DAILY_LIMIT_EXCEEDED',
          message: 'You have exceeded the daily request limit. Please try again tomorrow.',
          retryAfter: CONFIG.EXTENDED_BAN_DURATION
        });
      }
      
      // Add throttle info to request
      req.ipThrottle = {
        ip,
        hourlyCount,
        dailyCount,
        remainingHourly: Math.max(0, maxPerHour - hourlyCount),
        remainingDaily: Math.max(0, maxPerDay - dailyCount)
      };
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit-Hour', maxPerHour);
      res.setHeader('X-RateLimit-Remaining-Hour', req.ipThrottle.remainingHourly);
      res.setHeader('X-RateLimit-Limit-Day', maxPerDay);
      res.setHeader('X-RateLimit-Remaining-Day', req.ipThrottle.remainingDaily);
      
      next();
    } catch (error) {
      console.error('❌ IP throttle middleware error:', error);
      next(); // Don't block on error
    }
  };
}

/**
 * Track failed attempt (for use in controllers)
 */
async function trackFailedAttempt(req, reason = 'Failed request') {
  const ip = getClientIP(req);
  const result = await trackAttempt(ip, false);
  
  console.warn(`❌ Failed attempt from ${ip} | Reason: ${reason} | Count: ${result.failedCount || 0}`);
  
  return result;
}

/**
 * Whitelist an IP address
 */
async function whitelistIP(ip, duration = 0) {
  try {
    const keys = getKeys(ip);
    
    if (duration > 0) {
      await redis.setex(keys.whitelist, duration, '1');
    } else {
      await redis.set(keys.whitelist, '1'); // Permanent
    }
    
    console.log(`✅ IP whitelisted: ${ip} | Duration: ${duration > 0 ? duration + 's' : 'permanent'}`);
  } catch (error) {
    console.error('❌ IP whitelist error:', error);
    throw error;
  }
}

/**
 * Unban an IP address
 */
async function unbanIP(ip) {
  try {
    const keys = getKeys(ip);
    await redis.del(keys.banned);
    await redis.del(keys.failedAttempts);
    
    console.log(`✅ IP unbanned: ${ip}`);
  } catch (error) {
    console.error('❌ IP unban error:', error);
    throw error;
  }
}

module.exports = {
  ipThrottleMiddleware,
  trackFailedAttempt,
  banIP,
  unbanIP,
  whitelistIP,
  isWhitelisted,
  isBanned,
  getClientIP,
  CONFIG
};
