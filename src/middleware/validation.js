const { body, validationResult, param, query } = require('express-validator');
const sanitizeHtml = require('sanitize-html');

/**
 * HTML sanitization configuration
 * Allows basic formatting but strips dangerous tags
 */
const sanitizeConfig = {
  allowedTags: ['b', 'i', 'em', 'strong', 'u', 'br', 'p'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

/**
 * Strict HTML sanitization (no HTML allowed)
 */
const strictSanitizeConfig = {
  allowedTags: [],
  allowedAttributes: {}
};

/**
 * Sanitize HTML in request body fields
 */
function sanitizeHTMLFields(fields = [], strict = false) {
  return (req, res, next) => {
    try {
      const config = strict ? strictSanitizeConfig : sanitizeConfig;
      
      fields.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          req.body[field] = sanitizeHtml(req.body[field], config);
        }
      });
      
      next();
    } catch (error) {
      console.error('❌ HTML sanitization error:', error);
      next(error);
    }
  };
}

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.warn(`⚠️  Validation failed | IP: ${req.ip} | Errors: ${JSON.stringify(errors.array())}`);
    
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// User validation rules
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  handleValidationErrors
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Error analysis validation rules
const validateErrorAnalysis = [
  body('errorMessage')
    .notEmpty()
    .withMessage('Error message is required')
    .isLength({ max: 10000 })
    .withMessage('Error message is too long (max 10,000 characters)'),
  body('errorType')
    .optional()
    .isIn(['runtime', 'syntax', 'logical', 'network', 'database', 'other'])
    .withMessage('Invalid error type'),
  body('language')
    .optional()
    .isIn(['javascript', 'python', 'java', 'csharp', 'cpp', 'php', 'ruby', 'go', 'rust', 'other'])
    .withMessage('Invalid programming language'),
  body('context')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('Context is too long (max 5,000 characters)'),
  handleValidationErrors
];

// File upload validation
const validateFileUpload = [
  body('fileContent')
    .optional()
    .isLength({ max: 50000 })
    .withMessage('File content is too large (max 50KB)'),
  body('fileName')
    .optional()
    .matches(/^[a-zA-Z0-9._-]+\.(txt|log|js|py|java|cpp|php|rb|go|rs)$/)
    .withMessage('Invalid file name or unsupported file type'),
  handleValidationErrors
];

// Subscription validation rules
const validateSubscription = [
  body('planId')
    .notEmpty()
    .withMessage('Plan ID is required')
    .isUUID()
    .withMessage('Invalid plan ID format'),
  body('paymentMethodId')
    .optional()
    .isString()
    .withMessage('Payment method ID must be a string'),
  handleValidationErrors
];

// User settings validation
const validateUserSettings = [
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Invalid theme option'),
  body('language')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'])
    .withMessage('Invalid language option'),
  body('notifications')
    .optional()
    .isBoolean()
    .withMessage('Notifications setting must be boolean'),
  body('emailUpdates')
    .optional()
    .isBoolean()
    .withMessage('Email updates setting must be boolean'),
  handleValidationErrors
];

// Team validation rules
const validateTeam = [
  body('name')
    .notEmpty()
    .withMessage('Team name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Team name must be between 2 and 50 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description is too long (max 500 characters)'),
  handleValidationErrors
];

const validateTeamInvite = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('role')
    .isIn(['member', 'admin'])
    .withMessage('Invalid role. Must be member or admin'),
  handleValidationErrors
];

// Parameter validation
const validateUUID = (paramName) => [
  param(paramName)
    .isUUID()
    .withMessage(`Invalid ${paramName} format`),
  handleValidationErrors
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'name', 'email'])
    .withMessage('Invalid sortBy field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  handleValidationErrors
];

// Search validation
const validateSearch = [
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters'),
  handleValidationErrors
];

// Newsletter validation rules
const validateNewsletterSubscription = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email is too long'),
  
  body('subscriptionType')
    .optional()
    .isIn(['general', 'product_updates', 'tips', 'all'])
    .withMessage('Invalid subscription type'),
  
  body('source')
    .optional()
    .isLength({ max: 100 }).withMessage('Source is too long')
    .trim(),
  
  sanitizeHTMLFields(['source'], true),
  
  handleValidationErrors
];

// Feedback validation rules
const validateFeedbackSubmission = [
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email is too long'),
  
  body('feedbackType')
    .isIn(['bug', 'feature_request', 'improvement', 'praise', 'complaint', 'other'])
    .withMessage('Invalid feedback type'),
  
  body('category')
    .isIn(['ui_ux', 'performance', 'functionality', 'documentation', 'pricing', 'support', 'other'])
    .withMessage('Invalid category'),
  
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 }).withMessage('Subject must be between 5 and 200 characters')
    .notEmpty().withMessage('Subject is required'),
  
  body('message')
    .trim()
    .isLength({ min: 10, max: 5000 }).withMessage('Message must be between 10 and 5000 characters')
    .notEmpty().withMessage('Message is required'),
  
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  
  sanitizeHTMLFields(['subject', 'message']),
  
  handleValidationErrors
];

// Contact message validation rules
const validateContactMessage = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .notEmpty().withMessage('Name is required')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name contains invalid characters'),
  
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email is too long')
    .notEmpty().withMessage('Email is required'),
  
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 }).withMessage('Subject must be between 5 and 200 characters')
    .notEmpty().withMessage('Subject is required'),
  
  body('message')
    .trim()
    .isLength({ min: 20, max: 5000 }).withMessage('Message must be between 20 and 5000 characters')
    .notEmpty().withMessage('Message is required'),
  
  body('phone')
    .optional()
    .trim()
    .isMobilePhone('any', { strictMode: false }).withMessage('Invalid phone number'),
  
  body('company')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Company name is too long'),
  
  sanitizeHTMLFields(['name', 'subject', 'message', 'company'], true),
  
  handleValidationErrors
];

// Help ticket validation rules
const validateHelpTicket = [
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email is too long'),
  
  body('category')
    .isIn(['technical', 'billing', 'account', 'feature_request', 'bug_report', 'documentation', 'api', 'integration', 'other'])
    .withMessage('Invalid ticket category'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 }).withMessage('Subject must be between 5 and 200 characters')
    .notEmpty().withMessage('Subject is required'),
  
  body('description')
    .trim()
    .isLength({ min: 20, max: 5000 }).withMessage('Description must be between 20 and 5000 characters')
    .notEmpty().withMessage('Description is required'),
  
  sanitizeHTMLFields(['subject', 'description']),
  
  handleValidationErrors
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateErrorAnalysis,
  validateFileUpload,
  validateSubscription,
  validateUserSettings,
  validateTeam,
  validateTeamInvite,
  validateUUID,
  validatePagination,
  validateSearch,
  validateNewsletterSubscription,
  validateFeedbackSubmission,
  validateContactMessage,
  validateHelpTicket,
  sanitizeHTMLFields,
  handleValidationErrors
};