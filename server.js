

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');  // PERFORMANCE: Add compression
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const logger = require('./src/utils/logger');
const { connectRedis } = require('./src/utils/redisClient');
const { sessionMiddleware } = require('./src/middleware/session');
const { rateLimiters } = require('./src/middleware/rateLimiter');

// ============================================================================
// CRASH PREVENTION - Handle uncaught errors to prevent server crashes
// ============================================================================
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION - Server continuing:', error);
  logger.error('Uncaught exception:', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION - Server continuing:', reason);
  logger.error('Unhandled rejection:', { reason, promise });
  // Don't exit - keep server running
});

const app = express();

// ============================================================================
// PROXY CONFIGURATION - Required for Railway/Vercel behind reverse proxy
// ============================================================================
app.set('trust proxy', 1); // Trust first proxy (Railway's load balancer)

// ============================================================================
// PERFORMANCE: Enable compression for all responses
// ============================================================================
app.use(compression({
  filter: (req, res) => {
    // Don't compress responses with no-transform directive
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level (1-9)
  threshold: 1024 // Only compress responses > 1KB
}));

// Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production'
}));

// CORS configuration - supports wildcards like https://*.vercel.app
// Production fallback includes common ErrorWise domains
const getDefaultCorsOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return [
      'https://errorwise.tech',
      'https://www.errorwise.tech',
      'https://*.vercel.app',
      'https://errorwise-frontend.vercel.app',
      'https://errorwise-frontend-*.vercel.app'
    ];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
};

const corsOrigin = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : getDefaultCorsOrigins();

// Function to check if origin matches wildcard pattern
const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return false;
  
  for (const allowed of allowedOrigins) {
    // Exact match
    if (allowed === origin) return true;
    
    // Wildcard match (e.g., https://*.vercel.app)
    if (allowed.includes('*')) {
      const pattern = allowed
        .replace(/\./g, '\\.')  // Escape dots
        .replace(/\*/g, '.*');  // Convert * to regex .*
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) return true;
    }
  }
  return false;
};

app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
    
    if (isOriginAllowed(origin, allowedOrigins)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Logging - different format for production
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined')); // Apache combined format for production
} else {
  app.use(morgan('dev')); // Colored output for development
}

app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Security middleware - MUST be before routes
const { 
  sanitizeInput, 
  detectSpam, 
  securityHeaders,
  preventTabAbuse,
  preventRequestFlooding,
  preventDuplicateRequests,
  detectSuspiciousBehavior,
  requestIdMiddleware,
  apiKeyRateLimiter
} = require('./src/middleware/security');

app.use(requestIdMiddleware); // Add unique request ID for tracking/debugging
app.use(securityHeaders); // Add security headers to all responses
app.use(sanitizeInput); // Sanitize all inputs (XSS, SQL injection, code injection)
app.use(apiKeyRateLimiter()); // Rate limit external API key usage

// Session middleware (loads user session from Redis)
app.use(sessionMiddleware);

// Tab abuse & resource protection - Apply globally
app.use(preventRequestFlooding); // Rate limit based on user tier
app.use(preventTabAbuse); // Limit concurrent sessions/tabs
app.use(preventDuplicateRequests); // Prevent double-click submissions
app.use(detectSuspiciousBehavior); // Detect bot/abuse patterns

// General rate limiting DISABLED for development/testing
// app.use(rateLimiters.general);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} → ${req.method} ${req.originalUrl}`);
  next();
});

// Import database
const sequelize = require('./src/config/database');

// Import models to ensure they're loaded
require('./src/models/User');
require('./src/models/ErrorQuery');
require('./src/models/Subscription');
require('./src/models/QueryLog'); // A1 - Central Error Logging
require('./src/models/Event'); // D1 - Event Tracking

// Import associations to set up model relationships
require('./src/models/associations');

// Import routes
const authRoutes = require('./src/routes/auth');
const authEnhancedRoutes = require('./src/routes/authEnhanced');
const errorRoutes = require('./src/routes/errors');
const userRoutes = require('./src/routes/users');
const subscriptionRoutes = require('./src/routes/subscriptions');
const historyRoutes = require('./src/routes/history');
const settingsRoutes = require('./src/routes/settings');
const publicDemoRoutes = require('./src/routes/publicDemo');
const supportRoutes = require('./src/routes/support');
const teamRoutes = require('./src/routes/teams');
const webhookRoutes = require('./src/routes/webhooks'); // Dodo Payments webhooks
const adminRoutes = require('./src/routes/admin'); // Admin operations
const libraryRoutes = require('./src/routes/library'); // Error Library - pre-built solutions
const usageRoutes = require('./src/routes/usage'); // C3 - Usage meter and limits
const upgradeRoutes = require('./src/routes/upgrade'); // C4 - Pro upgrade flow

// EPIC E - Conversion Optimisation
const smartUpgradeRoutes = require('./src/routes/smartUpgrade'); // E1 - Smart upgrade prompts
const plansRoutes = require('./src/routes/plans'); // E2 - Compare plans modal
const socialProofRoutes = require('./src/routes/socialProof'); // E3 - Social proof section

// EPIC F - Early Retention Hooks
const digestRoutes = require('./src/routes/digest'); // F1 - Weekly email digest
const feedbackRoutes = require('./src/routes/feedback'); // F2 - Success feedback
const referralRoutes = require('./src/routes/referral'); // F3 - Referral program
const modelsRoutes = require('./src/routes/models'); // AI Model selection
const configRoutes = require('./src/routes/configRoutes'); // App configuration - single source of truth
// const couponsRoutes = require('./src/routes/coupons'); // Discount coupons system - disabled, using Dodo Payments coupons

// PERFORMANCE - Response time monitoring
const { router: performanceRoutes, responseTimeMiddleware } = require('./src/routes/performance');

// Apply response time tracking middleware (before routes)
app.use(responseTimeMiddleware);

// Health check - Multiple endpoints for Railway compatibility
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'ErrorWise API is running', 
    status: 'OK',
    version: '1.0.0',
    timestamp: new Date().toISOString() 
  });
});

const healthRoutes = require('./src/routes/health');
app.use('/', healthRoutes);

// AI Service Health Check (debug endpoint)
app.get('/api/ai-status', (req, res) => {
  const aiService = require('./src/services/aiService');
  const health = aiService.getServiceHealth();
  
  // Add config check
  const configStatus = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET (length: ' + process.env.ANTHROPIC_API_KEY.length + ')' : 'NOT SET',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  res.json({
    ...health,
    config: configStatus,
    timestamp: new Date().toISOString()
  });
});

// Platform statistics (public endpoint - real-time calculations)
app.get('/api/stats', async (req, res) => {
  try {
    const { calculatePlatformStats, getPlatformCapabilities } = require('./src/config/platformStats');
    
    const includeCapabilities = req.query.capabilities === 'true';
    const stats = await calculatePlatformStats();
    
    if (includeCapabilities) {
      stats.capabilities = getPlatformCapabilities();
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ 
      error: 'Failed to calculate statistics',
      message: error.message 
    });
  }
});

// Mount API routes
app.use('/api/public/demo', detectSpam, publicDemoRoutes); // Public demo - with spam detection

// Debug: AI service test endpoint
app.get('/api/ai-test', async (req, res) => {
  try {
    const aiService = require('./src/services/aiService');
    
    // Just check if the service loads
    const health = aiService.getServiceHealth();
    
    // Try a simple analyze
    const result = await aiService.analyzeError({
      errorMessage: 'Test JavaScript undefined error',
      errorType: 'general',
      subscriptionTier: 'free',
      userId: null,
      codeSnippet: null
    });
    
    res.json({
      success: true,
      health,
      resultKeys: Object.keys(result || {}),
      hasExplanation: !!result?.explanation,
      hasSolution: !!result?.solution
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5)
    });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/auth', authEnhancedRoutes); // Enhanced auth with tracking
app.use('/api/errors', errorRoutes);
app.use('/api/conversation', require('./src/routes/conversation')); // Conversational AI with web scraping
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/support', detectSpam, supportRoutes); // Feedback, Contact, Help Center, Newsletter - with spam detection
app.use('/api/teams', teamRoutes); // Team management - requires TEAM subscription
app.use('/api/admin', adminRoutes); // Admin operations - requires admin role
app.use('/api/library', libraryRoutes); // Error Library - browse pre-built solutions
app.use('/api/usage', usageRoutes); // C3 - Usage meter and limit enforcement
app.use('/api/upgrade', upgradeRoutes); // C4 - Pro upgrade flow with DodoPayments

// EPIC E - Conversion Optimisation routes
app.use('/api/smart-upgrade', smartUpgradeRoutes); // E1 - Smart upgrade prompts
app.use('/api/plans', plansRoutes); // E2 - Compare plans modal
app.use('/api/social-proof', socialProofRoutes); // E3 - Social proof for landing

// EPIC F - Early Retention Hooks routes
app.use('/api/digest', digestRoutes); // F1 - Weekly email digest
app.use('/api/feedback', feedbackRoutes); // F2 - Success feedback with sharing
app.use('/api/referral', referralRoutes); // F3 - Referral program
app.use('/api/models', modelsRoutes); // AI Model selection for conversational AI
app.use('/api/config', configRoutes); // App configuration - SINGLE SOURCE OF TRUTH for frontend
// app.use('/api/coupons', couponsRoutes); // Disabled - using Dodo Payments built-in coupons

// Tier management and feature access
app.use('/api/tiers', require('./src/routes/tiers'));
app.use('/api/chat', require('./src/routes/chat')); // Conversational AI chat

// PERFORMANCE - Response time monitoring
app.use('/api/performance', performanceRoutes);

// TODO: Temporarily disabled for short-term - will enable in future
// app.use('/api/content', require('./src/routes/content')); // Privacy, Terms, About, Community
app.use('/api/webhooks', webhookRoutes); // Dodo Payments webhook endpoint(s)

// Import professional error handlers
const { errorHandler, notFoundHandler } = require('./src/utils/errors');

// 404 handler - use professional handler
app.use('*', notFoundHandler);

// Global error handler - MUST be last middleware - use professional handler
app.use(errorHandler);

// Database connection and server start
const start = async () => {
  try {
    console.log(`\n🚀 Starting ErrorWise Backend...`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API Base URL: ${process.env.API_BASE_URL || 'http://localhost:3001'}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);

    // Connect to Redis first (both redisClient and redisService)
    try {
      await connectRedis();
      
      // Also connect the redisService singleton used by chatController
      const redisService = require('./src/services/redisService');
      await redisService.connect();
      
      console.log('✅ Redis initialization complete');
    } catch (redisError) {
      console.warn('⚠️  Redis connection failed - sessions will use memory store:', redisError.message);
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Redis is required in production mode');
        throw redisError;
      }
    }
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Run migrations in production (create ErrorQueries table if missing)
    if (process.env.NODE_ENV === 'production') {
      try {
        console.log('📝 Checking for required tables and columns...');
        
        // Check if ErrorQueries table exists
        const [results] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'ErrorQueries'
          );
        `);
        
        if (!results[0].exists) {
          console.log('⚠️  ErrorQueries table missing. Creating...');
          
          // Create ErrorQueries table
          await sequelize.query(`
            CREATE TABLE "ErrorQueries" (
              "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
              "errorMessage" TEXT NOT NULL,
              "explanation" TEXT NOT NULL,
              "solution" TEXT,
              "errorCategory" VARCHAR(255) DEFAULT 'general',
              "aiProvider" VARCHAR(255) DEFAULT 'mock',
              "userSubscriptionTier" VARCHAR(255) NOT NULL DEFAULT 'free' CHECK ("userSubscriptionTier" IN ('free', 'pro', 'team')),
              "responseTime" INTEGER,
              "tags" JSONB DEFAULT '[]'::jsonb,
              "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
          `);
          
          // Create indexes
          await sequelize.query(`
            CREATE INDEX "error_queries_user_created_idx" ON "ErrorQueries" ("userId", "createdAt");
          `);
          await sequelize.query(`
            CREATE INDEX "error_queries_category_idx" ON "ErrorQueries" ("errorCategory");
          `);
          
          console.log('✅ ErrorQueries table created successfully');
        } else {
          console.log('✅ ErrorQueries table exists');
        }
        
        // ============================================================================
        // C1 & C2 MIGRATION: Add usage counter columns to users table
        // ============================================================================
        console.log('📝 Checking for usage counter columns (C1 & C2)...');
        
        const [usersColumns] = await sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' 
          AND column_name IN (
            'queries_used_this_period', 'period_start_date', 
            'trial_queries_used', 'trial_ended_notified',
            'usage_emails_enabled', 'trial_ending_notified', 'limit_warning_notified'
          )
        `);
        
        const existingColumns = usersColumns.map(r => r.column_name);
        
        // Add queries_used_this_period if missing
        if (!existingColumns.includes('queries_used_this_period')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN queries_used_this_period INTEGER DEFAULT 0`);
          console.log('✅ Added: queries_used_this_period');
        }
        
        // Add period_start_date if missing
        if (!existingColumns.includes('period_start_date')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN period_start_date TIMESTAMP WITH TIME ZONE`);
          console.log('✅ Added: period_start_date');
        }
        
        // Add trial_queries_used if missing (C2)
        if (!existingColumns.includes('trial_queries_used')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN trial_queries_used INTEGER DEFAULT 0`);
          console.log('✅ Added: trial_queries_used');
        }
        
        // Add trial_ended_notified if missing (C2)
        if (!existingColumns.includes('trial_ended_notified')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN trial_ended_notified BOOLEAN DEFAULT false`);
          console.log('✅ Added: trial_ended_notified');
        }
        
        // Add usage_emails_enabled if missing
        if (!existingColumns.includes('usage_emails_enabled')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN usage_emails_enabled BOOLEAN DEFAULT true`);
          console.log('✅ Added: usage_emails_enabled');
        }
        
        // Add trial_ending_notified if missing
        if (!existingColumns.includes('trial_ending_notified')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN trial_ending_notified BOOLEAN DEFAULT false`);
          console.log('✅ Added: trial_ending_notified');
        }
        
        // Add limit_warning_notified if missing
        if (!existingColumns.includes('limit_warning_notified')) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN limit_warning_notified BOOLEAN DEFAULT false`);
          console.log('✅ Added: limit_warning_notified');
        }
        
        // Add has_used_trial column if missing (for trial abuse prevention)
        const [hasUsedTrialCheck] = await sequelize.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'has_used_trial'
        `);
        if (hasUsedTrialCheck.length === 0) {
          await sequelize.query(`ALTER TABLE users ADD COLUMN has_used_trial BOOLEAN DEFAULT false`);
          console.log('✅ Added: has_used_trial');
        }
        
        // Initialize period_start_date for existing users
        await sequelize.query(`
          UPDATE users SET period_start_date = date_trunc('month', CURRENT_TIMESTAMP) 
          WHERE period_start_date IS NULL
        `);
        
        // Set trial_ends_at for existing free users without it
        await sequelize.query(`
          UPDATE users SET trial_ends_at = CURRENT_TIMESTAMP + INTERVAL '7 days' 
          WHERE trial_ends_at IS NULL AND subscription_tier = 'free'
        `);
        
        console.log('✅ Usage counter columns verified');
        
        // ============================================================================
        // NEWSLETTER TABLE: Create if missing
        // ============================================================================
        console.log('📝 Checking for newsletter subscriptions table...');
        
        const [newsletterExists] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'newslettersubscriptions'
          )
        `);
        
        if (!newsletterExists[0].exists) {
          console.log('⚠️  NewsletterSubscriptions table missing. Creating...');
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS newslettersubscriptions (
              id SERIAL PRIMARY KEY,
              user_id UUID REFERENCES users(id) ON DELETE SET NULL,
              email VARCHAR(255) NOT NULL UNIQUE,
              name VARCHAR(255),
              status VARCHAR(50) DEFAULT 'active',
              subscription_type VARCHAR(50) DEFAULT 'general',
              source VARCHAR(50) DEFAULT 'website',
              unsubscribe_token VARCHAR(255) UNIQUE,
              ip_address VARCHAR(45),
              user_agent TEXT,
              confirmed_at TIMESTAMP WITH TIME ZONE,
              email_count INTEGER DEFAULT 0,
              last_email_sent_at TIMESTAMP WITH TIME ZONE,
              unsubscribed_at TIMESTAMP WITH TIME ZONE,
              unsubscribe_reason TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
          `);
          console.log('✅ NewsletterSubscriptions table created');
        } else {
          console.log('✅ NewsletterSubscriptions table exists');
        }
        
        // ============================================================================
        // EVENTS TABLE: D1 - Event Tracking Layer
        // ============================================================================
        console.log('📝 Checking for events table (D1 - Event Tracking)...');
        
        const [eventsExists] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'events'
          )
        `);
        
        if (!eventsExists[0].exists) {
          console.log('⚠️  Events table missing. Creating...');
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS events (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID REFERENCES users(id) ON DELETE SET NULL,
              anonymous_id VARCHAR(64),
              event_name VARCHAR(100) NOT NULL,
              timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
              subscription_tier VARCHAR(20) DEFAULT 'free',
              properties JSONB DEFAULT '{}',
              session_id VARCHAR(64),
              ip_hash VARCHAR(64),
              user_agent VARCHAR(255),
              page VARCHAR(255),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          // Create indexes for events table
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id)`);
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name)`);
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)`);
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_events_anonymous_id ON events(anonymous_id)`);
          await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_events_name_timestamp ON events(event_name, timestamp)`);
          
          console.log('✅ Events table created with indexes (D1 - Event Tracking)');
        } else {
          console.log('✅ Events table exists');
        }
        
        // ============================================================================
        // MISSING COLUMNS: ErrorQueries and Subscriptions tables
        // ============================================================================
        console.log('📝 Checking for missing columns in ErrorQueries and Subscriptions...');
        
        // Check ErrorQueries for feedback columns (using camelCase to match Sequelize model)
        const [errorQueryColumns] = await sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ErrorQueries' 
          AND column_name IN ('feedback', 'feedbackAt', 'feedbackComment')
        `);
        
        const eqColumns = errorQueryColumns.map(r => r.column_name);
        
        if (!eqColumns.includes('feedback')) {
          await sequelize.query(`ALTER TABLE "ErrorQueries" ADD COLUMN IF NOT EXISTS feedback VARCHAR(20)`);
          console.log('✅ Added: ErrorQueries.feedback');
        }
        if (!eqColumns.includes('feedbackAt')) {
          await sequelize.query(`ALTER TABLE "ErrorQueries" ADD COLUMN IF NOT EXISTS "feedbackAt" TIMESTAMP WITH TIME ZONE`);
          console.log('✅ Added: ErrorQueries.feedbackAt');
        }
        if (!eqColumns.includes('feedbackComment')) {
          await sequelize.query(`ALTER TABLE "ErrorQueries" ADD COLUMN IF NOT EXISTS "feedbackComment" TEXT`);
          console.log('✅ Added: ErrorQueries.feedbackComment');
        }
        
        // Check Subscriptions for payment columns
        const [subscriptionColumns] = await sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'Subscriptions' 
          AND column_name IN ('paymentMethod', 'cancelAtPeriodEnd')
        `);
        
        const subColumns = subscriptionColumns.map(r => r.column_name);
        
        if (!subColumns.includes('paymentMethod')) {
          await sequelize.query(`ALTER TABLE "Subscriptions" ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(50)`);
          console.log('✅ Added: Subscriptions.paymentMethod');
        }
        if (!subColumns.includes('cancelAtPeriodEnd')) {
          await sequelize.query(`ALTER TABLE "Subscriptions" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN DEFAULT false`);
          console.log('✅ Added: Subscriptions.cancelAtPeriodEnd');
        }
        
        // === Check query_logs table columns (snake_case - for QueryLog model) ===
        console.log('🔍 Checking query_logs table columns...');
        const [queryLogsColumns] = await sequelize.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'query_logs' 
          AND column_name IN ('feedback', 'feedback_at', 'feedback_comment')
        `);
        
        const qlColumns = queryLogsColumns.map(r => r.column_name);
        console.log('📊 query_logs existing columns:', qlColumns);
        
        // Check if query_logs table exists first
        const [tableExists] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'query_logs'
          ) as exists
        `);
        
        if (tableExists[0]?.exists) {
          if (!qlColumns.includes('feedback')) {
            await sequelize.query(`ALTER TABLE "query_logs" ADD COLUMN IF NOT EXISTS "feedback" VARCHAR(10)`);
            console.log('✅ Added: query_logs.feedback');
          }
          if (!qlColumns.includes('feedback_at')) {
            await sequelize.query(`ALTER TABLE "query_logs" ADD COLUMN IF NOT EXISTS "feedback_at" TIMESTAMP`);
            console.log('✅ Added: query_logs.feedback_at');
          }
          if (!qlColumns.includes('feedback_comment')) {
            await sequelize.query(`ALTER TABLE "query_logs" ADD COLUMN IF NOT EXISTS "feedback_comment" TEXT`);
            console.log('✅ Added: query_logs.feedback_comment');
          }
        } else {
          console.log('ℹ️  query_logs table does not exist yet - will be created by sync');
        }
        
        // === Check error_library table columns (for web sources) ===
        console.log('🔍 Checking error_library table columns...');
        const [libraryTableExists] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'error_library'
          ) as exists
        `);
        
        if (libraryTableExists[0]?.exists) {
          const [libraryColumns] = await sequelize.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'error_library' 
            AND column_name IN ('webSources', 'codeExample')
          `);
          
          const libCols = libraryColumns.map(r => r.column_name);
          
          if (!libCols.includes('webSources')) {
            await sequelize.query(`ALTER TABLE "error_library" ADD COLUMN IF NOT EXISTS "webSources" JSONB DEFAULT '[]'`);
            console.log('✅ Added: error_library.webSources');
          }
          if (!libCols.includes('codeExample')) {
            await sequelize.query(`ALTER TABLE "error_library" ADD COLUMN IF NOT EXISTS "codeExample" TEXT`);
            console.log('✅ Added: error_library.codeExample');
          }
          if (!libCols.includes('inputType')) {
            await sequelize.query(`ALTER TABLE "error_library" ADD COLUMN IF NOT EXISTS "inputType" VARCHAR(20) DEFAULT 'error'`);
            console.log('✅ Added: error_library.inputType (error/query/mixed detection)');
          }
          if (!libCols.includes('isErrorInput')) {
            await sequelize.query(`ALTER TABLE "error_library" ADD COLUMN IF NOT EXISTS "isErrorInput" BOOLEAN DEFAULT true`);
            console.log('✅ Added: error_library.isErrorInput');
          }
        } else {
          console.log('ℹ️  error_library table does not exist yet - will be created by sync');
        }
        
        console.log('✅ Missing columns check complete');
        
      } catch (migrationError) {
        console.error('❌ Migration check failed:', migrationError);
        // Don't fail startup if table already exists
      }
    }
    
    // Sync database (creates tables if they don't exist)
    // TEMPORARY: Enable sync in production to create base tables on first deploy
    // TODO: Disable after initial deployment and use migrations
    await sequelize.sync({ alter: false });
    console.log(`✅ Database synced (${process.env.NODE_ENV || 'development'} mode)`);
    
    // Initialize email service
    try {
      const emailService = require('./src/utils/emailService');
      await emailService.initialize();
      console.log('✅ Email service initialized');
    } catch (emailError) {
      console.warn('⚠️  Email service initialization warning:', emailError.message);
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ Email service is required in production mode');
        throw emailError;
      }
    }
    
    // Verify AI service configuration
    const aiService = require('./src/services/aiService');
    if (aiService && process.env.ANTHROPIC_API_KEY) {
      console.log('✅ AI service configured (Anthropic Claude)');
    } else {
      console.warn('⚠️  AI service not fully configured - check ANTHROPIC_API_KEY');
    }
    
    // Initialize scheduled jobs (C1 - Usage Reset)
    const usageResetJob = require('./src/jobs/usageResetJob');
    usageResetJob.initializeJobs();
    console.log('✅ Scheduled jobs initialized (usage reset, trial check)');
    
    // Initialize usage notification jobs (weekly digest, trial ending, limit warnings)
    const usageNotificationJob = require('./src/jobs/usageNotificationJob');
    usageNotificationJob.initializeNotificationJobs();
    console.log('✅ Email notification jobs initialized (weekly digest, trial warnings)');
    
    // Initialize newsletter jobs (weekly newsletter to subscribers)
    const newsletterJob = require('./src/jobs/newsletterJob');
    newsletterJob.initializeNewsletterJobs();
    console.log('✅ Newsletter job initialized (weekly updates to subscribers)');
    
    // Start server
    const port = process.env.PORT || 3001;
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✨ ErrorWise Backend Server Started Successfully!`);
      console.log(`${'='.repeat(60)}`);
      console.log(`🚀 Server running on port ${port}`);
      console.log(`🌍 Listening on all interfaces (0.0.0.0)`);
      console.log(`📦 Redis: ${process.env.REDIS_URL ? 'Connected' : 'Using memory store'}`);
      console.log(`🗄️  Database: PostgreSQL connected`);
      console.log(`� Email: ${process.env.SENDGRID_API_KEY ? 'SendGrid configured' : 'Not configured'}`);
      console.log(`🤖 AI: Anthropic Claude ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'}`);
      console.log(`🔒 Security: Helmet, CORS, Rate Limiting enabled`);
      console.log(`${'='.repeat(60)}\n`);
      logger.info(`Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        try {
          await sequelize.close();
          console.log('🗄️  Database connection closed');
        } catch (error) {
          console.error('❌ Error closing database:', error);
        }
        
        console.log('👋 Shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('\n❌ Failed to start server:', error);
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();

module.exports = app;
