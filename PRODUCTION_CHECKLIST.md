# Production Deployment Checklist

## Pre-Deployment

### Environment Configuration
- [ ] Copy `.env.example` to `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Update `API_BASE_URL` to production domain
- [ ] Update `FRONTEND_URL` to production domain
- [ ] Update `CORS_ORIGIN` to production domain(s)

### Security Secrets (CRITICAL)
Generate secure secrets using: `node generate-secrets.js`

- [ ] Set `JWT_SECRET` (32+ characters)
- [ ] Set `JWT_REFRESH_SECRET` (32+ characters)
- [ ] Set `SESSION_SECRET` (32+ characters)
- [ ] Set `CSRF_SECRET` (32+ characters)
- [ ] Set `BCRYPT_ROUNDS=12` (or higher)
- [ ] Remove all placeholder/example values

### Database Configuration
- [ ] Set `DATABASE_URL` (PostgreSQL connection string)
- [ ] Verify database is accessible from deployment server
- [ ] Ensure SSL is enabled for production database
- [ ] Remove any hardcoded credentials from code

### Redis Configuration
- [ ] Set `REDIS_URL` (required for production)
- [ ] Verify Redis is accessible from deployment server
- [ ] Test Redis connection

### Email Service (SendGrid)
- [ ] Create SendGrid account: https://sendgrid.com/
- [ ] Generate API key
- [ ] Set `SENDGRID_API_KEY`
- [ ] Set `FROM_EMAIL` to verified sender
- [ ] Set `FROM_NAME` to your brand name
- [ ] Verify sender domain in SendGrid

### AI Service (Anthropic)
- [ ] Create Anthropic account: https://console.anthropic.com/
- [ ] Generate API key
- [ ] Set `ANTHROPIC_API_KEY`
- [ ] Test API key with a simple request
- [ ] Set up billing/credits

### Payment Gateway (Dodo Payments) - Optional
- [ ] Create Dodo Payments account
- [ ] Set `DODO_API_KEY`
- [ ] Set `DODO_SECRET_KEY`
- [ ] Set `DODO_MERCHANT_ID`
- [ ] Set `DODO_WEBHOOK_SECRET`
- [ ] Set `DODO_ENVIRONMENT=production`
- [ ] Configure webhook endpoint

## Deployment Platform Setup

### Railway (Recommended)
1. [ ] Connect GitHub repository
2. [ ] Create new project from repo
3. [ ] Add PostgreSQL database addon
4. [ ] Add Redis addon
5. [ ] Copy all environment variables from `.env`
6. [ ] Set build command: `npm install`
7. [ ] Set start command: `npm start`
8. [ ] Deploy

### Alternative Platforms
- **Render**: Similar process, auto-detects Node.js
- **Heroku**: Use Heroku Postgres and Redis addons
- **DigitalOcean App Platform**: Deploy from GitHub
- **AWS Elastic Beanstalk**: Requires more configuration

## Post-Deployment

### Verification
- [ ] Check deployment logs for errors
- [ ] Test health endpoint: `GET /health`
- [ ] Test API endpoints: `GET /api/stats`
- [ ] Verify database connection
- [ ] Verify Redis connection
- [ ] Test user registration
- [ ] Test email sending
- [ ] Test AI error analysis
- [ ] Test authentication flow

### Database Setup
- [ ] Run migrations (if any): `npx sequelize-cli db:migrate`
- [ ] Verify all tables created
- [ ] Check indexes and constraints

### Monitoring Setup
- [ ] Set up error logging (e.g., Sentry)
- [ ] Set up uptime monitoring (e.g., UptimeRobot)
- [ ] Set up performance monitoring
- [ ] Configure log aggregation
- [ ] Set up alerts for critical errors

### Security Verification
- [ ] Test CORS configuration
- [ ] Test rate limiting
- [ ] Verify CSRF protection
- [ ] Test authentication endpoints
- [ ] Check for exposed secrets in logs
- [ ] Verify SSL/TLS certificate
- [ ] Test password reset flow
- [ ] Verify email verification flow

## Production Readiness Check

Run the automated checker:
```bash
node production-readiness-check.js
```

Expected result: All critical checks passing, warnings addressed.

## Common Issues & Solutions

### Database Connection Fails
- Verify DATABASE_URL is correct
- Check if database allows external connections
- Ensure SSL is enabled: `?sslmode=require`
- Check firewall rules

### Redis Connection Fails
- Verify REDIS_URL format: `redis://user:password@host:port`
- For TLS: `rediss://user:password@host:port`
- Check if Redis allows external connections

### Email Sending Fails
- Verify SendGrid API key is active
- Check sender email is verified
- Review SendGrid dashboard for bounces/blocks
- Ensure SMTP settings are correct

### AI Service Fails
- Verify ANTHROPIC_API_KEY is valid
- Check API quota/credits
- Review API usage in Anthropic console
- Check for rate limiting

### High Memory Usage
- Reduce cache TTL (CACHE_TTL_MS)
- Implement cache cleanup schedule
- Check for memory leaks in logs
- Consider upgrading server resources

### Rate Limiting Too Strict
- Adjust RATE_LIMIT_MAX_REQUESTS
- Adjust RATE_LIMIT_WINDOW_MS
- Consider tier-based rate limits

## Rollback Plan

If deployment fails:
1. Check logs for specific error
2. Revert to previous working version
3. Verify environment variables
4. Test locally with production settings
5. Fix issue and redeploy

## Performance Optimization

### After Initial Deployment
- [ ] Enable gzip compression
- [ ] Implement CDN for static assets
- [ ] Set up database connection pooling
- [ ] Enable Redis persistence
- [ ] Configure cache headers
- [ ] Set up database read replicas (if needed)
- [ ] Implement request queuing for AI calls

### Scaling Considerations
- [ ] Monitor server CPU/memory usage
- [ ] Monitor database connections
- [ ] Monitor Redis memory usage
- [ ] Plan for horizontal scaling
- [ ] Consider load balancer setup
- [ ] Plan for database sharding (if needed)

## Maintenance

### Regular Tasks
- [ ] Review error logs weekly
- [ ] Monitor API usage and costs
- [ ] Update dependencies monthly
- [ ] Backup database regularly
- [ ] Test backup restoration
- [ ] Review security advisories
- [ ] Monitor uptime and performance

### Monthly Health Check
```bash
# Run production readiness check
node production-readiness-check.js

# Check for outdated packages
npm outdated

# Check for security vulnerabilities
npm audit

# Review error logs
# Review performance metrics
# Review API costs
```

## Support & Documentation

- **Backend Repository**: https://github.com/Getgingee/errorwise-backend
- **Railway Deployment Guide**: See RAILWAY_DEPLOYMENT.md
- **Quick Start Guide**: See QUICK_START_RAILWAY.md
- **API Documentation**: See API_DOCUMENTATION.md

## Emergency Contacts

- Railway Support: https://railway.app/help
- SendGrid Support: https://support.sendgrid.com/
- Anthropic Support: https://support.anthropic.com/
- Database Provider Support: [Add your provider]

---

**Last Updated**: November 2025
**Version**: 1.0.0
