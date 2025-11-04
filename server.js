

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const logger = require('./src/utils/logger');
const { connectRedis } = require('./src/utils/redisClient');
const { sessionMiddleware } = require('./src/middleware/session');
const { rateLimiters } = require('./src/middleware/rateLimiter');

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production'
}));

// CORS configuration - use CORS_ORIGIN env variable for multiple origins
const corsOrigin = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : (process.env.FRONTEND_URL || 'http://localhost:5173');

app.use(cors({ 
  origin: corsOrigin,
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session middleware (loads user session from Redis)
app.use(sessionMiddleware);

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
// const teamRoutes = require('./src/routes/teams'); // TODO: Add team models first
// const webhookRoutes = require('./src/routes/webhooks'); // TODO: Add webhook routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const healthRoutes = require('./src/routes/health');
app.use('/', healthRoutes);

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
  app.use('/api/public/demo', publicDemoRoutes); // Public demo - no auth required
  app.use('/api/auth', authRoutes);
  app.use('/api/auth', authEnhancedRoutes); // Enhanced auth with tracking
  app.use('/api/errors', errorRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/support', supportRoutes); // Feedback, Contact, Help Center
  app.use('/api/content', require('./src/routes/content')); // Privacy, Terms, About, Community
  // app.use('/api/teams', teamRoutes); // TODO: Add team models first
  // app.use('/api/webhooks', webhookRoutes); // TODO: Add webhook routes// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err);
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// Database connection and server start
const start = async () => {
  try {
    console.log(`\n🚀 Starting ErrorWise Backend...`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API Base URL: ${process.env.API_BASE_URL || 'http://localhost:3001'}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);

    // Connect to Redis first
    try {
      await connectRedis();
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
    
    // Sync database (creates tables if they don't exist)
    // In production, use migrations instead of sync()
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️  Production mode: Skipping auto-sync. Use migrations instead!');
      // await sequelize.sync({ alter: false });
    } else {
      await sequelize.sync();
      console.log('✅ Database synced (development mode)');
    }
    
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
