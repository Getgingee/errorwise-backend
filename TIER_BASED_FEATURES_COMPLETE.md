# 🎯 ErrorWise Tier-Based Features - Complete Documentation

## 📋 Overview

ErrorWise implements a comprehensive 3-tier subscription system with feature gating at both backend and frontend levels:

- **Free Tier**: Basic error explanations with monthly query limits
- **Pro Tier**: Unlimited queries with advanced AI and features
- **Team Tier**: Everything in Pro + team collaboration features

---

## 🔐 Subscription Tiers

### Free Tier

**Price**: $0/month

**Limits**:
- 50 queries per month
- No daily limit

**Features**:
- ✅ Basic error explanations
- ✅ Gemini 2.0 Flash AI (800 tokens)
- ✅ Documentation links
- ✅ 7-day error history
- ✅ Community support
- ❌ No fix suggestions
- ❌ No code examples
- ❌ No advanced analysis
- ❌ No export functionality
- ❌ No team features

**AI Provider**: `gemini-2.0-flash-exp`

**Use Case**: Individual developers learning and debugging basic errors

---

### Pro Tier

**Price**: $3/month

**Trial**: 7 days free

**Limits**:
- Unlimited queries per day
- Unlimited queries per month

**Features**:
- ✅ Everything in Free
- ✅ Advanced error explanations
- ✅ Fix suggestions with code patches
- ✅ Code examples and snippets
- ✅ Advanced AI analysis
- ✅ Claude Haiku AI (1200 tokens)
- ✅ Unlimited error history
- ✅ Export history (JSON/CSV)
- ✅ Email support
- ✅ Priority queue
- ✅ Multi-language support
- ✅ API access
- ❌ No team features

**AI Provider**: `claude-3-5-haiku-20241022`

**Use Case**: Professional developers needing advanced debugging and unlimited queries

---

### Team Tier

**Price**: $8/month

**Limits**:
- Unlimited queries per day
- Unlimited queries per month
- Up to 10 team members

**Features**:
- ✅ Everything in Pro
- ✅ Team collaboration
- ✅ Shared error history across team
- ✅ Team dashboard with analytics
- ✅ Collaborative workspaces
- ✅ Video chat for debugging sessions
- ✅ Team member management
- ✅ Role-based access control
- ✅ Claude Sonnet AI (2000 tokens)
- ✅ Priority support
- ✅ Custom integrations
- ✅ Advanced team analytics

**AI Provider**: `claude-3-5-sonnet-20241022`

**Use Case**: Development teams collaborating on complex projects

---

## 🔧 Backend Implementation

### Middleware

#### 1. Subscription Middleware (`src/middleware/subscriptionMiddleware.js`)

**Exported Functions**:

```javascript
// Check if user has reached query limits
checkQueryLimit(req, res, next)

// Require specific feature access
requireFeature(featureName) 
// Example: requireFeature('exportHistory')

// Require minimum tier
requireTier(minimumTier)
// Example: requireTier('pro') or requireTier('team')

// Add subscription info to request object
addSubscriptionInfo(req, res, next)
```

**Usage in Routes**:

```javascript
const { checkQueryLimit, requireFeature, requireTier } = require('../middleware/subscriptionMiddleware');

// Apply query limit check
router.post('/analyze', checkQueryLimit, controller.analyzeError);

// Require specific feature
router.get('/export', requireFeature('exportHistory'), controller.exportHistory);

// Require tier level
router.use('/teams', requireTier('team'));
```

#### 2. Feature Gating Middleware (`src/middleware/featureGating.js`)

**Exported Functions**:

```javascript
// Require specific features
requireFeatures(['feature1', 'feature2'])

// Require Pro tier
requirePro()

// Require Team tier
requireTeam()

// Attach user tier to request (non-blocking)
attachUserTier(req, res, next)

// Filter response based on tier
filterResponseByTier(response, userTier)
```

---

### Protected Routes

#### Error Analysis Routes (`src/routes/errors.js`)

```javascript
// ✅ Query limit applied
POST /api/errors/analyze
Middleware: authMiddleware, checkQueryLimit, addUsageInfo

// ✅ Feature-gated (Pro/Team only)
GET /api/errors/export
Middleware: authMiddleware, requireFeature('exportHistory')

// Available to all authenticated users
GET /api/errors/history
GET /api/errors/recent
GET /api/errors/stats
GET /api/errors/search
GET /api/errors/:id
DELETE /api/errors/:id
```

#### Team Routes (`src/routes/teams.js`)

```javascript
// ✅ All team routes require Team tier
router.use(requireTier('team'));

POST /api/teams - Create team
GET /api/teams - Get user teams
GET /api/teams/:teamId - Get team details
PUT /api/teams/:teamId - Update team
DELETE /api/teams/:teamId - Delete team

// Team membership
POST /api/teams/:teamId/invite
POST /api/teams/:teamId/join
GET /api/teams/:teamId/members
PUT /api/teams/:teamId/members/:userId
DELETE /api/teams/:teamId/members/:userId

// Error sharing
POST /api/teams/:teamId/errors
GET /api/teams/:teamId/errors
PUT /api/teams/:teamId/errors/:errorId
DELETE /api/teams/:teamId/errors/:errorId

// Analytics
GET /api/teams/:teamId/dashboard
GET /api/teams/:teamId/analytics

// Video chat
POST /api/teams/:teamId/video/start
POST /api/teams/:teamId/video/end
```

#### Subscription Routes (`src/routes/subscriptions.js`)

```javascript
// Public (no auth)
POST /api/subscriptions/webhook
GET /api/subscriptions/plans

// Authenticated only
GET /api/subscriptions/current
POST /api/subscriptions/checkout
POST /api/subscriptions/upgrade
POST /api/subscriptions/downgrade
POST /api/subscriptions/cancel
GET /api/subscriptions/usage
GET /api/subscriptions/billing
GET /api/subscriptions/history
```

#### User Routes (`src/routes/users.js`)

```javascript
// ✅ Profile includes subscription data
GET /api/users/profile
Returns: {
  id, username, email, role,
  subscriptionTier,
  subscriptionStatus,
  subscriptionEndDate,
  ...
}
```

---

### API Responses

#### Tier-Based Error Responses

**Insufficient Tier (403)**:

```json
{
  "error": "Insufficient subscription tier",
  "message": "This feature requires pro plan or higher. Please upgrade your subscription.",
  "upgrade": true,
  "currentTier": "free",
  "requiredTier": "pro"
}
```

**Query Limit Exceeded (429)**:

```json
{
  "error": "Monthly query limit exceeded",
  "message": "You have used 50 of 50 queries this month. Upgrade to Pro for unlimited queries.",
  "upgrade": true,
  "currentTier": "free",
  "usage": {
    "queriesThisMonth": 50,
    "limit": 50,
    "resetDate": "2025-12-01T00:00:00Z"
  }
}
```

**Feature Not Available (403)**:

```json
{
  "error": "Feature not available",
  "message": "This feature is only available in pro plan. Upgrade to access exportHistory.",
  "upgrade": true,
  "currentTier": "free",
  "requiredTier": "pro",
  "feature": "exportHistory"
}
```

**Team Subscription Required (403)**:

```json
{
  "error": "Team subscription required",
  "message": "You need an active Team subscription to create teams. Please upgrade your plan.",
  "upgradeUrl": "/pricing",
  "currentTier": "pro"
}
```

---

## 🎨 Frontend Implementation

See detailed guide: **[FRONTEND_TIER_IMPLEMENTATION_GUIDE.md](./FRONTEND_TIER_IMPLEMENTATION_GUIDE.md)**

### Quick Reference

#### 1. SubscriptionContext

```typescript
import { useSubscription } from './contexts/SubscriptionContext';

const { 
  subscription,      // Current subscription data
  loading,           // Loading state
  error,             // Error message
  refreshSubscription, // Refresh function
  hasFeature,        // Check feature access
  hasTier            // Check tier level
} = useSubscription();
```

#### 2. TierGate Component

```typescript
import { TierGate, ProFeature, TeamFeature } from './components/TierGate';

// Require Pro or higher
<ProFeature>
  <AdvancedFeatureComponent />
</ProFeature>

// Require Team tier
<TeamFeature>
  <TeamDashboard />
</TeamFeature>

// Custom tier requirement with fallback
<TierGate 
  requiredTier="pro" 
  fallback={<UpgradePrompt />}
>
  <ExportButton />
</TierGate>
```

#### 3. Feature Checks

```typescript
// Check if user has specific feature
{hasFeature('fixSuggestions') && (
  <div className="fix-suggestions">
    {/* ... */}
  </div>
)}

// Check tier level
{hasTier('pro') && (
  <button onClick={exportData}>Export</button>
)}

// Check subscription status
{subscription?.tier === 'free' && (
  <UpgradeBanner />
)}
```

---

## 🧪 Testing Guide

### Backend Testing

#### Test Query Limits (Free Tier)

```bash
# Create free user and make 51 requests
# First 50 should succeed, 51st should return 429

curl -X POST https://errorwise-backend-production.up.railway.app/api/errors/analyze \
  -H "Authorization: Bearer $FREE_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"errorMessage": "Test error", "language": "javascript"}'
```

**Expected**: After 50 queries, should return:
```json
{
  "error": "Monthly query limit exceeded",
  "upgrade": true,
  "currentTier": "free"
}
```

#### Test Feature Access (Pro Features)

```bash
# Try to export as free user (should fail)
curl -X GET https://errorwise-backend-production.up.railway.app/api/errors/export \
  -H "Authorization: Bearer $FREE_USER_TOKEN"

# Expected: 403 Forbidden
{
  "error": "Feature not available",
  "requiredTier": "pro",
  "feature": "exportHistory"
}

# Try to export as pro user (should succeed)
curl -X GET https://errorwise-backend-production.up.railway.app/api/errors/export \
  -H "Authorization: Bearer $PRO_USER_TOKEN"

# Expected: 200 OK with export data
```

#### Test Team Features

```bash
# Try to create team as free user (should fail)
curl -X POST https://errorwise-backend-production.up.railway.app/api/teams \
  -H "Authorization: Bearer $FREE_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Team", "description": "Test team"}'

# Expected: 403 Forbidden
{
  "error": "Insufficient subscription tier",
  "requiredTier": "team"
}

# Try as team user (should succeed)
curl -X POST https://errorwise-backend-production.up.railway.app/api/teams \
  -H "Authorization: Bearer $TEAM_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Team", "description": "Test team"}'

# Expected: 201 Created with team data
```

---

### Frontend Testing

#### Test Tier-Based UI

1. **Free User**:
   - Login as free user
   - Dashboard should show "Free" badge
   - Usage stats show "X / 50" monthly queries
   - "Upgrade" prompts visible on Pro features
   - Team section not visible
   - Export button locked/disabled

2. **Pro User**:
   - Login as `hi@getgingee.com` (upgraded to Pro)
   - Dashboard shows "Pro ⭐" badge
   - Usage stats show "Unlimited ∞"
   - All Pro features unlocked
   - Team section still locked
   - Export button functional

3. **Team User**:
   - Login as team user
   - Dashboard shows "Team 👥" badge
   - All features unlocked
   - Team dashboard accessible
   - Can create/manage teams

#### Test Auto-Refresh

1. Have user logged in on one browser
2. Upgrade user via admin API or different browser
3. Focus back to first browser window
4. Subscription should auto-refresh
5. UI should update to show new tier

#### Test Manual Refresh

1. Click "Refresh Data" button
2. Should see loading spinner
3. Subscription data updates
4. UI re-renders with new permissions

---

## 📊 Database Schema

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  
  -- Subscription fields
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'active',
  subscription_end_date TIMESTAMP,
  
  -- Other fields...
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Subscriptions Table

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  
  tier VARCHAR(50) DEFAULT 'free',
  status VARCHAR(50) DEFAULT 'active',
  
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  
  -- Payment integration
  dodo_subscription_id VARCHAR(255),
  dodo_customer_id VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### ErrorQueries Table (for usage tracking)

```sql
CREATE TABLE error_queries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  
  error_message TEXT,
  language VARCHAR(50),
  ai_response TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 User Upgrade Flow

### Manual Admin Upgrade (Current Implementation)

```javascript
// Admin endpoint to upgrade user
POST /api/admin/upgrade-user
{
  "email": "user@example.com",
  "tier": "pro",
  "duration": 365  // days
}

// Updates:
// - users.subscription_tier = 'pro'
// - users.subscription_status = 'active'
// - users.subscription_end_date = now + 365 days
```

### Payment-Based Upgrade (DodoPayments Integration)

```javascript
// User initiates checkout
POST /api/subscriptions/checkout
{
  "planId": "pro",  // or "team"
  "successUrl": "https://errorwise.tech/success",
  "cancelUrl": "https://errorwise.tech/pricing"
}

// Returns checkout URL, user completes payment

// Webhook receives confirmation
POST /api/subscriptions/webhook
{
  "event": "subscription.created",
  "data": {
    "subscription_id": "sub_xxx",
    "customer_id": "cus_xxx",
    "plan": "pro",
    "status": "active"
  }
}

// Backend updates user subscription
```

---

## 🚨 Edge Cases Handled

### 1. Expired Subscription

```javascript
// Middleware checks subscription_end_date
if (user.subscriptionEndDate < now && user.subscriptionTier !== 'free') {
  // Auto-downgrade to free
  await user.update({
    subscriptionTier: 'free',
    subscriptionStatus: 'expired'
  });
  
  return res.status(403).json({
    error: 'Subscription expired',
    message: 'Your subscription has expired. You have been downgraded to the Free plan.'
  });
}
```

### 2. Query Limit Exceeded

```javascript
// Count queries this month
const queriesThisMonth = await ErrorQuery.count({
  where: {
    userId,
    createdAt: { [Op.gte]: startOfMonth }
  }
});

if (queriesThisMonth >= monthlyLimit) {
  return res.status(429).json({
    error: 'Monthly query limit exceeded',
    upgrade: true
  });
}
```

### 3. Feature Access Denied

```javascript
// Check feature availability
if (!tierConfig.features[featureName]) {
  return res.status(403).json({
    error: 'Feature not available',
    message: `This feature requires ${requiredTier} plan.`,
    upgrade: true
  });
}
```

### 4. Team Tier Required

```javascript
// Team routes check tier
if (subscription.tier !== 'team') {
  return res.status(403).json({
    error: 'Team subscription required',
    upgradeUrl: '/pricing'
  });
}
```

---

## 📈 Monitoring & Analytics

### Track Usage

```javascript
// Get user usage stats
GET /api/subscriptions/usage

Response:
{
  "current": {
    "tier": "pro",
    "queriesToday": 12,
    "queriesThisMonth": 145,
    "remainingToday": -1,      // unlimited
    "remainingThisMonth": -1   // unlimited
  },
  "history": [
    { "date": "2025-11-01", "queries": 23 },
    { "date": "2025-11-02", "queries": 31 }
  ]
}
```

### Admin Analytics

```javascript
// Admin can view all users
GET /api/admin/users

Response:
{
  "count": 100,
  "users": [
    {
      "id": "...",
      "email": "user@example.com",
      "subscriptionTier": "pro",
      "subscriptionStatus": "active",
      "queriesThisMonth": 250
    }
  ]
}
```

---

## ✅ Deployment Checklist

### Backend
- [x] Subscription middleware implemented
- [x] Feature gating middleware implemented
- [x] Query limit checking on analyze endpoint
- [x] Feature requirement on export endpoint
- [x] Tier requirement on team routes
- [x] Admin upgrade endpoints
- [x] User profile includes subscription data
- [x] Error responses include upgrade info
- [x] Deployed to Railway

### Frontend
- [ ] SubscriptionContext provider created
- [ ] TierGate component implemented
- [ ] SubscriptionCard component added
- [ ] UsageStats component added
- [ ] Refresh mechanism implemented
- [ ] Applied to dashboard features
- [ ] Applied to team pages
- [ ] Applied to export functionality
- [ ] Tested with all three tiers
- [ ] Deployed to Vercel

### Testing
- [x] Backend tier enforcement verified
- [x] Query limits tested
- [ ] Frontend tier gates tested
- [ ] Auto-refresh tested
- [ ] Manual refresh tested
- [ ] Upgrade flow tested end-to-end

---

## 🎉 Current Status

### ✅ Completed

1. **Backend Tier System**
   - Subscription middleware fully implemented
   - Feature gating on routes
   - Query limit enforcement
   - Tier-based error responses
   - Admin upgrade endpoints
   - User `hi@getgingee.com` upgraded to Pro

2. **Documentation**
   - Complete frontend implementation guide
   - Backend API documentation
   - Tier configuration reference
   - Testing guide

### 🚧 Pending (Frontend Implementation)

1. Install SubscriptionContext
2. Create TierGate components
3. Add SubscriptionCard to dashboard
4. Add UsageStats display
5. Apply tier gates to features
6. Test with all three user types
7. Deploy to production

---

## 📞 Support

### For Users

- **Free tier support**: Community forums
- **Pro tier support**: Email support
- **Team tier support**: Priority email + live chat

### For Developers

**Backend Issues**: Check middleware logs, verify token, check subscription status in database

**Frontend Issues**: Inspect browser console, verify SubscriptionContext, check API responses

**Upgrade Issues**: Use admin endpoint to manually upgrade, or check payment webhook logs

---

## 🔗 Related Documentation

- [FRONTEND_TIER_IMPLEMENTATION_GUIDE.md](./FRONTEND_TIER_IMPLEMENTATION_GUIDE.md) - Complete frontend setup
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - All API endpoints
- [SUBSCRIPTION-SYSTEM-PLAN.md](./SUBSCRIPTION-SYSTEM-PLAN.md) - Original implementation plan
- [COMPREHENSIVE_FEATURE_EDGE_CASE_IMPLEMENTATION.md](./COMPREHENSIVE_FEATURE_EDGE_CASE_IMPLEMENTATION.md) - Edge cases

---

## 📝 Summary

ErrorWise now has a **complete tier-based feature system**:

- ✅ **3-tier subscription model** (Free, Pro, Team)
- ✅ **Backend enforcement** via middleware on all relevant routes
- ✅ **Query limiting** for free users (50/month)
- ✅ **Feature gating** for Pro features (export, advanced analysis)
- ✅ **Team tier protection** on all team routes
- ✅ **Clear upgrade prompts** in API responses
- ✅ **Frontend implementation guide** ready for integration
- ✅ **Admin tools** for manual user upgrades
- ✅ **Comprehensive documentation** for developers

**Next Step**: Implement frontend components using the provided guide and test end-to-end!
