const axios = require('axios');
const crypto = require('crypto');

class DodoPaymentService {
  constructor() {
    this.apiKey = process.env.DODO_API_KEY;
    this.secretKey = process.env.DODO_SECRET_KEY;
    this.baseURL = process.env.DODO_BASE_URL || 'https://api.dodo.co/v1';
    this.webhookSecret = process.env.DODO_WEBHOOK_SECRET;
    
    if (!this.apiKey || !this.secretKey) {
      console.warn('Dodo payment credentials not configured. Payment functionality will be limited.');
    }
  }

  // Generate signature for API requests
  generateSignature(timestamp, method, path, body = '') {
    const message = timestamp + method.toUpperCase() + path + body;
    return crypto.createHmac('sha256', this.secretKey).update(message).digest('hex');
  }

  // Create payment session for subscription
  async createPaymentSession(subscriptionData) {
    try {
      const { userId, planId, planName, amount, currency = 'USD', successUrl, cancelUrl } = subscriptionData;
      
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = '/payments/sessions';
      const body = JSON.stringify({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        payment_method_types: ['card'],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId.toString(),
        metadata: {
          userId: userId.toString(),
          planId,
          planName
        },
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: `${planName} Subscription`,
              description: `ErrorWise ${planName} Plan`
            },
            unit_amount: Math.round(amount * 100),
            recurring: {
              interval: 'month'
            }
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
        },
        timeout: 10000
      });

      return {
        success: true,
        sessionId: response.data.id,
        sessionUrl: response.data.url,
        data: response.data
      };

    } catch (error) {
      console.error('Dodo payment session creation failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Payment session creation failed',
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
      const { client_reference_id: userId, metadata, subscription: subscriptionId } = session;
      const { planId, planName } = metadata;

      // Update subscription in database
      const Subscription = require('../models/Subscription');
      
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      await Subscription.upsert({
        userId: parseInt(userId),
        tier: planId,
        status: 'active',
        startDate,
        endDate,
        dodoSubscriptionId: subscriptionId,
        dodoSessionId: session.id
      }, {
        where: { userId: parseInt(userId) }
      });

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
  async handlePaymentSuccess(invoice) {
    try {
      const subscriptionId = invoice.subscription;
      
      // Update subscription status if needed
      const Subscription = require('../models/Subscription');
      await Subscription.update(
        { status: 'active' },
        { where: { dodoSubscriptionId: subscriptionId } }
      );

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
      const subscriptionId = subscription.id;
      
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