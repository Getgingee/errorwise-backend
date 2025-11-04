/**
 * HTTPS Redirect Middleware
 * Forces HTTPS in production environments
 */

/**
 * Redirect HTTP to HTTPS in production
 * Checks X-Forwarded-Proto header (for proxies/load balancers)
 */
const httpsRedirect = (req, res, next) => {
  // Skip in development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Check if behind a proxy (Heroku, AWS, etc.)
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isSecure = forwardedProto === 'https' || req.secure || req.protocol === 'https';
  
  if (!isSecure) {
    // Construct HTTPS URL
    const httpsUrl = `https://${req.hostname}${req.url}`;
    
    console.log(`♻️  Redirecting HTTP to HTTPS: ${req.url}`);
    
    // 301 permanent redirect
    return res.redirect(301, httpsUrl);
  }
  
  next();
};

/**
 * HTTPS enforcement with custom options
 * @param {Object} options - Configuration options
 * @param {boolean} options.force - Force HTTPS even in development
 * @param {string[]} options.excludePaths - Paths to exclude from HTTPS (e.g., health checks)
 */
const httpsRedirectWithOptions = (options = {}) => {
  const {
    force = false,
    excludePaths = ['/health', '/ping', '/.well-known']
  } = options;
  
  return (req, res, next) => {
    // Check if path is excluded
    const isExcluded = excludePaths.some(path => req.path.startsWith(path));
    if (isExcluded) {
      return next();
    }
    
    // Skip in development unless forced
    if (process.env.NODE_ENV !== 'production' && !force) {
      return next();
    }
    
    // Check if behind a proxy
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = forwardedProto === 'https' || req.secure || req.protocol === 'https';
    
    if (!isSecure) {
      const httpsUrl = `https://${req.hostname}${req.url}`;
      
      console.log(`♻️  Redirecting HTTP to HTTPS: ${req.url}`);
      
      return res.redirect(301, httpsUrl);
    }
    
    next();
  };
};

module.exports = {
  httpsRedirect,
  httpsRedirectWithOptions
};
