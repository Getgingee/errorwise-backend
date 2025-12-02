/**
 * Upgrade Controller (C4)
 * 
 * Handles Pro upgrade flow with DodoPayments integration.
 * Tracks upgrade events for analytics.
 * 
 * @ticket C4 – Implement minimal Pro upgrade flow
 * @epic EPIC C — Plans Limits & Upgrade Path (MVP)
 */

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const eventTracking = require('../services/eventTrackingService');

// DodoPayments configuration
const DODO_PAYMENTS_CONFIG = {
  // Product checkout URLs (replace with actual DodoPayments links)
  productUrls: {
    pro_monthly: process.env.DODO_PRO_MONTHLY_URL || 'https://pay.dodopayments.com/checkout/pro-monthly',
    pro_yearly: process.env.DODO_PRO_YEARLY_URL || 'https://pay.dodopayments.com/checkout/pro-yearly',
    team_monthly: process.env.DODO_TEAM_MONTHLY_URL || 'https://pay.dodopayments.com/checkout/team-monthly',
    team_yearly: process.env.DODO_TEAM_YEARLY_URL || 'https://pay.dodopayments.com/checkout/team-yearly'
  },
  // Pricing
  pricing: {
    pro: { monthly: 3, yearly: 30 },
    team: { monthly: 8, yearly: 80 }
  }
};

/**
 * Get upgrade options and checkout URLs
 * GET /api/upgrade/options
 * 
 * Returns available upgrade options. Frontend should use the checkout API
 * (/api/subscriptions/checkout or /api/upgrade/checkout-url) to get actual
 * checkout URLs dynamically.
 */
async function getUpgradeOptions(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentTier = user.subscriptionTier || 'free';
    
    // Get plan configs from subscription controller
    const { SUBSCRIPTION_TIERS } = require('./subscriptionController');
    
    // Build available upgrade options
    const options = [];
    
    if (currentTier === 'free') {
      const proPlan = SUBSCRIPTION_TIERS.pro;
      options.push({
        tier: 'pro',
        name: proPlan.name,
        description: proPlan.description,
        pricing: {
          monthly: { amount: proPlan.price, label: `$${proPlan.price}/month` },
          yearly: { amount: proPlan.price * 10, label: `$${proPlan.price * 10}/year (save 17%)` }
        },
        features: proPlan.displayFeatures.filter(f => f.available).slice(0, 5).map(f => f.text),
        // Tell frontend to use the checkout API instead of static URLs
        useCheckoutApi: true,
        checkoutEndpoint: '/api/subscriptions/checkout'
      });
      
      const teamPlan = SUBSCRIPTION_TIERS.team;
      options.push({
        tier: 'team',
        name: teamPlan.name,
        description: teamPlan.description,
        pricing: {
          monthly: { amount: teamPlan.price, label: `$${teamPlan.price}/month` },
          yearly: { amount: teamPlan.price * 10, label: `$${teamPlan.price * 10}/year (save 17%)` }
        },
        features: teamPlan.displayFeatures.filter(f => f.available).slice(0, 5).map(f => f.text),
        useCheckoutApi: true,
        checkoutEndpoint: '/api/subscriptions/checkout'
      });
    } else if (currentTier === 'pro') {
      const teamPlan = SUBSCRIPTION_TIERS.team;
      options.push({
        tier: 'team',
        name: teamPlan.name,
        description: 'Upgrade for team features',
        pricing: {
          monthly: { amount: teamPlan.price, label: `$${teamPlan.price}/month` },
          yearly: { amount: teamPlan.price * 10, label: `$${teamPlan.price * 10}/year (save 17%)` }
        },
        features: teamPlan.displayFeatures.filter(f => f.available).slice(0, 5).map(f => f.text),
        useCheckoutApi: true,
        checkoutEndpoint: '/api/subscriptions/checkout'
      });
    }
    
    res.json({
      success: true,
      currentTier,
      options,
      user: {
        email: user.email,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('Error fetching upgrade options:', error);
    res.status(500).json({ error: 'Failed to fetch upgrade options' });
  }
}

/**
 * Track upgrade click event
 * POST /api/upgrade/click
 */
async function trackUpgradeClick(req, res) {
  try {
    const userId = req.user.id;
    const { source, targetTier, billingCycle } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Track the event
    await eventTracking.trackUpgradeClicked(userId, {
      source: source || 'unknown', // 'header', 'limit_banner', 'pricing_page', 'dashboard'
      currentTier: user.subscriptionTier || 'free',
      targetTier: targetTier || 'pro',
      billingCycle: billingCycle || 'monthly'
    }, {
      subscriptionTier: user.subscriptionTier || 'free',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });
    
    res.json({
      success: true,
      message: 'Upgrade click tracked'
    });
    
  } catch (error) {
    console.error('Error tracking upgrade click:', error);
    res.status(500).json({ error: 'Failed to track upgrade click' });
  }
}

/**
 * Get checkout URL for specific plan
 * GET /api/upgrade/checkout-url
 * 
 * Uses the dynamic payment service to create DodoPayments checkout sessions
 * instead of hardcoded URLs.
 */
async function getCheckoutUrl(req, res) {
  try {
    const userId = req.user.id;
    const { tier, billingCycle } = req.query;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate tier
    if (!['pro', 'team'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be pro or team.' });
    }
    
    // Validate billing cycle
    const cycle = billingCycle || 'monthly';
    if (!['monthly', 'yearly'].includes(cycle)) {
      return res.status(400).json({ error: 'Invalid billing cycle. Must be monthly or yearly.' });
    }

    // Get plan config from subscription controller
    const { SUBSCRIPTION_TIERS } = require('./subscriptionController');
    const plan = SUBSCRIPTION_TIERS[tier];
    
    if (!plan || !plan.dodo_plan_id) {
      return res.status(400).json({ error: 'Plan not found or not configured for payment' });
    }

    // Track the click
    await eventTracking.trackUpgradeClicked(userId, {
      source: 'checkout_url',
      currentTier: user.subscriptionTier || 'free',
      targetTier: tier,
      billingCycle: cycle
    }, {
      subscriptionTier: user.subscriptionTier || 'free',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });

    // Use the payment service to create a dynamic checkout session
    const paymentService = require('../services/paymentService');
    
    try {
      const paymentSession = await paymentService.createPaymentSession({
        userId: user.id,
        userEmail: user.email,
        planId: tier,
        planName: plan.name,
        productId: plan.dodo_plan_id,
        amount: plan.price,
        currency: 'USD',
        interval: plan.interval,
        trialDays: user.hasUsedTrial ? 0 : (plan.trialDays || 0),
        allowedPaymentMethodTypes: ['credit', 'debit', 'upi_collect', 'upi_intent'],
        successUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription?payment=cancelled`
      });

      if (paymentSession.success) {
        return res.json({
          success: true,
          checkoutUrl: paymentSession.sessionUrl,
          sessionId: paymentSession.sessionId,
          tier,
          billingCycle: cycle,
          price: DODO_PAYMENTS_CONFIG.pricing[tier][cycle]
        });
      } else {
        throw new Error('Failed to create payment session');
      }
    } catch (paymentError) {
      console.error('Payment session creation failed:', paymentError.message);
      return res.status(500).json({ 
        error: 'Payment service unavailable. Please try again later.',
        details: paymentError.message
      });
    }
    
  } catch (error) {
    console.error('Error getting checkout URL:', error);
    res.status(500).json({ error: 'Failed to get checkout URL' });
  }
}

/**
 * Manual upgrade completion (for admin use until webhook is set up)
 * POST /api/upgrade/complete-manual
 * 
 * This is a temporary endpoint for manually marking upgrades as complete
 * until the DodoPayments webhook integration is done.
 */
async function completeUpgradeManual(req, res) {
  try {
    const { userId, newTier, transactionId, amount } = req.body;
    
    // Validate admin permission
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const previousTier = user.subscriptionTier || 'free';
    
    // Update user subscription
    await user.update({
      subscriptionTier: newTier,
      subscriptionStatus: 'active',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    
    // Create/update subscription record
    const [subscription] = await Subscription.findOrCreate({
      where: { userId: user.id },
      defaults: {
        userId: user.id,
        tier: newTier,
        status: 'active',
        stripeCustomerId: `manual_${user.id}`,
        stripeSubscriptionId: transactionId || `manual_sub_${Date.now()}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    if (subscription.tier !== newTier) {
      await subscription.update({
        tier: newTier,
        status: 'active',
        stripeSubscriptionId: transactionId || `manual_sub_${Date.now()}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
    }
    
    // Track upgrade completed event
    await eventTracking.trackUpgradeCompleted(userId, {
      previousTier,
      newTier,
      amount: amount || DODO_PAYMENTS_CONFIG.pricing[newTier]?.monthly || 0,
      paymentMethod: 'manual',
      transactionId
    }, {
      subscriptionTier: newTier
    });
    
    res.json({
      success: true,
      message: `User upgraded to ${newTier}`,
      user: {
        id: user.id,
        email: user.email,
        previousTier,
        newTier,
        subscriptionStatus: 'active'
      }
    });
    
  } catch (error) {
    console.error('Error completing manual upgrade:', error);
    res.status(500).json({ error: 'Failed to complete upgrade' });
  }
}

/**
 * Get Pro features list for display
 * GET /api/upgrade/pro-features
 */
async function getProFeatures(req, res) {
  try {
    res.json({
      success: true,
      features: {
        pro: {
          name: 'Pro',
          price: '$3/month',
          features: [
            { icon: '♾️', text: 'Unlimited AI queries' },
            { icon: '🧠', text: 'Advanced AI models (Claude, GPT-4)' },
            { icon: '📚', text: 'Unlimited error history' },
            { icon: '⚡', text: 'Priority processing' },
            { icon: '📧', text: 'Email support' },
            { icon: '🔒', text: 'Private error storage' }
          ],
          cta: 'Upgrade to Pro'
        },
        team: {
          name: 'Team',
          price: '$8/month',
          features: [
            { icon: '✅', text: 'Everything in Pro' },
            { icon: '👥', text: 'Up to 10 team members' },
            { icon: '📊', text: 'Team analytics dashboard' },
            { icon: '🔗', text: 'Shared error library' },
            { icon: '⭐', text: 'Priority support' }
          ],
          cta: 'Upgrade to Team'
        }
      },
      comparison: {
        headers: ['Feature', 'Free', 'Pro', 'Team'],
        rows: [
          ['Monthly queries', '50', 'Unlimited', 'Unlimited'],
          ['AI Models', 'Basic', 'Advanced', 'Advanced'],
          ['Error history', '7 days', 'Unlimited', 'Unlimited'],
          ['Team members', '1', '1', 'Up to 10'],
          ['Support', 'Community', 'Email', 'Priority']
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching pro features:', error);
    res.status(500).json({ error: 'Failed to fetch features' });
  }
}

module.exports = {
  getUpgradeOptions,
  trackUpgradeClick,
  getCheckoutUrl,
  completeUpgradeManual,
  getProFeatures,
  DODO_PAYMENTS_CONFIG
};
