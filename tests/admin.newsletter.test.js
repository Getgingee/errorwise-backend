/**
 * Unit Tests for Admin Newsletter Routes
 * 
 * Tests RBAC behavior, audit logging, and field normalization
 * 
 * Run: npm test -- --grep "Admin Newsletter"
 * Or: npx jest tests/admin.newsletter.test.js
 */

const { 
  logPiiAccess, 
  canViewPii, 
  hasPermission, 
  maskEmail,
  ADMIN_PERMISSIONS 
} = require('../src/utils/auditLogger');

// Mock audit log entries for testing
let auditLogEntries = [];

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

describe('Admin Newsletter Routes', () => {
  
  beforeEach(() => {
    auditLogEntries = [];
  });

  // =========================================================================
  // RBAC Permission Tests
  // =========================================================================
  describe('RBAC Permissions', () => {
    
    test('super_admin should have VIEW_PII permission', () => {
      const superAdmin = { 
        id: 1, 
        email: 'super@example.com', 
        role: 'super_admin',
        permissions: []
      };
      expect(canViewPii(superAdmin)).toBe(true);
    });

    test('admin with explicit VIEW_PII permission should have access', () => {
      const adminWithPii = { 
        id: 2, 
        email: 'admin@example.com', 
        role: 'admin',
        permissions: [ADMIN_PERMISSIONS.VIEW_PII]
      };
      expect(canViewPii(adminWithPii)).toBe(true);
    });

    test('regular admin without VIEW_PII permission should NOT have access', () => {
      const regularAdmin = { 
        id: 3, 
        email: 'regular@example.com', 
        role: 'admin',
        permissions: []
      };
      expect(canViewPii(regularAdmin)).toBe(false);
    });

    test('admin with SUPER permission should have VIEW_PII access', () => {
      const superPermAdmin = { 
        id: 4, 
        email: 'elevated@example.com', 
        role: 'admin',
        permissions: [ADMIN_PERMISSIONS.SUPER]
      };
      expect(canViewPii(superPermAdmin)).toBe(true);
    });

    test('null/undefined admin should not have permissions', () => {
      expect(canViewPii(null)).toBe(false);
      expect(canViewPii(undefined)).toBe(false);
      expect(canViewPii({})).toBe(false);
    });

    test('regular admin should have VIEW_SUBSCRIBERS permission', () => {
      const regularAdmin = { 
        id: 5, 
        role: 'admin',
        permissions: []
      };
      expect(hasPermission(regularAdmin, ADMIN_PERMISSIONS.VIEW_SUBSCRIBERS)).toBe(true);
    });

    test('regular admin should have SEND_NEWSLETTER permission', () => {
      const regularAdmin = { 
        id: 6, 
        role: 'admin',
        permissions: []
      };
      expect(hasPermission(regularAdmin, ADMIN_PERMISSIONS.SEND_NEWSLETTER)).toBe(true);
    });

    test('regular admin should NOT have EXPORT_DATA permission', () => {
      const regularAdmin = { 
        id: 7, 
        role: 'admin',
        permissions: []
      };
      expect(hasPermission(regularAdmin, ADMIN_PERMISSIONS.EXPORT_DATA)).toBe(false);
    });
  });

  // =========================================================================
  // Audit Logging Tests
  // =========================================================================
  describe('Audit Logging', () => {
    
    test('logPiiAccess should return structured log entry', () => {
      const entry = logPiiAccess({
        action: 'VIEW_SUBSCRIBER_EMAILS',
        admin: { id: 1, email: 'admin@example.com', role: 'super_admin' },
        resource: 'newsletter_subscribers',
        recordCount: 50,
        ipAddress: '192.168.1.1',
        success: true,
        metadata: { page: 1, limit: 50 }
      });

      expect(entry.eventType).toBe('PII_ACCESS');
      expect(entry.action).toBe('VIEW_SUBSCRIBER_EMAILS');
      expect(entry.admin.id).toBe(1);
      expect(entry.admin.email).toContain('***'); // Should be masked
      expect(entry.resource).toBe('newsletter_subscribers');
      expect(entry.recordCount).toBe(50);
      expect(entry.success).toBe(true);
    });

    test('logPiiAccess should mask admin email in log', () => {
      const entry = logPiiAccess({
        action: 'VIEW_SUBSCRIBER_LIST',
        admin: { id: 1, email: 'longadmin@example.com', role: 'admin' },
        resource: 'newsletter_subscribers',
        ipAddress: '10.0.0.1',
        success: true
      });

      // Email should be masked (lo***in@example.com)
      expect(entry.admin.email).not.toBe('longadmin@example.com');
      expect(entry.admin.email).toContain('***');
    });

    test('logPiiAccess should log denied access attempts', () => {
      const entry = logPiiAccess({
        action: 'VIEW_SUBSCRIBER_EMAILS',
        admin: { id: 2, email: 'unauthorized@example.com', role: 'admin' },
        resource: 'newsletter_subscribers',
        ipAddress: '172.16.0.1',
        success: false,
        reason: 'Missing VIEW_PII permission'
      });

      expect(entry.success).toBe(false);
      expect(entry.reason).toBe('Missing VIEW_PII permission');
    });
  });

  // =========================================================================
  // Email Masking Tests
  // =========================================================================
  describe('Email Masking', () => {
    
    test('should mask standard email correctly', () => {
      expect(maskEmail('johndoe@example.com')).toBe('jo***oe@example.com');
    });

    test('should mask short local part', () => {
      expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    });

    test('should mask single char local part', () => {
      expect(maskEmail('a@example.com')).toBe('a***@example.com');
    });

    test('should handle invalid email', () => {
      expect(maskEmail('notanemail')).toBe('[invalid]');
      expect(maskEmail('')).toBe('[invalid]');
      expect(maskEmail(null)).toBe('[invalid]');
      expect(maskEmail(undefined)).toBe('[invalid]');
    });

    test('should mask long email correctly', () => {
      expect(maskEmail('verylongemailaddress@domain.com')).toBe('ve***ss@domain.com');
    });
  });

  // =========================================================================
  // Field Normalization Tests (snake_case vs camelCase)
  // =========================================================================
  describe('Field Normalization', () => {
    
    // Helper function that mirrors the sanitization logic in admin.js
    function normalizeSubscriber(sub, includeEmail = false) {
      const normalized = {
        id: sub.id,
        name: sub.name || null,
        status: sub.status || 'active',
        subscriptionType: sub.subscription_type || sub.subscriptionType || 'general',
        createdAt: sub.created_at || sub.createdAt || null
      };
      
      if (includeEmail) {
        normalized.email = sub.email;
      } else {
        normalized.emailMasked = maskEmail(sub.email);
      }
      
      return normalized;
    }

    test('should normalize snake_case fields from raw DB query', () => {
      const dbRow = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        status: 'active',
        subscription_type: 'premium',
        created_at: '2025-01-15T10:30:00Z'
      };

      const normalized = normalizeSubscriber(dbRow, true);
      
      expect(normalized.id).toBe(1);
      expect(normalized.email).toBe('test@example.com');
      expect(normalized.subscriptionType).toBe('premium');
      expect(normalized.createdAt).toBe('2025-01-15T10:30:00Z');
    });

    test('should normalize camelCase fields from ORM', () => {
      const ormRecord = {
        id: 2,
        email: 'orm@example.com',
        name: 'ORM User',
        status: 'active',
        subscriptionType: 'basic',
        createdAt: new Date('2025-02-20T14:00:00Z')
      };

      const normalized = normalizeSubscriber(ormRecord, true);
      
      expect(normalized.id).toBe(2);
      expect(normalized.email).toBe('orm@example.com');
      expect(normalized.subscriptionType).toBe('basic');
      expect(normalized.createdAt).toEqual(new Date('2025-02-20T14:00:00Z'));
    });

    test('should handle mixed case fields (prefer snake_case)', () => {
      const mixedRecord = {
        id: 3,
        email: 'mixed@example.com',
        subscription_type: 'premium',  // snake_case present
        subscriptionType: 'basic',     // camelCase also present
        created_at: '2025-03-01',
        createdAt: '2025-03-02'
      };

      const normalized = normalizeSubscriber(mixedRecord, true);
      
      // snake_case should take precedence (comes first in || chain)
      expect(normalized.subscriptionType).toBe('premium');
      expect(normalized.createdAt).toBe('2025-03-01');
    });

    test('should use defaults when fields are missing', () => {
      const sparseRecord = {
        id: 4,
        email: 'sparse@example.com'
        // No name, status, subscription_type, created_at
      };

      const normalized = normalizeSubscriber(sparseRecord, true);
      
      expect(normalized.id).toBe(4);
      expect(normalized.name).toBeNull();
      expect(normalized.status).toBe('active');
      expect(normalized.subscriptionType).toBe('general');
      expect(normalized.createdAt).toBeNull();
    });

    test('should mask email when admin lacks VIEW_PII permission', () => {
      const record = {
        id: 5,
        email: 'hidden@example.com',
        name: 'Hidden User'
      };

      const normalized = normalizeSubscriber(record, false);
      
      expect(normalized.email).toBeUndefined();
      expect(normalized.emailMasked).toBe('hi***en@example.com');
    });

    test('should include full email when admin has VIEW_PII permission', () => {
      const record = {
        id: 6,
        email: 'visible@example.com',
        name: 'Visible User'
      };

      const normalized = normalizeSubscriber(record, true);
      
      expect(normalized.email).toBe('visible@example.com');
      expect(normalized.emailMasked).toBeUndefined();
    });
  });

  // =========================================================================
  // Integration-like Tests (Route Handler Logic)
  // =========================================================================
  describe('Route Handler Logic', () => {
    
    test('should return piiIncluded: true for super_admin', () => {
      const mockReq = {
        user: { id: 1, email: 'super@test.com', role: 'super_admin' },
        query: { page: '1', limit: '10' },
        ip: '127.0.0.1'
      };

      const piiIncluded = canViewPii(mockReq.user);
      expect(piiIncluded).toBe(true);
    });

    test('should return piiIncluded: false for regular admin', () => {
      const mockReq = {
        user: { id: 2, email: 'admin@test.com', role: 'admin', permissions: [] },
        query: { page: '1', limit: '10' },
        ip: '127.0.0.1'
      };

      const piiIncluded = canViewPii(mockReq.user);
      expect(piiIncluded).toBe(false);
    });

    test('pagination should be bounded correctly', () => {
      // Simulate pagination parsing logic
      const parsePageParams = (query) => {
        const page = Math.max(1, parseInt(query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
        const offset = (page - 1) * limit;
        return { page, limit, offset };
      };

      // Normal case
      expect(parsePageParams({ page: '2', limit: '25' })).toEqual({ page: 2, limit: 25, offset: 25 });
      
      // Defaults
      expect(parsePageParams({})).toEqual({ page: 1, limit: 50, offset: 0 });
      
      // Clamped values
      expect(parsePageParams({ page: '0', limit: '0' })).toEqual({ page: 1, limit: 1, offset: 0 });
      expect(parsePageParams({ page: '-5', limit: '500' })).toEqual({ page: 1, limit: 100, offset: 0 });
    });
  });
});

// =========================================================================
// Export for external test runners
// =========================================================================
module.exports = {
  // Export test utilities for use in other test files
  mockAdminWithPii: { id: 1, email: 'pii@test.com', role: 'admin', permissions: [ADMIN_PERMISSIONS.VIEW_PII] },
  mockAdminNoPii: { id: 2, email: 'nopii@test.com', role: 'admin', permissions: [] },
  mockSuperAdmin: { id: 3, email: 'super@test.com', role: 'super_admin', permissions: [] }
};
