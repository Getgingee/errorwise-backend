/**
 * Audit Logger for PII Access and Security Events
 * 
 * This module provides structured audit logging for compliance with
 * data protection regulations (GDPR, CCPA, etc.)
 * 
 * All PII access events are logged with:
 * - Timestamp
 * - Admin user ID and email
 * - Action performed
 * - Resource accessed
 * - IP address
 * - Success/failure status
 */

const winston = require('winston');
const path = require('path');

// Create dedicated audit logger with separate transport
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.json()
  ),
  defaultMeta: { service: 'errorwise-audit' },
  transports: [
    // Dedicated audit log file - should be retained per compliance requirements
    new winston.transports.File({ 
      filename: path.join(process.cwd(), 'logs', 'audit.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 90, // Keep 90 days of logs
      tailable: true
    }),
    // Also log to combined for redundancy
    new winston.transports.File({ 
      filename: path.join(process.cwd(), 'logs', 'combined.log')
    })
  ],
});

// In development, also log to console
if (process.env.NODE_ENV !== 'production') {
  auditLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `[AUDIT] ${timestamp} ${level}: ${message} ${JSON.stringify(meta)}`;
      })
    )
  }));
}

/**
 * Mask email for logging (show first 2 and last 2 chars of local part)
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[invalid]';
  const [local, domain] = email.split('@');
  if (!domain) return '[invalid]';
  if (local.length <= 4) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

/**
 * Log PII access event
 * @param {Object} options
 * @param {string} options.action - Action performed (e.g., 'VIEW_SUBSCRIBER_EMAILS')
 * @param {Object} options.admin - Admin user object { id, email, role, permissions }
 * @param {string} options.resource - Resource accessed (e.g., 'newsletter_subscribers')
 * @param {number} options.recordCount - Number of records accessed
 * @param {string} options.ipAddress - Request IP address
 * @param {boolean} options.success - Whether action succeeded
 * @param {string} [options.reason] - Reason for access (optional)
 * @param {Object} [options.metadata] - Additional metadata (optional)
 */
function logPiiAccess({
  action,
  admin,
  resource,
  recordCount = 0,
  ipAddress,
  success = true,
  reason = null,
  metadata = {}
}) {
  const logEntry = {
    eventType: 'PII_ACCESS',
    action,
    admin: {
      id: admin?.id || 'unknown',
      email: maskEmail(admin?.email),
      role: admin?.role || 'unknown',
      permissions: admin?.permissions || []
    },
    resource,
    recordCount,
    ipAddress: ipAddress || 'unknown',
    success,
    reason,
    ...metadata
  };

  if (success) {
    auditLogger.info(`PII Access: ${action} on ${resource}`, logEntry);
  } else {
    auditLogger.warn(`PII Access DENIED: ${action} on ${resource}`, logEntry);
  }

  return logEntry;
}

/**
 * Log security event (failed auth, permission denied, etc.)
 */
function logSecurityEvent({
  eventType,
  userId,
  userEmail,
  action,
  ipAddress,
  userAgent,
  success = false,
  reason = null,
  metadata = {}
}) {
  const logEntry = {
    eventType: eventType || 'SECURITY_EVENT',
    user: {
      id: userId || 'anonymous',
      email: maskEmail(userEmail)
    },
    action,
    ipAddress: ipAddress || 'unknown',
    userAgent: userAgent || 'unknown',
    success,
    reason,
    ...metadata
  };

  if (success) {
    auditLogger.info(`Security Event: ${action}`, logEntry);
  } else {
    auditLogger.warn(`Security Event FAILED: ${action}`, logEntry);
  }

  return logEntry;
}

/**
 * Log admin action (upgrades, deletions, etc.)
 */
function logAdminAction({
  action,
  admin,
  targetResource,
  targetId,
  ipAddress,
  changes = {},
  success = true,
  reason = null
}) {
  const logEntry = {
    eventType: 'ADMIN_ACTION',
    action,
    admin: {
      id: admin?.id || 'unknown',
      email: maskEmail(admin?.email),
      role: admin?.role || 'unknown'
    },
    target: {
      resource: targetResource,
      id: targetId
    },
    changes,
    ipAddress: ipAddress || 'unknown',
    success,
    reason
  };

  auditLogger.info(`Admin Action: ${action}`, logEntry);
  return logEntry;
}

// Admin permission levels for RBAC
const ADMIN_PERMISSIONS = {
  // Basic admin - can view aggregated/anonymized data
  BASIC: 'admin:basic',
  // Can view subscriber counts and non-PII fields
  VIEW_SUBSCRIBERS: 'admin:view_subscribers',
  // Can view PII (emails, names) - requires explicit grant
  VIEW_PII: 'admin:view_pii',
  // Can export subscriber data
  EXPORT_DATA: 'admin:export_data',
  // Can trigger newsletter sends
  SEND_NEWSLETTER: 'admin:send_newsletter',
  // Super admin - all permissions
  SUPER: 'admin:super'
};

/**
 * Check if admin has specific permission
 * @param {Object} admin - Admin user object
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
function hasPermission(admin, permission) {
  if (!admin) return false;
  
  // Super admin has all permissions
  if (admin.role === 'super_admin') return true;
  if (admin.permissions?.includes(ADMIN_PERMISSIONS.SUPER)) return true;
  
  // Check specific permission
  if (admin.permissions?.includes(permission)) return true;
  
  // For backward compatibility: regular 'admin' role gets basic + view_subscribers
  if (admin.role === 'admin') {
    const basicPermissions = [
      ADMIN_PERMISSIONS.BASIC,
      ADMIN_PERMISSIONS.VIEW_SUBSCRIBERS,
      ADMIN_PERMISSIONS.SEND_NEWSLETTER
    ];
    return basicPermissions.includes(permission);
  }
  
  return false;
}

/**
 * Check if admin can view PII (emails)
 * This requires explicit VIEW_PII permission or super_admin role
 */
function canViewPii(admin) {
  return hasPermission(admin, ADMIN_PERMISSIONS.VIEW_PII);
}

module.exports = {
  auditLogger,
  logPiiAccess,
  logSecurityEvent,
  logAdminAction,
  maskEmail,
  hasPermission,
  canViewPii,
  ADMIN_PERMISSIONS
};
