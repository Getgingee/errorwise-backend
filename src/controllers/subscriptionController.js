const User = require('../models/User');
const Subscription = require('../models/Subscription');
const logger = require('../utils/logger');
const subscriptionService = require('../services/subscriptionService');

// UNIFIED: Import central model configuration
const modelConfig = require('../config/modelConfig');
const { configDotenv } = require('dotenv');
const { hashData } = require('../services/userTrackingService');
const { send } = require('process');

// Subscription tier configuration - matches pricing page exactly
// UNIFIED: AI models now come from central modelConfig
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free Plan',
    price: 0,
    interval: 'forever',
    description: 'Perfect for trying out ErrorWise. Get 50 error explanations per month with 7-day history.',
    dodo_plan_id: null,
    // Display-ready feature list for frontend (single source of truth)
    // Matches original pricing page design exactly
    displayFeatures: [
      { text: '50 error solutions/month', available: true },
      { text: '10 queries per day', available: true },
      { text: 'Plain English explanations', available: true },
      { text: 'Basic step-by-step fixes', available: true },
      { text: '7-day history', available: true },
      { text: 'Works with any error type', available: true },
      { text: 'Community support', available: true },
      { text: 'Unlimited queries', available: false },
      { text: 'Web search for solutions', available: false },
      { text: 'Follow-up questions', available: false },
      { text: 'Export history', available: false }
    ],
    features: {
      // Query limits
      monthlyQueries: 50,
      dailyQueries: -1, // No daily limit
      
      // History
      errorHistory: '7-day',
      historyDays: 7,
      
      // UNIFIED: AI Model from central config
      aiProvider: modelConfig.CLAUDE_MODELS['haiku'].apiId,
      aiModel: 'Claude Haiku (Fast)',
      maxTokens: modelConfig.getMaxTokensForTier('free'),
      
      // Features list (matching pricing page)
      basicErrorExplanations: true,
      errorExplanation: true,
      
      // Support
      supportLevel: 'community',
      
      // Disabled features
      fixSuggestions: false,
      fullErrorExplanations: false,
      codeExamples: false,
      preventionTips: false,
      unlimitedQueries: false,
      unlimitedHistory: false,
      advancedAnalysis: false,
      exportToJSON: false,
      exportToCSV: false,
      urlScrapingContext: false,
      multiLanguageSupport: false,
      emailSupport: false,
      teamFeatures: false
    }
  },
  pro: {
    name: 'Pro Plan',
    price: 3,
    interval: 'month',
    description: 'Unlimited error queries with fixes, documentation links, and complete history.',
    trialDays: 7,
    dodo_plan_id: 'pdt_OKdKW76gtO6vBWltBBV5d',
    mostPopular: true,
    // Display-ready feature list for frontend (single source of truth)
    // Matches original pricing page design exactly
    displayFeatures: [
      { text: 'UNLIMITED error solutions', available: true, highlight: true, badge: 'NEW' },
      { text: 'Ask anything about tech', available: true, highlight: true, badge: 'NEW' },
      { text: 'Web search for latest solutions', available: true, highlight: true, badge: 'Live' },
      { text: '10 follow-up questions per query', available: true, highlight: true, badge: 'NEW' },
      { text: 'Visual guides & screenshots', available: true },
      { text: 'How-to tutorials', available: true },
      { text: 'Prevention tips', available: true },
      { text: 'Detailed explanations', available: true },
      { text: 'Multi-language support (10+)', available: true, badge: 'NEW' },
      { text: 'Unlimited history storage', available: true },
      { text: 'Export to JSON/CSV', available: true },
      { text: 'Save solutions to library', available: true, badge: 'NEW' },
      { text: 'Faster AI responses', available: true },
      { text: 'Email support', available: true },
      { text: 'India-specific solutions', available: true }
    ],
    features: {
      // Query limits
      monthlyQueries: -1, // unlimited
      dailyQueries: -1,
      unlimitedQueries: true,
      
      // History
      errorHistory: 'unlimited',
      historyDays: -1,
      unlimitedHistory: true,
      
      // UNIFIED: AI Model from central config
      aiProvider: modelConfig.CLAUDE_MODELS['haiku'].apiId,
      aiModel: 'Claude Haiku (Fast)',
      maxTokens: modelConfig.getMaxTokensForTier('pro'),
      
      // Features list (matching pricing page)
      errorExplanation: true,
      fullErrorExplanations: true,
      fixSuggestions: true,
      codeExamples: true,
      preventionTips: true,
      advancedAnalysis: true,
      exportToJSON: true,
      exportToCSV: true,
      urlScrapingContext: true,
      multiLanguageSupport: true,
      
      // Support
      emailSupport: true,
      supportLevel: 'email',
      
      // Disabled team features
      teamFeatures: false,
      sharedErrorHistory: false,
      teamDashboard: false,
      teamMembers: false,
      advancedDebuggingTools: false,
      prioritySupport: false,
      apiAccess: false,
      customIntegrations: false
    }
  },
  team: {
    name: 'Team Plan',
    price: 8,
    interval: 'month',
    description: 'Everything in Pro plus shared team history, team dashboard, and collaborative features.',
    trialDays: 14,
    dodo_plan_id: 'pdt_Zbn5YM2pCgkKcdQyV0ouY',
    // Team plan is coming soon - not available for purchase yet
    comingSoon: true,
    comingSoonMessage: 'Coming Soon! Team features are under development.',
    disabled: true,
    // Display-ready feature list for frontend (single source of truth)
    // Matches original pricing page design exactly
    displayFeatures: [
      { text: 'Everything in Pro', available: true, highlight: true, badge: 'COMING SOON' },
      { text: 'Up to 10 team members', available: true, highlight: true, badge: 'COMING SOON' },
      { text: 'Team dashboard & analytics', available: true, highlight: true, badge: 'COMING SOON' },
      { text: 'Shared solution library', available: true, highlight: true, badge: 'COMING SOON' },
      { text: 'Help teammates with errors', available: true },
      { text: 'Member usage reports', available: true },
      { text: 'Best AI model (Claude Sonnet)', available: true },
      { text: '10 follow-up questions per query', available: true },
      { text: 'Priority support queue', available: true },
      { text: 'API access', available: true },
      { text: 'Custom integrations', available: true }
    ],
    features: {
      // Query limits
      monthlyQueries: -1, // unlimited
      dailyQueries: -1,
      unlimitedQueries: true,
      
      // History
      errorHistory: 'unlimited',
      historyDays: -1,
      unlimitedHistory: true,
      
      // UNIFIED: AI Model from central config
      aiProvider: modelConfig.CLAUDE_MODELS['sonnet'].apiId,
      aiModel: 'Claude Sonnet (Advanced)',
      maxTokens: modelConfig.getMaxTokensForTier('team'),
      
      // All Pro features
      everythingInPro: true,
      errorExplanation: true,
      fullErrorExplanations: true,
      fixSuggestions: true,
      codeExamples: true,
      preventionTips: true,
      advancedAnalysis: true,
      exportToJSON: true,
      exportToCSV: true,
      urlScrapingContext: true,
      multiLanguageSupport: true,
      emailSupport: true,
      
      // Team features (matching pricing page)
      teamFeatures: true,
      teamMembers: 10,
      maxTeamMembers: 10,
      sharedErrorHistory: true,
      teamDashboard: true,
      teamAnalytics: true,
      collaborativeFeatures: true,
      advancedDebuggingTools: true,
      
      // Support
      prioritySupport: true,
      supportLevel: 'priority',
      
      // Advanced features
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

    // Single source of truth response - no redundant data
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
          
          // Build limits object for frontend compatibility
          const limits = {
            daily_queries: tierConfig.features?.dailyQueries ?? -1,
            monthly_queries: tierConfig.features?.monthlyQueries ?? 50,
            explanation_type: tierKey === 'free' ? 'Basic' : 'Full',
            solutions_provided: tierConfig.features?.fixSuggestions ?? false,
            team_features: tierConfig.features?.teamFeatures ?? false,
            video_chat: tierConfig.features?.videoMeetings ?? false,
            video_session_duration: tierKey === 'team' ? 60 : undefined,
            max_team_members: tierKey === 'team' ? 10 : undefined
          };
          
          // Build features array from displayFeatures for frontend
          const featuresArray = (tierConfig.displayFeatures || [])
            .filter((f: any) => f.available)
            .map((f: any) => f.text);
          
          return {
            id: tierKey, // Use tier key ('free', 'pro', 'team') instead of database ID
            name: plan.name,
            price: tierConfig.price || parseFloat(plan.price) || 0, // Use SUBSCRIPTION_TIERS price first
            interval: plan.billing_interval || plan.interval || 'month',
            trialDays: plan.trial_period_days || plan.trial_days || (tierKey === 'pro' ? 7 : tierKey === 'team' ? 14 : 0),
            features: featuresArray, // Array of feature strings for frontend
            limits: limits, // Limits object for frontend
            displayFeatures: tierConfig.displayFeatures, // Frontend-ready feature list
            popular: tierKey === 'pro', // Mark Pro as popular
            description: plan.description || getPlanDescription(tierKey),
            dodo_plan_id: tierConfig.dodo_plan_id || plan.dodo_plan_id, // Use SUBSCRIPTION_TIERS Product ID first
            // Team plan coming soon flags
            comingSoon: tierConfig.comingSoon || false,
            disabled: tierConfig.disabled || false,
            comingSoonMessage: tierConfig.comingSoonMessage || null
          };
        });
      
      return res.json({ plans: formattedPlans });
    }
    
    // Fallback to hardcoded plans if database is empty
    console.log('⚠️  No plans in database, using hardcoded SUBSCRIPTION_TIERS');
    const plans = Object.keys(SUBSCRIPTION_TIERS).map(tierKey => {
      const tier = SUBSCRIPTION_TIERS[tierKey];
      
      // Build limits object for frontend compatibility
      const limits = {
        daily_queries: tier.features?.dailyQueries ?? -1,
        monthly_queries: tier.features?.monthlyQueries ?? 50,
        explanation_type: tierKey === 'free' ? 'Basic' : 'Full',
        solutions_provided: tier.features?.fixSuggestions ?? false,
        team_features: tier.features?.teamFeatures ?? false,
        video_chat: tier.features?.videoMeetings ?? false,
        video_session_duration: tierKey === 'team' ? 60 : undefined,
        max_team_members: tierKey === 'team' ? 10 : undefined
      };
      
      // Build features array from displayFeatures for frontend
      const featuresArray = (tier.displayFeatures || [])
        .filter((f: any) => f.available)
        .map((f: any) => f.text);
      
      return {
        id: tierKey,
        name: tier.name,
        price: tier.price,
        interval: tier.interval,
        trialDays: tier.trialDays || 0,
        features: featuresArray, // Array of feature strings
        limits: limits, // Limits object for frontend
        displayFeatures: tier.displayFeatures, // Frontend-ready feature list
        popular: tierKey === 'pro', // Mark Pro as popular
        description: getPlanDescription(tierKey),
        // Team plan coming soon flags
        comingSoon: tier.comingSoon || false,
        disabled: tier.disabled || false,
        comingSoonMessage: tier.comingSoonMessage || null
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
    
    console.log('📦 Creating payment session for:', {
      userId: user.id,
      planId,
      productId: plan.dodo_plan_id,
      amount: plan.price
    });
    
    // Check if plan has a valid Dodo product ID
    if (!plan.dodo_plan_id) {
      console.error('❌ No Dodo product ID configured for plan:', planId);
      return res.status(503).json({
        error: 'Payment product not configured',
        message: 'This plan is not yet available for purchase. Please contact support.',
        code: 'PRODUCT_NOT_CONFIGURED'
      });
    }
    
    // Check if payment service is properly configured
    const dodoKey = process.env.DODO_SECRET_KEY || process.env.DODO_API_KEY;
    if (!dodoKey) {
      console.error('❌ No Dodo payment API key configured');
      return res.status(503).json({
        error: 'Payment service not configured',
        message: 'Please contact support to set up payments',
        code: 'PAYMENT_NOT_CONFIGURED'
      });
    }
    
    // Warn if using wrong key type
    if (dodoKey.startsWith('pk_')) {
      console.error('❌ Using PUBLIC key for Dodo API - need SECRET key (sk_...)');
      return res.status(503).json({
        error: 'Payment service misconfigured',
        message: 'Payment system configuration error. Please contact support.',
        code: 'PAYMENT_KEY_TYPE_ERROR'
      });
    }
    
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

    console.log('💳 Payment session result:', {
      success: paymentSession.success,
      sessionId: paymentSession.sessionId,
      hasUrl: !!paymentSession.sessionUrl,
      error: paymentSession.error
    });

    if (!paymentSession.success) {
      console.error('❌ Payment session creation failed:', paymentSession.error);
      return res.status(500).json({ 
        error: 'Payment session creation failed',
        message: paymentSession.error || 'Unable to create checkout session',
        code: 'PAYMENT_SESSION_FAILED'
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

    // Get user's subscription tier from User model (primary source of truth)
    const user = await User.findByPk(userId, {
      attributes: ['subscriptionTier', 'subscriptionStatus', 'subscriptionEndDate', 'trialEndsAt']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Use user's subscription tier (not Subscription model) as primary source
    const tier = user.subscriptionTier || 'free';
    const status = user.subscriptionStatus || 'active';
    
    // Check if subscription is still valid
    const now = new Date();
    let effectiveTier = tier;
    
    if (status === 'trial' && user.trialEndsAt && new Date(user.trialEndsAt) < now) {
      effectiveTier = 'free'; // Trial expired
    } else if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) < now && tier !== 'free') {
      effectiveTier = 'free'; // Subscription expired
    }
    
    const limits = await getUsageLimits(userId, effectiveTier);

    // Frontend UsageStats interface expects: tier, usage: {queriesUsed, queriesLimit, percentage}, features
    res.json({
      tier: effectiveTier,
      status,
      usage: {
        queriesUsed: limits.queriesUsed || 0,
        queriesLimit: limits.queriesLimit || 50,
        queriesRemaining: limits.queriesRemaining,
        percentage: limits.percentage || 0,
        resetTime: limits.resetTime,
        planType: limits.planType
      },
      features: getFeaturesByTier(effectiveTier),
      subscription: {
        tier: effectiveTier,
        status,
        endDate: user.subscriptionEndDate,
        trialEndsAt: user.trialEndsAt
      }
    });

  } catch (error) {
    console.error('Failed to fetch usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
};

// Handle Dodo payment webhooks
exports.handleWebhook = async (req, res) => {
  try {
    // Extract webhook ID for idempotency
    const webhookId = req.headers['x-webhook-id'] 
      || req.body.id 
      || req.body.event_id 
      || `webhook_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Check if already processed (idempotency protection)
    const alreadyProcessed = await subscriptionService.isWebhookProcessed(webhookId);
    if (alreadyProcessed) {
      logger.info('⚠️  Webhook already processed (idempotent):', webhookId);
      return res.status(200).json({ 
        message: 'Webhook already processed',
        idempotent: true 
      });
    }
    
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

    // Mark as processed BEFORE processing to prevent duplicate processing
    await subscriptionService.markWebhookProcessed(webhookId, {
      event: req.body.event || req.body.type,
      receivedAt: new Date().toISOString(),
      signature: signature.substring(0, 20) + '...' // Store partial for debugging
    });

    // Process webhook event (req.body already parsed JSON)
    const result = await paymentService.processWebhookEvent(req.body);

    if (result.success) {
      logger.info('✅ Webhook processed successfully:', webhookId);
      return res.status(200).json({ 
        message: 'Webhook processed successfully',
        webhookId 
      });
    }
    
    logger.error('❌ Webhook processing error:', result.error);
    return res.status(500).json({ error: result.error || 'Processing error' });

  } catch (error) {
    logger.error('Webhook processing failed:', error);
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
    const { planId, successUrl, cancelUrl, discountCode } = req.body;

    if (!planId || !['pro', 'team'].includes(planId)) {
      return res.status(400).json({ success: false, error: 'Invalid plan ID. Must be "pro" or "team"' });
    }

    // Block Team plan upgrades - Coming Soon
    if (planId === 'team') {
      return res.status(400).json({ 
        success: false, 
        error: 'Team plan is coming soon! Currently only Pro plan is available for upgrade.',
        comingSoon: true,
        availablePlans: ['pro']
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const plan = SUBSCRIPTION_TIERS[planId];
    if (!plan) {
      return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    // Check if user already has this tier or higher
    const tierOrder = { free: 0, pro: 1, team: 2 };
    if (tierOrder[user.subscriptionTier] >= tierOrder[planId] && user.subscriptionStatus === 'active') {
      return res.status(400).json({ 
        success: false, 
        error: `You already have ${user.subscriptionTier} plan active`,
        currentTier: user.subscriptionTier
      });
    }

    // Check if user has already used their trial
    const hasUsedTrial = user.trialEndsAt !== null || user.hasUsedTrial === true;
    
    // Helper function to activate trial subscription (ONLY for first-time users)
    const activateTrialSubscription = async () => {
      // STRICT CHECK: Only allow trial if never used before
      if (hasUsedTrial) {
        return res.status(400).json({ 
          success: false, 
          error: 'You have already used your free trial. Payment is required to upgrade.',
          requiresPayment: true,
          hasUsedTrial: true
        });
      }

      const trialDays = plan.trialDays || 7;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + trialDays);

      await user.update({
        subscriptionTier: planId,
        subscriptionStatus: 'trial',
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        trialEndsAt: endDate,
        hasUsedTrial: true // Mark trial as used
      });

      logger.info(`Trial activated for user ${userId}: ${planId} until ${endDate}`);

      return res.json({
        success: true,
        trialActivated: true,
        message: `${plan.name} trial activated for ${trialDays} days!`,
        subscription: {
          tier: planId,
          status: 'trial',
          startDate,
          endDate,
          trialEndsAt: endDate
        },
        data: {
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?trial_activated=true&plan=${planId}`,
          sessionId: `trial_session_${Date.now()}`
        }
      });
    };

    // Check if payment is properly configured
    const dodoApiKey = process.env.DODO_API_KEY || process.env.DODO_PAYMENTS_API_KEY;
    const isPlaceholderKey = !dodoApiKey || 
                             dodoApiKey.includes('your_') || 
                             dodoApiKey.includes('placeholder') ||
                             dodoApiKey.includes('_here') ||
                             dodoApiKey.length < 20;

    // For development: allow trial if not used before
    const isDevelopment = process.env.NODE_ENV === 'development';
    const skipPaymentEnv = process.env.SKIP_PAYMENT === 'true';
    
    // Only skip payment in development OR if explicitly set AND user hasn't used trial
    if ((isDevelopment || skipPaymentEnv || isPlaceholderKey) && !hasUsedTrial) {
      console.log('💳 Payment skipped - activating trial (reason: ' + 
        (isDevelopment ? 'development mode' : 
         isPlaceholderKey ? 'payment not configured' : 'SKIP_PAYMENT=true') + ')');
      return activateTrialSubscription();
    }

    // If payment not configured but user already used trial, return error
    if (isPlaceholderKey && hasUsedTrial) {
      return res.status(503).json({ 
        success: false, 
        error: 'Payment system is not configured. Please contact support.',
        requiresPayment: true
      });
    }

    // Production: Create payment session
    const paymentService = require('../services/paymentService');
    
    console.log('💳 Creating payment session:', {
      userId: user.id,
      planId,
      productId: plan.dodo_plan_id,
      hasUsedTrial,
      userEmail: user.email?.substring(0, 5) + '***'
    });
    
    let paymentSession;
    try {
      paymentSession = await paymentService.createPaymentSession({
        userId: user.id,
        userEmail: user.email,
        planId,
        planName: plan.name,
        productId: plan.dodo_plan_id,
        amount: plan.price,
        currency: 'USD',
        interval: plan.interval,
        trialDays: hasUsedTrial ? 0 : (plan.trialDays || 0), // No trial period if already used
        allowedPaymentMethodTypes: ['credit', 'debit', 'upi_collect', 'upi_intent'],
        successUrl: successUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
        cancelUrl: cancelUrl || `${process.env.FRONTEND_URL}/pricing?payment=cancelled`,
        discountCode: discountCode || null
      });
      
      console.log('💳 Payment session result:', {
        success: paymentSession?.success,
        hasUrl: !!paymentSession?.sessionUrl,
        error: paymentSession?.error
      });
      
    } catch (paymentError) {
      console.error('⚠️ Payment service error:', paymentError.message);
      console.error('⚠️ Payment error stack:', paymentError.stack);
      // Only fallback to trial if user hasn't used it before
      if (!hasUsedTrial) {
        logger.info('Payment failed, offering trial instead');
        return activateTrialSubscription();
      }
      // Otherwise return payment error
      return res.status(500).json({ 
        success: false, 
        error: 'Payment service unavailable. Please try again later.',
        requiresPayment: true
      });
    }

    if (!paymentSession || !paymentSession.success) {
      console.log('⚠️ Payment session creation failed:', paymentSession?.error || 'No session returned');
      // Only fallback to trial if user hasn't used it before
      if (!hasUsedTrial) {
        return activateTrialSubscription();
      }
      return res.status(500).json({ 
        success: false, 
        error: paymentSession?.error || 'Failed to create payment session. Please try again.',
        requiresPayment: true
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
    const { Op } = require('sequelize');

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get active subscription from database
    const currentSubscription = await Subscription.findOne({
      where: { 
        userId,
        status: { [Op.in]: ['active', 'trial', 'past_due', 'cancelled'] }
      },
      order: [['createdAt', 'DESC']]
    });

    const plan = SUBSCRIPTION_TIERS[user.subscriptionTier] || SUBSCRIPTION_TIERS.free;

    // If user has DodoPayments subscription, fetch real data from their API
    let dodoSubscriptionData = null;
    if (currentSubscription?.dodoSubscriptionId) {
      try {
        const paymentService = require('../services/paymentService');
        dodoSubscriptionData = await paymentService.getSubscriptionDetails(currentSubscription.dodoSubscriptionId);
      } catch (error) {
        console.error('Failed to fetch DodoPayments subscription:', error);
        // Continue with database data if API fails
      }
    }

    // Use DodoPayments data if available, otherwise use database data
    const subscriptionData = dodoSubscriptionData || {
      status: currentSubscription?.status || user.subscriptionStatus || 'free',
      current_period_end: currentSubscription?.endDate || user.subscriptionEndDate,
      current_period_start: currentSubscription?.startDate || user.subscriptionStartDate,
      cancel_at_period_end: currentSubscription?.cancelAtPeriodEnd || false,
      product: {
        name: plan.name,
        price: plan.price
      }
    };

    // Calculate next billing date
    let nextBillingDate = null;
    if (subscriptionData.current_period_end && subscriptionData.status === 'active') {
      nextBillingDate = new Date(subscriptionData.current_period_end);
    } else if (user.subscriptionEndDate && user.subscriptionStatus === 'active') {
      nextBillingDate = new Date(user.subscriptionEndDate);
    }

    // Get actual payment method from subscription record or DodoPayments
    let paymentMethod = 'Not set';
    if (dodoSubscriptionData?.payment_method) {
      paymentMethod = `${dodoSubscriptionData.payment_method.type} ending in ${dodoSubscriptionData.payment_method.last4}`;
    } else if (currentSubscription?.paymentMethod) {
      paymentMethod = currentSubscription.paymentMethod;
    }

    // Last payment date from subscription or user record
    const lastPaymentDate = currentSubscription?.startDate || user.subscriptionStartDate;

    // Return direct object (no success/data wrapper) to match frontend BillingInfo interface
    res.json({
      currentPlan: {
        name: plan.name,
        tier: user.subscriptionTier,
        price: plan.price,
        interval: plan.interval,
        status: subscriptionData.status || user.subscriptionStatus || 'free'
      },
      billing: {
        nextBillingDate,
        amount: plan.price,
        currency: 'USD',
        interval: plan.interval,
        paymentMethod,
        lastPaymentDate
      },
      subscription: {
        startDate: subscriptionData.current_period_start || user.subscriptionStartDate,
        endDate: subscriptionData.current_period_end || user.subscriptionEndDate,
        trialEndsAt: user.trialEndsAt,
        cancelAtPeriodEnd: subscriptionData.cancel_at_period_end || (user.subscriptionStatus === 'cancelled'),
        dodoSubscriptionId: currentSubscription?.dodoSubscriptionId || null
      }
    });

  } catch (error) {
    console.error('Failed to fetch billing info:', error);
    res.status(500).json({ error: 'Failed to fetch billing information' });
  }
};

// Get subscription history
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Get user for account creation date
    const user = await User.findByPk(userId, {
      attributes: ['id', 'createdAt', 'subscriptionTier', 'subscriptionStatus', 'subscriptionStartDate', 'trialEndsAt']
    });

    // Get subscription changes/transactions from Subscription model
    const subscriptions = await Subscription.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Get subscription-related events from Event model
    const Event = require('../models/Event');
    const { Op } = require('sequelize');
    const subscriptionEvents = await Event.findAll({
      where: {
        user_id: userId,
        event_name: {
          [Op.in]: [
            'subscription_created', 'subscription_upgraded', 'subscription_downgraded',
            'subscription_cancelled', 'subscription_renewed', 'trial_started',
            'payment_succeeded', 'payment_failed', 'trial_expired'
          ]
        }
      },
      order: [['timestamp', 'DESC']],
      limit: 20
    });

    const total = await Subscription.count({ where: { userId } });

    // Build comprehensive history
    const history = [];

    // Add subscription records
    subscriptions.forEach((sub, index) => {
      const plan = SUBSCRIPTION_TIERS[sub.tier] || SUBSCRIPTION_TIERS.free;
      const previousSub = subscriptions[index + 1];
      const actionType = getActionType(sub);
      
      let type = 'renewed';
      if (actionType === 'subscribed' || actionType === 'trial_started') {
        type = 'upgrade';
      } else if (actionType === 'upgraded') {
        type = 'upgrade';
      } else if (actionType === 'downgraded') {
        type = 'downgrade';
      } else if (actionType === 'cancelled' || actionType === 'expired') {
        type = 'cancelled';
      }
      
      history.push({
        id: sub.id,
        type,
        fromPlan: previousSub ? (SUBSCRIPTION_TIERS[previousSub.tier]?.name || 'Free Plan') : 'Free Plan',
        toPlan: plan.name,
        date: sub.createdAt,
        amount: plan.price,
        tier: sub.tier,
        status: sub.status,
        interval: plan.interval,
        source: 'subscription'
      });
    });

    // Add events that aren't duplicates of subscription records
    subscriptionEvents.forEach(event => {
      const eventDate = new Date(event.timestamp);
      const isDuplicate = history.some(h => {
        const historyDate = new Date(h.date);
        return Math.abs(historyDate - eventDate) < 60000; // Within 1 minute
      });

      if (!isDuplicate) {
        const props = event.properties || {};
        let type = 'renewed';
        let fromPlan = 'Free Plan';
        let toPlan = props.plan_name || props.tier || 'Unknown';
        
        if (event.event_name.includes('trial_started')) {
          type = 'upgrade';
          toPlan = 'Pro Plan (Trial)';
        } else if (event.event_name.includes('upgraded') || event.event_name.includes('created')) {
          type = 'upgrade';
        } else if (event.event_name.includes('downgraded')) {
          type = 'downgrade';
        } else if (event.event_name.includes('cancelled') || event.event_name.includes('expired')) {
          type = 'cancelled';
        } else if (event.event_name.includes('payment_succeeded')) {
          type = 'renewed';
          toPlan = props.plan_name || 'Pro Plan';
        }

        history.push({
          id: event.id,
          type,
          fromPlan,
          toPlan,
          date: event.timestamp,
          amount: props.amount || 0,
          source: 'event',
          eventName: event.event_name
        });
      }
    });

    // Add account creation as the first event if no other history
    if (user && (history.length === 0 || !history.some(h => h.type === 'account_created'))) {
      history.push({
        id: `account_${user.id}`,
        type: 'account_created',
        fromPlan: null,
        toPlan: 'Free Plan',
        date: user.createdAt,
        amount: 0,
        source: 'account'
      });
    }

    // Sort by date descending
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply pagination
    const paginatedHistory = history.slice(offset, offset + limit);

    res.json({
      history: paginatedHistory,
      pagination: {
        total: history.length,
        limit,
        offset,
        hasMore: offset + limit < history.length
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
  if (tierConfig.features.monthlyQueries === -1 || tierConfig.features.dailyQueries === -1) {
    const totalUsed = await ErrorQuery.count({
      where: { userId }
    });

    return {
      queriesUsed: totalUsed,
      queriesLimit: -1, // -1 means unlimited
      queriesRemaining: 'unlimited',
      percentage: 0, // No percentage for unlimited
      dailyLimit: 'unlimited',
      resetTime: null,
      planType: tier
    };
  }

  // For free plan - use monthly limit (50) or daily limit
  const monthlyLimit = tierConfig.features.monthlyQueries || 50;
  
  // Get start of current month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const nextMonth = new Date(startOfMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const monthlyUsed = await ErrorQuery.count({
    where: {
      userId,
      createdAt: {
        [Op.gte]: startOfMonth,
        [Op.lt]: nextMonth
      }
    }
  });

  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
  const percentage = Math.min(100, (monthlyUsed / monthlyLimit) * 100);

  return {
    queriesUsed: monthlyUsed,
    queriesLimit: monthlyLimit,
    queriesRemaining: monthlyRemaining,
    percentage: percentage, // Frontend needs this!
    dailyLimit: tierConfig.features.dailyQueries || monthlyLimit,
    resetTime: nextMonth.toISOString(),
    planType: 'free',
    limitReached: monthlyRemaining === 0
  };
}

// Helper function to get features by tier (returns format expected by frontend)
function getFeaturesByTier(tier) {
  const tierConfig = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
  const features = tierConfig.features;
  
  // Return simplified feature flags for frontend UsageStats interface
  return {
    errorExplanation: features.errorExplanation || features.basicErrorExplanations || true,
    fixSuggestions: features.fixSuggestions || tier !== 'free',
    codeExamples: features.codeExamples || tier !== 'free',
    exportHistory: features.exportToJSON || features.exportToCSV || tier !== 'free',
    teamFeatures: features.teamFeatures || tier === 'team'
  };
}

// ============================================================================
// EDGE CASE HANDLERS - Upgrade, Downgrade, Pause, Resume, Payment Failures
// ============================================================================

/**
 * Upgrade subscription with proration
 * POST /api/subscriptions/upgrade
 */
exports.upgradeSubscription = async (req, res) => {
  try {
    const { targetTier, paymentMethod } = req.body;
    
    if (!targetTier || !['pro', 'team'].includes(targetTier)) {
      return res.status(400).json({ error: 'Invalid target tier' });
    }
    
    // Block Team plan upgrades - Coming Soon
    if (targetTier === 'team') {
      return res.status(400).json({ 
        error: 'Team plan is coming soon! Currently only Pro plan is available for upgrade.',
        comingSoon: true,
        availablePlans: ['pro']
      });
    }
    
    const user = await User.findByPk(req.user.id);
    const currentTier = user.subscriptionTier || 'free';
    
    if (currentTier === targetTier) {
      return res.status(400).json({ error: 'Already on this tier' });
    }
    
    // Prevent downgrade through upgrade endpoint
    const tierOrder = { free: 0, pro: 1, team: 2 };
    if (tierOrder[targetTier] <= tierOrder[currentTier]) {
      return res.status(400).json({ error: 'Use downgrade endpoint for downgrades' });
    }
    
    const result = await subscriptionService.processUpgrade(
      user,
      currentTier,
      targetTier,
      paymentMethod
    );
    
    logger.info(`Subscription upgraded successfully`, {
      userId: user.id,
      fromTier: currentTier,
      toTier: targetTier
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Upgrade failed:', error);
    res.status(500).json({ 
      error: error.message || 'Upgrade failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Downgrade subscription (immediate or end-of-period)
 * POST /api/subscriptions/downgrade
 */
exports.downgradeSubscription = async (req, res) => {
  try {
    const { targetTier, immediate = false, reason } = req.body;
    
    if (!targetTier || !['free', 'pro'].includes(targetTier)) {
      return res.status(400).json({ error: 'Invalid target tier' });
    }
    
    const user = await User.findByPk(req.user.id);
    const currentTier = user.subscriptionTier || 'free';
    
    if (currentTier === targetTier) {
      return res.status(400).json({ error: 'Already on this tier' });
    }
    
    // Prevent upgrade through downgrade endpoint
    const tierOrder = { free: 0, pro: 1, team: 2 };
    if (tierOrder[targetTier] >= tierOrder[currentTier]) {
      return res.status(400).json({ error: 'Use upgrade endpoint for upgrades' });
    }
    
    const result = await subscriptionService.processDowngrade(
      user,
      currentTier,
      targetTier,
      immediate,
      reason
    );
    
    logger.info(`Subscription downgrade ${immediate ? 'completed' : 'scheduled'}`, {
      userId: user.id,
      fromTier: currentTier,
      toTier: targetTier,
      immediate
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Downgrade failed:', error);
    res.status(500).json({ 
      error: error.message || 'Downgrade failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Pause subscription
 * POST /api/subscriptions/pause
 */
exports.pauseSubscription = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active' }
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    
    if (user.subscriptionTier === 'free') {
      return res.status(400).json({ error: 'Cannot pause free tier' });
    }
    
    const result = await subscriptionService.pauseSubscription(subscription, user);
    
    logger.info(`Subscription paused`, {
      userId: user.id,
      subscriptionId: subscription.id
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Pause failed:', error);
    res.status(500).json({ 
      error: error.message || 'Pause failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Resume paused subscription
 * POST /api/subscriptions/resume
 */
exports.resumeSubscription = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'paused' }
    });
    
    if (!subscription) {
      return res.status(404).json({ error: 'No paused subscription found' });
    }
    
    const result = await subscriptionService.resumeSubscription(subscription, user);
    
    logger.info(`Subscription resumed`, {
      userId: user.id,
      subscriptionId: subscription.id
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Resume failed:', error);
    res.status(500).json({ 
      error: error.message || 'Resume failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Handle payment failure (webhook or manual)
 * POST /api/subscriptions/payment-failure
 */
exports.handlePaymentFailureEndpoint = async (req, res) => {
  try {
    const { subscriptionId, error: paymentError, attemptNumber = 1 } = req.body;
    
    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID required' });
    }
    
    const subscription = await Subscription.findByPk(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    const user = await User.findByPk(subscription.userId);
    
    const result = await subscriptionService.handlePaymentFailure(
      subscription,
      user,
      paymentError || { message: 'Payment failed' },
      attemptNumber
    );
    
    logger.info(`Payment failure handled`, {
      subscriptionId,
      userId: user.id,
      attemptNumber
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Payment failure handling error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to handle payment failure',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Get proration details for upgrade (preview)
 * GET /api/subscriptions/proration-preview?targetTier=pro
 */
exports.getProrationPreview = async (req, res) => {
  try {
    const { targetTier } = req.query;
    
    if (!targetTier) {
      return res.status(400).json({ error: 'Target tier required' });
    }
    
    const user = await User.findByPk(req.user.id);
    const currentTier = user.subscriptionTier || 'free';
    
    if (currentTier === targetTier) {
      return res.status(400).json({ error: 'Already on this tier' });
    }
    
    // Calculate days remaining
    const subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active' }
    });
    
    const daysRemaining = subscription && subscription.endDate
      ? Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const proration = subscriptionService.calculateProration(
      currentTier,
      targetTier,
      daysRemaining
    );
    
    res.json({
      preview: true,
      ...proration
    });
  } catch (error) {
    logger.error('Proration preview failed:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to calculate proration',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


