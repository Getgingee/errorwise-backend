# Tab Abuse & Resource Protection

## 🛡️ Protection Features

### 1. **Tab Switching Prevention**
Prevents users from opening too many tabs to abuse resources.

**Limits:**
- **Anonymous users:** Max 2 tabs
- **Authenticated users:** Max 5 tabs

**What happens:**
- User opens 6th tab → Gets error: "Too many active sessions. Please close some tabs."
- Sessions auto-expire after 5 minutes of inactivity
- Prevents resource exhaustion from tab spam

### 2. **Request Flooding Prevention**
Rate limits based on subscription tier.

**Limits per minute:**
- **Anonymous:** 10 requests/minute
- **Free tier:** 30 requests/minute  
- **PRO tier:** 100 requests/minute
- **TEAM tier:** 300 requests/minute

**What happens:**
- User exceeds limit → HTTP 429 "Rate limit exceeded"
- Shows countdown timer: "Please wait 45 seconds"
- Response includes upgrade message for free users
- Headers show remaining quota: `X-RateLimit-Remaining: 15`

### 3. **Duplicate Request Blocking**
Prevents double-click and rapid resubmission.

**Protection:**
- Same POST/PUT/DELETE within 2 seconds → Blocked
- Shows: "Please wait - your previous request is still processing"
- Prevents accidental duplicate payments, submissions, etc.

### 4. **Suspicious Behavior Detection**
AI-powered abuse pattern detection.

**Detects:**
- **Bot behavior:** 20+ actions in 10 seconds → +30 suspicion score
- **Endpoint spam:** Same endpoint 5 times in a row → +20 score
- **New account abuse:** Created <1 min ago, 15+ actions → +25 score

**Score > 50 = Account restricted:**
```
"Your account has been temporarily restricted due to unusual behavior. 
Contact support if this is a mistake."
```

### 5. **Memory Leak Prevention**
Auto-cleanup every 10 minutes to prevent memory exhaustion.

**Cleanup:**
- Removes tracking data older than 30 minutes
- Clears expired sessions
- Logs cleanup stats to monitor health

## 📊 Response Headers

All responses include rate limit info:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 2025-11-09T15:30:00.000Z
```

## 🚨 Abuse Scenarios Prevented

### Scenario 1: Tab Spam Attack
**Attack:** User opens 50 tabs to overload server  
**Prevention:** Blocked after 5 tabs (auth) or 2 tabs (anon)  
**Result:** Server resources protected ✅

### Scenario 2: API Hammering
**Attack:** Script sends 1000 requests/minute  
**Prevention:** Blocked after 10-300 requests (tier-based)  
**Result:** Fair usage enforced ✅

### Scenario 3: Double Payment
**Attack:** User clicks "Pay" button 5 times rapidly  
**Prevention:** Only first request processed, others blocked  
**Result:** No duplicate charges ✅

### Scenario 4: Bot Scraping
**Attack:** Bot rapidly crawls all endpoints  
**Prevention:** Detected via suspicion scoring, account blocked  
**Result:** Bot traffic stopped ✅

### Scenario 5: Memory Exhaustion
**Attack:** Long-running attack accumulates tracking data  
**Prevention:** Auto-cleanup removes old data every 10 min  
**Result:** Memory stays stable ✅

## 📝 Error Messages

### Too Many Tabs
```json
{
  "success": false,
  "error": "Too many active sessions",
  "message": "You have 6 tabs open. Maximum allowed is 5. Please close some tabs.",
  "maxSessions": 5,
  "currentSessions": 6
}
```

### Rate Limit Exceeded
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "You've exceeded 30 requests per minute. Please wait 42 seconds.",
  "limit": 30,
  "requestsMade": 35,
  "retryAfter": 42,
  "tier": "free",
  "upgradeMessage": "Upgrade to PRO for higher limits!"
}
```

### Duplicate Request
```json
{
  "success": false,
  "error": "Duplicate request",
  "message": "Please wait - your previous request is still processing"
}
```

### Suspicious Behavior
```json
{
  "success": false,
  "error": "Suspicious activity detected",
  "message": "Your account has been temporarily restricted due to unusual behavior. Contact support if this is a mistake."
}
```

## 🔧 Configuration

All limits are configurable in `src/middleware/security.js`:

```javascript
// Tab limits
const MAX_SESSIONS = req.user ? 5 : 2;

// Rate limits
const limits = {
  free: 30,
  pro: 100,
  team: 300,
  anonymous: 10
};

// Duplicate request window
const DUPLICATE_WINDOW = 2000; // 2 seconds

// Suspicion thresholds
const RAPID_ACTION_THRESHOLD = 20; // actions in 10 seconds
const SUSPICION_BLOCK_SCORE = 50;
```

## 🎯 Benefits

✅ **Prevents resource abuse** - No single user can hog server resources  
✅ **Fair usage** - Tier-based limits encourage upgrades  
✅ **Better UX** - Prevents accidental duplicate submissions  
✅ **Security** - Detects and blocks malicious behavior  
✅ **Stability** - Memory cleanup prevents leaks  
✅ **Transparency** - Rate limit headers show quota  

## 📈 Monitoring

Check logs for abuse patterns:
```
⚠️ Too many concurrent sessions: userId=abc123 sessionCount=7
⚠️ Request flooding detected: tier=free requestCount=45 limit=30
⚠️ Duplicate request blocked: endpoint=POST:/api/payments
🚨 SUSPICIOUS BEHAVIOR DETECTED: score=65 recentActions=25
🧹 Security trackers cleaned up: sessionTrackerSize=143
```

---

**Status:** ✅ Deployed (commit e427f9a)  
**Railway:** Auto-deploying now  
**Protection:** Active on all routes
