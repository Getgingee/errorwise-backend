# Privacy & Access Control Documentation

## Newsletter Subscriber Data Access Policy

**Last Updated:** November 30, 2025  
**Document Version:** 1.0  
**Classification:** Internal - Compliance Required

---

## 1. Overview

This document outlines the access controls, audit logging, and compliance requirements for accessing newsletter subscriber data in the ErrorWise platform.

## 2. Data Classification

### 2.1 Personal Identifiable Information (PII)

The following fields are classified as **PII** and require explicit permissions to access:

| Field | Classification | Access Level Required |
|-------|---------------|----------------------|
| `email` | PII - High | `admin:view_pii` or `super_admin` |
| `name` | PII - Medium | `admin:view_subscribers` |

### 2.2 Non-PII Data

The following fields are **not** classified as PII:

| Field | Classification | Access Level Required |
|-------|---------------|----------------------|
| `id` | Internal Identifier | `admin:basic` |
| `status` | Account State | `admin:view_subscribers` |
| `subscriptionType` | Preference | `admin:view_subscribers` |
| `createdAt` | Timestamp | `admin:view_subscribers` |

## 3. Role-Based Access Control (RBAC)

### 3.1 Permission Hierarchy

```
super_admin (all permissions)
    │
    ├── admin:super (equivalent to super_admin)
    │
    ├── admin:view_pii (can view email addresses)
    │
    ├── admin:export_data (can export subscriber data)
    │
    ├── admin:send_newsletter (can trigger newsletter sends)
    │
    ├── admin:view_subscribers (can view subscriber list without PII)
    │
    └── admin:basic (basic admin dashboard access)
```

### 3.2 Role Mappings

| Role | Inherited Permissions |
|------|----------------------|
| `super_admin` | All permissions |
| `admin` | `admin:basic`, `admin:view_subscribers`, `admin:send_newsletter` |
| `user` | None (cannot access admin routes) |

### 3.3 Explicit Permission Grants

PII access (`admin:view_pii`) is **never** automatically granted. It must be:
1. Explicitly added to the user's `permissions` array in the database
2. Approved by a data protection officer or equivalent
3. Logged and reviewed quarterly

## 4. Audit Logging

### 4.1 Events Logged

All PII access events are logged with the following information:

```json
{
  "eventType": "PII_ACCESS",
  "action": "VIEW_SUBSCRIBER_EMAILS | VIEW_SUBSCRIBER_LIST",
  "admin": {
    "id": "admin_user_id",
    "email": "ad***in@example.com",  // Always masked in logs
    "role": "admin | super_admin",
    "permissions": ["admin:view_pii", ...]
  },
  "resource": "newsletter_subscribers",
  "recordCount": 50,
  "ipAddress": "192.168.x.x",
  "success": true,
  "timestamp": "2025-11-30T10:30:00.000Z",
  "metadata": {
    "page": 1,
    "limit": 50,
    "piiIncluded": true
  }
}
```

### 4.2 Log Retention

| Log Type | Retention Period | Storage Location |
|----------|-----------------|------------------|
| Audit Logs | 90 days minimum | `logs/audit.log` |
| Combined Logs | 30 days | `logs/combined.log` |
| Error Logs | 30 days | `logs/error.log` |

### 4.3 Log Review Schedule

- **Weekly:** Automated scan for anomalous PII access patterns
- **Monthly:** Manual review of all PII access events
- **Quarterly:** Full audit report for compliance

## 5. API Endpoint Security

### 5.1 Newsletter Subscribers Endpoint

**Endpoint:** `GET /api/admin/newsletter/subscribers`

**Authentication Required:** Yes (JWT token)

**Authorization Required:** 
- Minimum: `admin` role
- For PII access: `admin:view_pii` permission

**Response Format:**

```json
{
  "success": true,
  "pagination": {
    "page": 1,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "count": 50,
  "total": 1234,
  "piiIncluded": false,  // Indicates if emails are included
  "subscribers": [
    {
      "id": 123,
      "emailMasked": "jo***oe@example.com",  // When piiIncluded: false
      "name": "John Doe",
      "status": "active",
      "subscriptionType": "general",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**When `piiIncluded: true`:**
```json
{
  "subscribers": [
    {
      "id": 123,
      "email": "johndoe@example.com",  // Full email when permitted
      "name": "John Doe",
      ...
    }
  ]
}
```

### 5.2 Security Headers

All admin endpoints include:
- Rate limiting: 100 requests/minute
- CORS: Restricted to allowed origins
- Content-Security-Policy headers

## 6. Compliance Requirements

### 6.1 GDPR Compliance

- [x] Purpose limitation: Data only used for newsletter delivery
- [x] Data minimization: Only necessary fields exposed
- [x] Access control: RBAC enforced
- [x] Audit trail: All access logged
- [x] Right to erasure: Unsubscribe mechanism available
- [ ] Data Processing Agreement: Required before production use

### 6.2 CCPA Compliance

- [x] Disclosure of data collection
- [x] Right to opt-out (unsubscribe)
- [x] Right to access (admin view)
- [x] Right to deletion (unsubscribe removes data)

### 6.3 Pre-Merge Checklist

Before merging changes to PII handling:

- [ ] RBAC permissions tested and verified
- [ ] Audit logging confirmed working
- [ ] Unit tests passing
- [ ] Security review completed
- [ ] Privacy impact assessment (if new PII fields)
- [ ] Data protection officer approval (if required)

## 7. Granting VIEW_PII Permission

### 7.1 Process

1. **Request:** Admin submits request with business justification
2. **Review:** Data Protection Officer reviews request
3. **Approval:** Manager approval required
4. **Implementation:** Add permission to user record
5. **Audit:** Log the permission grant

### 7.2 SQL to Grant Permission

```sql
-- Only run after proper approval process
UPDATE users 
SET permissions = array_append(permissions, 'admin:view_pii')
WHERE id = :admin_user_id 
  AND role IN ('admin', 'super_admin');

-- Log the grant (insert into audit table if available)
INSERT INTO admin_audit_log (admin_id, action, target_user_id, timestamp)
VALUES (:approver_id, 'GRANT_VIEW_PII', :admin_user_id, NOW());
```

## 8. Incident Response

### 8.1 Unauthorized Access Attempt

If unauthorized PII access is detected:

1. Alert sent to security team
2. User session terminated
3. Account temporarily suspended
4. Incident logged and investigated
5. Report filed within 72 hours (GDPR requirement)

### 8.2 Data Breach

In case of confirmed data breach:

1. Isolate affected systems
2. Assess scope of exposure
3. Notify affected users within 72 hours
4. Report to supervisory authority
5. Conduct post-incident review

## 9. Contact

For questions about this policy:

- **Security Team:** security@errorwise.tech
- **Data Protection:** privacy@errorwise.tech
- **Technical Support:** support@errorwise.tech

---

*This document is subject to review and updates. Always refer to the latest version in the repository.*
