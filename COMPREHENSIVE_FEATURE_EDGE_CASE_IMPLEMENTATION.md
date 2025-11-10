# 🚀 Comprehensive Feature & Edge Case Implementation Plan

**Date:** November 10, 2025  
**Project:** ErrorWise Backend & Frontend Integration  
**Goal:** Make both repos feature-complete with all edge cases covered following modern best practices

---

## 📊 Current State Analysis

### ✅ Backend Features Implemented

#### Authentication System
- ✅ Basic auth (register, login, logout)
- ✅ Enhanced auth with OTP login
- ✅ Email verification
- ✅ Password reset via email token
- ✅ Phone verification (OTP)
- ✅ Account lockout protection
- ✅ Session management (Redis)
- ✅ JWT token refresh
- ✅ User tracking (abuse prevention)

#### Subscription System
- ✅ Three tiers (Free, Pro, Team)
- ✅ Subscription endpoints (get, create, cancel, upgrade)
- ✅ Usage tracking
- ✅ DodoPayments integration
- ✅ Webhook handling
- ✅ Billing information
- ✅ Subscription history

#### AI Service
- ✅ Three-tier AI models (Gemini Free, Claude Haiku Pro, Claude Sonnet Team)
- ✅ Error analysis
- ✅ Code examples
- ✅ URL scraping (Pro/Team)
- ✅ Conversation history (Team)
- ✅ Batch analysis (Team)

#### Team Features
- ✅ Team creation
- ✅ Member invitation
- ✅ Error sharing
- ✅ Team dashboard
- ✅ Video chat (start/end)

#### Support System
- ✅ Feedback submission
- ✅ Contact messages
- ✅ Help center articles
- ✅ Newsletter subscription
- ✅ Help ticket system

#### Security & Middleware
- ✅ Rate limiting (tier-based)
- ✅ CORS configuration
- ✅ Input sanitization
- ✅ Spam detection
- ✅ Honeypot protection
- ✅ Tab abuse prevention
- ✅ Request flooding protection
- ✅ Duplicate request prevention
- ✅ Suspicious behavior detection

---

## ❌ Missing Features & Edge Cases

### 1. Subscription Flow Edge Cases

#### Missing Edge Cases:
- ❌ Payment failure handling & retry logic
- ❌ Expired subscription grace period
- ❌ Upgrade during active subscription (proration)
- ❌ Downgrade immediate vs end-of-period
- ❌ Concurrent subscription modification prevention
- ❌ Webhook retry mechanism (idempotency)
- ❌ Failed webhook handling (manual reconciliation)
- ❌ Subscription cancellation with refund
- ❌ Trial expiration handling
- ❌ Usage limit exceeded notifications
- ❌ Payment method update
- ❌ Invoice generation & retrieval
- ❌ Subscription pause/resume
- ❌ Failed payment dunning (retry emails)

#### Required Implementations:

**File: `src/controllers/subscriptionController.js`**
```javascript
// Add these functions:

exports.handlePaymentFailure = async (req, res) => {
  // Send email notification
  // Update subscription status to 'payment_failed'
  // Schedule retry attempts (1 day, 3 days, 7 days)
  // Downgrade after final failure
};

exports.handleUpgradeWithProration = async (req, res) => {
  // Calculate prorated amount
  // Charge difference immediately
  // Update tier instantly
  // Extend end date appropriately
};

exports.handleDowngrade = async (req, res) => {
  // Option 1: End of period (default)
  // Option 2: Immediate with partial refund
  // Schedule downgrade for end date
  // Notify user of change
};

exports.pauseSubscription = async (req, res) => {
  // Pause billing
  // Maintain access until end of paid period
  // Set resume date
};

exports.resumeSubscription = async (req, res) => {
  // Reactivate billing
  // Calculate next billing date
  // Restore full access
};

exports.updatePaymentMethod = async (req, res) => {
  // Update DodoPayments payment method
  // Send confirmation email
  // Retry failed payments if any
};

exports.retryFailedPayment = async (req, res) => {
  // Manually retry payment
  // Update status if successful
  // Send receipt
};
```

**File: `src/services/subscriptionService.js`** (Create new)
```javascript
// Idempotency handling
const processedWebhooks = new Map();

exports.isWebhookProcessed = (webhookId) => {
  return processedWebhooks.has(webhookId);
};

exports.markWebhookProcessed = (webhookId) => {
  processedWebhooks.set(webhookId, {
    processedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  });
};

// Webhook retry with exponential backoff
exports.retryWebhook = async (webhookData, attempt = 1) => {
  const maxAttempts = 5;
  const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000);
  
  if (attempt > maxAttempts) {
    await logFailedWebhook(webhookData);
    await alertAdmin(webhookData);
    return;
  }
  
  setTimeout(async () => {
    try {
      await processWebhook(webhookData);
    } catch (error) {
      await retryWebhook(webhookData, attempt + 1);
    }
  }, backoffMs);
};

// Proration calculation
exports.calculateProration = (currentTier, newTier, daysRemaining, billingPeriod) => {
  const currentPrice = TIER_PRICES[currentTier];
  const newPrice = TIER_PRICES[newTier];
  const daysInPeriod = billingPeriod === 'year' ? 365 : 30;
  
  const unusedCredit = (currentPrice / daysInPeriod) * daysRemaining;
  const newCharge = newPrice - unusedCredit;
  
  return {
    unusedCredit,
    newCharge: Math.max(0, newCharge),
    effectiveDate: new Date(),
    nextBillingDate: calculateNextBilling(newTier, billingPeriod)
  };
};

// Grace period management
exports.applyGracePeriod = async (subscription) => {
  const gracePeriodDays = 3; // 3-day grace period
  const gracePeriodEnd = new Date(subscription.endDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);
  
  await subscription.update({
    status: 'grace_period',
    gracePeriodEndsAt: gracePeriodEnd
  });
  
  await sendGracePeriodEmail(subscription.user);
};
```

---

### 2. AI Service Edge Cases

#### Missing Edge Cases:
- ❌ AI API timeout handling
- ❌ AI API rate limit exceeded
- ❌ Invalid/malformed error messages
- ❌ Extremely long error messages (>8000 chars)
- ❌ Non-English error messages
- ❌ Concurrent request limiting
- ❌ Token limit exceeded handling
- ❌ AI response validation
- ❌ Fallback when all providers fail
- ❌ Cost tracking per request
- ❌ AI response caching optimization
- ❌ Streaming responses for long analyses

#### Required Implementations:

**File: `src/services/aiService.js`**
```javascript
// Add timeout wrapper
exports.analyzeWithTimeout = async (errorMessage, options, timeoutMs = 30000) => {
  return Promise.race([
    analyzeError(errorMessage, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI request timeout')), timeoutMs)
    )
  ]);
};

// Add rate limit handler
const userRequestCounts = new Map();

exports.checkAIRateLimit = (userId, tier) => {
  const limits = {
    free: { concurrent: 1, perMinute: 5 },
    pro: { concurrent: 3, perMinute: 20 },
    team: { concurrent: 10, perMinute: 100 }
  };
  
  const limit = limits[tier];
  const userRequests = userRequestCounts.get(userId) || { concurrent: 0, perMinute: [] };
  
  // Check concurrent
  if (userRequests.concurrent >= limit.concurrent) {
    throw new Error('Too many concurrent AI requests');
  }
  
  // Check per-minute
  const oneMinuteAgo = Date.now() - 60000;
  const recentRequests = userRequests.perMinute.filter(t => t > oneMinuteAgo);
  
  if (recentRequests.length >= limit.perMinute) {
    throw new Error('AI rate limit exceeded. Please try again in a minute.');
  }
  
  return true;
};

// Input validation and sanitization
exports.validateAndSanitizeInput = (errorMessage) => {
  if (!errorMessage || typeof errorMessage !== 'string') {
    throw new Error('Invalid error message');
  }
  
  // Trim and limit length
  let sanitized = errorMessage.trim().slice(0, CONFIG.MAX_PROMPT_LENGTH);
  
  // Remove potential injection attacks
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Check for minimum meaningful content
  if (sanitized.length < 10) {
    throw new Error('Error message too short');
  }
  
  return sanitized;
};

// Response validation
exports.validateAIResponse = (response) => {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid AI response format');
  }
  
  const required = ['explanation', 'solution'];
  for (const field of required) {
    if (!response[field] || response[field].length < 50) {
      throw new Error(`AI response missing or too short: ${field}`);
    }
  }
  
  return true;
};

// Multi-provider fallback chain
exports.analyzeWithFallback = async (errorMessage, tier) => {
  const providers = getProvidersForTier(tier); // Returns ['anthropic', 'gemini', 'mock']
  
  for (const provider of providers) {
    try {
      console.log(`Attempting analysis with ${provider}...`);
      const result = await analyzeWithProvider(errorMessage, provider, tier);
      
      if (validateAIResponse(result)) {
        return { ...result, provider, fallbackUsed: provider !== providers[0] };
      }
    } catch (error) {
      console.error(`${provider} failed:`, error.message);
      continue; // Try next provider
    }
  }
  
  throw new Error('All AI providers failed');
};

// Cost tracking
const costTracking = {
  daily: new Map(),
  monthly: new Map()
};

exports.trackAICost = (userId, tier, tokensUsed) => {
  const costs = {
    'gemini-2.0-flash-exp': 0, // Free
    'claude-3-haiku-20240307': tokensUsed * 0.00025 / 1000,
    'claude-3-5-sonnet-20241022': tokensUsed * 0.003 / 1000
  };
  
  const model = getTierModel(tier);
  const cost = costs[model] || 0;
  
  // Track daily
  const today = new Date().toISOString().split('T')[0];
  const dailyCost = costTracking.daily.get(today) || 0;
  costTracking.daily.set(today, dailyCost + cost);
  
  return cost;
};
```

---

### 3. Authentication Edge Cases

#### Missing Edge Cases:
- ❌ Email change verification (send verification to new email)
- ❌ Password change requires current password
- ❌ Multi-device session management
- ❌ Suspicious login detection (new device/location)
- ❌ Account deletion confirmation (email with restore link)
- ❌ Account restoration after soft delete
- ❌ Email bounce handling
- ❌ OTP brute force prevention
- ❌ Session hijacking detection
- ❌ Two-factor authentication (TOTP)

#### Required Implementations:

**File: `src/routes/authEnhanced.js`**
```javascript
// Add change email endpoint
router.post('/change-email', authMiddleware, async (req, res) => {
  const { newEmail, password } = req.body;
  
  // Verify current password
  const bcrypt = require('bcryptjs');
  const isValid = await bcrypt.compare(password, req.user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  // Check if email already exists
  const existing = await User.findOne({ where: { email: newEmail } });
  if (existing) {
    return res.status(400).json({ error: 'Email already in use' });
  }
  
  // Generate verification token
  const token = crypto.randomBytes(32).toString('hex');
  
  // Store pending email change
  await req.user.update({
    pendingEmail: newEmail,
    emailChangeToken: token,
    emailChangeExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  });
  
  // Send verification to NEW email
  await emailService.sendEmailChangeVerification(newEmail, token);
  
  res.json({ message: 'Verification email sent to new address' });
});

router.get('/verify-email-change', async (req, res) => {
  const { token } = req.query;
  
  const user = await User.findOne({
    where: {
      emailChangeToken: token,
      emailChangeExpires: { [Op.gt]: new Date() }
    }
  });
  
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
  
  await user.update({
    email: user.pendingEmail,
    pendingEmail: null,
    emailChangeToken: null,
    emailChangeExpires: null,
    isEmailVerified: true
  });
  
  res.json({ message: 'Email updated successfully' });
});

// Session management
router.get('/sessions', authMiddleware, async (req, res) => {
  const { redisClient } = require('../utils/redisClient');
  const sessions = await redisClient.keys(`session:${req.user.id}:*`);
  
  const sessionData = await Promise.all(
    sessions.map(async (key) => {
      const data = await redisClient.get(key);
      return JSON.parse(data);
    })
  );
  
  res.json({ sessions: sessionData });
});

router.delete('/sessions/:sessionId', authMiddleware, async (req, res) => {
  const { redisClient } = require('../utils/redisClient');
  await redisClient.del(`session:${req.user.id}:${req.params.sessionId}`);
  res.json({ message: 'Session revoked' });
});

// Suspicious login detection
router.post('/login/verify-device', async (req, res) => {
  const { email, deviceId, location } = req.body;
  
  const user = await User.findOne({ where: { email } });
  const knownDevices = user.knownDevices || [];
  
  if (!knownDevices.includes(deviceId)) {
    // Send email alert
    await emailService.sendNewDeviceAlert(email, location);
    
    return res.json({
      requiresVerification: true,
      message: 'New device detected. Please check your email.'
    });
  }
  
  res.json({ requiresVerification: false });
});

// Account deletion with restore
router.delete('/account/delete', authMiddleware, async (req, res) => {
  const { password, reason } = req.body;
  
  // Verify password
  const isValid = await bcrypt.compare(password, req.user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  // Generate restore token (valid for 30 days)
  const restoreToken = crypto.randomBytes(32).toString('hex');
  
  await req.user.update({
    deletedAt: new Date(),
    deletionReason: reason,
    restoreToken,
    restoreTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  });
  
  // Send confirmation email with restore link
  await emailService.sendAccountDeletionConfirmation(
    req.user.email,
    restoreToken
  );
  
  res.json({
    message: 'Account scheduled for deletion',
    restorePeriod: '30 days',
    restoreLink: `${process.env.FRONTEND_URL}/restore-account?token=${restoreToken}`
  });
});

router.post('/account/restore', async (req, res) => {
  const { token } = req.body;
  
  const user = await User.findOne({
    where: {
      restoreToken: token,
      restoreTokenExpires: { [Op.gt]: new Date() },
      deletedAt: { [Op.not]: null }
    }
  });
  
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired restore link' });
  }
  
  await user.update({
    deletedAt: null,
    deletionReason: null,
    restoreToken: null,
    restoreTokenExpires: null
  });
  
  res.json({ message: 'Account restored successfully' });
});
```

---

### 4. Error Analysis Service Edge Cases

#### Missing Edge Cases:
- ❌ Duplicate error detection (cache recent)
- ❌ Language detection for error messages
- ❌ Code language detection
- ❌ Invalid/corrupted code snippet handling
- ❌ Context-aware analysis (file/project type)
- ❌ Error categorization accuracy tracking
- ❌ User feedback on AI responses
- ❌ Learning from corrections
- ❌ Batch error analysis queue
- ❌ Export history with filtering

---

### 5. Team Features Edge Cases

#### Missing Edge Cases:
- ❌ Team member role permissions (owner, admin, member)
- ❌ Invite expiration (7 days)
- ❌ Maximum team member limit enforcement
- ❌ Team deletion requires confirmation
- ❌ Transfer team ownership
- ❌ Team activity audit log
- ❌ Team usage quota sharing
- ❌ Shared error analytics
- ❌ Video chat connection failure handling

---

### 6. Payment & Billing Edge Cases

#### Missing Edge Cases:
- ❌ Multiple payment methods support
- ❌ Payment method verification
- ❌ Invoice PDF generation
- ❌ Tax calculation (VAT, sales tax)
- ❌ Billing address validation
- ❌ Coupon/promo code system
- ❌ Referral program
- ❌ Credits system
- ❌ Refund processing
- ❌ Chargeback handling

---

## 🏗️ Implementation Priority

### Phase 1: Critical Edge Cases (Days 1-2)
1. Subscription payment failure handling
2. AI service timeout & fallback
3. Webhook idempotency
4. Session hijacking prevention
5. Usage limit notifications

### Phase 2: Important Edge Cases (Days 3-4)
1. Upgrade/downgrade with proration
2. Email change verification
3. Multi-device session management
4. AI rate limiting per user
5. Team role permissions

### Phase 3: Nice-to-Have Edge Cases (Days 5-7)
1. Account restoration
2. Invoice generation
3. Referral program
4. AI cost tracking
5. Team analytics

---

## 📝 Modern Best Practices to Apply

### 1. Error Handling
```javascript
// Use custom error classes
class SubscriptionError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error(err);
  
  if (err instanceof SubscriptionError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});
```

### 2. Validation
```javascript
// Use Joi for request validation
const Joi = require('joi');

const subscriptionUpgradeSchema = Joi.object({
  targetTier: Joi.string().valid('free', 'pro', 'team').required(),
  paymentMethod: Joi.object({
    type: Joi.string().required(),
    token: Joi.string().required()
  }).required(),
  billingPeriod: Joi.string().valid('month', 'year').default('month')
});

router.post('/upgrade', validate(subscriptionUpgradeSchema), controller.upgrade);
```

### 3. Logging
```javascript
// Structured logging with context
logger.info('Subscription upgrade', {
  userId: user.id,
  fromTier: user.subscriptionTier,
  toTier: targetTier,
  amount: cost,
  requestId: req.id
});
```

### 4. Testing
```javascript
// Unit tests for edge cases
describe('Subscription Upgrade', () => {
  it('should calculate proration correctly', () => {
    const result = calculateProration('pro', 'team', 15, 'month');
    expect(result.unusedCredit).toBe(1.5);
    expect(result.newCharge).toBe(6.5);
  });
  
  it('should handle payment failure gracefully', async () => {
    await expect(processUpgrade(failingPayment)).rejects.toThrow('Payment failed');
    expect(user.subscriptionTier).toBe('pro'); // Should not change
  });
});
```

### 5. Database Transactions
```javascript
// Use transactions for atomic operations
const sequelize = require('../config/database');

exports.upgradeSubscription = async (userId, targetTier) => {
  const t = await sequelize.transaction();
  
  try {
    // Update user tier
    await User.update(
      { subscriptionTier: targetTier },
      { where: { id: userId }, transaction: t }
    );
    
    // Create subscription record
    await Subscription.create({
      userId,
      tier: targetTier,
      status: 'active'
    }, { transaction: t });
    
    // Process payment
    await processPayment(userId, targetTier, t);
    
    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }
};
```

### 6. Caching Strategy
```javascript
// Cache frequently accessed data
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

exports.getSubscriptionPlans = async () => {
  const cacheKey = 'subscription:plans';
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Fetch from database
  const plans = await SubscriptionPlan.findAll();
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(plans));
  
  return plans;
};
```

### 7. API Rate Limiting
```javascript
// Implement sliding window rate limiting
const rateLimit = require('express-rate-limit');

const createRateLimiter = (tier) => {
  const limits = {
    free: { windowMs: 15 * 60 * 1000, max: 50 },
    pro: { windowMs: 15 * 60 * 1000, max: 500 },
    team: { windowMs: 15 * 60 * 1000, max: 5000 }
  };
  
  return rateLimit(limits[tier]);
};
```

---

## 🧪 Testing Checklist

### Subscription Flow Tests
- [ ] Payment success flow
- [ ] Payment failure with retry
- [ ] Upgrade with proration
- [ ] Downgrade immediate vs end-of-period
- [ ] Trial expiration
- [ ] Webhook idempotency
- [ ] Concurrent modification prevention
- [ ] Expired subscription grace period

### AI Service Tests
- [ ] Timeout handling
- [ ] Rate limit per user
- [ ] Invalid input handling
- [ ] All providers fail scenario
- [ ] Token limit exceeded
- [ ] Response validation
- [ ] Caching effectiveness

### Authentication Tests
- [ ] Email change flow
- [ ] Multi-device sessions
- [ ] Suspicious login detection
- [ ] Account deletion & restore
- [ ] OTP brute force prevention
- [ ] Session hijacking detection

---

## 📦 Deliverables

1. **Backend**: All edge cases implemented with tests
2. **Frontend**: Components updated to handle all edge cases
3. **Documentation**: API docs updated with error codes
4. **Tests**: 80%+ code coverage
5. **Deployment**: Staging environment ready
6. **Monitoring**: Error tracking & alerting configured

---

## 🎯 Success Criteria

- ✅ Zero critical bugs in production
- ✅ <1% payment failure rate
- ✅ 99.9% uptime
- ✅ <500ms API response time (p95)
- ✅ All user flows work on first try
- ✅ Comprehensive error messages for users
- ✅ Full audit trail for financial transactions

---

**Next Steps:**
1. Review this document
2. Approve implementation plan
3. Start Phase 1 implementation
4. Deploy to staging
5. QA testing
6. Production deployment
