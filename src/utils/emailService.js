/**
 * Email Service
 * 
 * Handles sending emails for:
 * - Email verification
 * - Phone OTP (until SMS is integrated)
 * - Password reset
 * - Notifications
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// Email configuration - using SendGrid API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || false, // true for 465, false for other ports
  auth: {
    user: 'apikey', // SendGrid requires literal 'apikey' as username
    pass: SENDGRID_API_KEY || ''
  }
};

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@errorwise.tech';
const FROM_NAME = process.env.FROM_NAME || 'ErrorWise';

// Create reusable transporter
let transporter = null;

function createTransporter() {
  if (!SENDGRID_API_KEY) {
    console.warn('⚠️  No SMTP configuration found, using EMAIL_SERVICE fallback');
    console.warn('⚠️ SMTP credentials not configured. Emails will be logged to console only.');
    return null;
  }

  try {
    return nodemailer.createTransporter(EMAIL_CONFIG);
  } catch (error) {
    console.error('Error creating email transporter:', error);
    return null;
  }
}

/**
 * Initialize email service
 */
async function initialize() {
  transporter = createTransporter();
  
  if (transporter) {
    try {
      await transporter.verify();
      console.log('✅ Email service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Email service verification failed:', error.message);
      transporter = null;
      return false;
    }
  }
  
  return false;
}

/**
 * Send an email
 */
async function sendEmail({ to, subject, html, text }) {
  // If no transporter, log email to console (development mode)
  if (!transporter) {
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL (Console Mode - SMTP not configured)');
    console.log('='.repeat(60));
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text || 'See HTML content');
    console.log('HTML:', html ? 'HTML content provided' : 'No HTML');
    console.log('='.repeat(60) + '\n');
    
    // Return success in development mode
    return {
      success: true,
      messageId: 'console-mode-' + Date.now(),
      mode: 'console'
    };
  }

  try {
    const mailOptions = {
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      mode: 'smtp'
    };
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send verification email
 */
async function sendVerificationEmail(email, username, token) {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .button {
          display: inline-block;
          padding: 12px 30px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          color: #999;
          font-size: 12px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ErrorWise! 🎉</h1>
        </div>
        <div class="content">
          <p>Hi ${username},</p>
          
          <p>Thank you for joining ErrorWise! We're excited to help you debug faster and smarter.</p>
          
          <p>Please verify your email address to get started:</p>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
          
          <p><strong>This link will expire in 24 hours.</strong></p>
          
          <p>If you didn't create an account, please ignore this email.</p>
          
          <p>Happy debugging! 🐛✨</p>
          
          <p>Best regards,<br>The ErrorWise Team</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; 2025 ErrorWise. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Welcome to ErrorWise!
    
    Hi ${username},
    
    Thank you for joining ErrorWise! Please verify your email address by clicking the link below:
    
    ${verificationUrl}
    
    This link will expire in 24 hours.
    
    If you didn't create an account, please ignore this email.
    
    Best regards,
    The ErrorWise Team
  `;

  return sendEmail({
    to: email,
    subject: 'Verify Your ErrorWise Account',
    html,
    text
  });
}

/**
 * Send OTP email (used for phone verification until SMS is integrated)
 */
async function sendOTPEmail(email, username, otp, phoneNumber) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .otp-box {
          background: white;
          border: 2px solid #667eea;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          margin: 20px 0;
        }
        .otp-code {
          font-size: 32px;
          font-weight: bold;
          color: #667eea;
          letter-spacing: 8px;
          font-family: 'Courier New', monospace;
        }
        .footer {
          text-align: center;
          color: #999;
          font-size: 12px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Phone Verification 📱</h1>
        </div>
        <div class="content">
          <p>Hi ${username},</p>
          
          <p>You requested to verify your phone number: <strong>${phoneNumber}</strong></p>
          
          <p>Your verification code is:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          
          <p><strong>This code will expire in 10 minutes.</strong></p>
          
          <p>If you didn't request this code, please ignore this email and secure your account.</p>
          
          <p>Best regards,<br>The ErrorWise Team</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; 2025 ErrorWise. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Phone Verification
    
    Hi ${username},
    
    You requested to verify your phone number: ${phoneNumber}
    
    Your verification code is: ${otp}
    
    This code will expire in 10 minutes.
    
    If you didn't request this code, please ignore this email.
    
    Best regards,
    The ErrorWise Team
  `;

  return sendEmail({
    to: email,
    subject: 'Your ErrorWise Verification Code',
    html,
    text
  });
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, username, resetToken) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .content {
          background: #f9f9f9;
          padding: 30px;
          border-radius: 0 0 10px 10px;
        }
        .button {
          display: inline-block;
          padding: 12px 30px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
        }
        .warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          color: #999;
          font-size: 12px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request 🔐</h1>
        </div>
        <div class="content">
          <p>Hi ${username},</p>
          
          <p>We received a request to reset your password for your ErrorWise account.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul style="margin: 10px 0;">
              <li>This link will expire in 1 hour</li>
              <li>If you didn't request this reset, ignore this email</li>
              <li>Never share this link with anyone</li>
            </ul>
          </div>
          
          <p>Best regards,<br>The ErrorWise Team</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
          <p>&copy; 2025 ErrorWise. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Password Reset Request
    
    Hi ${username},
    
    We received a request to reset your password. Click the link below to reset it:
    
    ${resetUrl}
    
    This link will expire in 1 hour.
    
    If you didn't request this, please ignore this email.
    
    Best regards,
    The ErrorWise Team
  `;

  return sendEmail({
    to: email,
    subject: 'Reset Your ErrorWise Password',
    html,
    text
  });
}

module.exports = {
  initialize,
  sendEmail,
  sendVerificationEmail,
  sendOTPEmail,
  sendPasswordResetEmail
};
