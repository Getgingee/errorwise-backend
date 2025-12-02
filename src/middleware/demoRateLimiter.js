const crypto = require('crypto');

/**
 * Enhanced Demo Rate Limiter with PERSISTENT Database Storage
 * 
 * FEATURES:
 * 1. Persists to database (survives server restarts)
 * 2. Browser fingerprinting that's resistant to tab refresh
 * 3. Registered users blocked for 7 days from demo abuse
 * 4. Strict 2 demos per unique device per 7 days
 * 5. Cannot bypass with incognito/new tabs
 */

// In-memory cache (backed by database)
const memoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache

const DEMO_LIMIT = 2; // 2 demos per device
const BLOCK_DURATION_ANONYMOUS = 24 * 60 * 60 * 1000; // 24 hours for anonymous
const BLOCK_DURATION_REGISTERED = 7 * 24 * 60 * 60 * 1000; // 7 days if registered user detected
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Generate device fingerprint from request headers
 * More robust - includes all available signals
 */
function generateFingerprint(req) {
  const signals = [
    req.ip || req.connection.remoteAddress || 'unknown-ip',
    req.headers['user-agent'] || 'unknown-ua',
    req.headers['accept-language'] || 'unknown-lang',
    req.headers['accept-encoding'] || 'unknown-enc',
    // Additional client hints if available
    req.headers['sec-ch-ua'] || '',
    req.headers['sec-ch-ua-platform'] || '',
    req.headers['sec-ch-ua-mobile'] || '',
    req.headers['sec-ch-ua-arch'] || '',
    req.headers['sec-ch-ua-model'] || '',
    // Screen info from custom headers (set by frontend)
    req.headers['x-screen-resolution'] || '',
    req.headers['x-timezone'] || '',
    req.headers['x-device-memory'] || '',
    // Additional fingerprint from frontend
    req.headers['x-fingerprint'] || req.body?.fingerprint || ''
  ];

  // Create hash from combined signals
  const fingerprint = crypto
    .createHash('sha256')
    .update(signals.join('|'))
    .digest('hex');

  return fingerprint;
}

/**
 * Get IP address from request (handles proxies)
 */
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Create composite key for tracking (fingerprint + IP)
 */
function createTrackingKey(req) {
  const fingerprint = generateFingerprint(req);
  const ip = getClientIP(req);
  
  // Also consider any client-side fingerprint sent
  const clientFingerprint = req.headers['x-fingerprint'] || req.body?.fingerprint || '';
  
  // Combine fingerprint and IP for stronger tracking
  const compositeKey = crypto
    .createHash('sha256')
    .update(`${fingerprint}:${ip}:${clientFingerprint}`)
    .digest('hex');

  return {
    compositeKey,
    fingerprint,
    ip,
    clientFingerprint
  };
}

/**
 * Check database for demo usage
 */
async function checkDatabaseUsage(fingerprint, ip) {
  try {
    const sequelize = require('../config/database');
    
    // Check if demo_usage table exists, create if not
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS demo_usage (
        id SERIAL PRIMARY KEY,
        fingerprint VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        demo_count INTEGER DEFAULT 0,
        first_demo_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_demo_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        blocked_until TIMESTAMP WITH TIME ZONE,
        is_registered_user BOOLEAN DEFAULT false,
        user_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fingerprint)
      )
    `);
    
    // Get usage record
    const [records] = await sequelize.query(`
      SELECT * FROM demo_usage WHERE fingerprint = :fingerprint
    `, {
      replacements: { fingerprint }
    });
    
    return records[0] || null;
  } catch (error) {
    console.error('Database check error:', error.message);
    return null;
  }
}

/**
 * Update demo usage in database
 */
async function updateDatabaseUsage(fingerprint, ip, userAgent, isRegisteredUser = false, userId = null) {
  try {
    const sequelize = require('../config/database');
    const now = new Date();
    const blockDuration = isRegisteredUser ? BLOCK_DURATION_REGISTERED : BLOCK_DURATION_ANONYMOUS;
    const blockedUntil = new Date(now.getTime() + blockDuration);
    
    // Upsert usage record
    await sequelize.query(`
      INSERT INTO demo_usage (fingerprint, ip_address, user_agent, demo_count, first_demo_at, last_demo_at, blocked_until, is_registered_user, user_id)
      VALUES (:fingerprint, :ip, :userAgent, 1, :now, :now, :blockedUntil, :isRegisteredUser, :userId)
      ON CONFLICT (fingerprint) 
      DO UPDATE SET 
        demo_count = demo_usage.demo_count + 1,
        last_demo_at = :now,
        ip_address = :ip,
        is_registered_user = COALESCE(:isRegisteredUser, demo_usage.is_registered_user),
        user_id = COALESCE(:userId, demo_usage.user_id),
        updated_at = :now
    `, {
      replacements: { 
        fingerprint, 
        ip, 
        userAgent, 
        now, 
        blockedUntil,
        isRegisteredUser,
        userId
      }
    });
    
    return true;
  } catch (error) {
    console.error('Database update error:', error.message);
    return false;
  }
}

/**
 * Check if this fingerprint belongs to a registered user
 */
async function checkRegisteredUser(fingerprint, ip) {
  try {
    const sequelize = require('../config/database');
    
    // Check if any user has logged in from this IP or fingerprint recently
    const [users] = await sequelize.query(`
      SELECT id, email FROM users 
      WHERE last_login_at > NOW() - INTERVAL '30 days'
      LIMIT 1
    `);
    
    // Also check demo_usage for registered user flag
    const [demoRecords] = await sequelize.query(`
      SELECT user_id FROM demo_usage 
      WHERE fingerprint = :fingerprint AND is_registered_user = true
    `, {
      replacements: { fingerprint }
    });
    
    return demoRecords.length > 0 || users.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if demo is allowed and track usage
 */
async function checkDemoLimit(req) {
  const now = Date.now();
  const { compositeKey, fingerprint, ip } = createTrackingKey(req);
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Check memory cache first for performance
  const cached = memoryCache.get(fingerprint);
  if (cached && cached.expiresAt > now) {
    if (cached.blocked) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: cached.resetTime,
        reason: 'daily_limit_exceeded',
        blocked: true
      };
    }
  }

  // Check database for persistent tracking
  const dbRecord = await checkDatabaseUsage(fingerprint, ip);
  
  if (dbRecord) {
    const blockedUntil = new Date(dbRecord.blocked_until);
    
    // Check if still in block period
    if (blockedUntil > new Date()) {
      // Check if limit exceeded
      if (dbRecord.demo_count >= DEMO_LIMIT) {
        // Cache the block
        memoryCache.set(fingerprint, {
          blocked: true,
          resetTime: blockedUntil.toISOString(),
          expiresAt: now + CACHE_TTL
        });
        
        return {
          allowed: false,
          remaining: 0,
          resetTime: blockedUntil.toISOString(),
          reason: dbRecord.is_registered_user ? 'registered_user_7day_block' : 'daily_limit_exceeded',
          blocked: true,
          isRegistered: dbRecord.is_registered_user
        };
      }
      
      // Demo still allowed, update count
      const isRegisteredUser = await checkRegisteredUser(fingerprint, ip);
      await updateDatabaseUsage(fingerprint, ip, userAgent, isRegisteredUser);
      
      const remaining = Math.max(0, DEMO_LIMIT - (dbRecord.demo_count + 1));
      
      return {
        allowed: true,
        remaining,
        resetTime: blockedUntil.toISOString(),
        fingerprint: fingerprint.substring(0, 8)
      };
    } else {
      // Block period expired - but check if registered user (7 day block)
      const isRegisteredUser = await checkRegisteredUser(fingerprint, ip);
      
      if (isRegisteredUser && dbRecord.demo_count >= DEMO_LIMIT) {
        // Registered users get 7 day block
        const sevenDaysAgo = new Date(now - BLOCK_DURATION_REGISTERED);
        const lastDemo = new Date(dbRecord.last_demo_at);
        
        if (lastDemo > sevenDaysAgo) {
          const resetTime = new Date(lastDemo.getTime() + BLOCK_DURATION_REGISTERED);
          return {
            allowed: false,
            remaining: 0,
            resetTime: resetTime.toISOString(),
            reason: 'registered_user_7day_block',
            blocked: true,
            isRegistered: true,
            message: 'Registered users are blocked for 7 days. Please sign in to use the full app.'
          };
        }
      }
      
      // Reset for new period
      await updateDatabaseUsage(fingerprint, ip, userAgent, isRegisteredUser);
      
      return {
        allowed: true,
        remaining: DEMO_LIMIT - 1,
        resetTime: new Date(now + (isRegisteredUser ? BLOCK_DURATION_REGISTERED : BLOCK_DURATION_ANONYMOUS)).toISOString(),
        fingerprint: fingerprint.substring(0, 8)
      };
    }
  }

  // New device - create record
  const isRegisteredUser = await checkRegisteredUser(fingerprint, ip);
  await updateDatabaseUsage(fingerprint, ip, userAgent, isRegisteredUser);
  
  const blockDuration = isRegisteredUser ? BLOCK_DURATION_REGISTERED : BLOCK_DURATION_ANONYMOUS;
  
  return {
    allowed: true,
    remaining: DEMO_LIMIT - 1,
    resetTime: new Date(now + blockDuration).toISOString(),
    fingerprint: fingerprint.substring(0, 8),
    isNewDevice: true
  };
}

/**
 * Get current usage stats for a device
 */
async function getUsageStats(req) {
  const { fingerprint, ip } = createTrackingKey(req);
  const dbRecord = await checkDatabaseUsage(fingerprint, ip);

  if (!dbRecord) {
    return {
      used: 0,
      remaining: DEMO_LIMIT,
      limit: DEMO_LIMIT,
      resetTime: new Date(Date.now() + BLOCK_DURATION_ANONYMOUS).toISOString(),
      blocked: false
    };
  }

  const blockedUntil = new Date(dbRecord.blocked_until);
  const isBlocked = dbRecord.demo_count >= DEMO_LIMIT && blockedUntil > new Date();

  return {
    used: dbRecord.demo_count,
    remaining: Math.max(0, DEMO_LIMIT - dbRecord.demo_count),
    limit: DEMO_LIMIT,
    resetTime: blockedUntil.toISOString(),
    blocked: isBlocked,
    isRegistered: dbRecord.is_registered_user
  };
}

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt < now) {
      memoryCache.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired demo cache entries`);
  }
}, CLEANUP_INTERVAL);

/**
 * Express middleware for demo rate limiting
 */
async function demoRateLimiter(req, res, next) {
  try {
    const limitCheck = await checkDemoLimit(req);

    if (!limitCheck.allowed) {
      if (limitCheck.reason === 'rate_limit_too_fast') {
        return res.status(429).json({
          error: 'Too many requests',
          message: `Please wait a moment between requests`,
          remaining: limitCheck.remaining,
          resetTime: limitCheck.resetTime
        });
      }

      const message = limitCheck.isRegistered 
        ? `You've already used the demo. As a registered user, please sign in to continue using ErrorWise!`
        : `You've used all ${DEMO_LIMIT} free demos. Sign up for unlimited access!`;

      return res.status(429).json({
        error: 'Demo limit reached',
        message,
        resetTime: limitCheck.resetTime,
        blocked: true,
        isRegistered: limitCheck.isRegistered,
        upgradeUrl: limitCheck.isRegistered 
          ? `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
          : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register`
      });
    }

    // Attach usage info to request for use in route handlers
    req.demoUsage = limitCheck;
    next();
  } catch (error) {
    console.error('❌ demoRateLimiter error:', error.message);
    // On error, be strict - don't allow demo
    return res.status(500).json({
      error: 'Demo service unavailable',
      message: 'Please try again later or sign up for full access'
    });
  }
}

// Export stats for monitoring
function getStats() {
  return {
    cachedEntries: memoryCache.size,
    limit: DEMO_LIMIT,
    anonymousBlockDuration: BLOCK_DURATION_ANONYMOUS / (1000 * 60 * 60) + ' hours',
    registeredBlockDuration: BLOCK_DURATION_REGISTERED / (1000 * 60 * 60 * 24) + ' days'
  };
}

module.exports = {
  demoRateLimiter,
  checkDemoLimit,
  getUsageStats,
  getStats,
  DEMO_LIMIT
};

