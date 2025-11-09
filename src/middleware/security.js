const logger = require('../utils/logger');

// ============================================================================
// INPUT SANITIZATION & INJECTION PREVENTION
// ============================================================================

/**
 * Sanitize all user inputs to prevent XSS, code injection, SQL injection
 */
const sanitizeInput = (req, res, next) => {
  try {
    const sanitize = (obj) => {
      if (typeof obj === 'string') {
        // Remove script tags and dangerous HTML
        let clean = obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
        clean = clean.replace(/on\w+\s*=\s*["'][^"']*["']/gi, ''); // Remove event handlers
        clean = clean.replace(/javascript:/gi, '');
        
        // Remove SQL injection patterns
        clean = clean.replace(/(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/gi, (match) => {
          logger.warn('⚠️ Potential SQL injection blocked', { pattern: match, ip: req.ip });
          return '';
        });
        
        // Remove dangerous code patterns
        clean = clean.replace(/(eval|Function|setTimeout|setInterval|execScript)\s*\(/gi, (match) => {
          logger.warn('⚠️ Potential code injection blocked', { pattern: match, ip: req.ip });
          return '';
        });
        
        return clean.trim();
      } else if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item));
      } else if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const key in obj) {
          sanitized[key] = sanitize(obj[key]);
        }
        return sanitized;
      }
      return obj;
    };

    // Sanitize all inputs
    if (req.body) req.body = sanitize(req.body);
    if (req.query) req.query = sanitize(req.query);
    if (req.params) req.params = sanitize(req.params);

    next();
  } catch (error) {
    logger.error('Sanitization error:', error);
    res.status(400).json({ success: false, message: 'Invalid input' });
  }
};

/**
 * Detect and block spam content
 */
const detectSpam = (req, res, next) => {
  const spamPatterns = [
    /\b(viagra|cialis|casino|lottery|winner|prize)\b/gi,
    /\b(click here|buy now|limited time|act now)\b/gi,
    /(http:\/\/|https:\/\/)[^\s]{60,}/gi, // Very long URLs
    /(.)\1{15,}/g, // Repeated characters (aaaaaaa...)
  ];

  const checkSpam = (text) => {
    if (typeof text !== 'string') return false;
    
    for (const pattern of spamPatterns) {
      if (pattern.test(text)) return true;
    }
    
    // Check URL count
    const urlCount = (text.match(/https?:\/\//g) || []).length;
    if (urlCount > 5) return true;
    
    // Check special char ratio
    const specialChars = (text.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialChars > text.length * 0.4) return true;
    
    return false;
  };

  const content = JSON.stringify(req.body);
  
  if (checkSpam(content)) {
    logger.warn('⚠️ Spam detected:', { ip: req.ip, path: req.path });
    return res.status(400).json({ success: false, message: 'Spam content detected' });
  }

  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log incoming request
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    userId: req.user?.id || 'anonymous'
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    
    // Log response
    logger.info(`Response ${res.statusCode}`, {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'anonymous',
      responseSize: JSON.stringify(body).length
    });
    
    return originalJson.call(this, body);
  };

  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  // Set comprehensive security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
  
  // HSTS (HTTP Strict Transport Security) - Only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Enhanced Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // TODO: Remove unsafe-* in production
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);
  
  next();
};

// Request timeout middleware
const requestTimeout = (timeout = 30000) => { // 30 seconds default
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(`Request timeout: ${req.method} ${req.url}`, {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        res.status(408).json({
          error: 'Request timeout'
        });
      }
    }, timeout);
    
    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timer);
    });
    
    next();
  };
};

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const sizeLimit = typeof maxSize === 'string' ? 
        parseFloat(maxSize) * (maxSize.includes('mb') ? 1024 * 1024 : 1024) : 
        maxSize;
        
      if (parseInt(contentLength) > sizeLimit) {
        return res.status(413).json({
          error: 'Request entity too large'
        });
      }
    }
    
    next();
  };
};

// IP whitelist middleware (for admin endpoints)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Always allow localhost in development
    if (process.env.NODE_ENV === 'development') {
      const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
      if (localhostIPs.includes(clientIP)) {
        return next();
      }
    }
    
    if (allowedIPs.length === 0 || allowedIPs.includes(clientIP)) {
      return next();
    }
    
    logger.warn(`IP access denied: ${clientIP}`, {
      url: req.url,
      userAgent: req.get('User-Agent')
    });
    
    res.status(403).json({
      error: 'Access denied from this IP address'
    });
  };
};

// API key middleware (for external integrations)
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required'
    });
  }
  
  // Validate API key (you should store these securely)
  const validApiKeys = process.env.API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn(`Invalid API key attempt: ${apiKey}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(401).json({
      error: 'Invalid API key'
    });
  }
  
  next();
};

// ============================================================================
// TAB SWITCHING & RESOURCE ABUSE PREVENTION
// ============================================================================

/**
 * Prevent resource abuse from multiple tabs/sessions
 * Tracks concurrent sessions per user and limits requests
 */
const sessionTracker = new Map(); // userId -> { sessions: Set, lastCleanup: Date }
const requestTracker = new Map(); // userId -> { count: number, resetTime: Date }

const preventTabAbuse = (req, res, next) => {
  const userId = req.user?.id || req.ip; // Use IP for anonymous users
  const sessionId = req.headers['x-session-id'] || req.sessionID || 'unknown';
  
  // Initialize tracking for this user
  if (!sessionTracker.has(userId)) {
    sessionTracker.set(userId, {
      sessions: new Set(),
      lastCleanup: new Date()
    });
  }
  
  const userSessions = sessionTracker.get(userId);
  userSessions.sessions.add(sessionId);
  
  // Limit concurrent sessions (prevent opening many tabs)
  const MAX_SESSIONS = req.user ? 5 : 2; // Authenticated users get more tabs
  
  if (userSessions.sessions.size > MAX_SESSIONS) {
    logger.warn('⚠️ Too many concurrent sessions:', {
      userId,
      sessionCount: userSessions.sessions.size,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(429).json({
      success: false,
      error: 'Too many active sessions',
      message: `You have ${userSessions.sessions.size} tabs open. Maximum allowed is ${MAX_SESSIONS}. Please close some tabs.`,
      maxSessions: MAX_SESSIONS,
      currentSessions: userSessions.sessions.size
    });
  }
  
  // Cleanup old sessions every 5 minutes
  const now = new Date();
  if (now - userSessions.lastCleanup > 5 * 60 * 1000) {
    userSessions.sessions.clear();
    userSessions.lastCleanup = now;
  }
  
  next();
};

/**
 * Prevent rapid-fire requests (request flooding)
 * Tracks requests per user per minute
 */
const preventRequestFlooding = (req, res, next) => {
  const userId = req.user?.id || req.ip;
  const now = new Date();
  
  // Initialize tracking
  if (!requestTracker.has(userId)) {
    requestTracker.set(userId, {
      count: 0,
      resetTime: new Date(now.getTime() + 60 * 1000) // Reset in 1 minute
    });
  }
  
  const userRequests = requestTracker.get(userId);
  
  // Reset counter if time window passed
  if (now > userRequests.resetTime) {
    userRequests.count = 0;
    userRequests.resetTime = new Date(now.getTime() + 60 * 1000);
  }
  
  userRequests.count++;
  
  // Set limits based on user tier
  const limits = {
    free: 30,      // 30 requests per minute
    pro: 100,      // 100 requests per minute
    team: 300,     // 300 requests per minute
    anonymous: 10  // 10 requests per minute for non-authenticated
  };
  
  const userTier = req.user?.subscriptionTier || 'anonymous';
  const limit = limits[userTier] || limits.anonymous;
  
  if (userRequests.count > limit) {
    const secondsUntilReset = Math.ceil((userRequests.resetTime - now) / 1000);
    
    logger.warn('⚠️ Request flooding detected:', {
      userId,
      tier: userTier,
      requestCount: userRequests.count,
      limit,
      ip: req.ip
    });
    
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: `You've exceeded ${limit} requests per minute. Please wait ${secondsUntilReset} seconds.`,
      limit,
      requestsMade: userRequests.count,
      retryAfter: secondsUntilReset,
      tier: userTier,
      upgradeMessage: userTier === 'free' ? 'Upgrade to PRO for higher limits!' : undefined
    });
  }
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - userRequests.count));
  res.setHeader('X-RateLimit-Reset', userRequests.resetTime.toISOString());
  
  next();
};

/**
 * Prevent duplicate simultaneous requests (double-click prevention)
 */
const pendingRequests = new Map(); // userId:endpoint -> timestamp

const preventDuplicateRequests = (req, res, next) => {
  // Only check for POST/PUT/DELETE (data-modifying operations)
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return next();
  }
  
  const userId = req.user?.id || req.ip;
  const endpoint = `${req.method}:${req.path}`;
  const requestKey = `${userId}:${endpoint}`;
  
  const now = Date.now();
  const lastRequest = pendingRequests.get(requestKey);
  
  // If same request within 2 seconds, block it (likely double-click)
  if (lastRequest && (now - lastRequest) < 2000) {
    logger.warn('⚠️ Duplicate request blocked:', {
      userId,
      endpoint,
      timeSinceLastRequest: `${now - lastRequest}ms`,
      ip: req.ip
    });
    
    return res.status(409).json({
      success: false,
      error: 'Duplicate request',
      message: 'Please wait - your previous request is still processing'
    });
  }
  
  // Track this request
  pendingRequests.set(requestKey, now);
  
  // Cleanup on response
  res.on('finish', () => {
    setTimeout(() => {
      pendingRequests.delete(requestKey);
    }, 2000); // Keep for 2 seconds
  });
  
  next();
};

/**
 * Detect suspicious behavior patterns
 */
const behaviorTracker = new Map(); // userId -> { actions: [], score: number }

const detectSuspiciousBehavior = (req, res, next) => {
  const userId = req.user?.id || req.ip;
  
  if (!behaviorTracker.has(userId)) {
    behaviorTracker.set(userId, {
      actions: [],
      score: 0,
      firstSeen: new Date()
    });
  }
  
  const behavior = behaviorTracker.get(userId);
  const now = Date.now();
  
  // Track action
  behavior.actions.push({
    type: req.method,
    path: req.path,
    timestamp: now
  });
  
  // Keep only last 100 actions
  if (behavior.actions.length > 100) {
    behavior.actions = behavior.actions.slice(-100);
  }
  
  // Calculate suspicion score
  let suspicionScore = 0;
  
  // Check for rapid actions (bot-like behavior)
  const recentActions = behavior.actions.filter(a => (now - a.timestamp) < 10000); // Last 10 seconds
  if (recentActions.length > 20) {
    suspicionScore += 30; // Very rapid actions
  }
  
  // Check for same endpoint spam
  const lastFiveActions = behavior.actions.slice(-5);
  const uniquePaths = new Set(lastFiveActions.map(a => a.path));
  if (uniquePaths.size === 1) {
    suspicionScore += 20; // Hammering same endpoint
  }
  
  // Check for new account suspicious activity
  const accountAge = now - new Date(behavior.firstSeen).getTime();
  if (accountAge < 60000 && behavior.actions.length > 15) {
    suspicionScore += 25; // New account, high activity
  }
  
  behavior.score = suspicionScore;
  
  // Block if suspicion score too high
  if (suspicionScore > 50) {
    logger.error('🚨 SUSPICIOUS BEHAVIOR DETECTED:', {
      userId,
      score: suspicionScore,
      recentActionsCount: recentActions.length,
      accountAge: `${Math.floor(accountAge / 1000)}s`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(403).json({
      success: false,
      error: 'Suspicious activity detected',
      message: 'Your account has been temporarily restricted due to unusual behavior. Contact support if this is a mistake.'
    });
  }
  
  next();
};

/**
 * Cleanup tracking data periodically (prevent memory leaks)
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  // Cleanup session tracker
  for (const [userId, data] of sessionTracker.entries()) {
    if (now - data.lastCleanup.getTime() > maxAge) {
      sessionTracker.delete(userId);
    }
  }
  
  // Cleanup request tracker
  for (const [userId, data] of requestTracker.entries()) {
    if (now - data.resetTime.getTime() > maxAge) {
      requestTracker.delete(userId);
    }
  }
  
  // Cleanup behavior tracker
  for (const [userId, data] of behaviorTracker.entries()) {
    if (now - new Date(data.firstSeen).getTime() > maxAge) {
      behaviorTracker.delete(userId);
    }
  }
  
  logger.info('🧹 Security trackers cleaned up', {
    sessionTrackerSize: sessionTracker.size,
    requestTrackerSize: requestTracker.size,
    behaviorTrackerSize: behaviorTracker.size
  });
}, 10 * 60 * 1000); // Run every 10 minutes

module.exports = {
  sanitizeInput,
  detectSpam,
  requestLogger,
  securityHeaders,
  requestTimeout,
  requestSizeLimiter,
  ipWhitelist,
  apiKeyAuth,
  preventTabAbuse,
  preventRequestFlooding,
  preventDuplicateRequests,
  detectSuspiciousBehavior
};