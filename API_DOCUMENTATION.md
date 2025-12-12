# 📖 ErrorWise Backend - API Documentation

> **Complete API Reference** - All endpoints, request/response formats, authentication, and usage examples.

**Production Base URL:** `https://errorwise-backend-production.up.railway.app`

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Base URL](#base-url)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Error Handling](#error-handling)
6. [Authentication Endpoints](#authentication-endpoints)
7. [User Endpoints](#user-endpoints)
8. [Error Analysis Endpoints](#error-analysis-endpoints)
9. [Subscription Endpoints](#subscription-endpoints)
10. [Session Management](#session-management)
11. [Platform Statistics](#platform-statistics)

---

## Overview

ErrorWise is an AI-powered error analysis platform that helps developers understand, solve, and learn from coding errors. This document outlines all available API endpoints with complete request/response examples.

### Key Features
- 🔐 JWT-based authentication with Redis sessions
- ⚡ Tier-based rate limiting
- 🤖 AI-powered error analysis (Anthropic Claude)
- 💬 Conversational follow-up questions
- 💳 Multi-tier subscriptions (Free, Pro, Team)
- 📊 Usage tracking and analytics

---

## Base URL

**Development:**
```
http://localhost:3001
```

**Production:**
```
https://errorwise-backend-production.up.railway.app
```

---

## Authentication

### Token-Based Authentication

ErrorWise uses JWT (JSON Web Tokens) with Redis-backed sessions for authentication.

**Token Types:**
- **Access Token**: Short-lived (1 hour), sent in `Authorization` header
- **Refresh Token**: Long-lived (7 days), stored in Redis session

**Authorization Header Format:**
```
Authorization: Bearer <access_token>
```

**Session Storage:**
- Sessions stored in Redis with 7-day TTL
- Automatic expiry and cleanup
- Multi-device session support

### Security Question

Password recovery uses **1 security question**:
- Question and answer set during registration
- Answer is bcrypt-hashed before storage
- Used for password reset verification

---

## Rate Limiting

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1698412800
```

### Tier-Based Limits

| Tier | General Endpoints | Auth Endpoints | Error Analysis |
|------|------------------|----------------|----------------|
| **Free** | 10 req/min | 5 req/15min | 50 queries/month |
| **Pro** | 50 req/min | 5 req/15min | Unlimited |
| **Team** | 200 req/min | 5 req/15min | Unlimited |

### Rate Limit Exceeded Response

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60,
  "limit": 100,
  "current": 100
}
```

---

## Error Handling

### Standard Error Response

All errors follow this format:

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)",
  "code": "ERROR_CODE",
  "timestamp": "2025-12-12T10:30:00.000Z"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| **200** | OK | Request successful |
| **201** | Created | Resource created successfully |
| **400** | Bad Request | Invalid request parameters |
| **401** | Unauthorized | Authentication required or failed |
| **403** | Forbidden | Insufficient permissions |
| **404** | Not Found | Resource not found |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server-side error |

---

## Authentication Endpoints

### POST `/api/auth/register`

Register a new user account with 1 security question.

**Authentication Required:** No

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "securityQuestion": "What is your favorite color?",
  "securityAnswer": "Blue"
}
```

**Field Requirements:**
- `username`: 3-50 characters, alphanumeric + underscore
- `email`: Valid email format
- `password`: Minimum 6 characters
- `securityQuestion`: Required for password recovery
- `securityAnswer`: Case-insensitive, will be hashed

**Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "username": "johndoe",
    "email": "john@example.com",
    "subscriptionTier": "Free",
    "createdAt": "2025-10-27T10:30:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

**Error Responses:**

```json
// 400 - Email already exists
{
  "error": "Email already registered",
  "code": "EMAIL_EXISTS"
}

// 400 - Validation error
{
  "error": "Username must be 3-50 characters",
  "code": "VALIDATION_ERROR"
}

// 429 - Rate limit exceeded
{
  "error": "Too many registration attempts",
  "retryAfter": 900
}
```

---

### POST `/api/auth/login`

Authenticate user and receive access tokens. Creates a Redis session.

**Authentication Required:** No

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "username": "johndoe",
    "email": "john@example.com",
    "subscriptionTier": "Pro",
    "lastLoginAt": "2025-10-27T10:30:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "session": {
    "sessionId": "sess_abc123xyz789",
    "expiresAt": "2025-11-03T10:30:00.000Z"
  }
}
```

**Error Responses:**

```json
// 401 - Invalid credentials
{
  "error": "Invalid email or password",
  "code": "INVALID_CREDENTIALS"
}

// 403 - Account locked (abuse detection)
{
  "error": "Account temporarily locked due to multiple failed attempts",
  "code": "ACCOUNT_LOCKED",
  "retryAfter": 1800
}
```

---

### POST `/api/auth/logout`

Logout user and destroy Redis session.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully",
  "sessionDestroyed": true
}
```

---

### POST `/api/auth/refresh`

Refresh access token using refresh token. Updates Redis session.

**Authentication Required:** No (requires valid refresh token)

**Rate Limit:** 100 requests per minute

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "message": "Token refreshed successfully",
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

**Error Responses:**

```json
// 401 - Invalid or expired refresh token
{
  "error": "Invalid refresh token",
  "code": "INVALID_REFRESH_TOKEN"
}

// 401 - Session expired
{
  "error": "Session expired, please login again",
  "code": "SESSION_EXPIRED"
}
```

---

### POST `/api/auth/forgot-password`

Request password reset with security question.

**Authentication Required:** No

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Security question sent",
  "question": "What is your favorite color?",
  "resetToken": "reset_abc123xyz789"
}
```

**Note:** `resetToken` is used to verify the security answer in the next step.

---

### POST `/api/auth/reset-password`

Reset password after answering security question.

**Authentication Required:** No

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "resetToken": "reset_abc123xyz789",
  "securityAnswer": "Blue",
  "newPassword": "NewSecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successfully",
  "redirectTo": "/login"
}
```

**Error Responses:**

```json
// 400 - Incorrect security answer
{
  "error": "Incorrect security answer",
  "code": "INVALID_SECURITY_ANSWER",
  "attemptsRemaining": 2
}

// 400 - Token expired
{
  "error": "Reset token expired",
  "code": "TOKEN_EXPIRED"
}
```

---

## User Endpoints

### GET `/api/users/profile`

Get current user profile information.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Headers:**
```http
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "username": "johndoe",
    "email": "john@example.com",
    "subscriptionTier": "Pro",
    "subscriptionStatus": "active",
    "queriesUsed": 127,
    "queriesLimit": 500,
    "createdAt": "2025-10-01T10:30:00.000Z",
    "lastLoginAt": "2025-10-27T10:30:00.000Z"
  }
}
```

---

### PUT `/api/users/profile`

Update user profile information.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Request Body:**
```json
{
  "username": "johndoe_updated",
  "email": "newemail@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "username": "johndoe_updated",
    "email": "newemail@example.com"
  }
}
```

---

### GET `/api/users/sessions`

Get all active sessions for the current user.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "sessions": [
    {
      "sessionId": "sess_abc123",
      "device": "Chrome on Windows",
      "ipAddress": "192.168.1.100",
      "lastActive": "2025-10-27T10:30:00.000Z",
      "createdAt": "2025-10-20T10:30:00.000Z",
      "expiresAt": "2025-10-27T10:30:00.000Z",
      "current": true
    },
    {
      "sessionId": "sess_xyz789",
      "device": "Safari on iPhone",
      "ipAddress": "192.168.1.101",
      "lastActive": "2025-10-26T15:20:00.000Z",
      "createdAt": "2025-10-19T08:00:00.000Z",
      "expiresAt": "2025-10-26T08:00:00.000Z",
      "current": false
    }
  ],
  "total": 2
}
```

---

### DELETE `/api/users/sessions/:sessionId`

Revoke a specific session (logout from specific device).

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**URL Parameters:**
- `sessionId`: Session identifier to revoke

**Response (200 OK):**
```json
{
  "message": "Session revoked successfully",
  "sessionId": "sess_xyz789"
}
```

---

### DELETE `/api/users/sessions/all`

Revoke all sessions except current one.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "message": "All other sessions revoked",
  "sessionsRevoked": 3
}
```

---

## Session Management

### Redis Session Storage

All sessions are stored in Redis with the following structure:

**Session Key Format:**
```
session:<accessToken>
```

**Session Data:**
```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "username": "johndoe",
  "email": "john@example.com",
  "subscriptionTier": "Pro",
  "device": "Chrome on Windows",
  "ipAddress": "192.168.1.100",
  "createdAt": "2025-10-20T10:30:00.000Z",
  "lastActive": "2025-10-27T10:30:00.000Z"
}
```

**TTL:** 7 days (604800 seconds)

### Session Middleware

The session middleware automatically:
- Validates access token from Authorization header
- Retrieves session data from Redis
- Updates `lastActive` timestamp
- Attaches user data to `req.user`
- Returns 401 if session expired or invalid

---

## Error Analysis Endpoints

### POST `/api/errors/analyze`

Analyze an error using AI services (OpenAI GPT-4 or Google Gemini).

**Authentication Required:** Yes

**Rate Limit:** Tier-based (Free: 10/month, Pro: 500/month, Team: 2000/month)

**Request Body:**
```json
{
  "errorMessage": "TypeError: Cannot read property 'map' of undefined",
  "codeSnippet": "const results = data.map(item => item.value);",
  "language": "javascript",
  "context": "React component fetching API data",
  "aiProvider": "auto"
}
```

**Field Requirements:**
- `errorMessage`: Required, the error message to analyze
- `codeSnippet`: Optional, relevant code context
- `language`: Optional, auto-detected if not provided
- `context`: Optional, additional context about the error
- `aiProvider`: Optional (`openai`, `gemini`, `auto`). Defaults to tier-based selection

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "analysis": {
    "errorCategory": "TypeError",
    "explanation": "This error occurs because the 'data' variable is undefined when you try to call the .map() method on it...",
    "solution": "Add a null/undefined check before calling .map()...",
    "codeExample": "const results = data?.map(item => item.value) || [];",
    "bestPractices": [
      "Always validate data before using array methods",
      "Use optional chaining (?.) for safer property access",
      "Provide default values for potentially undefined data"
    ],
    "confidence": 95,
    "language": "javascript",
    "aiProvider": "openai-gpt4"
  },
  "usage": {
    "queriesUsed": 128,
    "queriesLimit": 500,
    "resetDate": "2025-11-01T00:00:00.000Z"
  },
  "responseTime": 1234,
  "createdAt": "2025-10-27T10:30:00.000Z"
}
```

**Error Responses:**

```json
// 403 - Query limit exceeded
{
  "error": "Monthly query limit exceeded",
  "code": "QUERY_LIMIT_EXCEEDED",
  "usage": {
    "queriesUsed": 10,
    "queriesLimit": 10,
    "resetDate": "2025-11-01T00:00:00.000Z"
  },
  "upgradeUrl": "/subscriptions/plans"
}

// 400 - Invalid request
{
  "error": "Error message is required",
  "code": "VALIDATION_ERROR"
}
```

---

### GET `/api/errors/history`

Get error analysis history for current user.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)
- `language`: Filter by programming language
- `category`: Filter by error category

**Request:**
```http
GET /api/errors/history?page=1&limit=20&language=javascript
```

**Response (200 OK):**
```json
{
  "errors": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "errorMessage": "TypeError: Cannot read property 'map' of undefined",
      "language": "javascript",
      "errorCategory": "TypeError",
      "solved": true,
      "createdAt": "2025-10-27T10:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalResults": 87,
    "limit": 20
  }
}
```

---

### GET `/api/errors/:id`

Get specific error analysis by ID.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**URL Parameters:**
- `id`: Error query UUID

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "errorMessage": "TypeError: Cannot read property 'map' of undefined",
  "codeSnippet": "const results = data.map(item => item.value);",
  "language": "javascript",
  "analysis": {
    "errorCategory": "TypeError",
    "explanation": "...",
    "solution": "...",
    "codeExample": "...",
    "confidence": 95
  },
  "createdAt": "2025-10-27T10:30:00.000Z"
}
```

---

### DELETE `/api/errors/:id`

Delete a specific error query from history.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "message": "Error query deleted successfully",
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

## Subscription Endpoints

### GET `/api/subscriptions/plans`

Get all available subscription plans with features and pricing.

**Authentication Required:** No (public endpoint)

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "plans": [
    {
      "tier": "Free",
      "name": "Free Tier",
      "price": 0,
      "currency": "USD",
      "billing": "monthly",
      "features": {
        "queriesPerMonth": 10,
        "aiModel": "GPT-3.5 Turbo",
        "contextLength": 1000,
        "teamMembers": 1,
        "rateLimit": "10 requests/minute",
        "prioritySupport": false,
        "advancedAnalytics": false
      }
    },
    {
      "tier": "Pro",
      "name": "Pro Plan",
      "price": 19.99,
      "currency": "USD",
      "billing": "monthly",
      "popular": true,
      "features": {
        "queriesPerMonth": 500,
        "aiModel": "GPT-4",
        "contextLength": 5000,
        "teamMembers": 1,
        "rateLimit": "50 requests/minute",
        "prioritySupport": true,
        "advancedAnalytics": true
      }
    },
    {
      "tier": "Team",
      "name": "Team Plan",
      "price": 49.99,
      "currency": "USD",
      "billing": "monthly",
      "features": {
        "queriesPerMonth": 2000,
        "aiModel": "GPT-4 + Gemini",
        "contextLength": 10000,
        "teamMembers": 10,
        "rateLimit": "200 requests/minute",
        "prioritySupport": true,
        "advancedAnalytics": true,
        "teamCollaboration": true
      }
    }
  ]
}
```

---

### GET `/api/subscriptions/current`

Get current user's subscription details.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "subscription": {
    "tier": "Pro",
    "status": "active",
    "startDate": "2025-10-01T00:00:00.000Z",
    "renewalDate": "2025-11-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false
  },
  "usage": {
    "queriesUsed": 127,
    "queriesLimit": 500,
    "resetDate": "2025-11-01T00:00:00.000Z",
    "percentageUsed": 25.4
  },
  "payment": {
    "amount": 19.99,
    "currency": "USD",
    "nextBillingDate": "2025-11-01T00:00:00.000Z",
    "paymentMethod": "•••• 4242"
  }
}
```

---

### POST `/api/subscriptions/upgrade`

Upgrade subscription to a higher tier.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Request Body:**
```json
{
  "targetTier": "Pro",
  "paymentMethod": {
    "type": "card",
    "token": "pm_abc123xyz789"
  }
}
```

**Response (200 OK):**
```json
{
  "message": "Subscription upgraded successfully",
  "subscription": {
    "tier": "Pro",
    "status": "active",
    "startDate": "2025-10-27T10:30:00.000Z",
    "renewalDate": "2025-11-27T10:30:00.000Z"
  },
  "payment": {
    "transactionId": "txn_abc123",
    "amount": 19.99,
    "currency": "USD",
    "status": "succeeded"
  },
  "redirectUrl": "/dashboard"
}
```

**Error Responses:**

```json
// 400 - Already on this tier
{
  "error": "Already subscribed to Pro tier",
  "code": "ALREADY_SUBSCRIBED"
}

// 402 - Payment failed
{
  "error": "Payment processing failed",
  "code": "PAYMENT_FAILED",
  "details": "Insufficient funds"
}

// 400 - Cannot downgrade via this endpoint
{
  "error": "Use /subscriptions/downgrade for tier downgrades",
  "code": "INVALID_OPERATION"
}
```

---

### POST `/api/subscriptions/downgrade`

Downgrade subscription to a lower tier (effective at period end).

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Request Body:**
```json
{
  "targetTier": "Free",
  "reason": "Not using enough queries"
}
```

**Response (200 OK):**
```json
{
  "message": "Subscription will be downgraded at period end",
  "currentSubscription": {
    "tier": "Pro",
    "status": "active",
    "validUntil": "2025-11-01T00:00:00.000Z"
  },
  "futureSubscription": {
    "tier": "Free",
    "effectiveDate": "2025-11-01T00:00:00.000Z"
  }
}
```

---

### POST `/api/subscriptions/cancel`

Cancel current subscription (effective at period end).

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Request Body:**
```json
{
  "reason": "No longer need the service",
  "feedback": "Great service, but switching to another tool"
}
```

**Response (200 OK):**
```json
{
  "message": "Subscription cancelled successfully",
  "subscription": {
    "tier": "Pro",
    "status": "cancelled",
    "validUntil": "2025-11-01T00:00:00.000Z",
    "willDowngradeTo": "Free"
  },
  "refund": null
}
```

---

### GET `/api/subscriptions/usage`

Get detailed usage statistics for current billing period.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "period": {
    "start": "2025-10-01T00:00:00.000Z",
    "end": "2025-11-01T00:00:00.000Z",
    "daysRemaining": 4
  },
  "queries": {
    "used": 127,
    "limit": 500,
    "percentageUsed": 25.4,
    "remaining": 373
  },
  "aiProviders": {
    "openai": 98,
    "gemini": 29
  },
  "languages": {
    "javascript": 45,
    "python": 38,
    "java": 24,
    "other": 20
  },
  "successRate": 94.5,
  "averageResponseTime": 1234
}
```

---

### GET `/api/subscriptions/invoices`

Get billing history and invoices.

**Authentication Required:** Yes

**Rate Limit:** 100 requests per minute

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 10, max: 50)

**Response (200 OK):**
```json
{
  "invoices": [
    {
      "id": "inv_abc123",
      "date": "2025-10-01T00:00:00.000Z",
      "amount": 19.99,
      "currency": "USD",
      "status": "paid",
      "description": "Pro Plan - Monthly",
      "downloadUrl": "https://api.errorwise.com/invoices/inv_abc123.pdf"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalInvoices": 12
  }
}
```

---

## Platform Statistics

### GET `/api/stats`

Get public platform statistics (no authentication required).

**Authentication Required:** No

**Rate Limit:** 100 requests per minute

**Response (200 OK):**
```json
{
  "platform": {
    "totalUsers": 15234,
    "totalQueries": 487521,
    "activeUsers24h": 1234,
    "averageResponseTime": 1234,
    "successRate": 96.5
  },
  "languages": [
    { "language": "JavaScript", "count": 145234, "percentage": 29.8 },
    { "language": "Python", "count": 123421, "percentage": 25.3 },
    { "language": "Java", "count": 87234, "percentage": 17.9 },
    { "language": "TypeScript", "count": 65432, "percentage": 13.4 },
    { "language": "Other", "count": 66200, "percentage": 13.6 }
  ],
  "errorCategories": [
    { "category": "TypeError", "count": 145234, "percentage": 29.8 },
    { "category": "SyntaxError", "count": 98765, "percentage": 20.3 },
    { "category": "RuntimeError", "count": 87654, "percentage": 18.0 },
    { "category": "Other", "count": 155868, "percentage": 31.9 }
  ]
}
```

---

## Webhooks

### Dodo Payments Webhook

**Endpoint:** `POST /api/webhooks/dodo`

**Description:** Receives payment events from Dodo Payments.

**Headers:**
```http
X-Dodo-Signature: sha256=abc123...
Content-Type: application/json
```

**Event Types:**
- `subscription.created`
- `subscription.updated`
- `subscription.cancelled`
- `payment.succeeded`
- `payment.failed`

**Example Payload:**
```json
{
  "event": "payment.succeeded",
  "data": {
    "transactionId": "txn_abc123",
    "amount": 19.99,
    "currency": "USD",
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "subscriptionTier": "Pro",
    "timestamp": "2025-10-27T10:30:00.000Z"
  }
}
```

---

## Caching

### Cache Strategy

ErrorWise uses Redis for multi-layer caching:

| Data Type | Cache Key Format | TTL | Purpose |
|-----------|-----------------|-----|---------|
| **User Data** | `cache:user:<userId>` | 30 min | Reduce DB queries for user info |
| **Subscriptions** | `cache:subscription:<userId>` | 1 hour | Cache subscription details |
| **Platform Stats** | `cache:stats:platform` | 15 min | Cache public statistics |
| **Subscription Plans** | `cache:plans` | 24 hours | Cache available plans |

### Cache Headers

Cached responses include these headers:

```http
X-Cache: HIT
X-Cache-Age: 456
X-Cache-TTL: 1344
```

- `X-Cache`: `HIT` (from cache) or `MISS` (from database)
- `X-Cache-Age`: Seconds since cached
- `X-Cache-TTL`: Seconds until expiration

---

## Examples

### Complete Registration Flow

```bash
# 1. Register new user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "securityQuestion": "What is your favorite color?",
    "securityAnswer": "Blue"
  }'

# Response includes accessToken and refreshToken
```

### Error Analysis with Authentication

```bash
# 2. Analyze an error
curl -X POST http://localhost:3001/api/errors/analyze \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "errorMessage": "TypeError: Cannot read property map of undefined",
    "codeSnippet": "const results = data.map(item => item.value);",
    "language": "javascript"
  }'
```

### Subscription Upgrade

```bash
# 3. Upgrade to Pro
curl -X POST http://localhost:3001/api/subscriptions/upgrade \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "targetTier": "Pro",
    "paymentMethod": {
      "type": "card",
      "token": "pm_abc123xyz789"
    }
  }'
```

---

## Rate Limiting Details

### Implementation

Rate limiting uses Redis with sliding window algorithm:

```javascript
// Key format: rate_limit:<tier>:<userId>:<endpoint>
// Example: rate_limit:Pro:123e4567:errors_analyze

// Sliding window tracking
{
  "requests": [
    { "timestamp": 1698412730, "count": 1 },
    { "timestamp": 1698412735, "count": 1 },
    { "timestamp": 1698412740, "count": 1 }
  ],
  "total": 3,
  "windowStart": 1698412700
}
```

### Custom Rate Limits

Custom rate limits can be applied per endpoint:

| Endpoint Pattern | Free | Pro | Team |
|-----------------|------|-----|------|
| `POST /api/errors/analyze` | 10/month | 500/month | 2000/month |
| `POST /api/auth/*` | 5/15min | 5/15min | 5/15min |
| `GET /api/*` | 10/min | 50/min | 200/min |
| `POST /api/*` | 10/min | 50/min | 200/min |

---

## Security Best Practices

### API Key Storage (Future Feature)

For programmatic access, API keys will be supported:

```http
Authorization: Bearer <api_key>
```

### CORS Configuration

Allowed origins:
- `http://localhost:3000` (development)
- `https://errorwise.com` (production)

### Request Signing (Webhooks)

Webhook requests are signed using HMAC-SHA256:

```javascript
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');

// Compare with X-Dodo-Signature header
```

---

## Support

- **API Issues:** [GitHub Issues](https://github.com/PankajKumar2804/errorwise-backend/issues)
- **Documentation:** [Full Docs](https://docs.errorwise.com)
- **Email:** api@errorwise.com

---

**API Version:** 1.0.0  
**Last Updated:** October 27, 2025  
**Next:** See [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) for frontend integration guide
  "email": "string (optional)"
}
```

**Response (200):**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "createdAt": "timestamp"
  }
}
```

### PUT /users/password
Change user password.

**Request Body:**
```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (required, min 6 characters)"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

### DELETE /users/account
Delete user account (requires password confirmation).

**Request Body:**
```json
{
  "password": "string (required)"
}
```

**Response (200):**
```json
{
  "message": "Account deleted successfully"
}
```

### GET /users/dashboard
Get user dashboard data with statistics and recent queries.

**Response (200):**
```json
{
  "summary": {
    "totalQueries": "number",
    "thisWeekQueries": "number",
    "categoriesCount": "number",
    "subscriptionTier": "string"
  },
  "recentQueries": [...],
  "categoryStats": [...],
  "monthlyStats": [...]
}
```

---

## History Management Endpoints

### GET /history
Get paginated error query history with filtering options.

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `category` (string, optional)
- `language` (string, optional)
- `search` (string, optional)
- `sortBy` (string, default: 'createdAt')
- `sortOrder` (string, default: 'DESC')

**Response (200):**
```json
{
  "queries": [...],
  "pagination": {
    "currentPage": "number",
    "totalPages": "number",
    "totalQueries": "number",
    "hasNextPage": "boolean",
    "hasPrevPage": "boolean"
  },
  "filters": {
    "category": "string",
    "language": "string",
    "search": "string"
  }
}
```

### GET /history/user
Get user history with advanced filtering.

**Query Parameters:**
- `page` (number)
- `limit` (number)
- `search` (string)
- `category` (string)
- `sortBy` (string)
- `sortOrder` (string)

### GET /history/stats
Get user history statistics.

**Response (200):**
```json
{
  "totalQueries": "number",
  "queriesThisWeek": "number",
  "queriesThisMonth": "number",
  "categoriesBreakdown": [...]
}
```

### GET /history/:queryId
Get specific query details by ID.

**Response (200):**
```json
{
  "id": "uuid",
  "errorMessage": "string",
  "explanation": "string",
  "solution": "string",
  "errorCategory": "string",
  "aiProvider": "string",
  "userSubscriptionTier": "string",
  "responseTime": "number",
  "tags": ["string"],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### DELETE /history/:queryId
Delete a specific error query.

**Response (200):**
```json
{
  "message": "Query deleted successfully"
}
```

---

## Subscription Management Endpoints

### GET /subscriptions/plans
Get available subscription plans.

**Response (200):**
```json
{
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "price": 0,
      "interval": "month",
      "features": {
        "maxQueries": 10,
        "aiProviders": ["mock"],
        "advancedAnalysis": false,
        "prioritySupport": false,
        "exportResults": false
      },
      "description": "Perfect for trying out ErrorWise"
    },
    {
      "id": "pro",
      "name": "Pro",
      "price": 9.99,
      "interval": "month",
      "features": {
        "maxQueries": 100,
        "aiProviders": ["openai", "gemini"],
        "advancedAnalysis": true,
        "prioritySupport": false,
        "exportResults": true
      },
      "description": "Great for individual developers"
    },
    {
      "id": "team",
      "name": "Team",
      "price": 29.99,
      "interval": "month",
      "features": {
        "maxQueries": 1000,
        "aiProviders": ["openai", "gemini"],
        "advancedAnalysis": true,
        "prioritySupport": true,
        "exportResults": true,
        "teamManagement": true
      },
      "description": "Perfect for development teams"
    }
  ]
}
```

### GET /subscriptions
Get current user subscription.

**Response (200):**
```json
{
  "tier": "string",
  "status": "string",
  "features": {...},
  "limits": {
    "queriesUsed": "number",
    "queriesRemaining": "number"
  }
}
```

### POST /subscriptions
Create a new subscription.

**Request Body:**
```json
{
  "planId": "string (required: 'pro' or 'team')"
}
```

**Response (201):**
```json
{
  "message": "Subscription created successfully",
  "subscription": {
    "id": "uuid",
    "tier": "string",
    "status": "string",
    "startDate": "timestamp",
    "endDate": "timestamp",
    "features": {...}
  }
}
```

### DELETE /subscriptions
Cancel current subscription.

**Response (200):**
```json
{
  "message": "Subscription cancelled successfully",
  "subscription": {
    "id": "uuid",
    "tier": "string",
    "status": "cancelled",
    "endDate": "timestamp"
  }
}
```

### GET /subscriptions/usage
Get subscription usage statistics.

**Response (200):**
```json
{
  "tier": "string",
  "usage": {
    "queriesUsed": "number",
    "queriesRemaining": "number",
    "maxQueries": "number"
  },
  "features": {...}
}
```

---

## Settings Management Endpoints

### GET /settings
Get user settings and preferences.

**Response (200):**
```json
{
  "id": "uuid",
  "preferences": {
    "notifications": {
      "email": "boolean",
      "push": "boolean",
      "errorAlerts": "boolean",
      "weeklyReports": "boolean"
    },
    "privacy": {
      "shareAnalytics": "boolean",
      "publicProfile": "boolean"
    },
    "ai": {
      "preferredProvider": "string",
      "analysisDepth": "string",
      "codeContext": "boolean"
    },
    "display": {
      "theme": "string",
      "language": "string",
      "timezone": "string"
    }
  },
  "updatedAt": "timestamp"
}
```

### PUT /settings
Update user settings.

**Request Body:**
```json
{
  "preferences": {
    "notifications": {...},
    "privacy": {...},
    "ai": {...},
    "display": {...}
  }
}
```

### PUT /settings/notifications
Update notification preferences.

**Request Body:**
```json
{
  "notifications": {
    "email": "boolean",
    "push": "boolean",
    "errorAlerts": "boolean",
    "weeklyReports": "boolean"
  }
}
```

### PUT /settings/privacy
Update privacy settings.

**Request Body:**
```json
{
  "privacy": {
    "shareAnalytics": "boolean",
    "publicProfile": "boolean"
  }
}
```

### PUT /settings/ai
Update AI preferences.

**Request Body:**
```json
{
  "ai": {
    "preferredProvider": "string (auto, openai, gemini, mock)",
    "analysisDepth": "string (basic, standard, advanced)",
    "codeContext": "boolean"
  }
}
```

### POST /settings/reset
Reset all settings to default values.

**Response (200):**
```json
{
  "message": "Settings reset to default successfully",
  "preferences": {...}
}
```

---

## Error Codes

### 400 Bad Request
- Invalid request body
- Missing required fields
- Validation errors

### 401 Unauthorized
- Invalid or expired tokens
- Missing authentication

### 403 Forbidden
- Insufficient permissions
- Subscription limits exceeded

### 404 Not Found
- Resource not found
- User not found

### 409 Conflict
- Email already exists
- Duplicate subscription

### 429 Too Many Requests
- Rate limiting exceeded

### 500 Internal Server Error
- Database errors
- AI service errors
- Unexpected server errors

---

## Rate Limiting

- Free tier: 10 requests per hour
- Pro tier: 100 requests per hour
- Team tier: 1000 requests per hour

Rate limiting is applied per user and resets every hour.

---

## CORS Configuration

The API accepts requests from:
- `http://localhost:3000` (development frontend)
- `http://localhost:5173` (Vite development server)
- Production domains (to be configured)

---

## Security Headers

The API includes security headers:
- `helmet` for security headers
- `cors` for cross-origin requests
- `express-rate-limit` for rate limiting
- Cookie security settings (httpOnly, secure, sameSite)

---

## Database Models

### User
- `id` (UUID, primary key)
- `username` (string, unique)
- `email` (string, unique)
- `password` (string, hashed)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### ErrorQuery
- `id` (UUID, primary key)
- `userId` (UUID, foreign key)
- `errorMessage` (text)
- `codeSnippet` (text)
- `language` (string)
- `explanation` (text)
- `solution` (text)
- `codeExample` (text)
- `errorCategory` (string)
- `confidence` (integer)
- `aiProvider` (string)
- `userSubscriptionTier` (string)
- `responseTime` (integer)
- `tags` (array)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### Subscription
- `id` (UUID, primary key)
- `userId` (UUID, foreign key)
- `tier` (string)
- `status` (string)
- `startDate` (timestamp)
- `endDate` (timestamp)
- `stripeSubscriptionId` (string)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### UserSettings
- `id` (UUID, primary key)
- `userId` (UUID, foreign key)
- `preferences` (JSON)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

---

## Development Setup

1. Install dependencies: `npm install`
2. Set up environment variables in `.env`
3. Start development server: `npm run dev`
4. Run tests: `npm test`

### Required Environment Variables

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=errorwise
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key
REDIS_URL=redis://localhost:6379
```

---

## Deployment

The application is ready for deployment on platforms like:
- Heroku
- Railway
- DigitalOcean
- AWS
- Vercel (for the frontend)

Make sure to configure production environment variables and database connections.