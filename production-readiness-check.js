#!/usr/bin/env node
/**
 * Production Readiness Check Script
 * Validates backend configuration and dependencies for production deployment
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

class ProductionChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.passed = [];
  }

  log(type, message) {
    const types = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    };
    console.log(`${types[type] || '•'} ${message}`);
    
    if (type === 'error') this.errors.push(message);
    else if (type === 'warning') this.warnings.push(message);
    else if (type === 'info') this.info.push(message);
    else if (type === 'success') this.passed.push(message);
  }

  // Check environment variables
  checkEnvironmentVariables() {
    console.log('\n📋 Checking Environment Variables...\n');

    const required = {
      // Core Configuration
      'NODE_ENV': { production: 'production' },
      'PORT': { default: '3001' },
      
      // Database
      'DATABASE_URL': { required: true },
      
      // Redis (optional but recommended)
      'REDIS_URL': { required: false },
      
      // Security
      'JWT_SECRET': { minLength: 32 },
      'JWT_REFRESH_SECRET': { minLength: 32 },
      'SESSION_SECRET': { minLength: 32 },
      'CSRF_SECRET': { minLength: 32 },
      
      // AI Service (at least one required)
      'ANTHROPIC_API_KEY': { required: false },
      
      // Email (required for production)
      'SENDGRID_API_KEY': { required: true },
      'SMTP_HOST': { default: 'smtp.sendgrid.net' },
      'SMTP_PORT': { default: '587' },
      'FROM_EMAIL': { required: true },
      
      // URLs
      'API_BASE_URL': { required: true },
      'FRONTEND_URL': { required: true },
      'CORS_ORIGIN': { required: true },
    };

    // Check NODE_ENV first
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv !== 'production') {
      this.log('warning', `NODE_ENV is "${nodeEnv}", should be "production" for deployment`);
    } else {
      this.log('success', 'NODE_ENV is set to "production"');
    }

    // Check all required variables
    for (const [key, config] of Object.entries(required)) {
      const value = process.env[key];

      if (!value || value === '') {
        if (config.required) {
          this.log('error', `Missing required variable: ${key}`);
        } else if (config.default) {
          this.log('warning', `${key} not set, will use default: ${config.default}`);
        } else {
          this.log('info', `Optional variable ${key} not set`);
        }
      } else {
        // Check minimum length for secrets
        if (config.minLength && value.length < config.minLength) {
          this.log('error', `${key} is too short (${value.length} chars, need ${config.minLength}+)`);
        } else if (config.production && value !== config.production) {
          this.log('warning', `${key} is "${value}", should be "${config.production}" for production`);
        } else {
          this.log('success', `${key} is set`);
        }
      }
    }

    // Check AI provider configuration
    const hasAnthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!hasAnthropicKey) {
      this.log('error', 'No AI provider API key found. Need ANTHROPIC_API_KEY');
    } else {
      this.log('success', 'Anthropic API key configured');
    }

    // Check for development URLs in production
    if (nodeEnv === 'production') {
      const devUrls = ['localhost', '127.0.0.1', '0.0.0.0'];
      ['API_BASE_URL', 'FRONTEND_URL', 'CORS_ORIGIN'].forEach(key => {
        const value = process.env[key];
        if (value && devUrls.some(dev => value.includes(dev))) {
          this.log('error', `${key} contains localhost/development URL: ${value}`);
        }
      });
    }
  }

  // Check database configuration
  checkDatabaseConfig() {
    console.log('\n🗄️  Checking Database Configuration...\n');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      this.log('error', 'DATABASE_URL is not set');
      return;
    }

    try {
      const url = new URL(dbUrl);
      
      if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        this.log('error', `Invalid database protocol: ${url.protocol}`);
      } else {
        this.log('success', 'Database URL protocol is valid (PostgreSQL)');
      }

      if (!url.hostname) {
        this.log('error', 'Database hostname is missing');
      } else if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        this.log('warning', 'Database is configured for localhost (update for production)');
      } else {
        this.log('success', `Database host: ${url.hostname}`);
      }

      if (!url.pathname || url.pathname === '/') {
        this.log('error', 'Database name is missing');
      } else {
        this.log('success', `Database name: ${url.pathname.substring(1)}`);
      }

      if (!url.username || !url.password) {
        this.log('error', 'Database credentials are missing');
      } else {
        this.log('success', 'Database credentials are set');
      }

    } catch (error) {
      this.log('error', `Invalid DATABASE_URL format: ${error.message}`);
    }
  }

  // Check Redis configuration
  checkRedisConfig() {
    console.log('\n🔴 Checking Redis Configuration...\n');

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.log('warning', 'REDIS_URL not set - sessions will use memory store (not recommended for production)');
      return;
    }

    try {
      const url = new URL(redisUrl);
      
      if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
        this.log('error', `Invalid Redis protocol: ${url.protocol}`);
      } else {
        this.log('success', `Redis URL protocol is valid (${url.protocol})`);
      }

      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        this.log('warning', 'Redis is configured for localhost (update for production)');
      } else {
        this.log('success', `Redis host: ${url.hostname}`);
      }

    } catch (error) {
      this.log('error', `Invalid REDIS_URL format: ${error.message}`);
    }
  }

  // Check security configuration
  checkSecurityConfig() {
    console.log('\n🔒 Checking Security Configuration...\n');

    // Check JWT secrets
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    const sessionSecret = process.env.SESSION_SECRET;
    const csrfSecret = process.env.CSRF_SECRET;

    if (jwtSecret && jwtSecret.includes('your_') || jwtSecret === 'dev-secret-key') {
      this.log('error', 'JWT_SECRET is using a placeholder value - generate a real secret!');
    }

    if (jwtRefreshSecret && jwtRefreshSecret.includes('your_')) {
      this.log('error', 'JWT_REFRESH_SECRET is using a placeholder value');
    }

    if (sessionSecret && sessionSecret.includes('your_')) {
      this.log('error', 'SESSION_SECRET is using a placeholder value');
    }

    if (csrfSecret && csrfSecret.includes('your_')) {
      this.log('error', 'CSRF_SECRET is using a placeholder value');
    }

    // Check bcrypt rounds
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    if (bcryptRounds < 12) {
      this.log('warning', `BCRYPT_ROUNDS is ${bcryptRounds}, recommended 12+ for production`);
    } else {
      this.log('success', `BCRYPT_ROUNDS is ${bcryptRounds}`);
    }

    // Check CORS configuration
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin === '*') {
      this.log('error', 'CORS_ORIGIN is set to "*" - this is a security risk!');
    } else if (corsOrigin) {
      this.log('success', `CORS_ORIGIN is configured: ${corsOrigin}`);
    }
  }

  // Check email configuration
  checkEmailConfig() {
    console.log('\n📧 Checking Email Configuration...\n');

    const sendgridKey = process.env.SENDGRID_API_KEY;
    const smtpHost = process.env.SMTP_HOST;
    const fromEmail = process.env.FROM_EMAIL;

    if (!sendgridKey || sendgridKey.includes('your_')) {
      this.log('error', 'SENDGRID_API_KEY is not configured properly');
    } else {
      this.log('success', 'SendGrid API key is configured');
    }

    if (smtpHost && smtpHost.includes('mailtrap')) {
      this.log('warning', 'SMTP is configured for Mailtrap (dev) - update for production');
    } else if (smtpHost) {
      this.log('success', `SMTP host: ${smtpHost}`);
    }

    if (!fromEmail || fromEmail.includes('example')) {
      this.log('error', 'FROM_EMAIL is not configured properly');
    } else {
      this.log('success', `FROM_EMAIL: ${fromEmail}`);
    }
  }

  // Check file structure
  checkFileStructure() {
    console.log('\n📁 Checking File Structure...\n');

    const requiredFiles = [
      'package.json',
      'server.js',
      '.env.example',
      'src/config/database.js',
      'src/services/aiService.js',
      'src/routes/auth.js',
      'src/routes/errors.js',
      'src/models/User.js',
      'src/models/ErrorQuery.js',
      'src/models/Subscription.js'
    ];

    const requiredDirs = [
      'src',
      'src/config',
      'src/controllers',
      'src/middleware',
      'src/models',
      'src/routes',
      'src/services',
      'src/utils'
    ];

    // Check files
    requiredFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        this.log('success', `Found: ${file}`);
      } else {
        this.log('error', `Missing: ${file}`);
      }
    });

    // Check directories
    requiredDirs.forEach(dir => {
      const fullPath = path.join(__dirname, dir);
      if (fs.existsSync(fullPath)) {
        this.log('success', `Found directory: ${dir}`);
      } else {
        this.log('error', `Missing directory: ${dir}`);
      }
    });

    // Check for sensitive files that shouldn't be committed
    const sensitiveFiles = ['.env'];
    sensitiveFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        this.log('warning', `${file} exists (ensure it's in .gitignore)`);
      }
    });
  }

  // Check package.json
  checkPackageJson() {
    console.log('\n📦 Checking package.json...\n');

    try {
      const packagePath = path.join(__dirname, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

      // Check scripts
      if (!pkg.scripts.start) {
        this.log('error', 'Missing "start" script in package.json');
      } else {
        this.log('success', `Start script: ${pkg.scripts.start}`);
      }

      // Check required dependencies
      const requiredDeps = [
        'express',
        'sequelize',
        'pg',
        'redis',
        'dotenv',
        '@anthropic-ai/sdk',
        'bcryptjs',
        'jsonwebtoken',
        'cors',
        'helmet',
        'express-rate-limit'
      ];

      requiredDeps.forEach(dep => {
        if (pkg.dependencies[dep]) {
          this.log('success', `Dependency: ${dep} v${pkg.dependencies[dep]}`);
        } else {
          this.log('error', `Missing dependency: ${dep}`);
        }
      });

      // Check engines
      if (!pkg.engines || !pkg.engines.node) {
        this.log('warning', 'No Node.js engine version specified');
      } else {
        this.log('success', `Node.js engine: ${pkg.engines.node}`);
      }

    } catch (error) {
      this.log('error', `Error reading package.json: ${error.message}`);
    }
  }

  // Check AI service configuration
  checkAIServiceConfig() {
    console.log('\n🤖 Checking AI Service Configuration...\n');

    try {
      const aiServicePath = path.join(__dirname, 'src/services/aiService.js');
      const content = fs.readFileSync(aiServicePath, 'utf8');

      // Check for Anthropic configuration
      if (content.includes('@anthropic-ai/sdk')) {
        this.log('success', 'Anthropic SDK integration found');
      }

      // Check for tier configuration
      if (content.includes('TIER_CONFIG')) {
        this.log('success', 'Tier configuration found');
      }

      // Check for caching
      if (content.includes('responseCache') || content.includes('cacheResponse')) {
        this.log('success', 'Response caching implemented');
      }

      // Check for retry logic
      if (content.includes('retryWithBackoff') || content.includes('MAX_RETRIES')) {
        this.log('success', 'Retry logic implemented');
      }

      // Check for input validation
      if (content.includes('validateInput')) {
        this.log('success', 'Input validation implemented');
      }

    } catch (error) {
      this.log('error', `Error checking AI service: ${error.message}`);
    }
  }

  // Check server configuration
  checkServerConfig() {
    console.log('\n🚀 Checking Server Configuration...\n');

    try {
      const serverPath = path.join(__dirname, 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');

      // Check middleware
      const middleware = [
        { name: 'helmet', check: 'helmet()' },
        { name: 'cors', check: 'cors(' },
        { name: 'express.json', check: 'express.json' },
        { name: 'rate limiting', check: 'rateLimiters' }
      ];

      middleware.forEach(({ name, check }) => {
        if (content.includes(check)) {
          this.log('success', `${name} middleware configured`);
        } else {
          this.log('warning', `${name} middleware not found`);
        }
      });

      // Check error handling
      if (content.includes('app.use((err, req, res, next)')) {
        this.log('success', 'Global error handler configured');
      } else {
        this.log('warning', 'No global error handler found');
      }

      // Check 404 handler
      if (content.includes('404')) {
        this.log('success', '404 handler configured');
      }

    } catch (error) {
      this.log('error', `Error checking server config: ${error.message}`);
    }
  }

  // Generate report
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PRODUCTION READINESS REPORT');
    console.log('='.repeat(60) + '\n');

    console.log(`✅ Passed Checks: ${this.passed.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);
    console.log(`ℹ️  Info: ${this.info.length}\n`);

    if (this.errors.length > 0) {
      console.log('❌ CRITICAL ISSUES:\n');
      this.errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log('⚠️  WARNINGS:\n');
      this.warnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
      console.log('');
    }

    console.log('='.repeat(60) + '\n');

    if (this.errors.length === 0 && this.warnings.length <= 5) {
      console.log('✅ Backend is PRODUCTION READY!\n');
      return 0;
    } else if (this.errors.length === 0) {
      console.log('⚠️  Backend is mostly ready but has warnings to address\n');
      return 0;
    } else {
      console.log('❌ Backend has critical issues that must be fixed before deployment\n');
      return 1;
    }
  }

  // Run all checks
  async run() {
    console.log('🔍 ErrorWise Backend Production Readiness Check');
    console.log('='.repeat(60));

    this.checkEnvironmentVariables();
    this.checkDatabaseConfig();
    this.checkRedisConfig();
    this.checkSecurityConfig();
    this.checkEmailConfig();
    this.checkFileStructure();
    this.checkPackageJson();
    this.checkAIServiceConfig();
    this.checkServerConfig();

    return this.generateReport();
  }
}

// Run the checker
const checker = new ProductionChecker();
checker.run().then(exitCode => {
  process.exit(exitCode);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
