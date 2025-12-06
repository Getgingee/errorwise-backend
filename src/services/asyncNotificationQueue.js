/**
 * Async Notification Queue Service
 * 
 * Implements async decoupling for payment notifications and other async operations
 * Uses Redis lists as a simple queue for reliable message processing
 */

const { redis } = require('../utils/redisClient');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const User = require('../models/User');

// Queue configuration
const QUEUE_PREFIX = 'notification_queue:';
const PAYMENT_QUEUE = `${QUEUE_PREFIX}payments`;
const SUBSCRIPTION_QUEUE = `${QUEUE_PREFIX}subscriptions`;
const TEAM_QUEUE = `${QUEUE_PREFIX}teams`;
const FAILED_QUEUE = `${QUEUE_PREFIX}failed`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

class AsyncNotificationQueue {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
  }

  /**
   * Add a notification job to the queue
   * @param {string} queueName - Name of the queue
   * @param {object} job - Job data
   * @returns {Promise<boolean>}
   */
  async enqueue(queueName, job) {
    try {
      const jobData = {
        id: `job_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        ...job,
        createdAt: Date.now(),
        retries: 0
      };

      await redis.rPush(queueName, JSON.stringify(jobData));
      logger.info(`📥 Job enqueued to ${queueName}:`, { jobId: jobData.id, type: job.type });
      return true;
    } catch (error) {
      logger.error(`Failed to enqueue job to ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Enqueue a payment notification
   * @param {string} type - Payment event type (payment_success, payment_failed, refund, etc.)
   * @param {object} data - Event data
   */
  async enqueuePaymentNotification(type, data) {
    return this.enqueue(PAYMENT_QUEUE, {
      type: 'payment_notification',
      eventType: type,
      data,
      priority: type === 'payment_failed' ? 'high' : 'normal'
    });
  }

  /**
   * Enqueue a subscription notification
   * @param {string} type - Subscription event type
   * @param {object} data - Event data
   */
  async enqueueSubscriptionNotification(type, data) {
    return this.enqueue(SUBSCRIPTION_QUEUE, {
      type: 'subscription_notification',
      eventType: type,
      data
    });
  }

  /**
   * Enqueue a team notification
   * @param {string} type - Team event type
   * @param {object} data - Event data
   */
  async enqueueTeamNotification(type, data) {
    return this.enqueue(TEAM_QUEUE, {
      type: 'team_notification',
      eventType: type,
      data
    });
  }

  /**
   * Process a single job from a queue
   * @param {string} queueName - Queue to process
   * @returns {Promise<boolean>} - True if a job was processed
   */
  async processOne(queueName) {
    try {
      const jobJson = await redis.lPop(queueName);
      if (!jobJson) return false;

      const job = JSON.parse(jobJson);
      logger.info(`📤 Processing job from ${queueName}:`, { jobId: job.id, type: job.type });

      try {
        await this.executeJob(job);
        logger.info(`✅ Job completed:`, { jobId: job.id });
        return true;
      } catch (error) {
        logger.error(`❌ Job failed:`, { jobId: job.id, error: error.message });
        
        // Retry logic
        if (job.retries < MAX_RETRIES) {
          job.retries++;
          job.lastError = error.message;
          job.lastRetryAt = Date.now();
          
          // Re-queue for retry
          await redis.rPush(queueName, JSON.stringify(job));
          logger.info(`🔄 Job re-queued for retry (${job.retries}/${MAX_RETRIES}):`, { jobId: job.id });
        } else {
          // Move to failed queue
          await redis.rPush(FAILED_QUEUE, JSON.stringify(job));
          logger.error(`❌ Job moved to failed queue after ${MAX_RETRIES} retries:`, { jobId: job.id });
        }
        return true;
      }
    } catch (error) {
      logger.error(`Error processing queue ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Execute a job based on its type
   * @param {object} job - Job to execute
   */
  async executeJob(job) {
    switch (job.type) {
      case 'payment_notification':
        await this.handlePaymentNotification(job);
        break;
      case 'subscription_notification':
        await this.handleSubscriptionNotification(job);
        break;
      case 'team_notification':
        await this.handleTeamNotification(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  /**
   * Handle payment notification jobs
   */
  async handlePaymentNotification(job) {
    const { eventType, data } = job;
    const user = await User.findByPk(data.userId);
    
    if (!user) {
      logger.warn('User not found for payment notification:', data.userId);
      return;
    }

    switch (eventType) {
      case 'payment_success':
        await notificationService.sendPaymentConfirmationNotification(user, {
          tier: data.tier,
          plan: data.plan
        }, data.amount);
        break;
        
      case 'payment_failed':
        await notificationService.sendPaymentFailedNotification(user, {
          reason: data.reason,
          amount: data.amount
        });
        break;
        
      case 'subscription_renewed':
        await notificationService.sendSubscriptionRenewedNotification(user, {
          tier: data.tier,
          nextBillingDate: data.nextBillingDate
        });
        break;
        
      case 'subscription_cancelled':
        await notificationService.sendSubscriptionCancelledNotification(user, {
          tier: data.tier,
          endDate: data.endDate
        });
        break;
        
      case 'refund_processed':
        await notificationService.sendRefundNotification(user, {
          amount: data.amount,
          reason: data.reason
        });
        break;
        
      default:
        logger.info(`No handler for payment event: ${eventType}`);
    }
  }

  /**
   * Handle subscription notification jobs
   */
  async handleSubscriptionNotification(job) {
    const { eventType, data } = job;
    const user = await User.findByPk(data.userId);
    
    if (!user) {
      logger.warn('User not found for subscription notification:', data.userId);
      return;
    }

    switch (eventType) {
      case 'trial_ending':
        await notificationService.sendTrialEndingNotification(user, {
          tier: data.tier
        }, data.daysLeft);
        break;
        
      case 'trial_ended':
        await notificationService.sendTrialEndedNotification(user);
        break;
        
      case 'usage_warning':
        await notificationService.sendQueryLimitWarningNotification(
          user, 
          data.queriesUsed, 
          data.dailyLimit
        );
        break;
        
      default:
        logger.info(`No handler for subscription event: ${eventType}`);
    }
  }

  /**
   * Handle team notification jobs
   */
  async handleTeamNotification(job) {
    const { eventType, data } = job;
    
    switch (eventType) {
      case 'member_invited':
        await notificationService.sendTeamInvitationNotification(
          data.inviter,
          data.invitedEmail,
          data.teamName,
          data.invitationId
        );
        break;
        
      case 'error_shared':
        await notificationService.sendSharedErrorNotification(
          data.sharedBy,
          data.teamId,
          data.errorTitle
        );
        break;
        
      default:
        logger.info(`No handler for team event: ${eventType}`);
    }
  }

  /**
   * Start the queue processor
   * @param {number} intervalMs - Processing interval in milliseconds
   */
  start(intervalMs = 5000) {
    if (this.processingInterval) {
      logger.warn('Queue processor already running');
      return;
    }

    logger.info('🚀 Starting async notification queue processor');
    
    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) return;
      
      this.isProcessing = true;
      try {
        // Process all queues
        await this.processOne(PAYMENT_QUEUE);
        await this.processOne(SUBSCRIPTION_QUEUE);
        await this.processOne(TEAM_QUEUE);
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);
  }

  /**
   * Stop the queue processor
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('🛑 Async notification queue processor stopped');
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    try {
      const [paymentLen, subscriptionLen, teamLen, failedLen] = await Promise.all([
        redis.lLen(PAYMENT_QUEUE),
        redis.lLen(SUBSCRIPTION_QUEUE),
        redis.lLen(TEAM_QUEUE),
        redis.lLen(FAILED_QUEUE)
      ]);

      return {
        queues: {
          payments: paymentLen || 0,
          subscriptions: subscriptionLen || 0,
          teams: teamLen || 0,
          failed: failedLen || 0
        },
        isProcessing: this.isProcessing,
        isRunning: !!this.processingInterval
      };
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      return null;
    }
  }
}

// Singleton instance
const asyncNotificationQueue = new AsyncNotificationQueue();

module.exports = asyncNotificationQueue;
