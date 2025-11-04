# 📚 ErrorWise Backend API Documentation

> Complete API reference for ErrorWise Backend v1.0.0

**Base URL**: `http://localhost:3001/api` (Development)  
**Production URL**: `https://api.errorwise.tech/api`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Error Resolution](#error-resolution)
3. [User Management](#user-management)
4. [Subscription Management](#subscription-management)
5. [History & Analytics](#history--analytics)
6. [Support & Feedback](#support--feedback)
7. [Public Endpoints](#public-endpoints)
8. [Error Codes](#error-codes)

---

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Register User

**POST** `/auth/register`

Create a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response** (201 Created):
```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "John Doe",
    "isVerified": false,
    "subscriptionTier": "free"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors**:
- `400` - Email already exists
- `400` - Invalid email format
- `400` - Password too weak

---

### Login

**POST** `/auth/login`

Authenticate a user.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response** (200 OK):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionTier": "pro"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors**:
- `401` - Invalid credentials
- `403` - Email not verified

---

### Request OTP (Magic Link)

**POST** `/auth/request-otp`

Send OTP to user's email for passwordless login.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200 OK):
```json
{
  "message": "OTP sent to your email",
  "expiresIn": "10 minutes"
}
```

**Rate Limit**: 3 requests per 15 minutes per email

---

### Verify OTP

**POST** `/auth/verify-otp`

Verify OTP and log in user.

**Request Body**:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response** (200 OK):
```json
{
  "user": {...},
  "accessToken": "...",
  "refreshToken": "..."
}
```

**Errors**:
- `400` - Invalid or expired OTP
- `429` - Too many attempts

---

### GitHub OAuth Callback

**POST** `/auth/github/callback`

Handle GitHub OAuth callback.

**Request Body**:
```json
{
  "code": "github_oauth_code",
  "state": "random_state"
}
```

**Response** (200 OK):
```json
{
  "user": {...},
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

### Refresh Token

**POST** `/auth/refresh`

Get new access token using refresh token.

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "accessToken": "new_access_token_here",
  "refreshToken": "new_refresh_token_here"
}
```

---

### Forgot Password

**POST** `/auth/forgot-password`

Request password reset link.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200 OK):
```json
{
  "message": "Password reset link sent to your email"
}
```

---

### Reset Password

**POST** `/auth/reset-password`

Reset password with token from email.

**Request Body**:
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecurePass123!"
}
```

**Response** (200 OK):
```json
{
  "message": "Password reset successfully"
}
```

---

### Logout

**POST** `/auth/logout`

🔒 **Requires Authentication**

Invalidate current session.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "message": "Logged out successfully"
}
```

---

## Error Resolution

### Analyze Error

**POST** `/errors/analyze`

🔒 **Requires Authentication**

Analyze an error using AI.

**Request Body**:
```json
{
  "errorMessage": "TypeError: Cannot read property 'length' of undefined",
  "codeSnippet": "const arr = null;\nconsole.log(arr.length);",
  "programmingLanguage": "javascript",
  "errorType": "runtime",
  "url": "https://github.com/user/repo/blob/main/file.js",
  "preferredLanguage": "en",
  "additionalContext": "This happens in production on line 42"
}
```

**Fields**:
- `errorMessage` (required): The error message
- `codeSnippet` (optional): Code snippet causing the error
- `programmingLanguage` (optional): Language (javascript, python, java, etc.)
- `errorType` (optional): Type (syntax, runtime, logical, etc.)
- `url` (optional): GitHub/Stack Overflow URL for context
- `preferredLanguage` (optional): Response language (en, hi, ta, etc.)
- `additionalContext` (optional): Additional context

**Response** (200 OK):
```json
{
  "queryId": "uuid",
  "solution": "The error occurs because the variable 'arr' is null...",
  "explanation": "Detailed explanation of the error...",
  "codeExample": "// Fixed code\nconst arr = [];\nif (arr) {\n  console.log(arr.length);\n}",
  "aiProvider": "openai",
  "model": "gpt-4",
  "remainingQueries": 45,
  "tier": "pro"
}
```

**Errors**:
- `400` - Missing required fields
- `403` - Query limit exceeded
- `429` - Rate limit exceeded
- `503` - AI service unavailable

---

### Get Query History

**GET** `/errors/history?page=1&limit=20`

🔒 **Requires Authentication**

Get user's query history.

**Query Parameters**:
- `page` (default: 1): Page number
- `limit` (default: 20): Items per page
- `programmingLanguage` (optional): Filter by language
- `startDate` (optional): Filter from date (ISO 8601)
- `endDate` (optional): Filter to date (ISO 8601)

**Response** (200 OK):
```json
{
  "queries": [
    {
      "id": "uuid",
      "errorMessage": "TypeError...",
      "solution": "The error occurs...",
      "programmingLanguage": "javascript",
      "aiProvider": "openai",
      "createdAt": "2025-11-04T10:30:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 95,
    "itemsPerPage": 20
  }
}
```

---

### Get Specific Query

**GET** `/errors/:queryId`

🔒 **Requires Authentication**

Get details of a specific query.

**Response** (200 OK):
```json
{
  "id": "uuid",
  "errorMessage": "TypeError...",
  "codeSnippet": "...",
  "solution": "...",
  "explanation": "...",
  "codeExample": "...",
  "programmingLanguage": "javascript",
  "aiProvider": "openai",
  "model": "gpt-4",
  "createdAt": "2025-11-04T10:30:00Z"
}
```

---

### Delete Query

**DELETE** `/errors/:queryId`

🔒 **Requires Authentication**

Delete a query from history.

**Response** (200 OK):
```json
{
  "message": "Query deleted successfully"
}
```

---

## User Management

### Get Profile

**GET** `/users/profile`

🔒 **Requires Authentication**

Get current user's profile.

**Response** (200 OK):
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "subscriptionTier": "pro",
  "isVerified": true,
  "preferredLanguage": "en",
  "createdAt": "2025-01-01T00:00:00Z",
  "lastLoginAt": "2025-11-04T10:30:00Z",
  "stats": {
    "totalQueries": 150,
    "queriesThisMonth": 45,
    "remainingQueries": 455
  }
}
```

---

### Update Profile

**PUT** `/users/profile`

🔒 **Requires Authentication**

Update user profile.

**Request Body**:
```json
{
  "name": "Jane Doe",
  "preferredLanguage": "hi"
}
```

**Response** (200 OK):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "preferredLanguage": "hi"
  }
}
```

---

### Change Password

**PUT** `/users/password`

🔒 **Requires Authentication**

Change user password.

**Request Body**:
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**Response** (200 OK):
```json
{
  "message": "Password changed successfully"
}
```

**Errors**:
- `401` - Invalid current password
- `400` - New password too weak

---

### Delete Account

**DELETE** `/users/account`

🔒 **Requires Authentication**

Delete user account (permanent).

**Request Body**:
```json
{
  "password": "CurrentPass123!",
  "confirmation": "DELETE"
}
```

**Response** (200 OK):
```json
{
  "message": "Account deleted successfully"
}
```

---

## Subscription Management

### Get Current Subscription

**GET** `/subscriptions/current`

🔒 **Requires Authentication**

Get current subscription details.

**Response** (200 OK):
```json
{
  "tier": "pro",
  "status": "active",
  "limits": {
    "dailyQueries": 50,
    "monthlyQueries": 500
  },
  "usage": {
    "queriesToday": 12,
    "queriesThisMonth": 145,
    "remainingToday": 38,
    "remainingThisMonth": 355
  },
  "billing": {
    "amount": 19,
    "currency": "USD",
    "interval": "month",
    "nextBillingDate": "2025-12-01T00:00:00Z"
  }
}
```

---

### Get Available Plans

**GET** `/subscriptions/plans`

Get all available subscription plans.

**Response** (200 OK):
```json
{
  "plans": [
    {
      "tier": "free",
      "name": "Free",
      "price": 0,
      "currency": "USD",
      "interval": "month",
      "features": {
        "dailyQueries": 5,
        "monthlyQueries": 20,
        "aiModels": ["Gemini Flash"],
        "support": "Community"
      }
    },
    {
      "tier": "pro",
      "name": "Pro",
      "price": 19,
      "currency": "USD",
      "interval": "month",
      "features": {
        "dailyQueries": 50,
        "monthlyQueries": 500,
        "aiModels": ["GPT-3.5", "Gemini Flash", "Claude Haiku"],
        "support": "Priority Email"
      }
    },
    {
      "tier": "team",
      "name": "Team",
      "price": 49,
      "currency": "USD",
      "interval": "month",
      "features": {
        "dailyQueries": -1,
        "monthlyQueries": -1,
        "aiModels": ["GPT-4", "Claude Sonnet", "Gemini Pro"],
        "support": "24/7 Priority"
      }
    }
  ]
}
```

---

### Upgrade Subscription

**POST** `/subscriptions/upgrade`

🔒 **Requires Authentication**

Upgrade to a higher tier.

**Request Body**:
```json
{
  "tier": "pro",
  "paymentMethod": "dodo"
}
```

**Response** (200 OK):
```json
{
  "subscription": {
    "tier": "pro",
    "status": "active",
    "startDate": "2025-11-04T10:30:00Z",
    "nextBillingDate": "2025-12-04T10:30:00Z"
  },
  "payment": {
    "transactionId": "txn_12345",
    "amount": 19,
    "currency": "USD"
  }
}
```

---

### Cancel Subscription

**POST** `/subscriptions/cancel`

🔒 **Requires Authentication**

Cancel current subscription.

**Response** (200 OK):
```json
{
  "message": "Subscription cancelled",
  "effectiveDate": "2025-12-04T10:30:00Z",
  "note": "You'll have access until the end of your billing period"
}
```

---

### Get Usage Statistics

**GET** `/subscriptions/usage`

🔒 **Requires Authentication**

Get detailed usage statistics.

**Response** (200 OK):
```json
{
  "current": {
    "tier": "pro",
    "queriesToday": 12,
    "queriesThisMonth": 145,
    "remainingToday": 38,
    "remainingThisMonth": 355
  },
  "history": [
    {
      "date": "2025-11-01",
      "queries": 23
    },
    {
      "date": "2025-11-02",
      "queries": 31
    }
  ],
  "breakdown": {
    "byLanguage": {
      "javascript": 85,
      "python": 45,
      "java": 15
    },
    "byAI": {
      "openai": 120,
      "gemini": 25
    }
  }
}
```

---

## History & Analytics

### Get Dashboard Stats

**GET** `/history/stats`

🔒 **Requires Authentication**

Get dashboard statistics.

**Response** (200 OK):
```json
{
  "totalQueries": 150,
  "queriesThisMonth": 45,
  "mostUsedLanguage": "javascript",
  "averageResponseTime": 2.3,
  "successRate": 98.5,
  "topErrors": [
    {
      "type": "TypeError",
      "count": 45
    },
    {
      "type": "SyntaxError",
      "count": 30
    }
  ]
}
```

---

## Support & Feedback

### Submit Feedback

**POST** `/support/feedback`

🔒 **Requires Authentication**

Submit feedback or bug report.

**Request Body**:
```json
{
  "type": "bug",
  "subject": "Error analysis not working",
  "message": "When I submit JavaScript errors, I get timeout...",
  "priority": "high"
}
```

**Response** (201 Created):
```json
{
  "ticketId": "uuid",
  "message": "Feedback submitted successfully",
  "estimatedResponseTime": "24 hours"
}
```

---

### Contact Support

**POST** `/support/contact`

Send message to support team.

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Billing Question",
  "message": "I have a question about my invoice..."
}
```

**Response** (200 OK):
```json
{
  "message": "Your message has been sent",
  "ticketId": "uuid"
}
```

---

## Public Endpoints

### Health Check

**GET** `/health`

Check API health status.

**Response** (200 OK):
```json
{
  "status": "OK",
  "timestamp": "2025-11-04T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "ai": "operational"
  }
}
```

---

### Platform Statistics

**GET** `/stats?capabilities=true`

Get public platform statistics.

**Response** (200 OK):
```json
{
  "users": {
    "total": 1250,
    "verified": 1100,
    "active": 850
  },
  "queries": {
    "total": 15000,
    "today": 450,
    "thisMonth": 12000
  },
  "subscriptions": {
    "free": 1000,
    "pro": 200,
    "team": 50
  },
  "capabilities": {
    "aiModels": ["OpenAI GPT-4", "Google Gemini Pro", "Claude Sonnet"],
    "languages": 15,
    "features": ["URL Scraping", "Multi-Language", "Real-time Analysis"]
  }
}
```

---

### Public Demo

**POST** `/public/demo`

Try error analysis without authentication (limited).

**Request Body**:
```json
{
  "errorMessage": "TypeError: Cannot read property 'length' of undefined",
  "programmingLanguage": "javascript"
}
```

**Response** (200 OK):
```json
{
  "solution": "Basic solution here...",
  "note": "Sign up for detailed analysis and code examples"
}
```

**Rate Limit**: 5 requests per hour per IP

---

## Error Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created successfully |
| `400` | Bad request (invalid input) |
| `401` | Unauthorized (invalid or missing token) |
| `403` | Forbidden (no permission or quota exceeded) |
| `404` | Not found |
| `429` | Too many requests (rate limit exceeded) |
| `500` | Internal server error |
| `503` | Service unavailable |

### Error Response Format

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {
    "field": "email",
    "issue": "Invalid format"
  },
  "timestamp": "2025-11-04T10:30:00Z"
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API | 100 requests | 15 minutes |
| Auth endpoints | 5 requests | 15 minutes |
| OTP requests | 3 requests | 15 minutes |
| Public demo | 5 requests | 1 hour |
| Error analysis (Free) | 5 queries | 1 day |
| Error analysis (Pro) | 50 queries | 1 day |
| Error analysis (Team) | Unlimited | - |

---

## Pagination

All list endpoints support pagination:

**Query Parameters**:
- `page` (default: 1): Page number
- `limit` (default: 20): Items per page (max: 100)

**Response Format**:
```json
{
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 95,
    "itemsPerPage": 20,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## Webhooks

### Payment Webhook

**POST** `/webhooks/payment`

Receives payment notifications from Dodo Payments.

**Headers**:
```
X-Dodo-Signature: signature_here
```

**Payload**:
```json
{
  "event": "payment.success",
  "data": {
    "transactionId": "txn_12345",
    "userId": "uuid",
    "amount": 19,
    "currency": "USD",
    "subscriptionTier": "pro"
  }
}
```

---

## Testing

### Test Credentials

Use these credentials in development:

```
Email: test@errorwise.tech
Password: Test123!@#
```

### Postman Collection

Import our Postman collection: [Download](./postman_collection.json)

---

## Support

- **Email**: support@errorwise.tech
- **GitHub Issues**: [Report Bug](https://github.com/Getgingee/errorwise-backend/issues)
- **Documentation**: [Full Docs](https://docs.errorwise.tech)

---

**Last Updated**: November 4, 2025  
**API Version**: 1.0.0
