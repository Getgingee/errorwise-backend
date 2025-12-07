/**
 * Script to promote a user to PRO tier
 * Usage: node promote-user.js <email>
 * 
 * This script connects to the Railway database using the DATABASE_URL
 * environment variable. You can set it via Railway CLI or environment.
 */
const { Sequelize } = require('sequelize');

// Check for DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  console.log('❌ DATABASE_URL environment variable is required');
  console.log('');
  console.log('To promote a user, you have two options:');
  console.log('');
  console.log('Option 1: Use Railway CLI');
  console.log('  railway run node promote-user.js hi@getgingee.com');
  console.log('');
  console.log('Option 2: Set DATABASE_URL manually');
  console.log('  Get it from Railway dashboard > Variables > DATABASE_URL');
  console.log('  $env:DATABASE_URL="postgresql://..." ; node promote-user.js hi@getgingee.com');
  console.log('');
  console.log('Option 3: Use the admin API (requires admin auth token)');
  console.log('  curl -X POST https://your-api.up.railway.app/api/admin/upgrade-user \\');
  console.log('    -H "Authorization: Bearer <ADMIN_TOKEN>" \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"email": "hi@getgingee.com"}\'');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
const EMAIL = process.argv[2] || 'hi@getgingee.com';

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

async function promoteUser() {
  try {
    await sequelize.authenticate();
    console.log('Connected to Railway database');
    
    const [users] = await sequelize.query(
      `SELECT id, email, username, subscription_tier, subscription_status FROM users WHERE email = :email`,
      { replacements: { email: EMAIL } }
    );
    
    if (!users || users.length === 0) {
      console.log('User not found:', EMAIL);
      process.exit(1);
    }
    
    const user = users[0];
    console.log('Found user:', user.email, 'Current tier:', user.subscription_tier);
    
    const now = new Date();
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    await sequelize.query(
      `UPDATE users SET subscription_tier = :tier, subscription_status = :status, subscription_start_date = :startDate, subscription_end_date = :endDate WHERE id = :id`,
      { 
        replacements: { 
          tier: 'pro', 
          status: 'active', 
          startDate: now,
          endDate: oneYearFromNow,
          id: user.id 
        } 
      }
    );
    
    console.log('✅ User promoted to PRO tier!');
    console.log('Email:', EMAIL);
    console.log('Subscription starts:', now.toISOString());
    console.log('Subscription ends:', oneYearFromNow.toISOString());
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

promoteUser();
