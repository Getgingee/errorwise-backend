const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://postgres:28April2001%4023@127.0.0.1:5432/errorwise'
});

async function getOTP() {
  try {
    const result = await pool.query(`
      SELECT 
        email,
        login_otp,
        login_otp_expires,
        CASE 
          WHEN login_otp_expires > NOW() THEN 'Valid'
          ELSE 'Expired'
        END as status
      FROM users 
      WHERE email = 'pankaj@getgingee.com'
    `);

    if (result.rows.length === 0) {
      console.log('\n❌ User not found: pankaj@getgingee.com\n');
      return;
    }

    const user = result.rows[0];
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║              GET OTP FOR LOGIN                          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    
    console.log('   📧 Email:', user.email);
    
    if (!user.login_otp) {
      console.log('   ⚠️  No OTP found!');
      console.log('   💡 Try logging in first to generate an OTP\n');
    } else {
      console.log('   🔑 OTP:', user.login_otp);
      console.log('   ⏰ Expires:', new Date(user.login_otp_expires).toLocaleString());
      console.log('   📊 Status:', user.status);
      
      if (user.status === 'Expired') {
        console.log('\n   ⚠️  OTP has expired!');
        console.log('   💡 Login again to generate a new OTP\n');
      } else {
        console.log('\n   ✅ OTP is valid - use it now!\n');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

getOTP();
