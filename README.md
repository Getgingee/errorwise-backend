# 🚀 ErrorWise Backend

> **AI-Powered Error Analysis Platform** - Intelligent error debugging with conversational AI, multi-tier subscriptions, web scraping for solutions, and production-grade infrastructure.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-blue)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red)](https://redis.io/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey)](https://expressjs.com/)
[![Railway](https://img.shields.io/badge/Deployed-Railway-purple)](https://railway.app/)

**Live Production:** [https://errorwise.tech](https://errorwise.tech)  
**API Endpoint:** `https://errorwise-backend-production.up.railway.app`

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
  - JWT-based authentication with refresh tokens
  - Security question password recovery
  - OTP-based email verification
  - Multi-device session management via Redis
  - GitHub OAuth integration

- 🤖 **AI-Powered Error Analysis**
  - Anthropic Claude integration (Haiku & Sonnet models)
  - Conversational follow-up questions (10 per query for Pro)
  - Context-aware error debugging with web scraping
  - TOON format for token-efficient AI communications
  - Smart model selection based on subscription tier

- 💬 **Conversational AI Chat**
  - Follow-up questions with context memory
  - Ask anything about tech (Pro feature)
  - Web search for latest solutions
  - Visual guides and how-to tutorials

- 💳 **Subscription Management**
  - Free, Pro, and Team tiers (Team coming soon)
  - Dodo Payments integration with webhooks
  - 7-day free trial for Pro
  - Upgrade/downgrade/pause/resume flows
  - Usage tracking and billing history

- ⚡ **Redis Infrastructure**
  - Session storage (7-day expiry)
  - Response caching (5min-1hr TTL)
  - Rate limiting (tier-based)
  - 1000+ concurrent user support

- 🛡️ **Security & Performance**
  - Helmet.js security headers
  - CORS configuration with wildcard support
  - Rate limiting per tier
  - Request logging with Winston
  - Tab abuse protection
  - Duplicate request prevention
  - Suspicious behavior detection
  - Compression enabled (gzip)

### Subscription Tiers

| Feature | Free | Pro ($3/mo) | Team ($8/mo) |
|---------|------|-------------|--------------|
| Error Solutions/Month | 50 | Unlimited | Unlimited |
| Daily Queries | 10 | Unlimited | Unlimited |
| AI Model | Claude Haiku | Claude Haiku | Claude Sonnet |
| Max Tokens | 800 | 1200 | 2000 |
| History | 7 days | Unlimited | Unlimited |
| Follow-up Questions | ❌ | 10/query | 10/query |
| Web Search | ❌ | ✅ | ✅ |
| Export (JSON/CSV) | ❌ | ✅ | ✅ |
| Team Members | 1 | 1 | 10 |
| Support | Community | Email | Priority |

---

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express 4.x
- **Database:** PostgreSQL 16.x (with Sequelize ORM)
- **Cache/Sessions:** Redis 7.x
- **Authentication:** JWT + bcrypt + Redis sessions

### AI/ML
- **Primary:** Anthropic Claude 3.5 Sonnet, Claude 3 Haiku
- **Fallback:** Enhanced mock responses
- **Format:** TOON (Token Object-Oriented Notation) for efficiency

### Payment
- **Provider:** Dodo Payments
- **Support:** Subscriptions, webhooks, trials

### DevOps
- **Hosting:** Railway (production)
- **Logging:** Winston + Morgan
- **Email:** SendGrid (production), Mailtrap (dev)
- **Process:** Cluster mode for multi-core support

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.x
- PostgreSQL >= 16.x
- Redis >= 7.x
- npm or yarn

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Getgingee/errorwise-backend.git
cd errorwise-backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Start Redis (if using Docker)
docker run -d -p 6379:6379 --name redis redis:latest

# 5. Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with the following:

```env
# Database (Railway PostgreSQL or local)
DATABASE_URL=postgres://user:password@host:port/database

# Redis (Railway Redis or local)
REDIS_URL=redis://localhost:6379

# JWT Secrets (generate with: node generate-secrets.js)
JWT_SECRET=your_jwt_secret_here_min_32_characters
JWT_REFRESH_SECRET=your_refresh_secret_here_min_32_characters

# AI API (ONLY ANTHROPIC ENABLED)
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://errorwise.tech
CORS_ORIGIN=https://errorwise.tech,https://www.errorwise.tech

# Email (SendGrid for production)
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=noreply@errorwise.tech

# Dodo Payments
DODO_API_KEY=your_dodo_api_key
DODO_WEBHOOK_SECRET=your_webhook_secret
```

### Running the Server

```bash
# Development with auto-reload
npm run dev

# Production (with clustering)
npm start
```

### Verify Installation

```bash
# Check server health
curl http://localhost:3001/health

# Ping endpoint
curl http://localhost:3001/ping
```

---

## 📚 Documentation

### Primary Documentation
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Complete API reference
- **[SETUP.md](./SETUP.md)** - Detailed setup instructions
- **[.env.example](./.env.example)** - All environment variables

### Deployment
- **[QUICK_START_RAILWAY.md](./QUICK_START_RAILWAY.md)** - Deploy to Railway in 5 steps
- **[DODOPAYMENTS-WEBHOOKS-SETUP.md](./DODOPAYMENTS-WEBHOOKS-SETUP.md)** - Payment webhooks

### Features
- **[SUBSCRIPTION_FEATURES_STATUS.md](./SUBSCRIPTION_FEATURES_STATUS.md)** - Tier features
- **[COMPREHENSIVE_FEATURES_IMPLEMENTED.md](./COMPREHENSIVE_FEATURES_IMPLEMENTED.md)** - All features

---

## 📁 Project Structure

```
errorwise-backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.js  # Sequelize configuration
│   │   ├── modelConfig.js # AI model configuration (central)
│   │   └── platformStats.js # Platform statistics
│   ├── controllers/     # Route controllers
│   │   ├── authController.js
│   │   ├── errorController.js
│   │   ├── subscriptionController.js
│   │   └── userController.js
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # JWT authentication
│   │   ├── session.js   # Redis session management
│   │   ├── rateLimiter.js # Rate limiting
│   │   ├── security.js  # Security protections
│   │   └── validation.js # Input validation
│   ├── models/          # Sequelize models
│   │   ├── User.js
│   │   ├── ErrorQuery.js
│   │   ├── Subscription.js
│   │   └── userSettings.js
│   ├── routes/          # API routes (34 route files)
│   │   ├── auth.js, authEnhanced.js
│   │   ├── errors.js, chat.js, conversation.js
│   │   ├── subscriptions.js, plans.js, trial.js
│   │   ├── users.js, settings.js
│   │   ├── teams.js, videoMeetings.js
│   │   └── ... (and more)
│   ├── services/        # Business logic
│   │   ├── aiService.js       # AI error analysis
│   │   ├── authService.js     # Authentication
│   │   ├── paymentService.js  # Dodo Payments
│   │   ├── emailService.js    # SendGrid emails
│   │   └── subscriptionService.js
│   └── utils/           # Utility functions
│       ├── logger.js
│       ├── redisClient.js
│       └── errors.js
├── cluster.js           # Multi-core clustering
├── server.js            # Application entry point
├── package.json
├── .env.example
└── README.md
```

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/register           # Register new user
POST   /api/auth/login              # Login user
POST   /api/auth/logout             # Logout user
POST   /api/auth/refresh            # Refresh access token
POST   /api/auth/forgot-password    # Request password reset
POST   /api/auth/reset-password     # Reset with security answer
POST   /api/auth/verify-email       # Verify email with OTP
POST   /api/auth/resend-otp         # Resend verification OTP
GET    /api/auth/github             # GitHub OAuth login
GET    /api/auth/github/callback    # GitHub OAuth callback
```

### Error Analysis
```
POST   /api/errors/analyze          # Submit error for AI analysis
GET    /api/errors/usage            # Get usage stats
GET    /api/errors/history          # Get error history
GET    /api/errors/:id              # Get specific error
DELETE /api/errors/:id              # Delete error
GET    /api/errors/export           # Export history (Pro+)
```

### Conversational AI
```
POST   /api/chat/follow-up          # Follow-up question (Pro+)
POST   /api/conversation/chat       # Conversational chat
GET    /api/models                  # Get available AI models
```

### Subscriptions
```
GET    /api/subscriptions           # Get current subscription
GET    /api/subscriptions/plans     # Get available plans (public)
POST   /api/subscriptions/checkout  # Create checkout session
GET    /api/subscriptions/billing   # Get billing info
GET    /api/subscriptions/usage     # Get usage statistics
GET    /api/subscriptions/history   # Get payment history
POST   /api/subscriptions/cancel    # Cancel subscription
POST   /api/subscriptions/pause     # Pause subscription
POST   /api/subscriptions/resume    # Resume subscription
POST   /api/webhooks/dodo           # Dodo Payments webhook
```

### Users
```
GET    /api/users/profile           # Get user profile
PUT    /api/users/profile           # Update profile
PUT    /api/users/password          # Change password
DELETE /api/users/account           # Delete account
GET    /api/users/trial/status      # Get trial status
POST   /api/users/trial/start       # Start 7-day trial
```

### Settings & Preferences
```
GET    /api/settings                # Get user settings
PUT    /api/settings                # Update settings
```

### Health & Status
```
GET    /health                      # Health check
GET    /ping                        # Simple ping
GET    /api/stats                   # Platform statistics
GET    /api/ai-status               # AI service status
```

For complete API documentation, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

---

## 🚢 Deployment

### Railway Deployment (Recommended)

1. Connect your GitHub repository to Railway
2. Add PostgreSQL and Redis addons
3. Set environment variables
4. Deploy automatically on push to main

**Production URL:** `https://errorwise-backend-production.up.railway.app`

### Production Checklist

- [x] Set all environment variables
- [x] Use strong JWT secrets (32+ characters)
- [x] Configure production database (Railway PostgreSQL)
- [x] Set up Redis (Railway Redis)
- [x] Configure SendGrid for emails
- [x] Configure CORS for production frontend
- [x] Set up Dodo Payments webhooks
- [x] Enable clustering for multi-core

For detailed deployment instructions, see [QUICK_START_RAILWAY.md](./QUICK_START_RAILWAY.md).

---

## 🔐 Security

- All passwords hashed with bcrypt (12 rounds)
- Security answers hashed before storage
- JWT tokens with short expiration (1h access, 7d refresh)
- Redis-backed sessions with automatic expiry
- Rate limiting on all endpoints (tier-based)
- Helmet.js security headers
- CORS whitelist with wildcard support
- Input validation and sanitization
- SQL injection prevention (Sequelize ORM)
- XSS protection
- Tab abuse protection
- Duplicate request prevention
- Suspicious behavior detection

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors

- **Getgingee Team** - [@Getgingee](https://github.com/Getgingee)

---

## 🙏 Acknowledgments

- Anthropic for Claude AI API
- Dodo Payments for payment processing
- Railway for hosting
- All open-source contributors

---

## 📞 Support

- **Website:** [errorwise.tech](https://errorwise.tech)
- **Issues:** [GitHub Issues](https://github.com/Getgingee/errorwise-backend/issues)
- **Email:** support@errorwise.tech

---

## 🗓️ Changelog

### December 2025
- ✅ Conversational AI with follow-up questions
- ✅ Web scraping for solution context
- ✅ TOON format for token efficiency
- ✅ 7-day free trial for Pro
- ✅ Email verification with OTP
- ✅ GitHub OAuth integration
- ✅ Enhanced security middleware
- ✅ Subscription pause/resume
- ✅ Export to JSON/CSV (Pro+)

### Previous Updates
- See [CHANGELOG.md](./CHANGELOG.md) for full history

---

## 🎯 Roadmap

- [x] Conversational AI chat
- [x] Web search for solutions
- [x] Multi-language support
- [ ] Team collaboration features
- [ ] Mobile app API
- [ ] GraphQL API support
- [ ] WebSocket for real-time updates
- [ ] Advanced analytics dashboard

---

**Made with ❤️ by the Getgingee Team**

*Last Updated: December 12, 2025*
