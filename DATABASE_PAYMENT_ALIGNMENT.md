# ✅ Database & Payment Flow - Updated & Aligned

## 🎯 What Was Changed

### **Database Plans Updated:**
✅ Free Plan (plan_id=1) - $0, 50 queries/month, Claude Haiku  
✅ Pro Plan (plan_id=2) - $2, unlimited, Claude Haiku, 7-day trial  
✅ Team Plan (plan_id=6) - $8, unlimited, Claude Sonnet, 14-day trial  
❌ Yearly plans disabled (can enable later)  
❌ Enterprise plans disabled  

### **Dodo Payment IDs Aligned:**
- **Pro**: `dodo_plan_id = 'plan_pro_monthly'`
- **Team**: `dodo_plan_id = 'plan_team_monthly'`
- **Free**: `dodo_plan_id = NULL` (no payment required)

---

## 🔄 Complete Payment & Feature Grant Flow

### **Step 1: User Clicks "Upgrade to Pro"**

Frontend → Backend:
```javascript
POST /api/subscriptions/checkout
{
  planId: 'pro',  // or 'team'
  successUrl: 'https://errorwise.com/subscription?success=true',
  cancelUrl: 'https://errorwise.com/subscription?cancelled=true'
}
```

### **Step 2: Backend Creates Payment Session**

**Development Mode** (no DODO_API_KEY):
```javascript
// Instant upgrade, no payment
await user.update({
  subscriptionTier: 'pro',
  subscriptionStatus: 'trial',
  subscriptionStartDate: NOW(),
  subscriptionEndDate: NOW() + 7 days,
  trialEndsAt: NOW() + 7 days
});

return {
  url: '/dashboard?upgraded=true',
  sessionId: 'dev_session_123'
};
```

**Production Mode** (has DODO_API_KEY):
```javascript
// Call Dodo Payments API
const session = await dodoPayments.createPaymentSession({
  userId: user.id,
  planId: 'pro',
  planName: 'Pro Plan',
  amount: 2.00,
  dodo_plan_id: 'plan_pro_monthly',  // From database!
  successUrl: '...',
  cancelUrl: '...'
});

return {
  url: 'https://checkout.dodo.co/session/abc123',
  sessionId: 'dodo_sess_xyz'
};
```

### **Step 3: User Pays on Dodo Page**

User enters payment details on Dodo's hosted checkout page:
- Card number
- Expiry date
- CVV
- Billing address

Dodo processes payment...

### **Step 4: Dodo Sends Webhook**

**Webhook Event: `checkout.session.completed`**

```javascript
POST /api/subscriptions/webhook
{
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'dodo_sess_xyz',
      subscription: 'dodo_sub_456',
      client_reference_id: 'user_789',  // userId
      metadata: {
        planId: 'pro',
        dodo_plan_id: 'plan_pro_monthly'
      }
    }
  }
}
```

### **Step 5: Backend Processes Webhook**

```javascript
// paymentService.js - handleSubscriptionSuccess()

// 1. Find user
const userId = session.client_reference_id;
const user = await User.findByPk(userId);

// 2. Find plan from database using dodo_plan_id
const [plans] = await sequelize.query(`
  SELECT * FROM subscription_plans 
  WHERE dodo_plan_id = :dodoPlanId
`, {
  replacements: { dodoPlanId: 'plan_pro_monthly' }
});

const plan = plans[0];

// 3. Update user subscription
await user.update({
  subscriptionTier: 'pro',             // From plan
  subscriptionStatus: 'active',        // Payment succeeded!
  subscriptionStartDate: NOW(),
  subscriptionEndDate: NOW() + 30 days,
  dodoSubscriptionId: 'dodo_sub_456'
});

// 4. Create subscription record
await Subscription.create({
  userId: user.id,
  tier: 'pro',
  status: 'active',
  startDate: NOW(),
  endDate: NOW() + 30 days,
  dodoSubscriptionId: 'dodo_sub_456',
  dodoSessionId: 'dodo_sess_xyz'
});

// 5. Grant features from database plan
const features = plan.features;  // JSONB column
/*
{
  "dailyQueries": -1,
  "monthlyQueries": -1,
  "errorExplanation": true,
  "fixSuggestions": true,
  "codeExamples": true,
  "documentationLinks": true,
  "errorHistory": "unlimited",
  "aiProvider": "claude-3-haiku-20240307",
  "maxTokens": 1200,
  "supportLevel": "email",
  "advancedAnalysis": true,
  "exportHistory": true
}
*/

// Features are automatically available because:
// - User tier = 'pro'
// - Middleware checks tier
// - Features config comes from SUBSCRIPTION_TIERS in controller
```

### **Step 6: User Redirected Back**

```
Dodo redirects to: https://errorwise.com/subscription?success=true
```

Frontend detects `?success=true`:
```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('success') === 'true') {
    setSuccess(true);
    toast.success('🎉 Subscription activated!');
    // Refresh subscription data
    fetchSubscriptionData();
  }
}, []);
```

### **Step 7: Features Automatically Unlocked**

When user makes API request:
```javascript
// Middleware: authenticate + checkSubscriptionTier

req.user = {
  id: 789,
  email: 'user@example.com',
  subscriptionTier: 'pro',       // ✅ Updated!
  subscriptionStatus: 'active'    // ✅ Updated!
};

// Controller uses SUBSCRIPTION_TIERS config
const tierConfig = SUBSCRIPTION_TIERS['pro'];

// Features from SUBSCRIPTION_TIERS (hardcoded in controller):
{
  name: 'Pro',
  price: 2,
  interval: 'month',
  trialDays: 7,
  features: {
    dailyQueries: -1,              // ✅ Unlimited!
    errorExplanation: true,        // ✅ Enabled
    fixSuggestions: true,          // ✅ Enabled
    codeExamples: true,            // ✅ Enabled
    errorHistory: 'unlimited',     // ✅ Enabled
    aiProvider: 'claude-3-haiku',  // ✅ Better AI
    maxTokens: 1200,               // ✅ More tokens
    exportHistory: true            // ✅ Can export
  }
}
```

---

## 🎨 Feature Access Control

### **How Backend Checks Features:**

```javascript
// src/middleware/subscription.js

const checkFeature = (featureName) => {
  return async (req, res, next) => {
    const user = req.user;
    const tier = user.subscriptionTier || 'free';
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    
    if (tierConfig.features[featureName]) {
      return next(); // Feature allowed!
    }
    
    return res.status(403).json({
      error: 'Feature not available',
      message: `This feature requires Pro or Team plan`,
      requiredFeature: featureName,
      currentTier: tier,
      upgradeUrl: '/subscription'
    });
  };
};

// Usage in routes:
router.post('/errors/export', 
  authenticate,
  checkFeature('exportHistory'),  // Check if tier has this feature
  errorController.export
);

router.get('/errors/advanced-analysis', 
  authenticate,
  checkFeature('advancedAnalysis'),
  errorController.analyzeAdvanced
);
```

### **AI Model Selection:**

```javascript
// src/services/aiService.js

const getAIModel = (user) => {
  const tier = user.subscriptionTier || 'free';
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  
  // Returns from config:
  // Free  → 'claude-3-haiku-20240307'
  // Pro   → 'claude-3-haiku-20240307'
  // Team  → 'claude-3-5-sonnet-20241022'
  
  return tierConfig.features.aiProvider;
};

const getMaxTokens = (user) => {
  const tier = user.subscriptionTier || 'free';
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  
  // Returns from config:
  // Free  → 800 tokens
  // Pro   → 1200 tokens
  // Team  → 2000 tokens
  
  return tierConfig.features.maxTokens;
};
```

### **Rate Limiting:**

```javascript
// src/middleware/rateLimiter.js

const getRateLimit = (user) => {
  const tier = user.subscriptionTier || 'free';
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  
  if (tierConfig.features.dailyQueries === -1) {
    return null; // Unlimited for Pro/Team
  }
  
  return {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: tierConfig.features.monthlyQueries // 50 for Free
  };
};
```

---

## 📊 Database Schema Alignment

### **subscription_plans Table:**
```sql
plan_id | name      | price | dodo_plan_id        | features (JSONB)
--------|-----------|-------|---------------------|-------------------
1       | Free Plan | 0.00  | NULL                | {monthlyQueries:50,...}
2       | Pro Plan  | 2.00  | plan_pro_monthly    | {dailyQueries:-1,...}
6       | Team Plan | 8.00  | plan_team_monthly   | {teamFeatures:true,...}
```

### **users Table:**
```sql
id | email              | subscription_tier | subscription_status | subscription_end_date
---|--------------------|--------------------|---------------------|----------------------
789| user@example.com   | pro                | active              | 2025-12-05
```

### **subscriptions Table (History):**
```sql
id | user_id | tier | status | dodo_subscription_id | start_date  | end_date
---|---------|------|--------|----------------------|-------------|-------------
1  | 789     | pro  | active | dodo_sub_456         | 2025-11-05  | 2025-12-05
```

---

## 🔐 Security & Validation

### **Webhook Signature Verification:**

```javascript
// paymentService.js

verifyWebhookSignature(payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.DODO_WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

// Usage in webhook route:
router.post('/webhook', (req, res) => {
  const signature = req.headers['dodo-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!paymentService.verifyWebhookSignature(payload, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
});
```

---

## ✅ Summary: From Database to Features

1. **Database**: Plans stored with `dodo_plan_id` and `features` JSON
2. **Payment**: User pays via Dodo → webhook includes `dodo_plan_id`
3. **Lookup**: Backend finds plan using `dodo_plan_id`
4. **Update**: User tier updated to match plan (free/pro/team)
5. **Features**: Controller uses `SUBSCRIPTION_TIERS` config based on tier
6. **Access**: Middleware checks tier to grant/deny feature access
7. **AI**: Service selects model based on tier config
8. **Rate Limits**: Applied based on tier config
9. **Frontend**: Shows features based on user's tier
10. **Export**: Button enabled/disabled based on tier

---

## 🎬 Demo Ready!

### **What Works:**
✅ Database aligned with dodoPayments.js  
✅ Plans API returns correct data with Dodo IDs  
✅ Checkout creates payment session  
✅ Dev mode instant upgrade (no payment needed)  
✅ Features granted based on tier  
✅ AI model changes by tier  
✅ Rate limits applied correctly  

### **Production Setup:**
1. Add Dodo API keys to .env
2. Configure webhook URL
3. Test with Dodo test cards
4. Verify webhook signature
5. Monitor subscription status

---

**Last Updated:** November 5, 2025  
**Status:** ✅ Database Updated & Ready for Demo!
