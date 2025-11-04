# 🚀 Quick Production Deployment Guide

## ⚡ 5-Minute Deployment to Railway

### Step 1: Prepare Your Code (2 minutes)
```bash
# Verify everything is ready
node production-readiness-check.js

# Generate secure secrets (copy these!)
node generate-secrets.js

# Commit your changes
git add .
git commit -m "Production ready deployment"
git push origin main
```

### Step 2: Get API Keys (2 minutes)
1. **Anthropic**: https://console.anthropic.com/ → Create API key
2. **SendGrid**: https://sendgrid.com/ → Create API key

### Step 3: Deploy to Railway (1 minute)
1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select `errorwise-backend` repository
3. Add PostgreSQL plugin
4. Add Redis plugin

### Step 4: Set Environment Variables
In Railway dashboard → Variables:

```bash
# Required
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-api...
SENDGRID_API_KEY=SG...

# Your domains
API_BASE_URL=https://errorwise-backend.railway.app
FRONTEND_URL=https://your-frontend.vercel.app
CORS_ORIGIN=https://your-frontend.vercel.app

# From generate-secrets.js
JWT_SECRET=<your-generated-secret>
JWT_REFRESH_SECRET=<your-generated-secret>
SESSION_SECRET=<your-generated-secret>
CSRF_SECRET=<your-generated-secret>

# Email
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=ErrorWise

# Database & Redis (auto-filled by Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

### Step 5: Deploy!
Click "Deploy" → Wait 2-3 minutes → Done! 🎉

---

## ✅ Verify Deployment

```bash
# Health check
curl https://your-app.railway.app/health

# Platform stats
curl https://your-app.railway.app/api/stats

# Should return: {"status": "OK", "timestamp": "..."}
```

---

## 🔧 If Something Goes Wrong

### Check Logs
Railway Dashboard → Deployments → View Logs

### Common Issues

**❌ "Cannot connect to database"**
- ✅ Check DATABASE_URL is set to `${{Postgres.DATABASE_URL}}`

**❌ "Redis connection failed"**
- ✅ Check REDIS_URL is set to `${{Redis.REDIS_URL}}`

**❌ "AI service error"**
- ✅ Verify ANTHROPIC_API_KEY is valid
- ✅ Check you have credits in Anthropic console

**❌ "Email not sending"**
- ✅ Verify SENDGRID_API_KEY is active
- ✅ Verify FROM_EMAIL in SendGrid dashboard

**❌ "CORS error"**
- ✅ Set CORS_ORIGIN to your frontend domain
- ✅ No trailing slash in URLs

---

## 📊 Monitor Your Deployment

### Railway Dashboard
- View real-time logs
- Monitor CPU/Memory usage
- Check deployment status
- View metrics

### Test Key Endpoints
```bash
# Health
GET /health

# Stats (public)
GET /api/stats

# Register user
POST /api/auth/register

# Login
POST /api/auth/login

# Analyze error (requires auth)
POST /api/errors/analyze
```

---

## 🎯 Cost Estimate (Railway)

| Service | Cost |
|---------|------|
| App (Hobby plan) | $5/month |
| PostgreSQL | $5/month |
| Redis | $5/month |
| **Total** | **~$15/month** |

*Free trial available + $5 free credit for new users*

---

## 📚 Full Documentation

- **Complete Checklist**: `PRODUCTION_CHECKLIST.md`
- **Deployment Guide**: `RAILWAY_DEPLOYMENT.md`
- **Production Summary**: `PRODUCTION_READY_SUMMARY.md`
- **API Documentation**: `API_DOCUMENTATION.md`

---

## 🆘 Need Help?

1. **Check Logs**: Railway Dashboard → View Logs
2. **Run Checker**: `node production-readiness-check.js`
3. **Review Docs**: See files above
4. **Railway Support**: https://railway.app/help

---

## ✨ Post-Deployment

### Configure Frontend
Update your frontend `.env`:
```bash
VITE_API_URL=https://your-backend.railway.app
```

### Set Up Monitoring (Recommended)
- **Uptime**: https://uptimerobot.com/ (free)
- **Errors**: https://sentry.io/ (free tier)
- **Analytics**: Your choice

### Enable Custom Domain (Optional)
Railway Settings → Domains → Add custom domain

---

**🎉 You're Live! Your ErrorWise backend is now running in production.**

---

*Last Updated: November 2025*
