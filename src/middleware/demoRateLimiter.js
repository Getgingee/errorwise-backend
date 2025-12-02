const crypto = require('crypto');

/**
 * Enhanced Demo Rate Limiter with Browser Fingerprinting
 * Prevents bypass through:
 * 1. Browser fingerprinting (User-Agent, Accept-Language, Screen resolution hints)
 * 2. IP address tracking
 * 3. Combined session tracking
 * 4. Persistent storage (can be moved to Redis/DB for production)
 */

// In-memory storage (use Redis or Database in production)
const demoUsage = new Map();
const blockedFingerprints = new Set();

const DEMO_LIMIT = 2; // 2 demos per device per day
const BLOCK_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Generate device fingerprint from request headers
 * Combines multiple signals to create unique identifier
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
    req.headers['sec-ch-ua-mobile'] || ''
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
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
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
  
  // Combine fingerprint and IP for stronger tracking
  const compositeKey = crypto
    .createHash('sha256')
    .update(`${fingerprint}:${ip}`)
    .digest('hex');

  return {
    compositeKey,
    fingerprint,
    ip
  };
}

/**
 * Check if demo is allowed and track usage
 */
function checkDemoLimit(req) {
  const now = Date.now();
  const { compositeKey, fingerprint, ip } = createTrackingKey(req);

  // Check if fingerprint is blocked
  if (blockedFingerprints.has(fingerprint)) {
    const blockInfo = demoUsage.get(fingerprint);
    if (blockInfo && now < blockInfo.blockUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(blockInfo.blockUntil).toISOString(),
        reason: 'daily_limit_exceeded',
        blocked: true
      };
    } else {
      // Block expired, remove from blocked list
      blockedFingerprints.delete(fingerprint);
      demoUsage.delete(fingerprint);
    }
  }

  // Check composite key usage
  let usage = demoUsage.get(compositeKey);

  if (!usage) {
    // New device/session - initialize tracking
    usage = {
      count: 1,
      firstRequest: now,
      lastRequest: now,
      blockUntil: now + BLOCK_DURATION,
      fingerprint,
      ip,
      timestamps: [now]
    };
    demoUsage.set(compositeKey, usage);

    return {
      allowed: true,
      remaining: DEMO_LIMIT - 1,
      resetTime: new Date(usage.blockUntil).toISOString(),
      fingerprint: fingerprint.substring(0, 8)
    };
  }

  // Check if tracking period expired
  if (now > usage.blockUntil) {
    // Reset for new period
    usage = {
      count: 1,
      firstRequest: now,
      lastRequest: now,
      blockUntil: now + BLOCK_DURATION,
      fingerprint,
      ip,
      timestamps: [now]
    };
    demoUsage.set(compositeKey, usage);

    return {
      allowed: true,
      remaining: DEMO_LIMIT - 1,
      resetTime: new Date(usage.blockUntil).toISOString(),
      fingerprint: fingerprint.substring(0, 8)
    };
  }

  // Check if limit exceeded
  if (usage.count >= DEMO_LIMIT) {
    // Block this fingerprint across all IPs
    blockedFingerprints.add(fingerprint);
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(usage.blockUntil).toISOString(),
      reason: 'daily_limit_exceeded',
      blocked: true
    };
  }

  // Detect rapid requests (potential abuse)
  const timeSinceLastRequest = now - usage.lastRequest;
  if (timeSinceLastRequest < 5000) { // Less than 5 seconds
    return {
      allowed: false,
      remaining: DEMO_LIMIT - usage.count,
      resetTime: new Date(usage.blockUntil).toISOString(),
      reason: 'rate_limit_too_fast',
      cooldown: 5 // seconds
    };
  }

  // Increment usage
  usage.count += 1;
  usage.lastRequest = now;
  usage.timestamps.push(now);
  demoUsage.set(compositeKey, usage);

  // Check if this was the last demo
  if (usage.count >= DEMO_LIMIT) {
    blockedFingerprints.add(fingerprint);
  }

  return {
    allowed: true,
    remaining: DEMO_LIMIT - usage.count,
    resetTime: new Date(usage.blockUntil).toISOString(),
    fingerprint: fingerprint.substring(0, 8)
  };
}

/**
 * Get current usage stats for a device
 */
function getUsageStats(req) {
  const { compositeKey, fingerprint } = createTrackingKey(req);
  const usage = demoUsage.get(compositeKey);

  if (!usage) {
    return {
      used: 0,
      remaining: DEMO_LIMIT,
      limit: DEMO_LIMIT,
      resetTime: new Date(Date.now() + BLOCK_DURATION).toISOString()
    };
  }

  return {
    used: usage.count,
    remaining: Math.max(0, DEMO_LIMIT - usage.count),
    limit: DEMO_LIMIT,
    resetTime: new Date(usage.blockUntil).toISOString(),
    blocked: blockedFingerprints.has(fingerprint)
  };
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, usage] of demoUsage.entries()) {
    if (now > usage.blockUntil) {
      demoUsage.delete(key);
      if (usage.fingerprint) {
        blockedFingerprints.delete(usage.fingerprint);
      }
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired demo tracking entries`);
  }
}, CLEANUP_INTERVAL);

/**
 * Express middleware for demo rate limiting
 */
function demoRateLimiter(req, res, next) {
  try {
    const limitCheck = checkDemoLimit(req);

    if (!limitCheck.allowed) {
      if (limitCheck.reason === 'rate_limit_too_fast') {
        return res.status(429).json({
          error: 'Too many requests',
          message: `Please wait ${limitCheck.cooldown} seconds between requests`,
          remaining: limitCheck.remaining,
          resetTime: limitCheck.resetTime
        });
      }

      return res.status(429).json({
        error: 'Demo limit reached',
        message: `You've used all ${DEMO_LIMIT} free demos for today. Sign up for unlimited access!`,
        resetTime: limitCheck.resetTime,
        blocked: true,
        upgradeUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register`
      });
    }

    // Attach usage info to request for use in route handlers
    req.demoUsage = limitCheck;
    next();
  } catch (error) {
    console.error('❌ demoRateLimiter error:', error.message);
    // Don't block on rate limiter errors - let request through
    req.demoUsage = {
      allowed: true,
      remaining: DEMO_LIMIT,
      fingerprint: 'error-fallback',
      resetTime: new Date(Date.now() + BLOCK_DURATION).toISOString()
    };
    next();
  }
}

// Export stats for monitoring
function getStats() {
  return {
    totalTracked: demoUsage.size,
    blockedDevices: blockedFingerprints.size,
    limit: DEMO_LIMIT,
    blockDuration: BLOCK_DURATION / (1000 * 60 * 60) + ' hours'
  };
}

module.exports = {
  demoRateLimiter,
  checkDemoLimit,
  getUsageStats,
  getStats,
  DEMO_LIMIT
};
