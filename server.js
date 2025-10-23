require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const logger = require('./src/utils/logger');

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

// Import routes
const authRoutes = require('./src/routes/auth');
const errorRoutes = require('./src/routes/errors');
const userRoutes = require('./src/routes/users');
const subscriptionRoutes = require('./src/routes/subscriptions');
const historyRoutes = require('./src/routes/history');
const settingsRoutes = require('./src/routes/settings');
const teamRoutes = require('./src/routes/teams');
const webhookRoutes = require('./src/routes/webhooks');

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/errors', errorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
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
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Sync database (creates tables if they don't exist)
    await sequelize.sync();
    console.log('✅ Database synced');
    
    // Start server
    const port = process.env.PORT || 5000;
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${port} and listening on all interfaces`);
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
