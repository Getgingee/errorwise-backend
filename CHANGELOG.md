# Changelog

All notable changes to the ErrorWise Backend project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-11-04

### 🎉 Initial Release

Complete AI-powered error resolution platform with enterprise-grade features.

### ✨ Features Added

#### Authentication & Security
- JWT-based authentication with access and refresh tokens
- Email/password authentication with bcrypt hashing
- GitHub OAuth integration
- Magic link (OTP) authentication via email
- Password reset functionality with email verification
- Email verification for new accounts
- Redis-backed session management with 7-day expiry
- Rate limiting on all endpoints (tier-based)
- CSRF protection
- Security headers via Helmet.js
- Multi-device session support

#### AI Integration
- Multi-model AI support:
  - OpenAI GPT-3.5 Turbo & GPT-4
  - Google Gemini Flash 1.5 & Gemini Pro
  - Anthropic Claude Haiku & Sonnet 3.5
- Intelligent fallback system between AI providers
- Tier-based AI model access (Free → Pro → Team)
- Context-aware error analysis
- Support for 15+ programming languages
- URL scraping for GitHub and Stack Overflow context
- Multi-language response support (15+ Indian languages)
- Response caching for similar queries

#### Subscription Management
- Three-tier system: Free, Pro ($19/mo), Team ($49/mo)
- Daily and monthly query limits per tier
- Real-time usage tracking
- Dodo Payments integration for Indian market
- Automatic subscription renewal
- Upgrade/downgrade flows
- Payment webhook handling
- Usage statistics and analytics

#### User Management
- User profile management (name, email, preferences)
- Password change functionality
- Account deletion with confirmation
- Query history with pagination
- Preferred language settings
- Last login tracking
- Statistics dashboard

#### Platform Features
- Health check endpoint with service status
- Platform statistics (users, queries, subscriptions)
- Public demo endpoint for testing
- Comprehensive error logging with Winston
- HTTP request logging with Morgan
- Support and feedback system
- Help center and FAQ
- Contact form

#### Database & Caching
- PostgreSQL with Sequelize ORM
- Redis for session storage and caching
- Optimized database queries with indexes
- Connection pooling
- Automatic migrations
- Seed data for development

### 🛠 Technical Improvements
- Express.js 4.x framework
- Node.js 16+ support
- RESTful API design
- Comprehensive error handling
- Input validation with express-validator
- HTML sanitization
- CORS configuration
- Environment-based configuration
- Production-ready logging
- Graceful shutdown handling

### 📚 Documentation
- Comprehensive README with badges
- Complete API documentation
- Contributing guidelines
- Setup and deployment guides
- Environment variable documentation
- Code examples and use cases
- Architecture overview
- Testing documentation

### 🧪 Testing
- Jest testing framework
- Unit tests for services
- Integration tests for API endpoints
- Test coverage reporting
- Mock AI responses for testing

### 🚀 Deployment
- Docker support with docker-compose
- Environment variable management
- Production configuration examples
- Railway/Render deployment ready
- Health checks for monitoring
- Graceful error recovery

### 🔒 Security
- Password strength requirements
- Rate limiting per endpoint
- JWT token expiration
- Refresh token rotation
- Session invalidation on logout
- CSRF token validation
- SQL injection prevention
- XSS protection
- Input sanitization

---

## [0.9.0] - 2025-10-27 (Beta)

### Added
- Redis implementation for sessions
- Tier-based rate limiting
- Single security question for password reset
- Dark UI fixes for frontend
- Documentation consolidation

### Changed
- Migrated from multiple security questions to single question
- Updated session management to use Redis
- Consolidated scattered documentation files

### Fixed
- Frontend dark mode UI issues
- OTP expiry timezone handling
- Session persistence issues

---

## [0.8.0] - 2025-10-23 (Alpha)

### Added
- Basic authentication system
- PostgreSQL database integration
- OpenAI GPT integration
- Basic subscription tiers
- User registration and login

### Changed
- Initial project structure
- Basic API endpoints

---

## Upcoming Features (Roadmap)

### [1.1.0] - Planned
- [ ] GraphQL API support
- [ ] WebSocket for real-time updates
- [ ] Advanced analytics dashboard
- [ ] Team collaboration features
- [ ] Custom AI model fine-tuning

### [1.2.0] - Planned
- [ ] Mobile app API
- [ ] Multi-language UI support
- [ ] Code snippet highlighting
- [ ] IDE extensions integration
- [ ] Slack/Discord bot integration

### [2.0.0] - Future
- [ ] Self-hosted deployment option
- [ ] Enterprise features
- [ ] Custom branding
- [ ] Advanced team management
- [ ] SLA guarantees

---

## Migration Guides

### Upgrading from 0.9.0 to 1.0.0

1. **Environment Variables**:
   - Add new AI API keys (Gemini, Claude)
   - Update Redis configuration
   - Add Dodo Payments credentials

2. **Database**:
   ```bash
   npm run migrate
   ```

3. **Dependencies**:
   ```bash
   npm install
   ```

4. **Breaking Changes**:
   - Security questions reduced to single question
   - Session format changed (Redis-backed)
   - Rate limit configuration updated

---

## Version Support

| Version | Release Date | End of Support | Status |
|---------|--------------|----------------|--------|
| 1.0.x   | 2025-11-04   | 2026-11-04     | ✅ Active |
| 0.9.x   | 2025-10-27   | 2025-12-27     | 🔄 Security Updates |
| 0.8.x   | 2025-10-23   | 2025-11-23     | ❌ Deprecated |

---

## Contributors

### Core Team
- **Pankaj Kumar** - Initial development and architecture
- **Getgingee Organization** - Project maintainer

### Special Thanks
- OpenAI for GPT API
- Google for Gemini API
- Anthropic for Claude API
- All open-source contributors

---

## Links

- **Homepage**: https://github.com/Getgingee/errorwise-backend
- **Issue Tracker**: https://github.com/Getgingee/errorwise-backend/issues
- **Documentation**: https://github.com/Getgingee/errorwise-backend/tree/main/docs
- **Changelog**: https://github.com/Getgingee/errorwise-backend/blob/main/CHANGELOG.md

---

[1.0.0]: https://github.com/Getgingee/errorwise-backend/releases/tag/v1.0.0
[0.9.0]: https://github.com/Getgingee/errorwise-backend/releases/tag/v0.9.0
[0.8.0]: https://github.com/Getgingee/errorwise-backend/releases/tag/v0.8.0
