/**
 * Health Check Routes
 * System health monitoring endpoints
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const redis = require('../config/redis');

/**
 * Basic health check
 * GET /health
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };
    
    res.status(200).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Detailed health check (includes database, Redis, etc.)
 * GET /health/detailed
 */
router.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {}
  };
  
  let allHealthy = true;
  
  // Check PostgreSQL database
  try {
    await db.authenticate();
    health.services.database = {
      status: 'connected',
      type: 'PostgreSQL',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    allHealthy = false;
    health.services.database = {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
  
  // Check Redis
  try {
    const redisStatus = redis.status;
    
    if (redisStatus === 'ready') {
      // Test Redis with ping
      await redis.ping();
      
      health.services.redis = {
        status: 'connected',
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Redis status: ${redisStatus}`);
    }
  } catch (error) {
    allHealthy = false;
    health.services.redis = {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
  
  // System metrics
  health.system = {
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
    },
    cpu: {
      usage: process.cpuUsage()
    },
    platform: process.platform,
    nodeVersion: process.version
  };
  
  // Set overall status
  health.status = allHealthy ? 'healthy' : 'degraded';
  
  // Return appropriate status code
  const statusCode = allHealthy ? 200 : 503;
  
  res.status(statusCode).json(health);
});

/**
 * Liveness probe (for Kubernetes)
 * GET /health/live
 */
router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe (for Kubernetes)
 * GET /health/ready
 */
router.get('/health/ready', async (req, res) => {
  try {
    // Check if database is ready
    await db.authenticate();
    
    // Check if Redis is ready
    if (redis.status !== 'ready') {
      throw new Error('Redis not ready');
    }
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Simple ping endpoint
 * GET /ping
 */
router.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

module.exports = router;
