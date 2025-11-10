const User = require('../models/User');
const authService = require('../services/authService');
const emailService = require('../utils/emailService');
const logger = require('../utils/logger');
const { trackFailedAttempt, resetFailedAttempts } = require('../middleware/accountLock');

// Simple registration without OTP
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username, email, and password are required' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ 
                success: false, 
                error: 'User with this email already exists' 
            });
        }

        // Hash password
        const hashedPassword = await authService.hashPassword(password);

        // Create user
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
            isActive: true, // Active immediately for simple registration
            emailVerified: false,
            subscriptionTier: 'free',
            subscriptionStatus: 'active'
        });

        // Generate tokens
        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);

        // Set cookies
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

        logger.info('User registered successfully', { userId: user.id, email: user.email });

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                subscriptionTier: user.subscriptionTier
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error during registration' 
        });
    }
};

// Simple login without OTP
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }

        // Find user
        const user = await User.findOne({ where: { email } });
        if (!user) {
            // Track failed attempt even if user doesn't exist (prevent enumeration but track suspicious activity)
            await trackFailedAttempt(email);
            
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({ 
                success: false, 
                error: 'Account is inactive. Please contact support.' 
            });
        }

        // Verify password
        const isPasswordValid = await authService.comparePassword(password, user.password);
        if (!isPasswordValid) {
            // Track failed login attempt
            const attemptResult = await trackFailedAttempt(email);
            
            logger.warn(`Failed login attempt for ${email}`, {
                attempts: attemptResult.attempts,
                locked: attemptResult.locked
            });
            
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
                success: false, 
                error: 'Invalid email or password',
                remainingAttempts: attemptResult.remainingAttempts
            });
        }

        // Successful login - reset failed attempts
        await resetFailedAttempts(email);

        // Detect suspicious login patterns
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('user-agent') || 'unknown';
        
        try {
            const suspiciousCheck = await authEdgeCaseService.detectSuspiciousLogin(
                user.id, 
                ipAddress, 
                userAgent
            );
            
            if (suspiciousCheck.suspicious) {
                logger.warn('Suspicious login detected but allowed', {
                    userId: user.id,
                    riskScore: suspiciousCheck.riskScore,
                    reasons: suspiciousCheck.reasons
                });
                // Note: We log and alert but don't block login
                // Consider adding 2FA requirement for high-risk logins in the future
            }
        } catch (suspicionError) {
            // Don't block login if suspicious detection fails
            logger.error('Suspicious login detection failed:', suspicionError);
        }

        // Update last login
        await user.update({ lastLoginAt: new Date() });

        // Generate tokens
        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);

        // Set cookies
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

        logger.info('User logged in successfully', { userId: user.id, email: user.email });

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                subscriptionTier: user.subscriptionTier,
                subscriptionStatus: user.subscriptionStatus
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error during login' 
        });
    }
};

//Forgot password - email-based flow
exports.forgotPassword = async (req, res) => {
    try {
        let { email } = req.body;
        
        // Normalize email to lowercase for consistent lookup
        email = email.toLowerCase().trim();
        
        console.log('🔐 [authController] Forgot password request for:', email);

        // Validate input
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email is required' 
            });
        }

        // Find user (case-insensitive email search)
        const user = await User.findOne({ 
            where: { 
                email: email 
            } 
        });
        console.log('👤 [authController] User lookup result:', user ? `Found: ${user.email}` : 'Not found');
        
        if (!user) {
            // For security, don't reveal if email exists
            console.log('⚠️ [authController] Email not registered, returning generic success message');
            return res.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate reset token
        const resetToken = authService.generatePasswordResetToken();
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        
        console.log('🔐 [authController] Generated reset token:', resetToken);
        console.log('⏰ [authController] Token expires at:', resetTokenExpiry.toISOString());

        // Save token to user
        await user.update({
            resetPasswordToken: resetToken,
            resetPasswordExpires: resetTokenExpiry
        });
        
        console.log('💾 [authController] Token saved to database for user:', user.email);

        // Send reset email
        try {
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
            console.log('📧 [authController] Attempting to send password reset email to:', user.email);
            console.log('🔗 [authController] Reset URL:', resetUrl);
            
            const result = await emailService.sendPasswordResetEmail(user.email, user.username, resetUrl);
            
            console.log('✅ [authController] Email service returned:', result);
            
            if (result.success) {
                logger.info('Password reset email sent', { userId: user.id, email: user.email });
                if (result.previewUrl) {
                    console.log('📬 [DEV MODE] Email preview URL:', result.previewUrl);
                }
            } else {
                console.error('❌ [authController] Email service reported failure:', result.error);
            }
        } catch (emailError) {
            console.error('❌ [authController] Exception sending password reset email:', emailError);
            logger.error('Failed to send password reset email:', emailError);
            // Don't fail the request if email fails
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    } catch (error) {
        console.error('❌ [authController] Forgot password error:', error);
        logger.error('Forgot password error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error processing password reset request' 
        });
    }
};

// Reset password with token
exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        console.log('🔐 [authController] Reset password request received');
        console.log('🔑 [authController] Token:', token);
        console.log('🔒 [authController] New password length:', newPassword ? newPassword.length : 0);

        // Validate input
        if (!token || !newPassword) {
            console.log('❌ [authController] Missing token or password');
            return res.status(400).json({ 
                success: false, 
                error: 'Token and new password are required' 
            });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            console.log('❌ [authController] Password too short');
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 8 characters long' 
            });
        }

        // Find user with valid token
        const { Op } = require('sequelize');
        console.log('🔍 [authController] Looking up user with token...');
        
        const user = await User.findOne({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: {
                    [Op.gt]: new Date()
                }
            }
        });
        
        console.log('👤 [authController] User found:', user ? `Yes: ${user.email}` : 'No - token invalid or expired');

        if (!user) {
            console.log('❌ [authController] Invalid or expired reset token');
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid or expired reset token' 
            });
        }

        console.log('🔐 [authController] Hashing new password...');
        // Hash new password
        const hashedPassword = await authService.hashPassword(newPassword);

        console.log('💾 [authController] Updating user password and clearing reset token...');
        // Update password and clear reset token
        await user.update({
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpires: null
        });

        console.log('✅ [authController] Password updated successfully for:', user.email);

        logger.info('Password reset successful', { userId: user.id, email: user.email });

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now login with your new password.'
        });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error during password reset' 
        });
    }
};

// Refresh token
exports.refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token required' });
        }
        authService.verifyRefreshToken(refreshToken, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ success: false, error: 'Invalid or expired refresh token' });
            }
            const user = await User.findByPk(decoded.userId);
            if (!user || !user.isActive) {
                return res.status(403).json({ success: false, error: 'User not found or inactive' });
            }
            const accessToken = authService.generateAccessToken(user);
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 1000
            });
            res.json({ success: true, accessToken });
        });
    } catch (error) {
        logger.error('Refresh token error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Logout
exports.logout = (req, res) => {
    try {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        logger.info('User logged out', { userId: req.user?.id });
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ success: false, error: 'Server error during logout' });
    }
};

// Get profile
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'email', 'role', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndDate', 'isActive', 'lastLoginAt', 'createdAt']
        });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

