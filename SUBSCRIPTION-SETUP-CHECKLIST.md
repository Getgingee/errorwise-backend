# ✅ DodoPayments Subscription Setup Checklist

## 🎯 Quick Setup Guide (15 minutes)

### ✅ ALREADY DONE
- ✅ Backend deployed on Railway (LIVE & HEALTHY)
- ✅ DodoPayments integration code written (paymentService.js)
- ✅ Webhook handlers implemented (subscriptionController.js)
- ✅ Database subscription tables ready
- ✅ Frontend subscription pages ready

### 🔄 TO DO NOW

#### **Step 1: Sign Up for DodoPayments (5 min)**
1. Go to: **https://dodopayments.com/signup**
2. Create account with:
   - Business Name: **ErrorWise**
   - Email: Your business email
   - Business Type: **SaaS/Software**
3. Verify email (check inbox)

#### **Step 2: Get API Keys (3 min)**
1. Log in to DodoPayments dashboard
2. Navigate: **Settings** → **API Keys** → **Developers**
3. Copy these 3 keys (TEST MODE first):
   ```
   pk_test_xxxxx...  (Publishable Key)
   sk_test_xxxxx...  (Secret Key)
   whsec_xxxxx...    (Webhook Secret)
   ```
4. Save them somewhere safe (password manager)

#### **Step 3: Add to Railway (2 min)**
1. Go to Railway: https://railway.app/project/errorwise-backend-production
2. Click **Variables** tab
3. Add these 4 variables:
   ```
   DODO_API_KEY=pk_test_xxxxx...
   DODO_SECRET_KEY=sk_test_xxxxx...
   DODO_WEBHOOK_SECRET=whsec_xxxxx...
   DODO_BASE_URL=https://api.dodopayments.com/v1
   ```
4. Railway will auto-redeploy (wait 2-3 minutes)

#### **Step 4: Configure Webhook (2 min)**
1. In DodoPayments dashboard
2. Go to **Settings** → **Webhooks** → **Add Endpoint**
3. Add webhook URL:
   ```
   https://errorwise-backend-production.up.railway.app/api/subscriptions/webhook
   ```
4. Select events to listen for:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`
   - ✅ `customer.subscription.deleted`
5. Click **Create Webhook**

#### **Step 5: Create Subscription Plans in Dodo (3 min)**
1. In DodoPayments dashboard
2. Go to **Products** → **Create Product**
3. Create 3 products:

**Product 1: ErrorWise FREE**
- Name: `ErrorWise FREE`
- Price: `$0/month`
- Billing: `Monthly`
- Copy the Plan ID → Update `SUBSCRIPTION_TIERS.free.dodo_plan_id` in code

**Product 2: ErrorWise PRO**
- Name: `ErrorWise PRO`
- Price: `$19/month`
- Billing: `Monthly`
- Copy the Plan ID → Update `SUBSCRIPTION_TIERS.pro.dodo_plan_id` in code

**Product 3: ErrorWise TEAM**
- Name: `ErrorWise TEAM`
- Price: `$49/month`
- Billing: `Monthly`
- Copy the Plan ID → Update `SUBSCRIPTION_TIERS.team.dodo_plan_id` in code

---

## 🧪 Testing (5 min)

### Test Payment Flow

1. **Go to your frontend**: https://www.errorwise.tech/dashboard
2. **Click "Upgrade to PRO"**
3. **You should be redirected to DodoPayments checkout**
4. **Use test card**:
   ```
   Card: 4242 4242 4242 4242
   Expiry: Any future date (e.g., 12/25)
   CVC: Any 3 digits (e.g., 123)
   ```
5. **Complete payment**
6. **Check**:
   - ✅ Redirected back to dashboard
   - ✅ Tier upgraded to PRO
   - ✅ Database shows `dodo_subscription_id`
   - ✅ Subscription status = `active`

### Verify Webhook

1. Check Railway logs:
   ```bash
   railway logs --filter "webhook"
   ```
2. Should see:
   ```
   ✓ Webhook signature verified
   ✓ Processing event: checkout.session.completed
   ✓ Subscription activated for user: xxx
   ```

---

## 📊 Monitor Live Payments

### Railway Logs
```bash
railway logs --filter "payment|subscription|dodo"
```

### Database Check
```sql
SELECT 
  user_id, 
  tier, 
  status, 
  dodo_subscription_id,
  current_period_end
FROM subscriptions
WHERE status = 'active';
```

### DodoPayments Dashboard
- View all transactions
- See successful/failed payments
- Monitor subscription renewals
- Check webhook deliveries

---

## 🚨 Common Issues

### "Payment session not created"
- ✅ Check Railway has all 4 environment variables
- ✅ Verify API keys are correct (no extra spaces)
- ✅ Ensure plan IDs exist in DodoPayments

### "Webhook failed"
- ✅ Check webhook URL is correct
- ✅ Verify webhook secret matches Railway env var
- ✅ Check Railway logs for signature errors

### "Subscription not activated"
- ✅ Check webhook is receiving events
- ✅ Verify database `subscriptions` table exists
- ✅ Check Railway logs for errors

---

## 🎉 When Complete

You'll have:
- ✅ Real payment processing
- ✅ Automatic subscription management
- ✅ Webhook-driven tier upgrades
- ✅ Revenue tracking
- ✅ Production-ready billing system

---

## 📞 Support

**DodoPayments Support**: support@dodopayments.com
**ErrorWise Docs**: See `DODOPAYMENTS-SETUP-GUIDE.md` for detailed info

---

## 🔐 Security Reminders

- ⚠️ Use TEST keys during development
- ⚠️ Switch to LIVE keys only when ready for production
- ⚠️ Never commit API keys to Git
- ⚠️ Enable webhook signature verification (already done)
- ⚠️ Use HTTPS only (already configured)

---

**Estimated Total Time**: 15-20 minutes
**Current Status**: Ready to configure - All code is deployed and working!
