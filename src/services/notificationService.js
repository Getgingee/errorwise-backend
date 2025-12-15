const { Op } = require('sequelize');
const emailService = require('../utils/emailService');
const User = require('../models/User');
const TeamMember = require('../models/TeamMember');

class NotificationService {
  
  /**
   * Send welcome email to new users
   */
  async sendWelcomeNotification(user) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: '🎉 Welcome to ErrorWise!',
        html: this.generateWelcomeEmailHtml(user)
      });
      
      console.log(`Welcome email sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send welcome notification:', error);
    }
  }

  /**
   * Send team invitation notification
   */
  async sendTeamInvitationNotification(inviterUser, invitedEmail, teamName, invitationId) {
    try {
      await emailService.sendEmail({
        to: invitedEmail,
        subject: `🤝 You're invited to join "${teamName}" on ErrorWise`,
        html: this.generateTeamInvitationHtml(inviterUser, invitedEmail, teamName, invitationId)
      });
      
      console.log(`Team invitation sent to ${invitedEmail} for team ${teamName}`);
    } catch (error) {
      console.error('Failed to send team invitation:', error);
    }
  }

  /**
   * Send payment confirmation notification
   */
  async sendPaymentConfirmationNotification(user, subscription, paymentAmount) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `✅ Payment Confirmed - Welcome to ${subscription.tier} Plan!`,
        html: this.generatePaymentConfirmationHtml(user, subscription, paymentAmount)
      });
      
      console.log(`Payment confirmation sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send payment confirmation:', error);
    }
  }

  /**
   * Send trial ending notification
   */
  async sendTrialEndingNotification(user, subscription, daysLeft) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `⏰ Your ErrorWise ${subscription.tier} trial ends in ${daysLeft} days`,
        html: this.generateTrialEndingHtml(user, subscription, daysLeft)
      });
      
      console.log(`Trial ending notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send trial ending notification:', error);
    }
  }

  /**
   * Send daily query limit warning
   */
  async sendQueryLimitWarningNotification(user, queriesUsed, dailyLimit) {
    try {
      const remaining = dailyLimit - queriesUsed;
      
      await emailService.sendEmail({
        to: user.email,
        subject: `⚠️ You're almost at your daily ErrorWise limit`,
        html: this.generateQueryLimitWarningHtml(user, queriesUsed, remaining)
      });
      
      console.log(`Query limit warning sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send query limit warning:', error);
    }
  }

  /**
   * Send shared error notification to team members
   */
  async sendSharedErrorNotification(sharedBy, teamId, errorTitle) {
    try {
      // Get all active team members except the person who shared
      const teamMembers = await TeamMember.findAll({
        where: { 
          team_id: teamId, 
          status: 'active',
          user_id: { [Op.ne]: sharedBy.id }
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['email', 'username']
        }]
      });

      // Send notifications to all team members
      const emailPromises = teamMembers.map(member =>
        emailService.sendEmail({
          to: member.user.email,
          subject: `🔍 ${sharedBy.username} shared an error: "${errorTitle}"`,
          html: this.generateSharedErrorHtml(sharedBy, member.user, errorTitle, teamId)
        })
      );

      await Promise.all(emailPromises);
      console.log(`Shared error notifications sent to ${teamMembers.length} team members`);
    } catch (error) {
      console.error('Failed to send shared error notifications:', error);
    }
  }

  /**
   * Check and send trial ending notifications (to be run daily via cron)
   */
  async checkTrialEndingNotifications() {
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      // Find users with trials ending soon
      const { Subscription } = require('../models');
      
      const endingTrials = await Subscription.findAll({
        where: {
          status: 'trialing',
          endDate: {
            [Op.between]: [oneDayFromNow, threeDaysFromNow]
          }
        },
        include: [{
          model: User,
          attributes: ['email', 'username']
        }]
      });

      for (const subscription of endingTrials) {
        const daysLeft = Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24));
        await this.sendTrialEndingNotification(subscription.User, subscription, daysLeft);
      }

      console.log(`Checked ${endingTrials.length} trial ending notifications`);
    } catch (error) {
      console.error('Failed to check trial ending notifications:', error);
    }
  }

  // HTML Email Templates
  
  generateWelcomeEmailHtml(user) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">🎉 Welcome to ErrorWise!</h1>
        </div>
        
        <p>Hi ${user.username || user.email.split('@')[0]},</p>
        
        <p>Welcome to ErrorWise - your AI-powered debugging companion! We're excited to help you solve coding errors faster and more efficiently.</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">🚀 Get Started:</h3>
          <ul>
            <li><strong>Free Plan:</strong> 3 error explanations per day</li>
            <li><strong>Pro Plan:</strong> Unlimited queries + detailed solutions ($3/month)</li>
            <li><strong>Team Plan:</strong> Everything + team collaboration ($8/month)</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Start Analyzing Errors →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          Need help? Reply to this email or visit our <a href="${process.env.FRONTEND_URL}/help">Help Center</a>.
        </p>
      </div>
    `;
  }

  generateTeamInvitationHtml(inviter, invitedEmail, teamName, invitationId) {
    const acceptUrl = `${process.env.FRONTEND_URL}/teams/accept/${invitationId}`;
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">🤝 Team Invitation</h1>
        </div>
        
        <p>Hi there!</p>
        
        <p><strong>${inviter.username}</strong> has invited you to join the "<strong>${teamName}</strong>" team on ErrorWise.</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">🎯 Team Benefits:</h3>
          <ul>
            <li>Share and collaborate on error solutions</li>
            <li>Access team error history and insights</li>
            <li>Built-in video chat for debugging sessions</li>
            <li>Team analytics dashboard</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${acceptUrl}" 
             style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
            Accept Invitation →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          This invitation will expire in 7 days. If you don't have an ErrorWise account, you'll be prompted to create one.
        </p>
      </div>
    `;
  }

  generatePaymentConfirmationHtml(user, subscription, paymentAmount) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #10b981; margin: 0;">✅ Payment Confirmed!</h1>
        </div>
        
        <p>Hi ${user.username || user.email.split('@')[0]},</p>
        
        <p>Your payment has been successfully processed. Welcome to the <strong>${subscription.tier.toUpperCase()} plan</strong>!</p>
        
        <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="color: #065f46; margin-top: 0;">📋 Payment Details:</h3>
          <p><strong>Plan:</strong> ${subscription.tier.toUpperCase()} Plan</p>
          <p><strong>Amount:</strong> $${paymentAmount}</p>
          <p><strong>Billing:</strong> ${subscription.billingInterval || 'Monthly'}</p>
          <p><strong>Next billing:</strong> ${subscription.endDate}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Access Your Dashboard →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          Questions about your subscription? Contact us at hi@getgingee.com
        </p>
      </div>
    `;
  }

  generateTrialEndingHtml(user, subscription, daysLeft) {
    const upgradeUrl = `${process.env.FRONTEND_URL}/pricing?upgrade=${subscription.tier}`;
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #f59e0b; margin: 0;">⏰ Trial Ending Soon</h1>
        </div>
        
        <p>Hi ${user.username || user.email.split('@')[0]},</p>
        
        <p>Your <strong>${subscription.tier.toUpperCase()} plan trial</strong> will end in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p>
        
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; margin-top: 0;">🎯 Don't lose access to:</h3>
          <ul>
            <li>Unlimited error analysis and solutions</li>
            <li>Advanced debugging insights</li>
            <li>Complete error history</li>
            <li>${subscription.tier === 'team' ? 'Team collaboration features' : 'Premium support'}</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${upgradeUrl}" 
             style="background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Continue ${subscription.tier.toUpperCase()} Plan →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          After your trial ends, you'll be switched to the Free plan (3 queries/day). Upgrade anytime to restore full access.
        </p>
      </div>
    `;
  }

  generateQueryLimitWarningHtml(user, queriesUsed, remaining) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #f59e0b; margin: 0;">⚠️ Almost at your daily limit</h1>
        </div>
        
        <p>Hi ${user.username || user.email.split('@')[0]},</p>
        
        <p>You've used <strong>${queriesUsed}</strong> of your daily queries. You have <strong>${remaining} remaining</strong> for today.</p>
        
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #92400e; margin-top: 0;">🚀 Upgrade to Pro for unlimited queries!</h3>
          <ul>
            <li><strong>$3/month</strong> - Best value for individual developers</li>
            <li>Unlimited error analysis</li>
            <li>Detailed solutions and code examples</li>
            <li>Complete error history</li>
            <li>7-day free trial</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/pricing" 
             style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Upgrade to Pro →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          Your daily limit resets at midnight. Upgrade anytime for unlimited access.
        </p>
      </div>
    `;
  }

  generateSharedErrorHtml(sharedBy, recipient, errorTitle, teamId) {
    const viewUrl = `${process.env.FRONTEND_URL}/teams/${teamId}/errors`;
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">🔍 New Shared Error</h1>
        </div>
        
        <p>Hi ${recipient.username || recipient.email.split('@')[0]},</p>
        
        <p><strong>${sharedBy.username}</strong> shared an error with your team:</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <h3 style="color: #1e40af; margin-top: 0;">"${errorTitle}"</h3>
          <p style="color: #64748b;">Click below to view the error details and collaborate on solutions.</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}" 
             style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Team Errors →
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          Team collaboration helps solve errors faster. Share your insights and solutions!
        </p>
      </div>
    `;
  }

  // ===== ASYNC PAYMENT NOTIFICATION METHODS =====

  /**
   * Send payment failed notification
   */
  async sendPaymentFailedNotification(user, paymentData) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `⚠️ Payment Failed - Action Required`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #dc2626; margin: 0;">⚠️ Payment Failed</h1>
            </div>
            
            <p>Hi ${user.username},</p>
            
            <p>We were unable to process your payment of <strong>$${paymentData.amount || 'N/A'}</strong>.</p>
            
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <p style="color: #991b1b; margin: 0;"><strong>Reason:</strong> ${paymentData.reason || 'Payment declined'}</p>
            </div>
            
            <p>Please update your payment method to continue enjoying ErrorWise features:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/settings/billing" 
                 style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Update Payment Method →
              </a>
            </div>
          </div>
        `
      });
      console.log(`Payment failed notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send payment failed notification:', error);
    }
  }

  /**
   * Send subscription renewed notification
   */
  async sendSubscriptionRenewedNotification(user, subscriptionData) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `✅ Subscription Renewed - ${subscriptionData.tier} Plan`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #22c55e; margin: 0;">✅ Subscription Renewed!</h1>
            </div>
            
            <p>Hi ${user.username},</p>
            
            <p>Your <strong>${subscriptionData.tier}</strong> subscription has been successfully renewed.</p>
            
            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Next billing date:</strong> ${new Date(subscriptionData.nextBillingDate).toLocaleDateString()}</p>
            </div>
            
            <p>Thank you for continuing to use ErrorWise!</p>
          </div>
        `
      });
      console.log(`Subscription renewed notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send subscription renewed notification:', error);
    }
  }

  /**
   * Send subscription cancelled notification
   */
  async sendSubscriptionCancelledNotification(user, subscriptionData) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `😢 Subscription Cancelled`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #6b7280; margin: 0;">Subscription Cancelled</h1>
            </div>
            
            <p>Hi ${user.username},</p>
            
            <p>Your <strong>${subscriptionData.tier}</strong> subscription has been cancelled.</p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Access until:</strong> ${new Date(subscriptionData.endDate).toLocaleDateString()}</p>
              <p style="color: #64748b;">You'll continue to have access to all features until this date.</p>
            </div>
            
            <p>We'd love to have you back! Resubscribe anytime:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/pricing" 
                 style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Plans →
              </a>
            </div>
          </div>
        `
      });
      console.log(`Subscription cancelled notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send subscription cancelled notification:', error);
    }
  }

  /**
   * Send refund notification
   */
  async sendRefundNotification(user, refundData) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `💰 Refund Processed`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #22c55e; margin: 0;">💰 Refund Processed</h1>
            </div>
            
            <p>Hi ${user.username},</p>
            
            <p>Your refund of <strong>$${refundData.amount}</strong> has been processed.</p>
            
            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Reason:</strong> ${refundData.reason || 'Requested by customer'}</p>
              <p style="color: #64748b;">Please allow 5-10 business days for the refund to appear in your account.</p>
            </div>
            
            <p>If you have any questions, please contact our support team.</p>
          </div>
        `
      });
      console.log(`Refund notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send refund notification:', error);
    }
  }

  /**
   * Send trial ended notification
   */
  async sendTrialEndedNotification(user) {
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: `⏰ Your Trial Has Ended`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #f59e0b; margin: 0;">⏰ Trial Period Ended</h1>
            </div>
            
            <p>Hi ${user.username},</p>
            
            <p>Your free trial of ErrorWise Pro has ended. You've been moved to the free tier.</p>
            
            <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #92400e; margin-top: 0;">Continue with Pro!</h3>
              <ul>
                <li>Unlimited error analysis</li>
                <li>Priority AI responses</li>
                <li>Complete error history</li>
                <li>Only $3/month</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/pricing" 
                 style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Upgrade Now →
              </a>
            </div>
          </div>
        `
      });
      console.log(`Trial ended notification sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send trial ended notification:', error);
    }
  }
}

module.exports = new NotificationService();