const User = require('../models/User');
const authService = require('../services/authService');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Register a new user
exports.register = async (req, res) => {
    try {
        // Debug log to see what data is received
        console.log('🔍 REGISTRATION ATTEMPT RECEIVED');
        console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
        console.log('📦 All Keys:', Object.keys(req.body));
        
        logger.info('Registration attempt received:', {
            body: req.body,
            keys: Object.keys(req.body)
        });

        // Extract fields with flexible field name support
        const username = req.body.username || req.body.userName || req.body.user_name;
        const email = req.body.email || req.body.emailAddress || req.body.email_address;
        const password = req.body.password || req.body.pass;
        
        // Support multiple possible field name variations for security questions
        const securityQuestion = req.body.securityQuestion || req.body.security_question || 
                                 req.body.question || req.body.securityQuestion1 || req.body.security_question_1;
        const securityAnswer = req.body.securityAnswer || req.body.security_answer || 
                               req.body.answer || req.body.securityAnswer1 || req.body.security_answer_1;
        
        // Old format support (3 questions)
        const securityQuestion1 = req.body.securityQuestion1 || req.body.security_question_1;
        const securityAnswer1 = req.body.securityAnswer1 || req.body.security_answer_1;
        const securityQuestion2 = req.body.securityQuestion2 || req.body.security_question_2;
        const securityAnswer2 = req.body.securityAnswer2 || req.body.security_answer_2;
        const securityQuestion3 = req.body.securityQuestion3 || req.body.security_question_3;
        const securityAnswer3 = req.body.securityAnswer3 || req.body.security_answer_3;

        console.log('✓ Extracted username:', username);
        console.log('✓ Extracted email:', email);
        console.log('✓ Extracted password:', password ? '***' : 'missing');
        console.log('✓ Extracted securityQuestion:', securityQuestion);
        console.log('✓ Extracted securityAnswer:', securityAnswer ? '***' : 'missing');

        // Determine which format is being used
        const isOldFormat = securityQuestion1 && securityAnswer1;
        const isNewFormat = securityQuestion && securityAnswer;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Username, email, and password are required' 
            });
        }

        if (!isOldFormat && !isNewFormat) {
            return res.status(400).json({ 
                success: false,
                error: 'At least one security question and answer are required' 
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ 
                success: false,
                error: 'Password must be at least 8 characters long' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid email format' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                error: 'Email already registered' 
            });
        }

        // Check if username is taken
        const existingUsername = await User.findOne({ where: { username } });
        if (existingUsername) {
            return res.status(400).json({ 
                success: false,
                error: 'Username already taken' 
            });
        }

        // Hash password and security answers
        const hashedPassword = await authService.hashPassword(password);
        
        let question1, answer1, question2, answer2, question3, answer3;
        
        if (isOldFormat) {
            // Old format: use 3 questions
            question1 = securityQuestion1;
            answer1 = await authService.hashPassword(securityAnswer1);
            question2 = securityQuestion2;
            answer2 = await authService.hashPassword(securityAnswer2);
            question3 = securityQuestion3;
            answer3 = await authService.hashPassword(securityAnswer3);
        } else {
            // New format: use 1 question for all 3 fields
            const hashedAnswer = await authService.hashPassword(securityAnswer);
            question1 = securityQuestion;
            answer1 = hashedAnswer;
            question2 = securityQuestion;
            answer2 = hashedAnswer;
            question3 = securityQuestion;
            answer3 = hashedAnswer;
        }

        // Create new user
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
            securityQuestion1: question1,
            securityAnswer1: answer1,
            securityQuestion2: question2,
            securityAnswer2: answer2,
            securityQuestion3: question3,
            securityAnswer3: answer3,
            isActive: true,
            role: 'user',
            subscriptionTier: 'free',
            subscriptionStatus: 'active',
            originalRegistrationDate: new Date()
        });

        // Generate tokens
        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);

        // Set HTTP-only cookies
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

        // Send welcome email
        const emailService = require('../utils/emailService');
        try {
            await emailService.sendWelcomeEmail(user);
            logger.info('Welcome email sent successfully', { email: user.email });
        } catch (emailError) {
            logger.error('Failed to send welcome email:', emailError);
            // Don't fail registration if email fails
        }

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                subscriptionTier: user.subscriptionTier,
                subscriptionStatus: user.subscriptionStatus
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during registration' 
        });
    }
};

// Login user
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
            return res.status(401).json({ 
                success: false,
                error: 'Invalid email or password' 
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({ 
                success: false,
                error: 'Account has been deactivated. Please contact support.' 
            });
        }

        // Verify password
        const isValidPassword = await authService.comparePassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid email or password' 
            });
        }

        // Update last login
        await user.update({ lastLoginAt: new Date() });

        // Generate tokens
        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);

        // Set HTTP-only cookies
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
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                subscriptionTier: user.subscriptionTier,
                subscriptionStatus: user.subscriptionStatus
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during login' 
        });
    }
};

// Forgot Password - Step 1: Get security question
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false,
                error: 'Email is required' 
            });
        }

        const user = await User.findOne({ 
            where: { email },
            attributes: ['securityQuestion1']
        });

        if (!user) {
            // Don't reveal if email exists or not for security
            return res.status(404).json({ 
                success: false,
                error: 'If this email is registered, security question will be displayed' 
            });
        }

        res.json({
            success: true,
            securityQuestion: user.securityQuestion1
        });
    } catch (error) {
        logger.error('Forgot password error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during password recovery' 
        });
    }
};

// Reset Password - Step 2: Verify answer and reset password
exports.resetPassword = async (req, res) => {
    try {
        const { email, securityAnswer, newPassword } = req.body;

        // Validate input
        if (!email || !securityAnswer || !newPassword) {
            return res.status(400).json({ 
                success: false,
                error: 'Email, security answer, and new password are required' 
            });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false,
                error: 'New password must be at least 8 characters long' 
            });
        }

        // Find user
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        // Verify security answer
        const isAnswerValid = await authService.comparePassword(
            securityAnswer, 
            user.securityAnswer1
        );

        if (!isAnswerValid) {
            return res.status(401).json({ 
                success: false,
                error: 'Incorrect security answer' 
            });
        }

        // Hash new password
        const hashedPassword = await authService.hashPassword(newPassword);

        // Update password
        await user.update({ password: hashedPassword });

        logger.info('Password reset successfully', { userId: user.id, email: user.email });

        // Send password change confirmation email
        const emailService = require('../utils/emailService');
        try {
            await emailService.sendPasswordChangeConfirmation(user.email, user.username);
            logger.info('Password change confirmation email sent', { email: user.email });
        } catch (emailError) {
            logger.error('Failed to send password change confirmation:', emailError);
            // Don't fail the password reset if email fails
        }

        res.json({
            success: true,
            message: 'Password reset successfully. You can now login with your new password.'
        });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during password reset' 
        });
    }
};

// Refresh access token
exports.refreshToken = async (req, res) => {
    try {
        // Get refresh token from cookie or body
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ 
                success: false,
                error: 'Refresh token required' 
            });
        }

        // Verify refresh token
        authService.verifyRefreshToken(refreshToken, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ 
                    success: false,
                    error: 'Invalid or expired refresh token' 
                });
            }

            // Get user
            const user = await User.findByPk(decoded.userId);
            if (!user || !user.isActive) {
                return res.status(403).json({ 
                    success: false,
                    error: 'User not found or inactive' 
                });
            }

            // Generate new access token
            const accessToken = authService.generateAccessToken(user);

            // Set new access token cookie
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 1000 // 1 hour
            });

            res.json({
                success: true,
                accessToken
            });
        });
    } catch (error) {
        logger.error('Refresh token error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during token refresh' 
        });
    }
};

// Logout user
exports.logout = (req, res) => {
    try {
        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');

        logger.info('User logged out', { userId: req.user?.id });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error during logout' 
        });
    }
};

// Get current user profile
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'email', 'role', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndDate', 'isActive', 'lastLoginAt', 'createdAt']
        });

        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error while fetching profile' 
        });
    }
};
