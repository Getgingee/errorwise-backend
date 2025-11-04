/**
 * Honeypot Middleware
 * Detects and blocks bot form submissions
 * Bots typically fill all form fields, including hidden ones
 */

/**
 * List of common honeypot field names
 * Use these in your frontend forms as hidden fields
 */
const HONEYPOT_FIELDS = [
  'website',       // Common honeypot
  'url',           // Bots love filling URLs
  'homepage',      // Another URL variant
  'company_url',   // Business forms
  'phone_number',  // Use 'phone' as real field
  'fax',           // Nobody uses fax anymore
  'company',       // Use 'company_name' as real field
  'address',       // Use 'address_line_1' as real field
  'additional_info', // Generic trap
  'extra_field',   // Generic trap
  'bot_field'      // Obvious trap for dumb bots
];

/**
 * Time-based honeypot
 * Forms submitted too quickly are likely bots
 * Minimum time: 3 seconds (human can't fill form faster)
 */
const MIN_FORM_SUBMISSION_TIME = 3000; // 3 seconds

/**
 * Honeypot validation middleware
 * @param {string[]} customFields - Additional honeypot fields specific to your form
 */
const honeypotProtection = (customFields = []) => {
  const allHoneypotFields = [...HONEYPOT_FIELDS, ...customFields];
  
  return (req, res, next) => {
    try {
      const { body } = req;
      
      // 1. Check for honeypot fields in request body
      const filledHoneypots = allHoneypotFields.filter(field => {
        const value = body[field];
        
        // Field exists and has any value (including empty string for some bots)
        if (value !== undefined && value !== null && value !== '') {
          return true;
        }
        
        return false;
      });
      
      if (filledHoneypots.length > 0) {
        console.warn(`🍯 Honeypot triggered: ${filledHoneypots.join(', ')} | IP: ${req.ip} | User-Agent: ${req.get('user-agent')}`);
        
        // Don't tell the bot it failed
        // Respond with success to waste bot's time
        return res.status(200).json({
          success: true,
          message: 'Thank you for your submission.',
          // Bot thinks it succeeded
        });
      }
      
      // 2. Time-based honeypot
      if (body._formStartTime) {
        const startTime = parseInt(body._formStartTime, 10);
        const currentTime = Date.now();
        const timeTaken = currentTime - startTime;
        
        if (timeTaken < MIN_FORM_SUBMISSION_TIME) {
          console.warn(`⏱️  Form submitted too quickly: ${timeTaken}ms | IP: ${req.ip} | User-Agent: ${req.get('user-agent')}`);
          
          // Fake success response
          return res.status(200).json({
            success: true,
            message: 'Thank you for your submission.',
          });
        }
      }
      
      // 3. Check for suspicious patterns
      const suspiciousPatterns = [
        // Too many fields filled (bots fill everything)
        Object.keys(body).length > 20,
        
        // Same value in multiple fields
        hasDuplicateValues(body),
        
        // Extremely long field values (bots spam text)
        hasExcessivelyLongFields(body)
      ];
      
      if (suspiciousPatterns.some(pattern => pattern === true)) {
        console.warn(`🚨 Suspicious submission pattern detected | IP: ${req.ip}`);
        
        // Fake success
        return res.status(200).json({
          success: true,
          message: 'Thank you for your submission.',
        });
      }
      
      // Clean up honeypot fields from body before passing to controller
      allHoneypotFields.forEach(field => {
        delete body[field];
      });
      
      // Remove time tracking field
      delete body._formStartTime;
      
      // Passed all checks - legitimate submission
      next();
      
    } catch (error) {
      console.error('❌ Honeypot middleware error:', error);
      next(error);
    }
  };
};

/**
 * Check if multiple fields have the same value (bot behavior)
 */
function hasDuplicateValues(body) {
  const values = Object.values(body).filter(v => typeof v === 'string' && v.length > 5);
  const uniqueValues = new Set(values);
  
  // If more than 3 fields have the same value, likely a bot
  return values.length - uniqueValues.size > 3;
}

/**
 * Check for excessively long field values
 */
function hasExcessivelyLongFields(body) {
  const MAX_FIELD_LENGTH = 5000; // Reasonable max for any form field
  
  return Object.values(body).some(value => {
    if (typeof value === 'string') {
      return value.length > MAX_FIELD_LENGTH;
    }
    return false;
  });
}

/**
 * Middleware to add form start time to response
 * Use on endpoints that render forms
 */
const addFormTimestamp = (req, res, next) => {
  res.locals.formStartTime = Date.now();
  next();
};

module.exports = {
  honeypotProtection,
  addFormTimestamp,
  HONEYPOT_FIELDS
};
