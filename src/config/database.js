require('dotenv').config();
const { Sequelize } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:28April2001@23@127.0.0.1:5432/errorwise';

console.log('Connecting to DB with:', databaseUrl);

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
