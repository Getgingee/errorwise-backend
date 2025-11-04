/**
 * Enhanced Email Validation
 * Includes disposable/temporary email detection
 */

/**
 * Comprehensive list of disposable/temporary email domains
 * Regularly update this list to block new temporary services
 */
const DISPOSABLE_EMAIL_DOMAINS = [
  // Popular temporary email services
  '10minutemail.com', '10minutemail.net', '10minutemail.org',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'mailinator.com', 'mailinator.net', 'mailinator2.com', 'mailinator3.com',
  'trashmail.com', 'trashmail.net', 'trash-mail.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.de',
  'throwawaymail.com', 'throwaway.email',
  'getnada.com', 'nada.email',
  'maildrop.cc', 'sharklasers.com', 'guerrillamail.info',
  'grr.la', 'guerrillamail.biz', 'guerrillamail.de',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'fakeinbox.com', 'fake-mail.com', 'fakemail.net',
  'dispostable.com', 'disposeamail.com', 'disposable.com',
  'emailondeck.com', 'mintemail.com', 'mytemp.email',
  'mohmal.com', 'mailnesia.com', 'mailnator.com',
  'spamgourmet.com', 'spam4.me', 'spambog.com',
  
  // Additional temporary providers
  'ethereal.email', 'example.com', 'test.com',
  'emailna.co', 'dropmail.me', 'inboxkitten.com',
  'getnowmail.com', 'anonymousemail.me', 'hidemail.de',
  'nowmymail.com', 'spambox.xyz', 'tempemail.net',
  'mailtemp.io', 'burnermail.io', 'harakirimail.com',
  'tmail.ws', 'emailfake.com', '33mail.com',
  
  // Additional blocklist
  'crazymailing.com', 'spamhereplease.com', 'binkmail.com',
  'safetymail.info', 'sogetthis.com', 'beefmilk.com',
  'tempinbox.com', 'emailtemporanea.net', 'armyspy.com',
  'cuvox.de', 'dayrep.com', 'einrot.com', 'fleckens.hu',
  'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com',
  'teleworm.us', 'example.org', 'example.net'
];

/**
 * Basic email regex
 * RFC 5322 compliant (simplified)
 */
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate email format
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const trimmed = email.trim().toLowerCase();
  
  // Basic length checks
  if (trimmed.length < 5 || trimmed.length > 254) {
    return false;
  }
  
  // Check regex
  if (!EMAIL_REGEX.test(trimmed)) {
    return false;
  }
  
  // Check for obvious invalid patterns
  const invalidPatterns = [
    /\.\./, // Consecutive dots
    /@\./, // @ followed by dot
    /\.@/, // Dot followed by @
    /^\./, // Starts with dot
    /\.$/, // Ends with dot
    /@.*@/, // Multiple @ symbols
  ];
  
  if (invalidPatterns.some(pattern => pattern.test(trimmed))) {
    return false;
  }
  
  return true;
}

/**
 * Check if email domain is disposable/temporary
 * @param {string} email 
 * @returns {boolean}
 */
function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const trimmed = email.trim().toLowerCase();
  const domain = trimmed.split('@')[1];
  
  if (!domain) {
    return false;
  }
  
  // Check against blacklist
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

/**
 * Comprehensive email validation
 * @param {string} email 
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateEmail(email) {
  // Format validation
  if (!isValidEmailFormat(email)) {
    return {
      valid: false,
      reason: 'INVALID_FORMAT',
      message: 'Please enter a valid email address.'
    };
  }
  
  // Disposable email detection
  if (isDisposableEmail(email)) {
    return {
      valid: false,
      reason: 'DISPOSABLE_EMAIL',
      message: 'Temporary email addresses are not allowed.'
    };
  }
  
  // Additional checks
  const trimmed = email.trim().toLowerCase();
  const [localPart, domain] = trimmed.split('@');
  
  // Check local part length
  if (localPart.length > 64) {
    return {
      valid: false,
      reason: 'LOCAL_PART_TOO_LONG',
      message: 'Email local part is too long.'
    };
  }
  
  // Check domain has valid TLD
  const parts = domain.split('.');
  if (parts.length < 2 || parts[parts.length - 1].length < 2) {
    return {
      valid: false,
      reason: 'INVALID_DOMAIN',
      message: 'Email domain is invalid.'
    };
  }
  
  // All checks passed
  return {
    valid: true,
    email: trimmed
  };
}

/**
 * Express middleware for email validation
 * @param {string} fieldName - Name of the field containing email (default: 'email')
 */
function emailValidationMiddleware(fieldName = 'email') {
  return (req, res, next) => {
    const email = req.body[fieldName];
    
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_REQUIRED',
        message: `${fieldName} is required.`
      });
    }
    
    const validation = validateEmail(email);
    
    if (!validation.valid) {
      console.warn(`📧 Email validation failed: ${validation.reason} | Email: ${email} | IP: ${req.ip}`);
      
      return res.status(400).json({
        success: false,
        code: validation.reason,
        message: validation.message
      });
    }
    
    // Store cleaned email
    req.body[fieldName] = validation.email;
    
    next();
  };
}

/**
 * Add a new disposable domain to the blacklist at runtime
 * @param {string} domain 
 */
function addDisposableDomain(domain) {
  const cleaned = domain.trim().toLowerCase();
  if (!DISPOSABLE_EMAIL_DOMAINS.includes(cleaned)) {
    DISPOSABLE_EMAIL_DOMAINS.push(cleaned);
    console.log(`🚫 Added disposable domain to blacklist: ${cleaned}`);
  }
}

module.exports = {
  validateEmail,
  isValidEmailFormat,
  isDisposableEmail,
  emailValidationMiddleware,
  addDisposableDomain,
  DISPOSABLE_EMAIL_DOMAINS
};
