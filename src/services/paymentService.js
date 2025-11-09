const axios = require('axios');
const crypto = require('crypto');

class DodoPaymentService {
  constructor() {
    this.apiKey = process.env.DODO_API_KEY;
    this.secretKey = process.env.DODO_SECRET_KEY;
    this.baseURL = process.env.DODO_BASE_URL || process.env.DODO_API_URL || 'https://api.dodopayments.com/v1';
    this.webhookSecret = process.env.DODO_WEBHOOK_SECRET;
    
    if (!this.apiKey) {
      console.warn('Dodo payment API key not configured. Payment functionality will be limited.');
    }
  }

  // Generate signature for API requests
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
        allowedPaymentMethodTypes = ['credit', 'debit', 'upi_collect', 'upi_intent']
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
            metadata: { userId, planId, planName }
          }
        };
      }

      // Build Checkout Session payload as per latest Dodo docs
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
        subscription_data: {
          trial_period_days: trialDays
        },
        return_url: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
        metadata: {
          userId: String(userId),
          planId,
          planName
        }
      };

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
      return {
        success: false,
        error: error.response?.data?.message || 'Checkout session creation failed',
        code: error.response?.status
      };
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

      switch (type) {
        // Dodo Payments events
        case 'subscription.active':
          return await this.handleDodoSubscriptionActive(data);
        case 'subscription.renewed':
          return await this.handlePaymentSuccess(data);
        case 'subscription.cancelled':
          return await this.handleSubscriptionCancelled(data);
        case 'subscription.failed':
          return await this.handlePaymentFailed(data);
        case 'subscription.expired':
          return await this.handleSubscriptionCancelled(data);
        case 'payment.succeeded':
          return await this.handlePaymentSuccess(data);
        case 'payment.failed':
          return await this.handlePaymentFailed(data);

        // Backwards compatibility with Stripe-like events (if configured)
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

      // Update subscription status if needed
      const Subscription = require('../models/Subscription');
      const User = require('../models/User');

      await Subscription.update(
        { status: 'active' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      // If possible, update the user status too (lookup by subscription)
      const subRecord = await Subscription.findOne({ where: { dodoSubscriptionId: subscriptionId } });
      if (subRecord?.userId) {
        await User.update(
          { subscriptionStatus: 'active', subscriptionTier: subRecord.tier },
          { where: { id: subRecord.userId } }
        );
      }

      console.log(`Payment successful for subscription: ${subscriptionId}`);
      
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
      await Subscription.update(
        { status: 'past_due' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

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
      
      // Update subscription status
      const Subscription = require('../models/Subscription');
      await Subscription.update(
        { status: 'cancelled' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

      console.log(`Subscription cancelled: ${subscriptionId}`);
      
      return {
        success: true,
        message: 'Subscription cancellation handled'
      };

    } catch (error) {
      console.error('Subscription cancellation handling failed:', error);
      throw error;
    }
  }

  // Handle Dodo subscription.active event
  async handleDodoSubscriptionActive(payload) {
    try {
      const Subscription = require('../models/Subscription');
      const userId = payload?.metadata?.userId;
      const planId = payload?.metadata?.planId;
      const subscriptionId = payload?.id || payload?.subscription_id;

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      if (userId) {
        await Subscription.upsert({
          userId: parseInt(userId),
          tier: planId || 'pro',
          status: 'active',
          startDate,
          endDate,
          dodoSubscriptionId: subscriptionId
        }, {
          where: { userId: parseInt(userId) }
        });
      }

      return { success: true, message: 'Dodo subscription activated' };
    } catch (error) {
      console.error('Dodo subscription.active handling failed:', error);
      throw error;
    }
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
}

module.exports = new DodoPaymentService();