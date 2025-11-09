const User = require('../models/User');
const Subscription = require('../models/Subscription');
const logger = require('../utils/logger');

// Subscription tier configuration
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    interval: 'month',
    features: {
      dailyQueries: -1, // No daily limit
      monthlyQueries: 50, // 50 queries per month
      errorExplanation: true,
      fixSuggestions: false,
      codeExamples: false,
      documentationLinks: true,
      errorHistory: '7 days',
      teamFeatures: false,
      aiProvider: 'gemini-2.0-flash',
      maxTokens: 800,
      supportLevel: 'community',
      advancedAnalysis: false,
      priorityQueue: false
    }
  },
  pro: {
    name: 'Pro',
    price: 3,
    interval: 'month',
    trialDays: 7,
    dodo_plan_id: 'pdt_OKdKW76gtO6vBWltBBV5d', // DodoPayments Product ID for Pro
    features: {
      dailyQueries: -1, // unlimited
      errorExplanation: true,
      fixSuggestions: true,
      codeExamples: true,
      documentationLinks: true,
      errorHistory: 'unlimited',
  teamFeatures: false,
  // aiProvider: 'gpt-3.5-turbo',
  aiProvider: 'claude-3-haiku-20240307', // Only Anthropic enabled
  maxTokens: 1200,
      supportLevel: 'email',
      advancedAnalysis: true,
      priorityQueue: true,
      multiLanguageSupport: true,
      exportHistory: true
    }
  },
  team: {
    name: 'Team',
    price: 8,
    interval: 'month',
    trialDays: 14,
    dodo_plan_id: 'pdt_Zbn5YM2pCgkKcdQyV0ouY', // DodoPayments Product ID for Team
    features: {
      dailyQueries: -1, // unlimited
      errorExplanation: true,
      fixSuggestions: true,
      codeExamples: true,
      documentationLinks: true,
      errorHistory: 'unlimited',
      teamFeatures: true,
  teamMembers: 10,
  sharedHistory: true,
  teamDashboard: true,
  // aiProvider: 'gpt-4',
  aiProvider: 'claude-3-5-sonnet-20241022', // Only Anthropic enabled
  maxTokens: 2000,
      supportLevel: 'priority',
      advancedAnalysis: true,
      priorityQueue: true,
      multiLanguageSupport: true,
      exportHistory: true,
      apiAccess: true,
      customIntegrations: true
    }
  }
};

// Get user subscription with comprehensive info
exports.getSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user with subscription info
    const user = await User.findByPk(userId, {
      attributes: [
        'id', 'username', 'email', 'subscriptionTier', 
        'subscriptionStatus', 'subscriptionEndDate', 
        'subscriptionStartDate', 'trialEndsAt'
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tier = user.subscriptionTier || 'free';
    const status = user.subscriptionStatus || 'active';
    
    // Check if subscription has expired
    const now = new Date();
    let actualStatus = status;
    
    if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) < now) {
      actualStatus = 'expired';
      // Auto-downgrade to free if expired
      if (tier !== 'free') {
        await user.update({
          subscriptionTier: 'free',
          subscriptionStatus: 'expired'
        });
      }
    }

    // Get usage limits
    const usage = await getUsageLimits(userId, tier);
    
    // Get tier configuration
    const tierConfig = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      subscription: {
        tier,
        status: actualStatus,
        startDate: user.subscriptionStartDate,
        endDate: user.subscriptionEndDate,
        trialEndsAt: user.trialEndsAt,
        isActive: actualStatus === 'active' || actualStatus === 'trial',
        isTrial: status === 'trial'
      },
      plan: {
        name: tierConfig.name,
        price: tierConfig.price,
        interval: tierConfig.interval,
        features: tierConfig.features
      },
      usage,
      canUpgrade: tier !== 'team',
      canDowngrade: tier !== 'free'
    });

  } catch (error) {
    console.error('Failed to fetch subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
};

// Get subscription plans with detailed features
exports.getPlans = async (req, res) => {
  try {
    const sequelize = require('../config/database');
    
    // Query database for plans
    const [dbPlans] = await sequelize.query(`
      SELECT * FROM subscription_plans 
      ORDER BY price ASC
    `);
    
    // If database has plans, format and return them
    if (dbPlans && dbPlans.length > 0) {
      // Group plans by tier (filter out yearly duplicates for now, show monthly)
      const plansByTier = {
        free: null,
        pro: null,
        team: null
      };
      
      dbPlans.forEach(plan => {
        const nameLower = plan.name.toLowerCase();
        
        if (nameLower.includes('free')) {
          if (!plansByTier.free) plansByTier.free = plan;
        } else if (nameLower.includes('pro') && !nameLower.includes('year')) {
          if (!plansByTier.pro) plansByTier.pro = plan;
        } else if (nameLower.includes('team') && !nameLower.includes('year')) {
          if (!plansByTier.team) plansByTier.team = plan;
        }
      });
      
      const formattedPlans = Object.keys(plansByTier)
        .filter(key => plansByTier[key] !== null)
        .map(tierKey => {
          const plan = plansByTier[tierKey];
          const tierConfig = SUBSCRIPTION_TIERS[tierKey] || SUBSCRIPTION_TIERS.free;
          
          return {
            id: tierKey, // Use tier key ('free', 'pro', 'team') instead of database ID
            name: plan.name,
            price: tierConfig.price || parseFloat(plan.price) || 0, // Use SUBSCRIPTION_TIERS price first
            interval: plan.billing_interval || plan.interval || 'month',
            trialDays: plan.trial_period_days || plan.trial_days || (tierKey === 'pro' ? 7 : tierKey === 'team' ? 14 : 0),
            features: tierConfig.features, // Use features from SUBSCRIPTION_TIERS
            popular: tierKey === 'pro', // Mark Pro as popular
            description: plan.description || getPlanDescription(tierKey),
            dodo_plan_id: tierConfig.dodo_plan_id || plan.dodo_plan_id // Use SUBSCRIPTION_TIERS Product ID first
          };
        });
      
      return res.json({ plans: formattedPlans });
    }
    
    // Fallback to hardcoded plans if database is empty
    console.log('⚠️  No plans in database, using hardcoded SUBSCRIPTION_TIERS');
    const plans = Object.keys(SUBSCRIPTION_TIERS).map(tierKey => {
      const tier = SUBSCRIPTION_TIERS[tierKey];
      return {
        id: tierKey,
        name: tier.name,
        price: tier.price,
        interval: tier.interval,
        trialDays: tier.trialDays || 0,
        features: tier.features,
        popular: tierKey === 'pro', // Mark Pro as popular
        description: getPlanDescription(tierKey)
      };
    });

    res.json({ plans });

  } catch (error) {
    console.error('Failed to fetch subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans', details: error.message });
  }
};

function getPlanDescription(tier) {
  const descriptions = {
    free: 'Perfect for trying out ErrorWise - 3 error explanations per day',
    pro: 'Unlimited queries with AI-powered fixes and code examples',
    team: 'Everything in Pro plus team collaboration and priority support'
  };
  return descriptions[tier] || '';
}

// Create subscription with payment integration
exports.createSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, successUrl, cancelUrl } = req.body;

    if (!planId || !['pro', 'team'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID. Must be "pro" or "team"' });
    }

    // Get current user
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has an active paid subscription
    if (user.subscriptionTier !== 'free' && user.subscriptionStatus === 'active') {
      return res.status(409).json({ 
        error: 'You already have an active subscription. Please cancel it first to upgrade/downgrade.' 
      });
    }

    // Get plan details
    const plan = SUBSCRIPTION_TIERS[planId];
    
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // For development/testing: Allow instant upgrade without payment
    if (process.env.NODE_ENV === 'development' && req.body.skipPayment === true) {
      const trialDays = plan.trialDays || 7;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + trialDays);

      await user.update({
        subscriptionTier: planId,
        subscriptionStatus: 'trial',
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        trialEndsAt: endDate
      });

      // Send subscription confirmation email
      const emailService = require('../utils/emailService');
      try {
        await emailService.sendSubscriptionConfirmation(user, {
          planName: plan.name,
          monthlyLimit: plan.features.dailyQueries === -1 ? 'Unlimited' : plan.features.dailyQueries,
          teamLimit: plan.features.teamMembers || 1,
          nextBillingDate: endDate
        });
        logger.info('Subscription confirmation email sent', { email: user.email, plan: planId });
      } catch (emailError) {
        logger.error('Failed to send subscription confirmation email:', emailError);
        // Don't fail subscription if email fails
      }

      return res.json({
        message: 'Trial subscription activated successfully',
        subscription: {
          tier: planId,
          status: 'trial',
          startDate,
          endDate,
          features: plan.features
        }
      });
    }

    // Create payment session with Dodo Payments (Hosted Checkout)
    const paymentService = require('../services/paymentService');
    const paymentSession = await paymentService.createPaymentSession({
      userId: user.id,
      userEmail: user.email,
      planId,
      planName: plan.name,
      productId: plan.dodo_plan_id,
      amount: plan.price,
      currency: 'USD',
      interval: plan.interval,
      trialDays: plan.trialDays || 0,
      allowedPaymentMethodTypes: ['credit', 'debit', 'upi_collect', 'upi_intent'],
      successUrl: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancelUrl: cancelUrl || `${process.env.FRONTEND_URL}/pricing?payment=cancelled`
    });

    if (!paymentSession.success) {
      return res.status(500).json({ 
        error: 'Payment session creation failed',
        details: paymentSession.error 
      });
    }

    // Store session ID for verification later
    await Subscription.create({
      userId: user.id,
      tier: planId,
      status: 'pending',
      dodoSessionId: paymentSession.sessionId
    });

    res.status(201).json({
      message: 'Payment session created successfully',
      sessionId: paymentSession.sessionId,
      sessionUrl: paymentSession.sessionUrl,
      plan: {
        id: planId,
        name: plan.name,
        price: plan.price,
        interval: plan.interval,
        trialDays: plan.trialDays || 0
      }
    });

  } catch (error) {
    console.error('Failed to create subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription', message: error.message });
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.subscriptionTier === 'free') {
      return res.status(400).json({ error: 'No active paid subscription to cancel' });
    }

    // Update user subscription to cancelled
    // Keep access until end of billing period
    await user.update({ 
      subscriptionStatus: 'cancelled'
      // Don't change tier yet - let them use until expiry
    });

    // Also update Subscription record if exists
    await Subscription.update(
      { status: 'cancelled' },
      { where: { userId, status: 'active' } }
    );

    // Send cancellation confirmation email
    const emailService = require('../utils/emailService');
    try {
      await emailService.sendCancellationConfirmation(
        user.email,
        user.username,
        user.subscriptionTier,
        user.subscriptionEndDate
      );
      logger.info('Cancellation confirmation email sent', { email: user.email });
    } catch (emailError) {
      logger.error('Failed to send cancellation confirmation email:', emailError);
      // Don't fail cancellation if email fails
    }

    res.json({
      message: 'Subscription cancelled successfully. You will retain access until the end of your billing period.',
      subscription: {
        tier: user.subscriptionTier,
        status: 'cancelled',
        endDate: user.subscriptionEndDate,
        message: `Your ${user.subscriptionTier} plan will remain active until ${user.subscriptionEndDate ? new Date(user.subscriptionEndDate).toLocaleDateString() : 'the end of the billing period'}`
      }
    });

  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

// Get subscription usage
exports.getUsage = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({
      where: { userId }
    });

    const tier = subscription ? subscription.tier : 'free';
    const limits = await getUsageLimits(userId, tier);

    res.json({
      tier,
      usage: limits,
      features: getFeaturesByTier(tier)
    });

  } catch (error) {
    console.error('Failed to fetch usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
};

// Handle Dodo payment webhooks
exports.handleWebhook = async (req, res) => {
  try {
    // Dodo sends signature header (case-insensitive). Express lowercases header keys.
    const signature = req.headers['dodo-signature'] || req.headers['x-dodo-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    // Use the raw request body for HMAC verification to avoid JSON re-serialization issues
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    const paymentService = require('../services/paymentService');
    
    // Verify webhook signature
    if (!paymentService.verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    // Process webhook event (req.body already parsed JSON)
    const result = await paymentService.processWebhookEvent(req.body);

    if (result.success) {
      return res.status(200).json({ message: 'Webhook processed successfully' });
    }
    return res.status(500).json({ error: result.error || 'Processing error' });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Verify payment session
exports.verifyPayment = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Check if subscription was created/updated for this user
    const subscription = await Subscription.findOne({
      where: { 
        userId,
        dodoSessionId: sessionId 
      }
    });

    if (subscription && subscription.status === 'active') {
      // Get user details
      const user = await User.findByPk(userId);
      
      res.json({
        success: true,
        subscription: {
          tier: user.subscriptionTier,
          status: user.subscriptionStatus,
          startDate: user.subscriptionStartDate,
          endDate: user.subscriptionEndDate,
          features: SUBSCRIPTION_TIERS[user.subscriptionTier]?.features || {}
        }
      });
    } else {
      res.status(404).json({ 
        success: false,
        error: 'Payment not yet processed or failed' 
      });
    }

  } catch (error) {
    console.error('Payment verification failed:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
};

// Update subscription (legacy compatibility)
exports.updateSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan, status, end_date } = req.body;

    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user subscription fields
    await user.update({
      subscriptionTier: plan,
      subscriptionStatus: status,
      subscriptionEndDate: end_date,
      subscriptionStartDate: user.subscriptionStartDate || new Date()
    });

    res.json({
      tier: user.subscriptionTier,
      status: user.subscriptionStatus,
      startDate: user.subscriptionStartDate,
      endDate: user.subscriptionEndDate
    });

  } catch (error) {
    console.error('Failed to update subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};

// Create checkout session (for frontend compatibility)
exports.createCheckout = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, successUrl, cancelUrl } = req.body;

    if (!planId || !['pro', 'team'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID. Must be "pro" or "team"' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const plan = SUBSCRIPTION_TIERS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // For development: instant upgrade
    if (process.env.NODE_ENV === 'development' || !process.env.DODO_API_KEY) {
      const trialDays = plan.trialDays || 7;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + trialDays);

      await user.update({
        subscriptionTier: planId,
        subscriptionStatus: 'trial',
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        trialEndsAt: endDate
      });

      return res.json({
        success: true,
        data: {
          url: `${process.env.FRONTEND_URL}/dashboard?upgraded=true`,
          sessionId: `dev_session_${Date.now()}`
        }
      });
    }

    // Production: Create payment session (Hosted Checkout)
    const paymentService = require('../services/paymentService');
    const paymentSession = await paymentService.createPaymentSession({
      userId: user.id,
      userEmail: user.email,
      planId,
      planName: plan.name,
      productId: plan.dodo_plan_id,
      amount: plan.price,
      currency: 'USD',
      interval: plan.interval,
      trialDays: plan.trialDays || 0,
      allowedPaymentMethodTypes: ['credit', 'debit', 'upi_collect', 'upi_intent'],
      successUrl: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancelUrl: cancelUrl || `${process.env.FRONTEND_URL}/pricing?payment=cancelled`
    });

    if (!paymentSession.success) {
      return res.status(500).json({ 
        success: false,
        error: paymentSession.error 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        url: paymentSession.sessionUrl,
        sessionId: paymentSession.sessionId
      }
    });

  } catch (error) {
    console.error('Failed to create checkout session:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create checkout session',
      message: error.message 
    });
  }
};

// Get billing information
exports.getBillingInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get subscription records
    const subscriptions = await Subscription.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    const currentSubscription = subscriptions.find(s => s.status === 'active' || s.status === 'trial');
    const plan = SUBSCRIPTION_TIERS[user.subscriptionTier] || SUBSCRIPTION_TIERS.free;

    // Calculate next billing date
    let nextBillingDate = null;
    if (user.subscriptionEndDate && user.subscriptionStatus === 'active') {
      nextBillingDate = new Date(user.subscriptionEndDate);
    }

    // Calculate billing amount
    const billingAmount = plan.price;
    const billingInterval = plan.interval;

    res.json({
      success: true,
      data: {
        currentPlan: {
          name: plan.name,
          tier: user.subscriptionTier,
          price: billingAmount,
          interval: billingInterval,
          status: user.subscriptionStatus
        },
        billing: {
          nextBillingDate,
          amount: billingAmount,
          currency: 'USD',
          interval: billingInterval,
          paymentMethod: currentSubscription?.paymentMethod || 'card',
          lastPaymentDate: user.subscriptionStartDate
        },
        subscription: {
          startDate: user.subscriptionStartDate,
          endDate: user.subscriptionEndDate,
          trialEndsAt: user.trialEndsAt,
          cancelAtPeriodEnd: user.subscriptionStatus === 'cancelled'
        }
      }
    });

  } catch (error) {
    console.error('Failed to fetch billing info:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch billing information' 
    });
  }
};

// Get subscription history
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Get subscription changes/transactions
    const subscriptions = await Subscription.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const total = await Subscription.count({ where: { userId } });

    // Format history
    const history = subscriptions.map(sub => {
      const plan = SUBSCRIPTION_TIERS[sub.tier] || SUBSCRIPTION_TIERS.free;
      return {
        id: sub.id,
        tier: sub.tier,
        planName: plan.name,
        status: sub.status,
        amount: plan.price,
        currency: 'USD',
        interval: plan.interval,
        startDate: sub.startDate,
        endDate: sub.endDate,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        action: getActionType(sub)
      };
    });

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    });

  } catch (error) {
    console.error('Failed to fetch subscription history:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch subscription history' 
    });
  }
};

// Get upgrade options
exports.getUpgradeOptions = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentTier = user.subscriptionTier || 'free';
    const allTiers = ['free', 'pro', 'team'];
    const currentIndex = allTiers.indexOf(currentTier);

    // Get available upgrades
    const upgrades = [];
    const downgrades = [];

    for (let i = 0; i < allTiers.length; i++) {
      const tier = allTiers[i];
      if (tier === currentTier) continue;

      const plan = SUBSCRIPTION_TIERS[tier];
      const option = {
        tier,
        name: plan.name,
        price: plan.price,
        interval: plan.interval,
        trialDays: plan.trialDays || 0,
        features: plan.features,
        savings: null,
        isUpgrade: i > currentIndex,
        isDowngrade: i < currentIndex,
        popular: tier === 'pro'
      };

      // Calculate savings for yearly plans
      if (plan.interval === 'year') {
        const monthlyEquivalent = plan.price / 12;
        const monthlyPlan = SUBSCRIPTION_TIERS[tier === 'proYearly' ? 'pro' : 'team'];
        if (monthlyPlan) {
          option.savings = Math.round((monthlyPlan.price * 12 - plan.price) * 100) / 100;
        }
      }

      if (i > currentIndex) {
        upgrades.push(option);
      } else {
        downgrades.push(option);
      }
    }

    res.json({
      success: true,
      data: {
        currentPlan: {
          tier: currentTier,
          name: SUBSCRIPTION_TIERS[currentTier].name,
          price: SUBSCRIPTION_TIERS[currentTier].price,
          features: SUBSCRIPTION_TIERS[currentTier].features
        },
        upgrades,
        downgrades,
        canUpgrade: upgrades.length > 0,
        canDowngrade: downgrades.length > 0
      }
    });

  } catch (error) {
    console.error('Failed to fetch upgrade options:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch upgrade options' 
    });
  }
};

// Helper function to determine action type
function getActionType(subscription) {
  if (subscription.status === 'active' && !subscription.previousTier) {
    return 'subscribed';
  } else if (subscription.status === 'cancelled') {
    return 'cancelled';
  } else if (subscription.previousTier && subscription.previousTier !== subscription.tier) {
    return subscription.tier > subscription.previousTier ? 'upgraded' : 'downgraded';
  } else if (subscription.status === 'trial') {
    return 'trial_started';
  } else if (subscription.status === 'expired') {
    return 'expired';
  }
  return 'updated';
}

// Export subscription tiers for use in other modules
exports.SUBSCRIPTION_TIERS = SUBSCRIPTION_TIERS;

// Helper function to get usage limits
async function getUsageLimits(userId, tier) {
  const ErrorQuery = require('../models/ErrorQuery');
  const { Op } = require('sequelize');
  
  const tierConfig = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
  
  // For unlimited plans (Pro and Team)
  if (tierConfig.features.dailyQueries === -1) {
    const totalUsed = await ErrorQuery.count({
      where: { userId }
    });

    return {
      queriesUsed: totalUsed,
      queriesRemaining: 'unlimited',
      dailyLimit: 'unlimited',
      resetTime: null,
      planType: tier
    };
  }

  // For free plan - daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dailyUsed = await ErrorQuery.count({
    where: {
      userId,
      createdAt: {
        [Op.gte]: today,
        [Op.lt]: tomorrow
      }
    }
  });

  const dailyRemaining = Math.max(0, tierConfig.features.dailyQueries - dailyUsed);

  return {
    queriesUsed: dailyUsed,
    queriesRemaining: dailyRemaining,
    dailyLimit: tierConfig.features.dailyQueries,
    resetTime: tomorrow.toISOString(),
    planType: 'free',
    limitReached: dailyRemaining === 0
  };
}

// Helper function to get features by tier
function getFeaturesByTier(tier) {
  const tierConfig = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
  return tierConfig.features;
}

