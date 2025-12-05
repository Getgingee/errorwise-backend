const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.sendgridInitialized = false;
    this.initialize();
  }

  async initialize() {
    try {
      const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
      
      if (!SENDGRID_API_KEY) {
        console.warn('⚠️  No SendGrid API key found, email service in console mode');
        logger.warn('SendGrid API key not configured');
        return;
      }

      // Initialize SendGrid Web API (Railway blocks SMTP ports)
      sgMail.setApiKey(SENDGRID_API_KEY);
      this.sendgridInitialized = true;
      
      console.log('✅ EmailService class: SendGrid Web API initialized');
      logger.info('EmailService initialized with SendGrid Web API');
    } catch (error) {
      console.error('❌ EmailService initialization failed:', error);
      logger.error('EmailService initialization failed:', error);
    }
  }

  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      if (!this.sendgridInitialized) {
        console.log('📧 Email (Console Mode) - SendGrid not initialized');
        console.log('   To:', to);
        console.log('   Subject:', subject);
        logger.info('Email would be sent (console mode):', { to, subject });
        return {
          success: true,
          messageId: 'console-' + Date.now(),
          mode: 'console'
        };
      }

      const fromName = process.env.FROM_NAME || 'ErrorWise';
      const fromEmail = process.env.FROM_EMAIL || 'noreply@errorwise.app';
      
      const msg = {
        to,
        from: {
          email: fromEmail,
          name: fromName
        },
        subject,
        html: htmlContent,
        text: textContent || this.stripHtml(htmlContent)
      };

      console.log('📧 Sending email via SendGrid to:', to);
      console.log('📧 Subject:', subject);

      const response = await sgMail.send(msg);
      
      console.log('✅ Email sent successfully via SendGrid Web API');
      logger.info('Email sent successfully:', {
        to,
        subject,
        statusCode: response[0].statusCode
      });

      return {
        success: true,
        messageId: response[0].headers['x-message-id'] || 'sendgrid-' + Date.now(),
        statusCode: response[0].statusCode
      };
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Welcome email for new users
  async sendWelcomeEmail(user) {
    const subject = 'Welcome to ErrorWise!';
    const htmlContent = this.generateWelcomeEmailHtml(user);
    
    return await this.sendEmail(user.email, subject, htmlContent);
  }

  // Password reset email
  async sendPasswordResetEmail(email, username, resetUrl) {
    const subject = 'Reset Your ErrorWise Password';
    const htmlContent = this.generatePasswordResetEmailHtml({ email, username }, resetUrl);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Password change confirmation email
  async sendPasswordChangeConfirmation(email, username) {
    const subject = 'Password Changed Successfully';
    const htmlContent = this.generatePasswordChangeConfirmationHtml({ email, username });
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Error analysis notification
  async sendErrorAnalysisComplete(user, analysisResult) {
    const subject = 'Your Error Analysis is Ready';
    const htmlContent = this.generateErrorAnalysisEmailHtml(user, analysisResult);
    
    return await this.sendEmail(user.email, subject, htmlContent);
  }

  // Subscription confirmation
  async sendSubscriptionConfirmation(user, subscription) {
    const subject = 'Subscription Confirmation - ErrorWise';
    const htmlContent = this.generateSubscriptionEmailHtml(user, subscription);
    
    return await this.sendEmail(user.email, subject, htmlContent);
  }

  // Team invitation
  async sendTeamInvitation(inviteeEmail, inviterUser, team, inviteToken) {
    const subject = `You've been invited to join ${team.name} on ErrorWise`;
    const inviteUrl = `${process.env.FRONTEND_URL}/team/join?token=${inviteToken}`;
    const htmlContent = this.generateTeamInviteEmailHtml(inviteeEmail, inviterUser, team, inviteUrl);
    
    return await this.sendEmail(inviteeEmail, subject, htmlContent);
  }

  // Subscription cancellation confirmation
  async sendCancellationConfirmation(email, username, plan, endDate) {
    const subject = 'Subscription Cancelled - ErrorWise';
    const htmlContent = this.generateCancellationEmailHtml({ email, username }, plan, endDate);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Send login OTP
  async sendLoginOTP(email, username, otp) {
    const subject = 'Your ErrorWise Login Code';
    const htmlContent = this.generateLoginOTPHtml(username, otp);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Trial started email
  async sendTrialStartedEmail(email, username, trialEndDate) {
    const subject = 'Your 7-Day Pro Trial Has Started! 🎉';
    const htmlContent = this.generateTrialStartedHtml(username, trialEndDate);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Trial expiring soon email (sent 2 days before expiry)
  async sendTrialExpiringEmail(email, username, daysLeft) {
    const subject = `Your Trial Ends in ${daysLeft} Day${daysLeft > 1 ? 's' : ''} - ErrorWise`;
    const htmlContent = this.generateTrialExpiringHtml(username, daysLeft);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Trial expired email
  async sendTrialExpiredEmail(email) {
    const subject = 'Your ErrorWise Trial Has Ended';
    const htmlContent = this.generateTrialExpiredHtml();
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Trial cancelled email
  async sendTrialCancelledEmail(email, username, accessUntil) {
    const subject = 'Trial Cancellation Confirmed - ErrorWise';
    const htmlContent = this.generateTrialCancelledHtml(username, accessUntil);
    
    return await this.sendEmail(email, subject, htmlContent);
  }

  // Email templates
  generateWelcomeEmailHtml(user) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Welcome to ErrorWise!</h1>
        <p>Hello ${user.username || user.email},</p>
        <p>Thank you for joining ErrorWise - your intelligent error analysis companion!</p>
        <p>Here's what you can do with ErrorWise:</p>
        <ul>
          <li>📝 Analyze error messages instantly</li>
          <li>🔍 Get detailed solutions and explanations</li>
          <li>📊 Track your error resolution history</li>
          <li>👥 Collaborate with your team</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Get Started
          </a>
        </div>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Happy debugging!<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generatePasswordResetEmailHtml(user, resetUrl) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Reset Your Password</h1>
        <p>Hello ${user.username || user.email},</p>
        <p>We received a request to reset your ErrorWise password.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Reset Password
          </a>
        </div>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>For security reasons, please don't share this link with anyone.</p>
        <p>Best regards,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generatePasswordChangeConfirmationHtml(user) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #22c55e;">Password Changed Successfully</h1>
        <p>Hello ${user.username || user.email},</p>
        <p>Your ErrorWise password has been successfully changed.</p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <p><strong>✅ Password Updated:</strong> ${new Date().toLocaleString()}</p>
          <p>If you didn't make this change, please contact our support team immediately.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/login" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Login to Your Account
          </a>
        </div>
        <p>Your account security is important to us. If you have any concerns, please don't hesitate to reach out.</p>
        <p>Best regards,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateErrorAnalysisEmailHtml(user, analysisResult) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Error Analysis Complete</h1>
        <p>Hello ${user.username || user.email},</p>
        <p>Your error analysis has been completed with <strong>${analysisResult.confidence}% confidence</strong>.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <h3>Error Type: ${analysisResult.category || 'General'}</h3>
          <p><strong>Solution Summary:</strong></p>
          <p>${analysisResult.solution.substring(0, 200)}...</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/analysis/${analysisResult.id}" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View Full Analysis
          </a>
        </div>
        <p>Happy debugging!<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateSubscriptionEmailHtml(user, subscription) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Subscription Confirmed</h1>
        <p>Hello ${user.username || user.email},</p>
        <p>Thank you for upgrading to <strong>${subscription.planName}</strong>!</p>
        <div style="background: #f0fdf4; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <h3>Your Plan Details:</h3>
          <ul>
            <li>Plan: ${subscription.planName}</li>
            <li>Monthly Analyses: ${subscription.monthlyLimit || 'Unlimited'}</li>
            <li>Team Members: ${subscription.teamLimit || 'Unlimited'}</li>
            <li>Next Billing: ${new Date(subscription.nextBillingDate).toLocaleDateString()}</li>
          </ul>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Access Your Dashboard
          </a>
        </div>
        <p>Enjoy your enhanced ErrorWise experience!</p>
        <p>Best regards,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateTeamInviteEmailHtml(inviteeEmail, inviterUser, team, inviteUrl) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Team Invitation</h1>
        <p>Hello,</p>
        <p><strong>${inviterUser.username || inviterUser.email}</strong> has invited you to join the team <strong>"${team.name}"</strong> on ErrorWise.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <h3>About ErrorWise:</h3>
          <p>ErrorWise is an intelligent error analysis platform that helps developers debug faster with AI-powered solutions.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Accept Invitation
          </a>
        </div>
        <p><em>This invitation will expire in 7 days.</em></p>
        <p>If you don't want to join this team, you can simply ignore this email.</p>
        <p>Best regards,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateCancellationEmailHtml(user, plan, endDate) {
    const formattedEndDate = endDate ? new Date(endDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : 'the end of your billing period';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ff9800;">Subscription Cancelled</h1>
        <p>Hello ${user.username || user.email},</p>
        <p>We've received your request to cancel your ErrorWise <strong>${plan}</strong> subscription.</p>
        <div style="background: #fff3cd; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3>📅 What Happens Next:</h3>
          <ul>
            <li><strong>Until ${formattedEndDate}:</strong> Your ${plan} features remain active</li>
            <li><strong>After ${formattedEndDate}:</strong> You'll be switched to the Free plan</li>
            <li><strong>Your data:</strong> All your history and settings will be preserved</li>
          </ul>
        </div>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <h3>💡 We'd Love Your Feedback:</h3>
          <p>Help us improve! What made you cancel? Reply to this email to let us know.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/pricing" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Reactivate Subscription
          </a>
        </div>
        <p>You can always reactivate your subscription anytime from your account settings.</p>
        <p>We hope to see you again!<br>The ErrorWise Team</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="text-align: center; color: #666; font-size: 12px;">
          © ${new Date().getFullYear()} ErrorWise. All rights reserved.
        </p>
      </div>
    `;
  }

  // Generate login OTP email HTML
  generateLoginOTPHtml(username, otp) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Login Verification</h1>
        <p>Hello ${username},</p>
        <p>You requested to login to your ErrorWise account. Here is your verification code:</p>
        <div style="background: #f3f4f6; padding: 30px; border-radius: 6px; margin: 20px 0; text-align: center;">
          <div style="font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 8px; font-family: 'Courier New', monospace;">
            ${otp}
          </div>
        </div>
        <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p><strong>⚠️ Security Notice:</strong></p>
          <ul style="margin: 10px 0;">
            <li>This code will expire in 10 minutes</li>
            <li>Never share this code with anyone</li>
            <li>If you didn't request this, please secure your account</li>
          </ul>
        </div>
        <p>Best regards,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateTrialStartedHtml(username, trialEndDate) {
    const endDateStr = new Date(trialEndDate).toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Your Pro Trial Has Started! 🎉</h1>
        <p>Hello ${username || 'there'},</p>
        <p>Welcome to ErrorWise Pro! Your 7-day trial is now active.</p>
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">What you now have access to:</h3>
          <ul style="color: #1e40af;">
            <li>✨ Unlimited error analyses</li>
            <li>🤖 Advanced AI models (Claude Sonnet)</li>
            <li>💬 Follow-up questions for deeper understanding</li>
            <li>📊 Full history access</li>
            <li>📤 Export your error history</li>
          </ul>
        </div>
        <p><strong>Your trial ends on:</strong> ${endDateStr}</p>
        <p>If you love ErrorWise Pro, you don't need to do anything - your subscription will automatically continue after the trial.</p>
        <p>Want to cancel? No problem! You can cancel anytime from your dashboard before the trial ends.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Start Exploring Pro Features
          </a>
        </div>
        <p>Happy debugging!<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateTrialExpiringHtml(username, daysLeft) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b;">Your Trial Ends Soon ⏰</h1>
        <p>Hello ${username || 'there'},</p>
        <p>Just a heads up - your ErrorWise Pro trial ends in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0;"><strong>What happens next?</strong></p>
          <p style="margin: 10px 0 0 0;">After your trial ends, your subscription will automatically continue and you'll be charged based on your selected plan. If you'd like to cancel, you can do so from your dashboard.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/settings/subscription" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Manage Subscription
          </a>
        </div>
        <p>Questions? Reply to this email and we'll help you out.</p>
        <p>Best,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateTrialExpiredHtml() {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6b7280;">Your Trial Has Ended</h1>
        <p>Hello,</p>
        <p>Your 7-day ErrorWise Pro trial has ended. We hope you enjoyed the experience!</p>
        <p>You're now on the Free plan with limited features. Want to continue with Pro?</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/pricing" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Upgrade to Pro
          </a>
        </div>
        <p>Thank you for trying ErrorWise!</p>
        <p>Best,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  generateTrialCancelledHtml(username, accessUntil) {
    const accessUntilStr = new Date(accessUntil).toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2563eb;">Trial Cancellation Confirmed</h1>
        <p>Hello ${username || 'there'},</p>
        <p>Your ErrorWise Pro trial has been cancelled as requested.</p>
        <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Good news:</strong> You'll continue to have Pro access until <strong>${accessUntilStr}</strong>.</p>
        </div>
        <p>After that date, your account will switch to our Free plan. You won't be charged.</p>
        <p>Changed your mind? You can always subscribe to Pro from your dashboard.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/pricing" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View Plans
          </a>
        </div>
        <p>Thank you for trying ErrorWise!</p>
        <p>Best,<br>The ErrorWise Team</p>
      </div>
    `;
  }

  // Utility function to strip HTML tags for text version
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;