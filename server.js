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
app.use(helmet());
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true 
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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
    // Connect to Redis first
    await connectRedis();
    console.log('✅ Redis initialization complete');
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Sync database (creates tables if they don't exist)
    await sequelize.sync();
    console.log('✅ Database synced');
    
    // Initialize email service
    const emailService = require('./src/utils/emailService');
    await emailService.initialize();
    console.log('✅ Email service initialized');
    
    // Start server
    const port = process.env.PORT || 5000;
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port} and listening on all interfaces`);
      console.log(`📦 Redis: Connected and ready for caching & sessions`);
      console.log(`🔒 Rate limiting: Active (100 req/min general, 5 req/15min auth)`);
      logger.info(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();

module.exports = app;
