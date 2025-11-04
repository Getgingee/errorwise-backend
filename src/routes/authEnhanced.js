const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authService = require('../services/authService');
const userTrackingService = require('../services/userTrackingService');
const emailService = require('../utils/emailService');
const emailServiceConfirmation = require('../services/emailService');
const { authMiddleware } = require('../middleware/auth');
const { accountLockoutMiddleware, trackFailedAttempt, resetFailedAttempts } = require('../middleware/accountLock');
const rateLimit = require('express-rate-limit');

// Rate limiter DISABLED for development/testing
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 999999, // Essentially unlimited
  message: { error: 'Too many resend attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => true // Skip rate limiting entirely
});

/**
 * POST /api/auth/register/enhanced
 * Enhanced registration with abuse prevention
 */
router.post('/register/enhanced', async (req, res) => {
  try {
    const { username, email, password, phoneNumber, googleId } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!password && !googleId) {
      return res.status(400).json({ error: 'Password or Google ID required' });
    }
    
    const result = await userTrackingService.registerUser({
      username: username || email.split('@')[0],
      email,
      password,
      phoneNumber,
      googleId
    });
    
    // Generate tokens if not an abuser
    let accessToken, refreshToken;
    if (result.hasFreeTierAccess) {
      accessToken = authService.generateAccessToken(result.user);
      refreshToken = authService.generateRefreshToken(result.user);
      
      // Set HTTP-only cookies for tokens
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hour
      });
      
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }
    
    res.status(201).json({
      message: result.message,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        isEmailVerified: result.user.isEmailVerified,
        isPhoneVerified: result.user.isPhoneVerified
      },
      accessToken,
      refreshToken,
      isReturningUser: result.isReturningUser,
      accountRecreationCount: result.accountRecreationCount,
      hasFreeTierAccess: result.hasFreeTierAccess,
      requiresEmailVerification: result.requiresEmailVerification
    });
  } catch (error) {
    console.error('Enhanced registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/auth/verify-email
 * Verify email address and auto-login user
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const result = await userTrackingService.verifyEmail(token);
    
    // If user was already verified, auto-login them
    if (result.alreadyVerified) {
      const accessToken = jwt.sign(
        { 
          userId: result.user.id, 
          email: result.user.email,
          role: result.user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return res.json({
        message: 'Email already verified. Logging you in...',
        alreadyVerified: true,
        token: accessToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          isEmailVerified: true
        }
      });
    }
    
    // First-time verification - generate login token
    const accessToken = jwt.sign(
      { 
        userId: result.id, 
        email: result.email,
        role: result.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Email verified successfully! Logging you in...',
      token: accessToken,
      user: {
        id: result.id,
        email: result.email,
        username: result.username,
        isEmailVerified: true
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend email verification (secure - uses session token)
 */
router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    const { verificationToken } = req.body;
    
    if (!verificationToken) {
      return res.status(400).json({ 
        error: 'Verification token is required' 
      });
    }
    
    // Validate token format
    if (!verificationToken.startsWith('verify:session:')) {
      return res.status(400).json({ 
        error: 'Invalid verification token format' 
      });
    }
    
    // Get token data from Redis
    const { redisClient } = require('../utils/redisClient');
    const tokenData = await redisClient.get(verificationToken);
    
    if (!tokenData) {
      return res.status(401).json({ 
        error: 'Verification session expired. Please try logging in again.' 
      });
    }
    
    const { userId, email } = JSON.parse(tokenData);
    
    // Get user from database
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Check if already verified
    if (user.isEmailVerified) {
      // Clean up token
      await redisClient.del(verificationToken);
      return res.json({ 
        message: 'Email is already verified. You can now log in.' 
      });
    }
    
    // Send verification email
    await userTrackingService.sendVerificationEmail(user);
    
    res.json({ 
      message: 'Verification email sent successfully',
      email: email
    });
    
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ 
      error: 'Failed to resend verification email. Please try again.' 
    });
  }
});

/**
 * POST /api/auth/send-phone-otp
 * Send phone verification OTP
 */
router.post('/send-phone-otp', authMiddleware, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const result = await userTrackingService.sendPhoneVerificationOTP(
      req.user.id,
      phoneNumber
    );
    
    res.json(result);
  } catch (error) {
    console.error('Send phone OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/verify-phone-otp
 * Verify phone OTP
 */
router.post('/verify-phone-otp', authMiddleware, async (req, res) => {
  try {
    const { otp } = req.body;
    
    if (!otp) {
      return res.status(400).json({ error: 'OTP is required' });
    }
    
    const user = await userTrackingService.verifyPhoneOTP(req.user.id, otp);
    
    res.json({
      message: 'Phone verified successfully',
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        isPhoneVerified: true
      }
    });
  } catch (error) {
    console.error('Phone OTP verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account (soft delete with tracking)
 */
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    const result = await userTrackingService.deleteUserAccount(
      req.user.id,
      reason,
      ipAddress
    );
    
    res.json(result);
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login/enhanced
 * Enhanced login with OTP verification
 * Step 1: Verify credentials and send OTP
 */
router.post('/login/enhanced', accountLockoutMiddleware, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user (exclude soft-deleted)
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      // Track failed attempt even for non-existent users
      await trackFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      // Track failed login attempt
      const attemptResult = await trackFailedAttempt(email);
      
      // If account got locked, send appropriate response
      if (attemptResult.locked) {
        const remainingMinutes = Math.ceil((attemptResult.lockoutInfo.expiresAt - Date.now()) / 1000 / 60);
        
        return res.status(423).json({
          success: false,
          code: 'ACCOUNT_LOCKED',
          error: `Account locked due to too many failed login attempts. Please try again in ${remainingMinutes} minutes.`,
          lockoutInfo: {
            expiresAt: attemptResult.lockoutInfo.expiresAt,
            remainingMinutes
          }
        });
      }
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        remainingAttempts: attemptResult.remainingAttempts
      });
    }

    // Check OTP generation rate limit (5 per day per user)
    const { redisClient } = require('../utils/redisClient');
    const rateLimitKey = `otp:daily:${user.id}`;
    
    // RATE LIMITING DISABLED FOR DEVELOPMENT/TESTING
    /* 
    try {
      const otpCount = await redisClient.get(rateLimitKey);
      const currentCount = otpCount ? parseInt(otpCount) : 0;
      
      if (currentCount >= 5) {
        return res.status(429).json({ 
          error: 'Daily OTP limit reached',
          message: 'You have reached the maximum of 5 login attempts per day. Please try again tomorrow.',
          retryAfter: await redisClient.ttl(rateLimitKey)
        });
      }
    } catch (err) {
      console.error('Rate limit check error:', err);
      // Continue even if Redis fails
    }
    */
    
    // Check if email is verified
    if (!user.isEmailVerified) {
      // Generate a temporary verification session token
      const crypto = require('crypto');
      const verificationToken = `verify:session:${crypto.randomUUID()}`;
      
      // Store token in Redis with 15-minute expiry
      const { redisClient } = require('../utils/redisClient');
      await redisClient.setEx(
        verificationToken,
        15 * 60, // 15 minutes
        JSON.stringify({ userId: user.id, email: user.email })
      );
      
      return res.status(403).json({ 
        error: 'Email not verified',
        requiresEmailVerification: true,
        email: user.email,
        verificationToken: verificationToken
      });
    }
    
    // Generate and send login OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const otpHash = await bcrypt.hash(otp, 10);
    
    // Calculate expiry as raw timestamp (milliseconds) to avoid timezone issues
    const expiryTimestamp = Date.now() + 60 * 60 * 1000; // 60 minutes (1 hour) for testing
    
    console.log('🔐 Generated OTP:', { 
      otp, 
      expiryTimestamp,
      expiresAt: new Date(expiryTimestamp).toISOString(),
      userId: user.id 
    });
    
    // Store OTP in user record - store raw timestamp as bigint to avoid timezone conversion
    const updateResult = await User.update(
      {
        loginOTP: otpHash,
        loginOTPExpires: expiryTimestamp  // Store as milliseconds since epoch
      },
      { where: { id: user.id } }
    );
    
    console.log('💾 OTP saved to database:', { 
      userId: user.id, 
      rowsUpdated: updateResult[0],
      expiryTimestamp,
      expiresAt: new Date(expiryTimestamp).toISOString()
    });
    
    // Verify the save by reading back
    const verifyUser = await User.findOne({ where: { id: user.id }, attributes: ['id', 'email', 'loginOTPExpires'] });
    console.log('✅ Verification - OTP expiry in DB:', verifyUser.loginOTPExpires, typeof verifyUser.loginOTPExpires);
    
    // Send OTP via email
    await emailService.sendEmail({
      to: user.email,
      subject: 'Your ErrorWise Login Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Login Verification 🔐</h1>
            </div>
            <div class="content">
              <p>Hi ${user.username},</p>
              <p>Your login verification code is:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p><strong>This code will expire in 10 minutes.</strong></p>
              <p>If you didn't try to log in, please ignore this email and secure your account.</p>
              <p>Best regards,<br>The ErrorWise Team</p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
              <p>&copy; 2025 ErrorWise. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Login Verification
        
        Hi ${user.username},
        
        Your login verification code is: ${otp}
        
        This code will expire in 10 minutes.
        
        If you didn't try to log in, please ignore this email.
        
        Best regards,
        The ErrorWise Team
      `
    });
    
    console.log(`📧 Login OTP sent to ${user.email}: ${otp}`); // Dev mode - remove in production
    
    // OTP COUNTER DISABLED FOR DEVELOPMENT/TESTING
    /*
    // Increment daily OTP counter
    try {
      const rateLimitKey = `otp:daily:${user.id}`;
      const currentCount = await redisClient.get(rateLimitKey);
      
      if (!currentCount) {
        // First OTP of the day - set counter to 1 with 24-hour expiry
        await redisClient.setEx(rateLimitKey, 24 * 60 * 60, '1');
      } else {
        // Increment existing counter
        await redisClient.incr(rateLimitKey);
      }
      
      const newCount = currentCount ? parseInt(currentCount) + 1 : 1;
      const remaining = 5 - newCount;
      
      console.log(`📊 OTP count for user ${user.email}: ${newCount}/5 (${remaining} remaining today)`);
    } catch (err) {
      console.error('Rate limit increment error:', err);
      // Continue even if Redis fails
    }
    */
    
    res.json({
      message: 'OTP sent to your email',
      requiresOTP: true,
      userId: user.id,
      email: user.email,
      // In dev mode, return OTP for testing - REMOVE IN PRODUCTION
      devOTP: process.env.NODE_ENV === 'development' ? otp : undefined
    });
    
  } catch (error) {
    console.error('Enhanced login error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login/verify-otp
 * Enhanced login Step 2: Verify OTP and complete login
 */
router.post('/login/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    console.log('🔐 OTP Verification Request:', { email, otp, otpType: typeof otp, otpLength: otp?.length });
    
    if (!email || !otp) {
      console.log('❌ Missing email or OTP');
      return res.status(400).json({ error: 'Email and OTP required' });
    }
    
    // Find user
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('✅ User found:', { 
      email: user.email, 
      hasLoginOTP: !!user.loginOTP, 
      loginOTPExpires: user.loginOTPExpires,
      expiresType: typeof user.loginOTPExpires
    });
    
    // Check if OTP exists and not expired
    if (!user.loginOTP || !user.loginOTPExpires) {
      console.log('❌ No OTP found in database');
      return res.status(400).json({ error: 'No OTP request found. Please login again.' });
    }
    
    // Handle both timestamp (number/string) and Date object formats
    const nowTimestamp = Date.now();
    let expiresTimestamp;
    
    if (typeof user.loginOTPExpires === 'number') {
      // Already a timestamp (number)
      expiresTimestamp = user.loginOTPExpires;
    } else if (typeof user.loginOTPExpires === 'string') {
      // Parse string timestamp to number
      expiresTimestamp = parseInt(user.loginOTPExpires, 10);
    } else if (user.loginOTPExpires instanceof Date) {
      // Convert Date to timestamp
      expiresTimestamp = user.loginOTPExpires.getTime();
    } else {
      // Fallback - try to parse
      expiresTimestamp = parseInt(String(user.loginOTPExpires), 10);
    }
    
    const isExpired = nowTimestamp > expiresTimestamp;
    
    console.log('⏰ Time check:', { 
      nowTimestamp, 
      expiresTimestamp,
      expiresType: typeof expiresTimestamp,
      nowDate: new Date(nowTimestamp).toISOString(),
      expiresDate: new Date(expiresTimestamp).toISOString(),
      timeDiffMinutes: Math.round((expiresTimestamp - nowTimestamp) / 60000),
      expired: isExpired 
    });
    
    if (isExpired) {
      console.log('❌ OTP expired');
      return res.status(400).json({ error: 'OTP expired. Please login again.' });
    }
    
    // Verify OTP
    const bcrypt = require('bcryptjs');
    console.log('🔍 Comparing OTP:', { provided: otp, stored: user.loginOTP?.substring(0, 20) + '...' });
    const isValidOTP = await bcrypt.compare(otp, user.loginOTP);
    console.log('🔑 OTP comparison result:', isValidOTP);
    
    if (!isValidOTP) {
      console.log('❌ Invalid OTP');
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    
    console.log('✅ OTP verified successfully!');
    
    // Successful login - reset failed attempts
    await resetFailedAttempts(email);
    
    // Clear OTP
    await User.update(
      {
        loginOTP: null,
        loginOTPExpires: null,
        lastLoginAt: new Date()
      },
      { where: { id: user.id } }
    );
    
    // Generate tokens
    const accessToken = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);
    
    // Set HTTP-only cookies for tokens
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified
      },
      accessToken,
      refreshToken
    });
    
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/account/history
 * Check if email has account history (for returning users)
 */
router.post('/account/history', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const history = await userTrackingService.checkDeletedUserHistory(email);
    
    res.json({
      hasHistory: !!history,
      deletionCount: history?.deletionCount || 0,
      originalRegistrationDate: history?.originalRegistrationDate || null,
      isAbuser: history?.isAbuser || false,
      message: history?.isAbuser 
        ? 'This email has been flagged for abuse. Free tier access may be restricted.'
        : history 
          ? 'Welcome back! Your account history is preserved.'
          : 'New user'
    });
  } catch (error) {
    console.error('Account history check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email with token
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔐 Forgot password request for:', email);
    
    if (!email) {
      console.log('❌ No email provided');
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await User.findOne({ where: { email } });
    
    console.log('👤 User lookup result:', user ? `Found: ${user.email}` : 'Not found');
    
    // Don't reveal if email exists for security
    if (!user) {
      console.log('⚠️ Email not registered, returning generic success message');
      return res.json({ 
        success: true,
        message: 'If this email is registered, you will receive a password reset link.' 
      });
    }
    
    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    await User.update({
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpires
    }, { where: { id: user.id } });
    
    console.log(`🔐 Generated reset token for ${user.email}:`, resetToken);
    console.log(`⏰ Token expires at:`, resetTokenExpires.toISOString());
    
    // Send reset email using utils emailService
    const utilsEmailService = require('../utils/emailService');
    
    console.log(`📧 Attempting to send password reset email to ${user.email}...`);
    try {
      await utilsEmailService.sendPasswordResetEmail(user.email, user.username, resetToken);
      console.log(`✅ Password reset email sent successfully to ${user.email}`);
    } catch (emailError) {
      console.error(`❌ Error sending password reset email:`, emailError);
      // Continue anyway - don't fail the request
    }
    
    res.json({
      success: true,
      message: 'If this email is registered, you will receive a password reset link.',
      // In dev mode, return token for testing
      devToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error during password recovery' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token from email
 */
router.post('/reset-password', async (req, res) => {
  try {
    console.log('🔍 Reset password request received');
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      console.log('❌ Missing token or password');
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    console.log('✓ Token and password provided');
    
    // Validate password strength
    if (newPassword.length < 8) {
      console.log('❌ Password too short:', newPassword.length);
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    console.log('✓ Password length valid:', newPassword.length);
    console.log('🔍 Looking for user with token...');
    
    // Find user with reset token
    const user = await User.findOne({ 
      where: { 
        '$reset_password_token$': token,
        '$reset_password_expires$': { [require('sequelize').Op.gt]: new Date() }
      } 
    });
    
    console.log('✓ User query completed, found:', !!user);
    console.log('✓ User query completed, found:', !!user);
    
    if (!user) {
      console.log('❌ No user found with this token');
      return res.status(404).json({ error: 'Invalid or expired reset token' });
    }
    
    console.log('✓ User found:', user.email);
    console.log('🔍 Hashing new password...');
    
    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log('✓ Password hashed');
    console.log('🔍 Updating database...');
    
    // Update password and clear reset token
    await User.update({ 
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null
    }, { where: { id: user.id } });
    
    console.log('✓ Database updated');
    
    // Send password change confirmation email
    try {
      if (emailServiceConfirmation && typeof emailServiceConfirmation.sendPasswordChangeConfirmation === 'function') {
        await emailServiceConfirmation.sendPasswordChangeConfirmation(user.email, user.username);
        console.log(`📧 Password change confirmation email sent to ${user.email}`);
      }
    } catch (emailError) {
      console.error('Failed to send password change confirmation:', emailError);
      // Don't fail the request if email fails - password is already reset
    }
    
    console.log(`✅ Password reset successfully for ${user.email}`);
    
    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Server error during password reset' });
  }
});

/**
 * POST /api/auth/logout
 * Logout user and clear cookies
 */
router.post('/logout', (req, res) => {
  try {
    // Clear cookies
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({ 
      message: 'Logged out successfully',
      success: true 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
