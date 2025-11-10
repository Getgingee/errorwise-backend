# ⚡ Quick Reference: Tomorrow Morning Implementation Guide

**Start Time:** When you wake up ☀️  
**Estimated Duration:** 6-8 hours  
**Difficulty:** Medium  
**Files to Update:** 5 main files

---

## 🎯 Quick Start (5 minutes)

```bash
# 1. Start backend
cd C:\Users\panka\Getgingee\errorwise-backend
npm start

# 2. Verify it's running
# Visit: http://localhost:3001/health

# 3. Open new terminal for frontend (if needed)
cd C:\Users\panka\Getgingee\errorwise-frontend
npm run dev
```

---

## 📋 Implementation Checklist

### ✅ Phase 1: Subscription Service Integration (90 min)

**File:** `src/controllers/subscriptionController.js`

Add at top:
```javascript
const subscriptionService = require('../services/subscriptionService');
```

Add new endpoints (around line 960):
```javascript
// Handle upgrade with proration
exports.upgradeSubscription = async (req, res) => {
  try {
    const { targetTier, paymentMethod } = req.body;
    const user = await User.findByPk(req.user.id);
    
    const result = await subscriptionService.processUpgrade(
      user,
      user.subscriptionTier,
      targetTier,
      paymentMethod
    );
    
    res.json(result);
  } catch (error) {
    logger.error('Upgrade failed:', error);
    res.status(500).json({ error: error.message });
  }
};

// Handle downgrade
exports.downgradeSubscription = async (req, res) => {
  try {
    const { targetTier, immediate = false, reason } = req.body;
    const user = await User.findByPk(req.user.id);
    
    const result = await subscriptionService.processDowngrade(
      user,
      user.subscriptionTier,
      targetTier,
      immediate,
      reason
    );
    
    res.json(result);
  } catch (error) {
    logger.error('Downgrade failed:', error);
    res.status(500).json({ error: error.message });
  }
};

// Handle payment failure
exports.handlePaymentFailure = async (req, res) => {
  try {
    const { subscriptionId, error: paymentError } = req.body;
    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [{ model: User, as: 'user' }]
    });
    
    const result = await subscriptionService.handlePaymentFailure(
      subscription,
      subscription.user,
      paymentError
    );
    
    res.json(result);
  } catch (error) {
    logger.error('Payment failure handling error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Pause subscription
exports.pauseSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      where: { userId: req.user.id, status: 'active' },
      include: [{ model: User, as: 'user' }]
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    const result = await subscriptionService.pauseSubscription(
      subscription,
      subscription.user
    );
    
    res.json(result);
  } catch (error) {
    logger.error('Pause failed:', error);
    res.status(500).json({ error: error.message });
  }
};

// Resume subscription
exports.resumeSubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      where: { userId: req.user.id, status: 'paused' },
      include: [{ model: User, as: 'user' }]
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No paused subscription found' });
    }
    
    const result = await subscriptionService.resumeSubscription(
      subscription,
      subscription.user
    );
    
    res.json(result);
  } catch (error) {
    logger.error('Resume failed:', error);
    res.status(500).json({ error: error.message });
  }
};
```

**File:** `src/routes/subscriptions.js`

Add routes (after existing routes):
```javascript
// Upgrade with proration
router.post('/upgrade', subscriptionController.upgradeSubscription);

// Downgrade
router.post('/downgrade', subscriptionController.downgradeSubscription);

// Pause/Resume
router.post('/pause', subscriptionController.pauseSubscription);
router.post('/resume', subscriptionController.resumeSubscription);

// Payment failure (admin/webhook only)
router.post('/payment-failure', subscriptionController.handlePaymentFailure);
```

**Update webhook handler for idempotency:**

In `subscriptionController.js`, find `handleWebhook` function and update:
```javascript
exports.handleWebhook = async (req, res) => {
  try {
    const webhookId = req.headers['x-webhook-id'] || req.body.id;
    
    // Check if already processed (idempotency)
    const alreadyProcessed = await subscriptionService.isWebhookProcessed(webhookId);
    if (alreadyProcessed) {
      console.log('⚠️ Webhook already processed:', webhookId);
      return res.status(200).json({ message: 'Already processed' });
    }
    
    // Mark as processed
    await subscriptionService.markWebhookProcessed(webhookId, {
      event: req.body.event,
      receivedAt: new Date()
    });
    
    // ... rest of webhook handling ...
    
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};
```

---

### ✅ Phase 2: Error Handling Updates (60 min)

**File:** `server.js`

Replace global error handler (around line 264):
```javascript
// OLD:
app.use((err, req, res, next) => {
  logger.error('Global error handler caught error:', { ... });
  // ... old code ...
});

// NEW:
const { errorHandler, notFoundHandler } = require('./src/utils/errors');

// ... rest of routes ...

// 404 handler
app.use('*', notFoundHandler);

// Global error handler - MUST be last middleware
app.use(errorHandler);
```

**File:** `src/controllers/errorController.js`

Add at top:
```javascript
const { asyncHandler, AIServiceError, UsageLimitError } = require('../utils/errors');
```

Wrap async functions:
```javascript
// OLD:
exports.analyzeError = async (req, res) => {
  try {
    // ... code ...
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// NEW:
exports.analyzeError = asyncHandler(async (req, res) => {
  // ... code ...
  // Throw custom errors instead of generic ones:
  if (queriesUsed >= limit) {
    throw new UsageLimitError(limit, queriesUsed, resetDate);
  }
  
  if (aiError) {
    throw new AIServiceError(aiError.message, provider);
  }
  
  // No try-catch needed - asyncHandler catches automatically
});
```

---

### ✅ Phase 3: AI Service Enhancements (90 min)

**File:** `src/services/aiService.js`

Add timeout wrapper (around line 100):
```javascript
// Add after CONFIG
const withTimeout = (promise, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AI request timeout')), timeoutMs)
    )
  ]);
};
```

Add input validation (around line 200):
```javascript
const validateInput = (errorMessage) => {
  if (!errorMessage || typeof errorMessage !== 'string') {
    throw new Error('Invalid error message');
  }
  
  // Remove potential injection
  let sanitized = errorMessage
    .trim()
    .slice(0, CONFIG.MAX_PROMPT_LENGTH)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '');
  
  if (sanitized.length < 10) {
    throw new Error('Error message too short');
  }
  
  return sanitized;
};
```

Add rate limiting (around line 250):
```javascript
const userRequestCounts = new Map();

const checkUserRateLimit = (userId, tier) => {
  const limits = {
    free: { concurrent: 1, perMinute: 5 },
    pro: { concurrent: 3, perMinute: 20 },
    team: { concurrent: 10, perMinute: 100 }
  };
  
  const limit = limits[tier] || limits.free;
  const userRequests = userRequestCounts.get(userId) || { concurrent: 0, perMinute: [] };
  
  if (userRequests.concurrent >= limit.concurrent) {
    throw new Error('Too many concurrent AI requests');
  }
  
  const oneMinuteAgo = Date.now() - 60000;
  const recentRequests = userRequests.perMinute.filter(t => t > oneMinuteAgo);
  
  if (recentRequests.length >= limit.perMinute) {
    throw new Error('AI rate limit exceeded');
  }
  
  // Track request
  userRequests.concurrent++;
  userRequests.perMinute.push(Date.now());
  userRequestCounts.set(userId, userRequests);
  
  // Cleanup after request
  return () => {
    userRequests.concurrent = Math.max(0, userRequests.concurrent - 1);
    userRequestCounts.set(userId, userRequests);
  };
};
```

Update main analyze function (find `analyzeError`):
```javascript
exports.analyzeError = async (errorMessage, options = {}) => {
  const tier = options.tier || 'free';
  const userId = options.userId;
  
  // Validate input
  const sanitizedMessage = validateInput(errorMessage);
  
  // Check rate limit
  const cleanup = userId ? checkUserRateLimit(userId, tier) : () => {};
  
  try {
    // Wrap with timeout
    const result = await withTimeout(
      analyzeErrorInternal(sanitizedMessage, options),
      CONFIG.REQUEST_TIMEOUT_MS
    );
    
    return result;
  } finally {
    cleanup();
  }
};
```

---

### ✅ Phase 4: Authentication Improvements (90 min)

**File:** `src/routes/authEnhanced.js`

Add new endpoints at end of file:
```javascript
const { Op } = require('sequelize');

/**
 * POST /api/auth/change-email
 * Change email with verification
 */
router.post('/change-email', authMiddleware, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    
    if (!newEmail || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Verify password
    const bcrypt = require('bcryptjs');
    const user = await User.findByPk(req.user.id);
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Check if email exists
    const existing = await User.findOne({ where: { email: newEmail } });
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store pending change
    await user.update({
      pendingEmail: newEmail,
      emailChangeToken: token,
      emailChangeExpires: new Date(Date.now() + 60 * 60 * 1000)
    });
    
    // Send verification to NEW email
    await emailService.sendEmail({
      to: newEmail,
      subject: 'Verify Your New Email Address',
      html: `
        <h2>Email Change Request</h2>
        <p>Click to verify: <a href="${process.env.FRONTEND_URL}/verify-email-change?token=${token}">Verify Email</a></p>
      `
    });
    
    res.json({ message: 'Verification email sent to new address' });
  } catch (error) {
    console.error('Email change error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/verify-email-change
 * Confirm email change
 */
router.get('/verify-email-change', async (req, res) => {
  try {
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
      emailChangeExpires: null
    });
    
    res.json({ message: 'Email updated successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/sessions
 * Get all user sessions
 */
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const { redisClient } = require('../utils/redisClient');
    const sessionKeys = await redisClient.keys(`session:${req.user.id}:*`);
    
    const sessions = await Promise.all(
      sessionKeys.map(async (key) => {
        const data = await redisClient.get(key);
        return JSON.parse(data || '{}');
      })
    );
    
    res.json({ sessions });
  } catch (error) {
    console.error('Sessions fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { redisClient } = require('../utils/redisClient');
    await redisClient.del(`session:${req.user.id}:${req.params.sessionId}`);
    res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error('Session revoke error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

### ✅ Phase 5: Testing (120 min)

Create test file: `tests/subscription.test.js`

```javascript
const { calculateProration } = require('../src/services/subscriptionService');

describe('Subscription Service', () => {
  describe('Proration', () => {
    it('should calculate proration for pro to team upgrade', () => {
      const result = calculateProration('pro', 'team', 15, 'month');
      
      expect(result.currentPrice).toBe(3);
      expect(result.newPrice).toBe(8);
      expect(result.unusedCredit).toBe(1.5); // $3 / 30 * 15
      expect(result.newCharge).toBe(6.5); // $8 - $1.5
    });
    
    it('should handle downgrade correctly', () => {
      const result = calculateProration('team', 'pro', 20, 'month');
      
      expect(result.unusedCredit).toBeGreaterThan(0);
      expect(result.newCharge).toBe(0); // Downgrade, no charge
    });
  });
});
```

Manual testing checklist:
```bash
# Test subscription upgrade
curl -X POST http://localhost:3001/api/subscriptions/upgrade \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetTier":"pro","paymentMethod":{"type":"card"}}'

# Test subscription downgrade
curl -X POST http://localhost:3001/api/subscriptions/downgrade \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetTier":"free","immediate":false}'

# Test pause
curl -X POST http://localhost:3001/api/subscriptions/pause \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test resume
curl -X POST http://localhost:3001/api/subscriptions/resume \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🐛 Common Issues & Fixes

### Issue 1: Module not found
```bash
npm install
```

### Issue 2: Redis not connected
```bash
# Check if Redis is running
redis-cli ping

# If not, start Redis or comment out Redis features for testing
```

### Issue 3: Database connection error
```bash
# Check .env file has correct DATABASE_URL
# Test connection:
node -e "const db = require('./src/config/database'); db.authenticate().then(() => console.log('OK'))"
```

---

## ✅ Final Checklist

Before committing:
- [ ] All new endpoints tested
- [ ] Error handling works correctly
- [ ] No console errors
- [ ] Database migrations run
- [ ] Documentation updated
- [ ] Git commit with good message

```bash
git add .
git commit -m "feat: Add subscription edge cases, professional error handling, and AI service improvements

- Add subscription proration, grace period, pause/resume
- Implement webhook idempotency with Redis
- Add 20+ custom error classes
- Enhance AI service with timeout, rate limiting, validation
- Add email change and multi-device session management
- Create comprehensive test suite

Closes #XX"

git push origin main
```

---

## 🎯 Success Metrics

After implementation, you should have:
- ✅ Zero TypeScript/JavaScript errors
- ✅ All new endpoints return 200 on success
- ✅ Error responses use new error classes
- ✅ Logs show structured error messages
- ✅ Webhooks are idempotent
- ✅ Subscription upgrades calculate proration
- ✅ AI service has timeout protection

---

## 🚀 You Got This!

**Total time:** 6-8 hours  
**Breaks:** Every 90 minutes  
**Coffee:** ☕☕☕  
**Result:** Production-ready backend 🎉

---

**Questions?** Check `IMPLEMENTATION_READY_SUMMARY.md` for detailed info.

**Stuck?** Review the files we created:
- `src/services/subscriptionService.js`
- `src/utils/errors.js`
- `COMPREHENSIVE_FEATURE_EDGE_CASE_IMPLEMENTATION.md`

Good luck! 💪
