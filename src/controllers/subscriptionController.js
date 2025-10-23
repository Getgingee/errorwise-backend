const User = require('../models/User');
const Subscription = require('../models/Subscription');

// Get user subscription
exports.getSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({
      where: { userId },
      include: [{
        model: User,
        attributes: ['username', 'email']
      }]
    });

    // If no subscription found, return free tier
    if (!subscription) {
      return res.json({
        tier: 'free',
        status: 'active',
        features: {
          maxQueries: 10,
          aiProviders: ['mock'],
          advancedAnalysis: false,
          prioritySupport: false
        },
        limits: {
          queriesUsed: 0,
          queriesRemaining: 10
        }
      });
    }

    res.json({
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      features: getFeaturesByTier(subscription.tier),
      limits: await getUsageLimits(userId, subscription.tier)
    });

  } catch (error) {
    console.error('Failed to fetch subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
};

// Get subscription plans
exports.getPlans = async (req, res) => {
  try {
    const dodoConfig = require('../config/dodoPayments');
    
    const plans = [
      {
        id: 'free',
        name: dodoConfig.plans.free.name,
        price: dodoConfig.plans.free.price,
        interval: dodoConfig.plans.free.interval,
        features: {
          dailyQueries: dodoConfig.plans.free.features.dailyQueries,
          errorExplanation: dodoConfig.plans.free.features.errorExplanation,
          fixSuggestions: dodoConfig.plans.free.features.fixSuggestions,
          documentationLinks: dodoConfig.plans.free.features.documentationLinks,
          errorHistory: dodoConfig.plans.free.features.errorHistory
        },
        description: 'Perfect for trying out ErrorWise - 3 error explanations per day'
      },
      {
        id: 'pro',
        name: dodoConfig.plans.pro.name,
        price: dodoConfig.plans.pro.price,
        interval: dodoConfig.plans.pro.interval,
        trialDays: dodoConfig.plans.pro.trialDays,
        features: {
          dailyQueries: dodoConfig.plans.pro.features.dailyQueries,
          errorExplanation: dodoConfig.plans.pro.features.errorExplanation,
          fixSuggestions: dodoConfig.plans.pro.features.fixSuggestions,
          documentationLinks: dodoConfig.plans.pro.features.documentationLinks,
          errorHistory: dodoConfig.plans.pro.features.errorHistory,
          advancedAnalysis: dodoConfig.plans.pro.features.advancedAnalysis
        },
        description: 'Unlimited error queries with fixes, documentation, and complete history'
      },
      {
        id: 'team',
        name: dodoConfig.plans.team.name,
        price: dodoConfig.plans.team.price,
        interval: dodoConfig.plans.team.interval,
        trialDays: dodoConfig.plans.team.trialDays,
        features: {
          dailyQueries: dodoConfig.plans.team.features.dailyQueries,
          errorExplanation: dodoConfig.plans.team.features.errorExplanation,
          fixSuggestions: dodoConfig.plans.team.features.fixSuggestions,
          documentationLinks: dodoConfig.plans.team.features.documentationLinks,
          errorHistory: dodoConfig.plans.team.features.errorHistory,
          teamFeatures: dodoConfig.plans.team.features.teamFeatures,
          sharedHistory: dodoConfig.plans.team.features.sharedHistory,
          teamDashboard: dodoConfig.plans.team.features.teamDashboard,
          teamMembers: dodoConfig.plans.team.features.teamMembers
        },
        description: 'Everything in Pro plus shared team history and collaboration features'
      }
    ];

    res.json({ plans });

  } catch (error) {
    console.error('Failed to fetch subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
};

// Create subscription with Dodo payment integration
exports.createSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, successUrl, cancelUrl } = req.body;

    if (!planId || !['pro', 'team'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Check if user already has an active subscription
    const existingSubscription = await Subscription.findOne({
      where: { 
        userId,
        status: 'active'
      }
    });

    if (existingSubscription) {
      return res.status(409).json({ error: 'User already has an active subscription' });
    }

    // Get plan details from Dodo configuration
    const dodoConfig = require('../config/dodoPayments');
    const plan = dodoConfig.plans[planId];
    
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Create payment session with Dodo
    const paymentService = require('../services/paymentService');
    const paymentSession = await paymentService.createPaymentSession({
      userId,
      planId,
      planName: plan.name,
      amount: plan.price,
      currency: dodoConfig.currency,
      successUrl: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancelUrl: cancelUrl || `${process.env.FRONTEND_URL}/pricing?payment=cancelled`
    });

    if (!paymentSession.success) {
      return res.status(500).json({ 
        error: 'Payment session creation failed',
        details: paymentSession.error 
      });
    }

    res.status(201).json({
      message: 'Payment session created successfully',
      sessionId: paymentSession.sessionId,
      sessionUrl: paymentSession.sessionUrl,
      plan: {
        id: planId,
        name: plan.name,
        price: plan.price
      }
    });

  } catch (error) {
    console.error('Failed to create subscription:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({
      where: { 
        userId,
        status: 'active'
      }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Update subscription status to cancelled
    await subscription.update({ status: 'cancelled' });

    res.json({
      message: 'Subscription cancelled successfully',
      subscription: {
        id: subscription.id,
        tier: subscription.tier,
        status: subscription.status,
        endDate: subscription.endDate
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
    const signature = req.headers['dodo-signature'];
    const payload = JSON.stringify(req.body);

    const paymentService = require('../services/paymentService');
    
    // Verify webhook signature
    if (!paymentService.verifyWebhookSignature(payload, signature)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    // Process webhook event
    const result = await paymentService.processWebhookEvent(req.body);

    if (result.success) {
      res.status(200).json({ message: 'Webhook processed successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }

  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
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

    if (subscription) {
      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          tier: subscription.tier,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          features: getFeaturesByTier(subscription.tier)
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

    let subscription = await Subscription.findOne({ where: { userId } });

    if (!subscription) {
      // Create new subscription
      subscription = await Subscription.create({
        userId,
        tier: plan,
        status,
        endDate: end_date,
        startDate: new Date()
      });
    } else {
      // Update existing subscription
      await subscription.update({
        tier: plan,
        status,
        endDate: end_date
      });
    }

    res.json({
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate
    });

  } catch (error) {
    console.error('Failed to update subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};

// Helper functions
function getFeaturesByTier(tier) {
  const dodoConfig = require('../config/dodoPayments');
  
  const features = {
    free: {
      dailyQueries: dodoConfig.plans.free.features.dailyQueries,
      errorExplanation: dodoConfig.plans.free.features.errorExplanation,
      fixSuggestions: dodoConfig.plans.free.features.fixSuggestions,
      documentationLinks: dodoConfig.plans.free.features.documentationLinks,
      errorHistory: dodoConfig.plans.free.features.errorHistory,
      teamFeatures: dodoConfig.plans.free.features.teamFeatures,
      supportLevel: dodoConfig.plans.free.features.supportLevel
    },
    pro: {
      dailyQueries: dodoConfig.plans.pro.features.dailyQueries === -1 ? 'unlimited' : dodoConfig.plans.pro.features.dailyQueries,
      errorExplanation: dodoConfig.plans.pro.features.errorExplanation,
      fixSuggestions: dodoConfig.plans.pro.features.fixSuggestions,
      documentationLinks: dodoConfig.plans.pro.features.documentationLinks,
      errorHistory: dodoConfig.plans.pro.features.errorHistory,
      teamFeatures: dodoConfig.plans.pro.features.teamFeatures,
      supportLevel: dodoConfig.plans.pro.features.supportLevel,
      advancedAnalysis: dodoConfig.plans.pro.features.advancedAnalysis
    },
    team: {
      dailyQueries: dodoConfig.plans.team.features.dailyQueries === -1 ? 'unlimited' : dodoConfig.plans.team.features.dailyQueries,
      errorExplanation: dodoConfig.plans.team.features.errorExplanation,
      fixSuggestions: dodoConfig.plans.team.features.fixSuggestions,
      documentationLinks: dodoConfig.plans.team.features.documentationLinks,
      errorHistory: dodoConfig.plans.team.features.errorHistory,
      teamFeatures: dodoConfig.plans.team.features.teamFeatures,
      sharedHistory: dodoConfig.plans.team.features.sharedHistory,
      teamDashboard: dodoConfig.plans.team.features.teamDashboard,
      supportLevel: dodoConfig.plans.team.features.supportLevel,
      teamMembers: dodoConfig.plans.team.features.teamMembers
    }
  };

  return features[tier] || features.free;
}

async function getUsageLimits(userId, tier) {
  const ErrorQuery = require('../models/ErrorQuery');
  
  // Get current month usage
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  const queriesUsed = await ErrorQuery.count({
    where: {
      userId,
      createdAt: {
        [require('sequelize').Op.gte]: currentMonth
      }
    }
  });

  const features = getFeaturesByTier(tier);
  
  // Handle unlimited plans (Pro and Team)
  if (features.dailyQueries === 'unlimited') {
    return {
      queriesUsed,
      queriesRemaining: 'unlimited',
      dailyQueries: 'unlimited',
      planType: tier
    };
  }

  // For free plan, calculate daily usage
  if (tier === 'free') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyUsed = await ErrorQuery.count({
      where: {
        userId,
        createdAt: {
          [require('sequelize').Op.gte]: today
        }
      }
    });

    const dailyRemaining = Math.max(0, features.dailyQueries - dailyUsed);

    return {
      queriesUsed: dailyUsed,
      queriesRemaining: dailyRemaining,
      dailyQueries: features.dailyQueries,
      planType: 'free',
      resetTime: 'daily'
    };
  }

  // For paid plans with unlimited queries
  return {
    queriesUsed,
    queriesRemaining: 'unlimited',
    dailyQueries: 'unlimited',
    planType: tier
  };
}
