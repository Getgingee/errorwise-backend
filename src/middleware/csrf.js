/**
 * CSRF Protection Middleware
 * Using csrf-sync for double-submit cookie pattern
 */

const { csrfSync } = require('csrf-sync');

/**
 * Initialize CSRF protection
 * Uses double-submit cookie pattern (no server-side state)
 */
const { generateToken, csrfSynchronisedProtection } = csrfSync({
  // Secret for signing tokens
  secret: process.env.CSRF_SECRET || 'super-secret-csrf-key-change-in-production-67890',
  
  // Cookie options
  cookie: {
    key: '_csrf',
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  },
  
  // Exclude routes that don't need CSRF (public APIs)
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  
  // Size of the secret (default: 128 bits)
  size: 128
});

/**
 * Middleware to generate and attach CSRF token to response
 * Use this on routes that render forms
 */
const attachCSRFToken = (req, res, next) => {
  try {
    const token = generateToken(req, res);
    res.locals.csrfToken = token;
    
    // Also send in response header for API clients
    res.setHeader('X-CSRF-Token', token);
    
    next();
  } catch (error) {
    console.error('❌ CSRF token generation error:', error);
    next(error);
  }
};

/**
 * Middleware to add CSRF token to API responses
 * For endpoints that need to return token in JSON
 */
const sendCSRFToken = (req, res, next) => {
  try {
    const token = generateToken(req, res);
    res.json({ csrfToken: token });
  } catch (error) {
    console.error('❌ CSRF token send error:', error);
    res.status(500).json({ error: 'Failed to generate CSRF token' });
  }
};

/**
 * Error handler for CSRF violations
 */
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message?.includes('CSRF')) {
    console.warn(`⚠️  CSRF violation attempt from IP: ${req.ip}, User-Agent: ${req.get('user-agent')}`);
    
    return res.status(403).json({
      success: false,
      code: 'CSRF_VIOLATION',
      message: 'Invalid CSRF token. Please refresh the page and try again.',
      timestamp: new Date().toISOString()
    });
  }
  
  next(err);
};

/**
 * Wrapper to selectively apply CSRF protection
 * Use for routes that should be protected
 */
const csrfProtection = [
  csrfSynchronisedProtection,
  csrfErrorHandler
];

module.exports = {
  csrfProtection,
  attachCSRFToken,
  sendCSRFToken,
  csrfErrorHandler,
  generateToken
};
