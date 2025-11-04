require('dotenv').config();
const { Sequelize } = require('sequelize');

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }
  console.warn('⚠️  Using fallback database URL for development only');
}

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/errorwise';

// Log connection (hide password in production)
const safeUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
console.log('Connecting to DB with:', safeUrl);

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false,
  timezone: '+00:00', // Force UTC
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production'
      ? { require: true, rejectUnauthorized: false }
      : false,
    useUTC: true // Ensure dates are stored/retrieved in UTC
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Force PostgreSQL session to use UTC timezone
sequelize.addHook('afterConnect', async (connection) => {
  try {
    await connection.query("SET TIME ZONE 'UTC'");
    console.log('✅ PostgreSQL session timezone set to UTC');
  } catch (error) {
    console.error('❌ Failed to set PostgreSQL timezone:', error);
  }
});

module.exports = sequelize;
