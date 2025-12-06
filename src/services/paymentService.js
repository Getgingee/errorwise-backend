const axios = require('axios');
const crypto = require('crypto');
const asyncNotificationQueue = require('./asyncNotificationQueue');

class DodoPaymentService {
  constructor() {
    // DodoPayments key configuration:
    // - Secret Key (DODO_SECRET_KEY or DODO_API_KEY with sk_ prefix): For API auth
    // - Public Key (pk_ prefix): Only for client-side, NOT for server API calls
    // - Webhook Secret: For verifying webhook signatures
    
    const potentialSecretKey = process.env.DODO_SECRET_KEY || process.env.DODO_API_KEY;
    const potentialPublicKey = process.env.DODO_PUBLIC_KEY;
    
    // Determine which key to use for API authentication
    // Secret keys start with 'sk_', public keys start with 'pk_'
    if (potentialSecretKey && potentialSecretKey.startsWith('sk_')) {
      this.apiKey = potentialSecretKey;
    } else if (process.env.DODO_SECRET_KEY && process.env.DODO_SECRET_KEY.startsWith('sk_')) {
      this.apiKey = process.env.DODO_SECRET_KEY;
    } else {
      // Fallback: use whatever is set, but warn if it's a public key
      this.apiKey = potentialSecretKey;
    }
    
    this.secretKey = process.env.DODO_SECRET_KEY || process.env.DODO_PAYMENTS_SECRET;
    this.baseURL = process.env.DODO_BASE_URL || process.env.DODO_API_URL || 'https://api.dodopayments.com/v1';
    this.webhookSecret = process.env.DODO_WEBHOOK_SECRET || this.secretKey;

    // Log configuration status (for debugging in Railway logs)
    console.log('💳 DodoPayments Configuration:');
    console.log(`   API Key: ${this.apiKey ? '✅ SET (' + this.apiKey.substring(0, 8) + '...)' : '❌ NOT SET'}`);
    console.log(`   Secret Key: ${this.secretKey ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`   Base URL: ${this.baseURL}`);
    
    // CRITICAL: Warn if using public key for API auth
    if (this.apiKey && this.apiKey.startsWith('pk_')) {
      console.error('⚠️ WARNING: Using PUBLIC key (pk_...) for API authentication!');
      console.error('   DodoPayments API requires SECRET key (sk_...) for server-side calls.');
      console.error('   Please set DODO_SECRET_KEY or DODO_API_KEY with your secret key (starts with sk_).');
    }

    // Only treat as placeholder if it contains obvious placeholder text
    const isPlaceholder = !this.apiKey || 
                          this.apiKey === 'your_actual_dodo_api_key_here' ||
                          this.apiKey === 'placeholder' ||
                          this.apiKey.startsWith('your_');

    if (isPlaceholder) {
      console.warn('⚠️ Dodo payment API key not configured. Payment will use mock mode locally.');
      this.apiKey = null; // Force mock mode
    } else if (this.apiKey && this.apiKey.startsWith('sk_')) {
      console.log('✅ DodoPayments ready for live transactions (using secret key)');
    } else {
      console.log('⚠️ DodoPayments configured but may have wrong key type');
    }
  }  // Generate signature for API requests
  generateSignature(timestamp, method, path, body = '') {
    const message = timestamp + method.toUpperCase() + path + body;
    return crypto.createHmac('sha256', this.secretKey).update(message).digest('hex');
  }

  // Create payment session for subscription (Hosted Checkout)
  async createPaymentSession(subscriptionData) {
    try {
      const {
        userId,
        userEmail,
        planId,
        planName,
        productId,
        amount,
        currency = 'USD',
        successUrl,
        cancelUrl,
        interval,
        trialDays = 0,
        allowedPaymentMethodTypes = ['credit', 'debit', 'upi_collect', 'upi_intent'],
        discountCode = null, // Dodo Payments discount code
        couponRedemptionId = null // Internal tracking
      } = subscriptionData;

      // Development fallback (no credentials)
      if (!this.apiKey) {
        console.log('⚠️  Dodo API key not configured. Using mock payment flow for development.');

        const mockSessionId = `mock_session_${Date.now()}_${userId}`;
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const mockSessionUrl = `${baseUrl}/subscription/mock-payment?sessionId=${mockSessionId}&planId=${planId}&userId=${userId}`;

        return {
          success: true,
          sessionId: mockSessionId,
          sessionUrl: mockSessionUrl,
          data: {
            session_id: mockSessionId,
            checkout_url: mockSessionUrl,
            mode: 'mock',
            metadata: { userId, planId, planName, discountCode }
          }
        };
      }

      // Build Checkout Session payload as per latest Dodo docs
      // IMPORTANT: DODO API rejects null values - only include defined fields
      const metadata = {
        userId: String(userId),
        planId: String(planId),
        planName: String(planName)
      };
      
      // Only add couponRedemptionId if it exists (DODO rejects null)
      if (couponRedemptionId) {
        metadata.couponRedemptionId = String(couponRedemptionId);
      }
      
      const payload = {
        product_cart: [
          {
            product_id: productId,
            quantity: 1
          }
        ],
        allowed_payment_method_types: allowedPaymentMethodTypes,
        billing_currency: currency,
        customer: {
          email: userEmail
        },
        return_url: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
        metadata
      };
      
      // Only add subscription_data if there's a trial period
      if (trialDays > 0) {
        payload.subscription_data = {
          trial_period_days: trialDays
        };
      }
      
      // Only add discount code if provided
      if (discountCode) {
        payload.discount_code = discountCode;
        payload.feature_flags = {
          allow_discount_code: true
        };
      }

      console.log('💳 Dodo API Request:', {
        url: `${this.baseURL}/checkouts`,
        productId,
        userEmail: userEmail?.substring(0, 5) + '***',
        hasApiKey: !!this.apiKey,
        apiKeyPrefix: this.apiKey?.substring(0, 8)
      });

      const response = await axios.post(`${this.baseURL}/checkouts`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 15000
      });

      const sessionId = response?.data?.session_id || response?.data?.id;
      const checkoutUrl = response?.data?.checkout_url || response?.data?.url;

      return {
        success: true,
        sessionId,
        sessionUrl: checkoutUrl,
        data: response.data
      };

    } catch (error) {
      console.error('Dodo checkout session creation failed:', error.response?.data || error.message);
      console.error('Full error details:', {
        status: error.response?.status,
        data: error.response?.data,
        headers: error.response?.headers,
        requestURL: `${this.baseURL}/checkouts`
      });
      return {
        success: false,
        error: error.response?.data?.message || 'Checkout session creation failed',
        code: error.response?.status
      };
    }
  }

  // ============================================================================
  // TRIAL CHECKOUT - Creates checkout with $0 initial charge + card capture
  // ============================================================================
  async createTrialCheckout({
    userId,
    userEmail,
    planId,
    planName,
    productId,
    price,
    trialDays = 7,
    successUrl,
    cancelUrl
  }) {
    try {
      // Development fallback (no credentials)
      if (!this.apiKey) {
        console.log('⚠️  Dodo API key not configured. Using mock trial flow.');

        const mockSessionId = `mock_trial_${Date.now()}_${userId}`;
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const mockSessionUrl = `${baseUrl}/subscription/mock-trial?sessionId=${mockSessionId}&planId=${planId}&userId=${userId}`;

        return {
          success: true,
          sessionId: mockSessionId,
          sessionUrl: mockSessionUrl,
          mode: 'mock',
          isTrial: true
        };
      }

      // Build trial checkout payload
      // Key difference: subscription_data with trial_period_days
      const payload = {
        product_cart: [
          {
            product_id: productId,
            quantity: 1
          }
        ],
        allowed_payment_method_types: ['credit', 'debit', 'upi_collect', 'upi_intent'],
        billing_currency: 'USD',
        customer: {
          email: userEmail
        },
        return_url: successUrl,
        // CRITICAL: This tells Dodo to create a subscription with trial
        subscription_data: {
          trial_period_days: trialDays
        },
        metadata: {
          userId: String(userId),
          planId: String(planId),
          planName: String(planName),
          isTrial: 'true',
          trialDays: String(trialDays),
          chargeAfterTrial: String(price)
        }
      };

      console.log('🎁 Creating trial checkout:', {
        userId: userId?.substring?.(0, 8) || userId,
        planId,
        productId: productId?.substring?.(0, 15),
        trialDays
      });

      const response = await axios.post(`${this.baseURL}/checkouts`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 15000
      });

      const sessionId = response?.data?.session_id || response?.data?.id;
      const checkoutUrl = response?.data?.checkout_url || response?.data?.url;

      console.log('✅ Trial checkout created:', sessionId);

      return {
        success: true,
        sessionId,
        sessionUrl: checkoutUrl,
        isTrial: true,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Trial checkout creation failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Trial checkout creation failed',
        code: error.response?.status
      };
    }
  }

  // Get checkout session status (for verifying trial completion)
  async getCheckoutStatus(sessionId) {
    try {
      if (!this.apiKey) {
        // Mock mode - assume completed for mock sessions
        if (sessionId?.startsWith('mock_')) {
          return {
            completed: true,
            status: 'completed',
            subscriptionId: `mock_sub_${Date.now()}`,
            customerId: `mock_cust_${Date.now()}`
          };
        }
        return { completed: false, status: 'unknown' };
      }

      const response = await axios.get(`${this.baseURL}/checkouts/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 10000
      });

      const status = response?.data?.status;
      const completed = ['completed', 'paid', 'active'].includes(status?.toLowerCase());

      return {
        completed,
        status,
        subscriptionId: response?.data?.subscription_id || response?.data?.subscription?.id,
        customerId: response?.data?.customer_id || response?.data?.customer?.id,
        data: response.data
      };

    } catch (error) {
      console.error('Failed to get checkout status:', error.response?.data || error.message);
      return {
        completed: false,
        status: 'error',
        error: error.message
      };
    }
  }

  // Cancel subscription with Dodo
  async cancelSubscription(subscriptionId) {
    try {
      if (!this.apiKey) {
        console.log('⚠️ Mock mode: Would cancel subscription', subscriptionId);
        return { success: true, mock: true };
      }

      const response = await axios.post(
        `${this.baseURL}/subscriptions/${subscriptionId}/cancel`,
        { cancel_at_period_end: false }, // Immediate cancellation for trials
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 10000
        }
      );

      console.log('✅ Subscription cancelled with Dodo:', subscriptionId);
      return { success: true, data: response.data };

    } catch (error) {
      console.error('Failed to cancel subscription:', error.response?.data || error.message);
      throw error;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');
      
      const providedSignature = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  // Process webhook event
  async processWebhookEvent(event) {
    try {
      const { type, data } = event;

      console.log(`Processing webhook event: ${type}`);

      switch (type) {
        // ============================================================
        // PAYMENT EVENTS
        // ============================================================
        case 'payment.succeeded':
          return await this.handlePaymentSuccess(data);
        case 'payment.failed':
          return await this.handlePaymentFailed(data);
        case 'payment.processing':
          return await this.handlePaymentProcessing(data);
        case 'payment.cancelled':
          return await this.handlePaymentCancelled(data);

        // ============================================================
        // SUBSCRIPTION EVENTS
        // ============================================================
        case 'subscription.active':
          return await this.handleSubscriptionActive(data);
        case 'subscription.on_hold':
          return await this.handleSubscriptionOnHold(data);
        case 'subscription.renewed':
          return await this.handleSubscriptionRenewed(data);
        case 'subscription.plan_changed':
          return await this.handleSubscriptionPlanChanged(data);
        case 'subscription.cancelled':
          return await this.handleSubscriptionCancelled(data);
        case 'subscription.failed':
          return await this.handleSubscriptionFailed(data);
        case 'subscription.expired':
          return await this.handleSubscriptionExpired(data);

        // ============================================================
        // REFUND EVENTS
        // ============================================================
        case 'refund.succeeded':
          return await this.handleRefundSucceeded(data);
        case 'refund.failed':
          return await this.handleRefundFailed(data);

        // ============================================================
        // DISPUTE EVENTS
        // ============================================================
        case 'dispute.opened':
          return await this.handleDisputeOpened(data);
        case 'dispute.expired':
          return await this.handleDisputeExpired(data);
        case 'dispute.accepted':
          return await this.handleDisputeAccepted(data);
        case 'dispute.cancelled':
          return await this.handleDisputeCancelled(data);
        case 'dispute.challenged':
          return await this.handleDisputeChallenged(data);
        case 'dispute.won':
          return await this.handleDisputeWon(data);
        case 'dispute.lost':
          return await this.handleDisputeLost(data);

        // ============================================================
        // LICENSE KEY EVENTS
        // ============================================================
        case 'license_key.created':
          return await this.handleLicenseKeyCreated(data);

        // ============================================================
        // BACKWARDS COMPATIBILITY (Stripe-like events)
        // ============================================================
        case 'checkout.session.completed':
          return await this.handleSubscriptionSuccess(data.object);
        case 'invoice.payment_succeeded':
          return await this.handlePaymentSuccess(data.object);
        case 'invoice.payment_failed':
          return await this.handlePaymentFailed(data.object);
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionCancelled(data.object);

        default:
          console.log(`Unhandled webhook event type: ${type}`);
          return { success: true, message: 'Event ignored' };
      }

    } catch (error) {
      console.error('Webhook event processing failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Handle successful subscription payment
  async handleSubscriptionSuccess(session) {
    try {
      const { client_reference_id: userId, metadata, subscription: subscriptionId } = session || {};
      const { planId, planName } = metadata || {};

      // Update subscription in database
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      await Subscription.upsert({
        userId: parseInt(userId),
        tier: planId || 'pro',
        status: 'active',
        startDate,
        endDate,
        dodoSubscriptionId: subscriptionId,
        dodoSessionId: session?.id
      }, {
        where: { userId: parseInt(userId) }
      });

      // Also update User record so UI reflects active subscription
      if (userId) {
        await User.update({
          subscriptionTier: planId || 'pro',
          subscriptionStatus: 'active',
          subscriptionStartDate: startDate,
          subscriptionEndDate: endDate
        }, { where: { id: userId } });
      }

      console.log(`Subscription activated for user ${userId}, plan: ${planName}`);
      
      return {
        success: true,
        message: 'Subscription activated successfully'
      };

    } catch (error) {
      console.error('Subscription success handling failed:', error);
      throw error;
    }
  }

  // Handle payment success
  async handlePaymentSuccess(invoiceOrPayload) {
    try {
      const subscriptionId = invoiceOrPayload?.subscription || invoiceOrPayload?.subscription_id;
      const paymentId = invoiceOrPayload?.payment_id || invoiceOrPayload?.id;

      const Subscription = require('../models/Subscription');
      const User = require('../models/User');

      // Check if this is a trial conversion (first payment after trial ends)
      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      
      if (subRecord?.trialStatus === 'active') {
        // ============================================================
        // TRIAL CONVERSION - First payment after trial period
        // ============================================================
        console.log('💰 [Webhook] Trial conversion payment, routing to trial controller');
        const trialController = require('../controllers/trialController');
        return await trialController.convertTrialFromWebhook({
          subscription_id: subscriptionId,
          payment_id: paymentId
        });
      }

      // ============================================================
      // REGULAR PAYMENT SUCCESS
      // ============================================================
      await Subscription.update(
        { status: 'active', lastPaymentDate: new Date() },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'active', subscriptionTier: subRecord.tier },
          { where: { id: subRecord.userId } }
        );
        
        // ===== ASYNC NOTIFICATION (Decoupled) =====
        // Queue payment confirmation email - doesn't block webhook response
        asyncNotificationQueue.enqueuePaymentNotification('payment_success', {
          userId: subRecord.userId,
          tier: subRecord.tier,
          plan: subRecord.tier,
          amount: invoiceOrPayload?.amount || invoiceOrPayload?.total,
          subscriptionId
        });
      }

      console.log(`✅ Payment successful for subscription: ${subscriptionId}`);
      
      return {
        success: true,
        message: 'Payment processed successfully'
      };

    } catch (error) {
      console.error('Payment success handling failed:', error);
      throw error;
    }
  }

  // Handle payment failure
  async handlePaymentFailed(invoice) {
    try {
      const subscriptionId = invoice.subscription;
      
      // Update subscription status
      const Subscription = require('../models/Subscription');
      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      
      await Subscription.update(
        { status: 'past_due' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      // ===== ASYNC NOTIFICATION (Decoupled) =====
      // Queue payment failed email - doesn't block webhook response
      if (subRecord?.userId) {
        asyncNotificationQueue.enqueuePaymentNotification('payment_failed', {
          userId: subRecord.userId,
          reason: invoice.failure_message || invoice.last_payment_error?.message || 'Payment declined',
          amount: invoice.amount_due || invoice.total,
          subscriptionId
        });
      }

      console.log(`Payment failed for subscription: ${subscriptionId}`);
      
      return {
        success: true,
        message: 'Payment failure handled'
      };

    } catch (error) {
      console.error('Payment failure handling failed:', error);
      throw error;
    }
  }

  // Handle subscription cancellation
  async handleSubscriptionCancelled(subscription) {
    try {
      const subscriptionId = subscription.id || subscription.subscription_id;
      const cancelAtPeriodEnd = subscription.cancel_at_period_end !== undefined ? subscription.cancel_at_period_end : true;
      
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      await Subscription.update(
        { 
          status: 'cancelled',
          cancelAtPeriodEnd
        },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      // Update user record
      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'cancelled' },
          { where: { id: subRecord.userId } }
        );
        
        // ===== ASYNC NOTIFICATION (Decoupled) =====
        // Queue cancellation email - doesn't block webhook response
        asyncNotificationQueue.enqueuePaymentNotification('subscription_cancelled', {
          userId: subRecord.userId,
          tier: subRecord.tier,
          endDate: subRecord.endDate,
          subscriptionId
        });
      }

      console.log(`✅ Subscription cancelled: ${subscriptionId} (cancel at period end: ${cancelAtPeriodEnd})`);
      return { success: true, message: 'Subscription cancellation handled' };

    } catch (error) {
      console.error('Subscription cancellation handling failed:', error);
      throw error;
    }
  }

  // ============================================================
  // COMPREHENSIVE WEBHOOK HANDLERS
  // ============================================================

  // Payment Event Handlers
  async handlePaymentProcessing(data) {
    try {
      console.log('Payment processing:', data);
      // You can track payment status in a separate table if needed
      return { success: true, message: 'Payment processing acknowledged' };
    } catch (error) {
      console.error('Payment processing handler failed:', error);
      throw error;
    }
  }

  async handlePaymentCancelled(data) {
    try {
      const paymentId = data?.id;
      console.log(`Payment cancelled: ${paymentId}`);
      // Update any pending payment records
      return { success: true, message: 'Payment cancellation handled' };
    } catch (error) {
      console.error('Payment cancellation handler failed:', error);
      throw error;
    }
  }

  // Subscription Event Handlers
  async handleSubscriptionActive(data) {
    try {
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      const userId = data?.metadata?.userId;
      const planId = data?.metadata?.planId;
      const subscriptionId = data?.id || data?.subscription_id;
      const isTrial = data?.metadata?.isTrial === 'true';
      const sessionId = data?.session_id || data?.metadata?.session_id;

      // ============================================================
      // TRIAL ACTIVATION - Route to trial controller
      // ============================================================
      if (isTrial) {
        console.log('🎁 [Webhook] Trial subscription activated, routing to trial controller');
        const trialController = require('../controllers/trialController');
        return await trialController.activateTrialFromWebhook({
          session_id: sessionId,
          subscription_id: subscriptionId,
          customer_id: data?.customer_id || data?.customer?.id,
          metadata: data?.metadata
        });
      }

      // ============================================================
      // REGULAR SUBSCRIPTION ACTIVATION
      // ============================================================
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      // Extract payment method from webhook data
      const paymentMethod = data?.payment_method?.type || data?.payment_method || 'card';
      const cancelAtPeriodEnd = data?.cancel_at_period_end || false;

      if (userId) {
        await Subscription.upsert({
          userId: parseInt(userId),
          tier: planId || 'pro',
          status: 'active',
          startDate,
          endDate,
          dodoSubscriptionId: subscriptionId,
          paymentMethod,
          cancelAtPeriodEnd,
          lastPaymentDate: startDate
        }, { where: { userId: parseInt(userId) } });

        await User.update(
          { 
            subscriptionStatus: 'active', 
            subscriptionTier: planId || 'pro',
            subscriptionStartDate: startDate,
            subscriptionEndDate: endDate
          },
          { where: { id: parseInt(userId) } }
        );
      }

      console.log(`✅ Subscription activated for user ${userId}`);
      return { success: true, message: 'Subscription activated' };
    } catch (error) {
      console.error('Subscription active handler failed:', error);
      throw error;
    }
  }

  async handleSubscriptionOnHold(data) {
    try {
      const subscriptionId = data?.id || data?.subscription_id;
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      await Subscription.update(
        { status: 'on_hold' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'on_hold' },
          { where: { id: subRecord.userId } }
        );
      }

      console.log(`⚠️ Subscription on hold: ${subscriptionId}`);
      return { success: true, message: 'Subscription placed on hold' };
    } catch (error) {
      console.error('Subscription on hold handler failed:', error);
      throw error;
    }
  }

  async handleSubscriptionRenewed(data) {
    try {
      const subscriptionId = data?.id || data?.subscription_id;
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      await Subscription.update(
        { status: 'active', endDate },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'active', subscriptionEndDate: endDate },
          { where: { id: subRecord.userId } }
        );
        
        // ===== ASYNC NOTIFICATION (Decoupled) =====
        // Queue renewal email - doesn't block webhook response
        asyncNotificationQueue.enqueuePaymentNotification('subscription_renewed', {
          userId: subRecord.userId,
          tier: subRecord.tier,
          nextBillingDate: endDate,
          subscriptionId
        });
      }

      console.log(`✅ Subscription renewed: ${subscriptionId}`);
      return { success: true, message: 'Subscription renewed successfully' };
    } catch (error) {
      console.error('Subscription renewed handler failed:', error);
      throw error;
    }
  }

  async handleSubscriptionPlanChanged(data) {
    try {
      const subscriptionId = data?.id || data?.subscription_id;
      const newPlanId = data?.metadata?.planId;
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      await Subscription.update(
        { tier: newPlanId },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionTier: newPlanId },
          { where: { id: subRecord.userId } }
        );
      }

      console.log(`✅ Subscription plan changed: ${subscriptionId} -> ${newPlanId}`);
      return { success: true, message: 'Subscription plan updated' };
    } catch (error) {
      console.error('Subscription plan changed handler failed:', error);
      throw error;
    }
  }

  async handleSubscriptionFailed(data) {
    try {
      const subscriptionId = data?.id || data?.subscription_id;
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      await Subscription.update(
        { status: 'failed' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'failed' },
          { where: { id: subRecord.userId } }
        );
      }

      console.log(`❌ Subscription failed: ${subscriptionId}`);
      return { success: true, message: 'Subscription failure handled' };
    } catch (error) {
      console.error('Subscription failed handler failed:', error);
      throw error;
    }
  }

  async handleSubscriptionExpired(data) {
    try {
      const subscriptionId = data?.id || data?.subscription_id;
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');
      
      await Subscription.update(
        { status: 'expired' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'expired', subscriptionTier: 'free' },
          { where: { id: subRecord.userId } }
        );
      }

      console.log(`⏰ Subscription expired: ${subscriptionId}`);
      return { success: true, message: 'Subscription expiration handled' };
    } catch (error) {
      console.error('Subscription expired handler failed:', error);
      throw error;
    }
  }

  // Refund Event Handlers
  async handleRefundSucceeded(data) {
    try {
      const refundId = data?.id;
      const paymentId = data?.payment_id;
      const userId = data?.metadata?.userId || data?.customer_id;
      
      console.log(`✅ Refund succeeded: ${refundId} for payment ${paymentId}`);
      
      // ===== ASYNC NOTIFICATION (Decoupled) =====
      // Queue refund email - doesn't block webhook response
      if (userId) {
        asyncNotificationQueue.enqueuePaymentNotification('refund_processed', {
          userId,
          amount: data?.amount || data?.refund_amount,
          reason: data?.reason || 'Refund processed',
          refundId,
          paymentId
        });
      }
      
      return { success: true, message: 'Refund processed successfully' };
    } catch (error) {
      console.error('Refund succeeded handler failed:', error);
      throw error;
    }
  }

  async handleRefundFailed(data) {
    try {
      const refundId = data?.id;
      console.log(`❌ Refund failed: ${refundId}`);
      return { success: true, message: 'Refund failure acknowledged' };
    } catch (error) {
      console.error('Refund failed handler failed:', error);
      throw error;
    }
  }

  // Dispute Event Handlers
  async handleDisputeOpened(data) {
    try {
      const disputeId = data?.id;
      const paymentId = data?.payment_id;
      console.log(`⚠️ Dispute opened: ${disputeId} for payment ${paymentId}`);
      
      // You can send email notifications to admin here
      // Track disputes in a separate table if needed
      return { success: true, message: 'Dispute opened notification received' };
    } catch (error) {
      console.error('Dispute opened handler failed:', error);
      throw error;
    }
  }

  async handleDisputeExpired(data) {
    try {
      const disputeId = data?.id;
      console.log(`⏰ Dispute expired: ${disputeId}`);
      return { success: true, message: 'Dispute expiration handled' };
    } catch (error) {
      console.error('Dispute expired handler failed:', error);
      throw error;
    }
  }

  async handleDisputeAccepted(data) {
    try {
      const disputeId = data?.id;
      console.log(`✅ Dispute accepted: ${disputeId}`);
      return { success: true, message: 'Dispute acceptance handled' };
    } catch (error) {
      console.error('Dispute accepted handler failed:', error);
      throw error;
    }
  }

  async handleDisputeCancelled(data) {
    try {
      const disputeId = data?.id;
      console.log(`🚫 Dispute cancelled: ${disputeId}`);
      return { success: true, message: 'Dispute cancellation handled' };
    } catch (error) {
      console.error('Dispute cancelled handler failed:', error);
      throw error;
    }
  }

  async handleDisputeChallenged(data) {
    try {
      const disputeId = data?.id;
      console.log(`⚔️ Dispute challenged: ${disputeId}`);
      return { success: true, message: 'Dispute challenge acknowledged' };
    } catch (error) {
      console.error('Dispute challenged handler failed:', error);
      throw error;
    }
  }

  async handleDisputeWon(data) {
    try {
      const disputeId = data?.id;
      console.log(`🎉 Dispute won: ${disputeId}`);
      return { success: true, message: 'Dispute victory handled' };
    } catch (error) {
      console.error('Dispute won handler failed:', error);
      throw error;
    }
  }

  async handleDisputeLost(data) {
    try {
      const disputeId = data?.id;
      const paymentId = data?.payment_id;
      console.log(`😞 Dispute lost: ${disputeId} for payment ${paymentId}`);
      
      // Handle refund if needed
      return { success: true, message: 'Dispute loss handled' };
    } catch (error) {
      console.error('Dispute lost handler failed:', error);
      throw error;
    }
  }

  // License Key Event Handler
  async handleLicenseKeyCreated(data) {
    try {
      const licenseKey = data?.key;
      const productId = data?.product_id;
      console.log(`🔑 License key created: ${licenseKey} for product ${productId}`);
      
      // You can store license keys in a table if you use this feature
      return { success: true, message: 'License key creation handled' };
    } catch (error) {
      console.error('License key created handler failed:', error);
      throw error;
    }
  }

  // ============================================================
  // LEGACY HANDLERS (kept for backwards compatibility)
  // ============================================================

  async handleDodoSubscriptionActive(payload) {
    // Redirect to new handler
    return await this.handleSubscriptionActive(payload);
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = `/subscriptions/${subscriptionId}`;
      const signature = this.generateSignature(timestamp, 'DELETE', path);

      const response = await axios.delete(`${this.baseURL}${path}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Dodo-Timestamp': timestamp,
          'Dodo-Signature': signature
        }
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Subscription cancellation failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Cancellation failed'
      };
    }
  }

  // Get subscription details
  async getSubscription(subscriptionId) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = `/subscriptions/${subscriptionId}`;
      const signature = this.generateSignature(timestamp, 'GET', path);

      const response = await axios.get(`${this.baseURL}${path}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Dodo-Timestamp': timestamp,
          'Dodo-Signature': signature
        }
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Get subscription failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch subscription'
      };
    }
  }

  // Create one-time payment (for upgrades or additional credits)
  async createOneTimePayment(paymentData) {
    try {
      const { userId, amount, currency = 'USD', description, successUrl, cancelUrl } = paymentData;
      
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = '/payments/sessions';
      const body = JSON.stringify({
        amount: Math.round(amount * 100),
        currency,
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId.toString(),
        metadata: {
          userId: userId.toString(),
          type: 'one_time_payment'
        },
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: description || 'ErrorWise Payment',
              description: description || 'One-time payment'
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }]
      });

      const signature = this.generateSignature(timestamp, 'POST', path, body);

      const response = await axios.post(`${this.baseURL}${path}`, JSON.parse(body), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Dodo-Timestamp': timestamp,
          'Dodo-Signature': signature
        }
      });

      return {
        success: true,
        sessionId: response.data.id,
        sessionUrl: response.data.url,
        data: response.data
      };

    } catch (error) {
      console.error('One-time payment creation failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Payment creation failed'
      };
    }
  }

  // Get subscription details from DodoPayments
  async getSubscriptionDetails(subscriptionId) {
    try {
      if (!this.apiKey) {
        console.warn('Dodo API key not configured');
        return null;
      }

      const timestamp = Date.now().toString();
      const path = `/subscriptions/${subscriptionId}`;
      const signature = this.generateSignature(timestamp, 'GET', path);

      const response = await axios.get(`${this.baseURL}${path}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Dodo-Timestamp': timestamp,
          'Dodo-Signature': signature
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to fetch subscription from DodoPayments:', error.response?.data || error.message);
      return null;
    }
  }

  // Get customer details from DodoPayments
  async getCustomerDetails(customerId) {
    try {
      if (!this.apiKey) {
        console.warn('Dodo API key not configured');
        return null;
      }

      const timestamp = Date.now().toString();
      const path = `/customers/${customerId}`;
      const signature = this.generateSignature(timestamp, 'GET', path);

      const response = await axios.get(`${this.baseURL}${path}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Dodo-Timestamp': timestamp,
          'Dodo-Signature': signature
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to fetch customer from DodoPayments:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = new DodoPaymentService();