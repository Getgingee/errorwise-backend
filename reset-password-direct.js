require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://errorwise_user:secure_password_2024@localhost:5432/errorwise_db'
});

async function resetPassword() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Connecting to database...');
    
    const email = 'pankaj@getgingee.com';
    const newPassword = 'Test123!@#';

    // Hash the password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user
    console.log('💾 Updating database...');
    const result = await client.query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING email, username',
      [hashedPassword, email]
    );

    if (result.rows.length > 0) {
      console.log('\n✅ Password updated successfully!');
      console.log(`📧 Email: ${result.rows[0].email}`);
      console.log(`👤 Username: ${result.rows[0].username}`);
      console.log(`🔐 New Password: ${newPassword}`);
    } else {
      console.log('❌ User not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

resetPassword();
