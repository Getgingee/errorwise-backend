# 🚀 Quick Start: Deploy to Railway in 5 Steps

## Your Backend is Ready! Here's What to Do:

### Step 1: Generate Security Secrets (2 minutes)
```bash
node generate-secrets.js
```
**Save the output** - you'll need it in Railway!

---

### Step 2: Create Railway Project (3 minutes)
1. Go to **https://railway.app**
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose **`Getgingee/errorwise-backend`**
5. Add **PostgreSQL** addon: Click "+ New" → "Database" → "PostgreSQL"
6. Add **Redis** addon: Click "+ New" → "Database" → "Redis"

---

### Step 3: Add Environment Variables (5 minutes)
Go to your service → **Variables** tab

**Copy-paste this template and fill in your values:**

```env
# 🤖 AI Provider (REQUIRED)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# 📧 Email (REQUIRED)
SENDGRID_API_KEY=SG.your-key-here
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-key-here
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=ErrorWise

# 🗄️ Database (Auto-filled by Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# 🔴 Redis (Auto-filled by Railway)
REDIS_URL=${{Redis.REDIS_URL}}

# 🔐 Security (from generate-secrets.js output)
JWT_SECRET=<paste-from-generator>
JWT_REFRESH_SECRET=<paste-from-generator>
SESSION_SECRET=<paste-from-generator>
CSRF_SECRET=<paste-from-generator>

# 🌍 Server Config
NODE_ENV=production
API_BASE_URL=https://your-app-name.up.railway.app
FRONTEND_URL=https://your-frontend-domain.com
CORS_ORIGIN=https://your-frontend-domain.com
```

---

### Step 4: Deploy (1 minute)
```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

Railway will **auto-deploy** when you push!

---

### Step 5: Verify (2 minutes)

#### A. Check deployment logs
Go to Railway dashboard → View deployment logs

#### B. Test health endpoint
```bash
curl https://your-app-name.up.railway.app/health
```

Should return:
```json
{"status":"ok","database":"connected","redis":"connected"}
```

#### C. Test AI service
```bash
curl -X POST https://your-app-name.up.railway.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"errorMessage":"test error","subscriptionTier":"free"}'
```

Should return AI analysis from Claude!

---

## ✅ Done! Your Backend is Live!

### What You Have Now:
- ✅ ErrorWise backend running on Railway
- ✅ Anthropic Claude AI (all 3 tiers work)
- ✅ SendGrid email service
- ✅ PostgreSQL database
- ✅ Redis caching
- ✅ Auto-deploy on git push

### Subscription Tiers Working:
| Tier | Model | Status |
|------|-------|--------|
| Free | Claude Haiku | ✅ Active |
| Pro | Claude Haiku | ✅ Active |
| Team | Claude Sonnet | ✅ Active |

---

## 🎯 Next Steps:

1. **Deploy your frontend** (Vercel/Netlify)
2. **Update frontend API URL** to your Railway URL
3. **Test end-to-end** with real error queries
4. **Monitor Railway logs** for any issues

---

## 📋 Quick Reference

### Your Railway URL
```
https://your-app-name.up.railway.app
```

### Check Configuration
```bash
node check-deployment-config.js
```

### View Logs
```bash
railway logs
```
(Install Railway CLI: `npm i -g @railway/cli`)

---

## 🐛 If Something Goes Wrong:

### "Missing ANTHROPIC_API_KEY"
→ Add it in Railway Variables, then redeploy

### "Database connection failed"
→ Check PostgreSQL addon is added and running

### "Redis connection failed"
→ Check Redis addon is added and running

### "Email not sending"
→ Verify sender email in SendGrid dashboard

### "CORS errors"
→ Set `CORS_ORIGIN` to exact frontend URL

---

## 💰 Cost Estimate:
- Railway: $5/month (free tier)
- Anthropic: ~$0.06-15/month per user (depending on usage)
- SendGrid: Free (100 emails/day)

**Total:** ~$5-10/month for small projects

---

## 📚 Full Documentation:
- `RAILWAY_DEPLOYMENT.md` - Complete deployment guide
- `RAILWAY_DEPLOYMENT_SUMMARY.md` - What was configured
- `DEPLOYMENT_CHECKLIST.md` - Detailed checklist

---

## 🎉 You're All Set!

Your backend is production-ready and configured to use **only Anthropic Claude** for all subscription tiers. 

Happy deploying! 🚀

---

**Need help?** Check the troubleshooting sections in the documentation files or create an issue on GitHub.
