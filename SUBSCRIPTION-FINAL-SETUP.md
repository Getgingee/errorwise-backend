# ✅ SUBSCRIPTION SETUP - FINAL CHECKLIST

## 🎉 COMPLETED SO FAR

- ✅ DodoPayments account created
- ✅ Webhook endpoint created (`https://errorwise-backend-production.up.railway.app/api/subscriptions/webhook`)
- ✅ PRO product created ($3/month) - ID: `pdt_OKdKW76gtO6vBWltBBV5d`
- ✅ TEAM product created ($8/month) - ID: `pdt_Zbn5YM2pCgkKcdQyV0ouY`
- ✅ Product IDs added to code
- ✅ Code committed and pushed (commit: `dc271aa`)
- ✅ Railway is deploying now...

---

## 🔑 CRITICAL: ADD API KEYS TO RAILWAY

### **YOU MUST DO THIS NOW:**

1. Go to Railway: **https://railway.app/project/errorwise-backend-production**
2. Click **"Variables"** tab
3. Add these 4 environment variables:

```bash
DODO_API_KEY=pk_test_xxxxxxxxxxxxx
DODO_SECRET_KEY=sk_test_xxxxxxxxxxxxx
DODO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
DODO_BASE_URL=https://api.dodopayments.com/v1
```

### **Where to get each key:**

**1. DODO_API_KEY** (Publishable Key)
- DodoPayments Dashboard → Settings → API Keys
- Copy "Publishable Key" (starts with `pk_test_`)

**2. DODO_SECRET_KEY** (Secret Key)
- Same page as above
- Copy "Secret Key" (starts with `sk_test_`)

**3. DODO_WEBHOOK_SECRET** (Webhook Signing Secret)
- DodoPayments Dashboard → Webhooks
- Click on the webhook you created
- Copy "Signing Secret" (starts with `whsec_`)

**4. DODO_BASE_URL**
- Just type: `https://api.dodopayments.com/v1`
- Or check DodoPayments API docs for the exact URL

---

## 🚀 AFTER ADDING API KEYS

Railway will automatically redeploy (2-3 minutes).

---

## 🧪 TEST THE PAYMENT FLOW

Once Railway finishes deploying:

### **Step 1: Go to your dashboard**
- https://www.errorwise.tech/dashboard

### **Step 2: Click "Upgrade to PRO"**

### **Step 3: You should be redirected to DodoPayments checkout**
- Should show: **$3.00/month** for PRO
- Or **$8.00/month** for TEAM

### **Step 4: Use test card**
```
Card Number: 4242 4242 4242 4242
Expiry: 12/25 (any future date)
CVC: 123 (any 3 digits)
```

### **Step 5: Complete payment**
- Should redirect back to your dashboard
- Your tier should be upgraded to PRO or TEAM
- Check database: subscription status should be "active"

---

## 🔍 VERIFY EVERYTHING WORKS

### **Check Railway Logs:**
```bash
railway logs --filter "payment|subscription|dodo"
```

**Expected logs:**
```
✓ Dodo payment service initialized
✓ Payment session created for user: xxx
✓ Webhook received: checkout.session.completed
✓ Subscription activated for user: xxx
```

### **Check Database:**
```sql
SELECT 
  id, 
  user_id, 
  tier, 
  status, 
  dodo_subscription_id,
  current_period_end
FROM subscriptions
WHERE status = 'active';
```

### **Check DodoPayments Dashboard:**
- Go to Payments tab
- Should see test payment
- Status: Succeeded

---

## ❌ TROUBLESHOOTING

### "Payment session not created"
- ✅ Check Railway has all 4 API keys
- ✅ Check API keys are correct (no extra spaces)
- ✅ Verify Product IDs match DodoPayments

### "Webhook signature verification failed"
- ✅ Check DODO_WEBHOOK_SECRET matches DodoPayments
- ✅ Verify webhook URL is correct
- ✅ Check Railway logs for signature errors

### "Subscription not activating"
- ✅ Check webhook events are selected in DodoPayments
- ✅ Verify webhook is receiving events
- ✅ Check Railway logs for webhook processing

---

## 📊 CURRENT STATUS

### **Code Deployed:**
- ✅ PRO: $3/month (Product ID: `pdt_OKdKW76gtO6vBWltBBV5d`)
- ✅ TEAM: $8/month (Product ID: `pdt_Zbn5YM2pCgkKcdQyV0ouY`)
- ✅ Webhook endpoint: `/api/subscriptions/webhook`
- ✅ Payment service: Ready
- ✅ All files updated

### **What's Missing:**
- ⏳ Railway environment variables (API keys)
- ⏳ Testing

---

## ✅ FINAL CHECKLIST

- [ ] 1. Add DODO_API_KEY to Railway
- [ ] 2. Add DODO_SECRET_KEY to Railway
- [ ] 3. Add DODO_WEBHOOK_SECRET to Railway
- [ ] 4. Add DODO_BASE_URL to Railway
- [ ] 5. Wait for Railway to redeploy (2-3 min)
- [ ] 6. Test PRO subscription ($3)
- [ ] 7. Test TEAM subscription ($8)
- [ ] 8. Verify webhook events work
- [ ] 9. Check subscription activates in database
- [ ] 10. Switch to LIVE mode when ready for production

---

## 🎉 WHEN COMPLETE

You'll have:
- ✅ Real payment processing with DodoPayments
- ✅ Automatic subscription management
- ✅ Webhook-driven tier upgrades
- ✅ Production-ready billing system
- ✅ $3/month PRO tier
- ✅ $8/month TEAM tier

---

## 📞 NEXT STEPS

**RIGHT NOW:**
1. Get your 3 API keys from DodoPayments
2. Add them to Railway
3. Wait for deployment
4. Test with test card!

**NEED HELP?**
- Check Railway logs: `railway logs`
- Check DodoPayments dashboard for webhook deliveries
- Verify API keys are correct
- Test with provided test card

---

**You're almost done! Just add those 4 API keys to Railway and test!** 🚀
