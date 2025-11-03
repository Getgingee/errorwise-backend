require('dotenv').config();
const emailService = require('./src/utils/emailService');
const crypto = require('crypto');

async function sendResetEmailNow() {
  try {
    console.log('Sending password reset email...\n');
    console.log('To: pankaj@getgingee.com');
    console.log('Username: Pankaj\n');
    
    // Generate a real reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    console.log('Reset Token:', resetToken.substring(0, 30) + '...\n');
    
    // Initialize email service
    await emailService.initialize();
    
    // Send the reset email
    const result = await emailService.sendPasswordResetEmail(
      'pankaj@getgingee.com',
      'Pankaj',
      resetToken
    );
    
    console.log('SUCCESS! Password reset email sent!');
    console.log('Message ID:', result.messageId);
    console.log('\nCheck your email inbox!');
    console.log('Subject: Reset Your ErrorWise Password');
    console.log('\nReset link to test:');
    console.log('http://localhost:3000/reset-password?token=' + resetToken);
    console.log('\nThis link will work if you update the database with this token.');
    
  } catch (error) {
    console.error('\nERROR:', error.message);
  }
}

sendResetEmailNow();
