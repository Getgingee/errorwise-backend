# 🔧 URGENT FIX: Update DodoPayments Base URL on Railway

## ❌ PROBLEM
```
Error: getaddrinfo ENOTFOUND api.dodopayments.com
```

## ✅ SOLUTION

### Railway Variables - Update NOW:

**Current (WRONG)**:
```
DODO_BASE_URL=https://api.dodopayments.com/v1
```

**Change to (CORRECT)**:
```
DODO_BASE_URL=https://live.dodopayments.com
```

## 📋 Step-by-Step:

1. Go to: https://railway.app/
2. Open project: **errorwise-backend**
3. Click: **Variables** tab
4. Find: `DODO_BASE_URL`
5. Click **Edit** (pencil icon)
6. Change value to: `https://live.dodopayments.com`
7. Click **Save**
8. Railway will auto-redeploy (2-3 minutes)

## 🔗 Correct URLs (from Official Docs)

According to https://docs.dodopayments.com/api-reference/introduction:

- **Test Mode**: `https://test.dodopayments.com`
- **Live Mode**: `https://live.dodopayments.com`

Since your API keys are `pk_live_*` and `sk_live_*`, use **Live Mode**.

## ✅ After Update

Wait 2-3 minutes for Railway to redeploy, then test:

```bash
node test-with-token.js YOUR_TOKEN
```

Should now work! 🎉

## 📝 Reference

- Docs: https://docs.dodopayments.com/api-reference/introduction
- Authentication: `Authorization: Bearer YOUR_API_KEY`
- No `/v1` suffix needed!
