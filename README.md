# 🚀 ErrorWise Backend

> **AI-Powered Error Analysis Platform** - Intelligent error debugging with multi-tier subscriptions, real-time caching, and production-grade infrastructure.

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-blue)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red)](https://redis.io/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com/)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Core Features
- 🔐 **Authentication & Authorization**
  - JWT-based authentication
  - Security question password recovery (1 question)
  - Multi-device session management
  - Refresh token rotation

- 🤖 **AI-Powered Error Analysis**
  - Anthropic Claude integration (Haiku & Sonnet)
  - Context-aware error debugging
  - Solution recommendations
  - Multi-tier AI models (Free: Haiku, Team: Sonnet)

- 💳 **Subscription Management**
  - Free, Pro, and Team tiers
  - Dodo Payments integration
  - Upgrade/downgrade flows
  - Usage tracking per tier

- ⚡ **Redis Infrastructure**
  - Session storage (7-day expiry)
  - Response caching (30min-24hr TTL)
  - Rate limiting (tier-based)
  - 1000+ concurrent user support

- 🛡️ **Security & Performance**
  - Helmet.js security headers
  - CORS configuration
  - Rate limiting (100 req/min general, 5/15min auth)
  - Request logging with Winston
  - Comprehensive error handling

### Subscription Tiers

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| Error Queries/Day | 5 | 50 | Unlimited |
| AI Model | Claude Haiku | Claude Haiku | Claude Sonnet |
| Max Tokens | 800 | 1200 | 2000 |
| Team Members | 1 | 1 | 10 |
| Rate Limit | 10/min | 50/min | 200/min |
| Priority Support | ❌ | ✅ | ✅ |
| Advanced Analytics | ❌ | ✅ | ✅ |

---

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js 22.x
- **Framework:** Express 4.x
- **Database:** PostgreSQL 16.x (with Sequelize ORM)
- **Cache/Sessions:** Redis 7.x
- **Authentication:** JWT + bcrypt

### AI/ML
- **Anthropic:** Claude 3.5 Sonnet, Claude 3 Haiku
- **Fallback:** Enhanced mock responses

### Payment
- **Provider:** Dodo Payments
- **Support:** Subscriptions, webhooks, 3DS

### DevOps
- **Testing:** Jest
- **Logging:** Winston
- **Monitoring:** Morgan
- **Email:** Nodemailer (Mailtrap for dev)

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 22.x
- PostgreSQL >= 16.x
- Redis >= 7.x (optional but recommended)
- npm or yarn

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/PankajKumar2804/errorwise-backend.git
cd errorwise-backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Set up database
createdb errorwise
npm run migrate  # If you have migrations

# 5. Start Redis (if using Docker)
docker run -d -p 6379:6379 --name redis redis:latest

# 6. Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with the following:

```env
# Database
DATABASE_URL=postgres://postgres:password@localhost:5432/errorwise

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# AI API (ONLY ANTHROPIC ENABLED)
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-... (DISABLED)
# GEMINI_API_KEY=... (DISABLED)

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000

# Email (Mailtrap for development) future development
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_password

# Dodo Payments
DODO_API_KEY=your_dodo_api_key
DODO_SECRET_KEY=your_dodo_secret_key
DODO_MERCHANT_ID=your_merchant_id
```

### Running the Server

```bash
# Development with auto-reload
npm run dev

# Production
npm start

# Run tests
npm test
```

### Verify Installation

```bash
# Check server health
curl http://localhost:3001/health

# Check Redis connection
redis-cli ping  # Should return PONG

# Check database
psql -d errorwise -c "SELECT 1;"
```

---

## 📚 Documentation

### Setup & Configuration
- **[SETUP.md](./SETUP.md)** - Detailed setup instructions
- **[REDIS-IMPLEMENTATION.md](./REDIS-IMPLEMENTATION.md)** - Redis configuration & usage

### Deployment
- **[QUICK_START_RAILWAY.md](./QUICK_START_RAILWAY.md)** - 🚀 Deploy in 5 steps!
- **[RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)** - Complete Railway deployment guide
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - General production deployment guide

### API & Integration
- **[API-DOCUMENTATION.md](./API-DOCUMENTATION.md)** - Complete API reference
- **[FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md)** - Frontend integration guide

### Features
- **[FEATURES.md](./FEATURES.md)** - Detailed feature documentation

---

## 📁 Project Structure

```
errorwise-backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.js  # Sequelize configuration
│   │   └── redis.js     # Redis configuration
│   ├── controllers/     # Route controllers
│   │   ├── authController.js
│   │   ├── errorController.js
│   │   └── subscriptionController.js
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # JWT authentication
│   │   ├── session.js   # Redis session management
│   │   └── rateLimiter.js # Rate limiting
│   ├── models/          # Sequelize models
│   │   ├── User.js
│   │   ├── ErrorQuery.js
│   │   └── Subscription.js
│   ├── routes/          # API routes
│   │   ├── auth.js
│   │   ├── errors.js
│   │   └── subscriptions.js
│   ├── services/        # Business logic
│   │   ├── authService.js
│   │   ├── aiService.js
│   │   └── paymentService.js
│   └── utils/           # Utility functions
│       ├── logger.js
│       ├── cache.js
│       └── redisClient.js
├── docs/                # Additional documentation
│   └── archive/         # Old/archived docs
├── tests/               # Test files
├── server.js            # Application entry point
├── package.json
├── .env.example
└── README.md
```

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/register          # Register new user (1 security question)
POST   /api/auth/login             # Login user
POST   /api/auth/logout            # Logout user
POST   /api/auth/refresh           # Refresh access token
POST   /api/auth/forgot-password   # Request password reset
POST   /api/auth/reset-password    # Reset password with security answer
```

### Error Queries
```
POST   /api/errors                 # Submit error for analysis
GET    /api/errors/:id             # Get specific error query
GET    /api/errors/user/:userId    # Get user's error history
DELETE /api/errors/:id             # Delete error query
```

### Subscriptions
```
GET    /api/subscriptions/plans    # Get available plans
POST   /api/subscriptions/upgrade  # Upgrade subscription
POST   /api/subscriptions/cancel   # Cancel subscription
GET    /api/subscriptions/usage    # Get usage statistics
```

### Users
```
GET    /api/users/profile          # Get user profile
PUT    /api/users/profile          # Update profile
GET    /api/users/sessions         # Get active sessions
DELETE /api/users/sessions/:token  # Revoke specific session
```

For complete API documentation, see [API-DOCUMENTATION.md](./API-DOCUMENTATION.md).

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/auth.test.js
```

---

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

### Redis Stats
```bash
# Connect to Redis CLI
redis-cli

# View all keys
KEYS *

# Monitor real-time
MONITOR

# Check memory usage
INFO memory
```

### Database Stats
```bash
# Connect to PostgreSQL
psql -d errorwise

# View user count
SELECT COUNT(*) FROM users;

# View subscription distribution
SELECT subscription_tier, COUNT(*) FROM users GROUP BY subscription_tier;
```

---

## 🚢 Deployment

### Production Checklist

- [ ] Set all environment variables
- [ ] Use strong JWT secrets
- [ ] Configure production database
- [ ] Set up Redis (ElastiCache, Redis Labs, etc.)
- [ ] Configure SMTP for production emails
- [ ] Set up SSL/TLS certificates
- [ ] Enable CORS for production frontend URL
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy
- [ ] Test payment webhooks
- [ ] Set up CI/CD pipeline

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## 🔐 Security

- All passwords hashed with bcrypt (10 rounds)
- Security answers hashed before storage
- JWT tokens with expiration
- Rate limiting on all endpoints
- Helmet.js security headers
- CORS whitelist
- Input validation and sanitization
- SQL injection prevention (Sequelize ORM)
- XSS protection

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors

- **Pankaj Kumar** - [@PankajKumar2804](https://github.com/PankajKumar2804)

---

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- Google for Gemini API
- Dodo Payments for payment processing
- All open-source contributors

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/PankajKumar2804/errorwise-backend/issues)
- **Email:** support@errorwise.com
- **Documentation:** [Full Docs](./docs/)

---

## 🗓️ Changelog

### Latest (October 27, 2025)
- ✅ Added Redis for sessions & caching
- ✅ Implemented tier-based rate limiting
- ✅ Updated to single security question
- ✅ Fixed frontend dark UI
- ✅ Consolidated documentation

### Previous
- See [docs/archive/](./docs/archive/) for historical changes

---

## 🎯 Roadmap

- [ ] GraphQL API support
- [ ] WebSocket for real-time updates
- [ ] Advanced analytics dashboard
- [ ] Team collaboration features
- [ ] Mobile app API
- [ ] Multi-language support
- [ ] Custom AI model training

---

**Made with ❤️ by the ErrorWise Team**

*Last Updated: October 27, 2025*
