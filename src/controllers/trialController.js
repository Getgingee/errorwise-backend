/**
 * Trial Controller
 * 
 * Handles 7-day trial flow with Dodo Payments:
 * 1. User starts trial -> Creates Dodo checkout with $0 initial, card capture
 * 2. User completes checkout -> Trial activates for 7 days
 * 3. User can cancel anytime during trial -> No charge
 * 4. Trial ends -> Dodo auto-charges the subscription price
 * 
 * Trial State Machine:
 * - none: No trial (free user)
 * - pending: Checkout created, awaiting card capture
 * - active: Trial running, user has Pro/Team features
 * - converted: Trial ended, user paid, now active subscription
 * - cancelled: User cancelled during trial, no charge
 * - expired: Trial ended without conversion (edge case)
 */

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const paymentService = require('../services/paymentService');
const emailService = require('../services/emailService');

// Trial configuration
const TRIAL_CONFIG = {
  durationDays: 7,
  gracePeriodHours: 24, // Extra time before auto-charge if payment fails
  reminderDays: [3, 1], // Send reminders at 3 days and 1 day before trial ends
  plans: {
    pro: {
      name: 'Pro Plan',
      price: 3,
      dodoProductId: process.env.DODO_PRO_PRODUCT_ID || 'pdt_OKdKW76gtO6vBWltBBV5d'
    },
    team: {
      name: 'Team Plan', 
      price: 8,
      dodoProductId: process.env.DODO_TEAM_PRODUCT_ID || 'pdt_Zbn5YM2pCgkKcdQyV0ouY'
    }
  }
};

/**
 * Start Trial Flow
 * POST /api/trial/start
 * 
 * Creates a Dodo checkout session with:
 * - $0 initial charge (trial)
 * - Payment method capture for future billing
 * - 7-day trial period
 * - Auto-charge at trial end
 */
exports.startTrial = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { planId = 'pro' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate plan
    const plan = TRIAL_CONFIG.plans[planId];
    if (!plan) {
      return res.status(400).json({ 
        error: 'Invalid plan', 
        validPlans: Object.keys(TRIAL_CONFIG.plans) 
      });
    }

    // Get user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check eligibility
    const eligibility = await checkTrialEligibility(user);
    if (!eligibility.eligible) {
      return res.status(400).json({
        error: 'Not eligible for trial',
        reason: eligibility.reason,
        code: eligibility.code
      });
    }

    // Check for existing pending trial
    const existingTrial = await Subscription.findOne({
      where: { 
        userId,
        trialStatus: ['pending', 'active']
      }
    });

    if (existingTrial) {
      if (existingTrial.trialStatus === 'active') {
        return res.status(400).json({
          error: 'Trial already active',
          trialEndDate: existingTrial.trialEndDate,
          daysRemaining: Math.ceil((new Date(existingTrial.trialEndDate) - new Date()) / (1000 * 60 * 60 * 24))
        });
      }
      // If pending, we'll create a new session
    }

    // Create Dodo checkout session with trial
    console.log('🎁 Starting trial checkout for:', { userId, planId, email: user.email?.substring(0, 5) + '***' });

    const successUrl = `${process.env.FRONTEND_URL}/dashboard?trial=started&plan=${planId}`;
    const cancelUrl = `${process.env.FRONTEND_URL}/pricing?trial=cancelled`;

    const checkoutResult = await paymentService.createTrialCheckout({
      userId: user.id,
      userEmail: user.email,
      planId,
      planName: plan.name,
      productId: plan.dodoProductId,
      price: plan.price,
      trialDays: TRIAL_CONFIG.durationDays,
      successUrl,
      cancelUrl
    });

    if (!checkoutResult.success) {
      console.error('❌ Trial checkout creation failed:', checkoutResult.error);
      return res.status(500).json({
        error: 'Could not create trial checkout',
        message: checkoutResult.error
      });
    }

    // Create or update subscription record with trial_pending status
    const [subscription] = await Subscription.upsert({
      userId,
      tier: 'free', // Still free until checkout completes
      status: 'pending',
      trialStatus: 'pending',
      trialPlanId: planId,
      dodoSessionId: checkoutResult.sessionId,
      paymentMethodCaptured: false
    }, {
      returning: true
    });

    console.log('✅ Trial checkout created:', {
      sessionId: checkoutResult.sessionId,
      planId,
      userId
    });

    res.status(201).json({
      success: true,
      message: 'Trial checkout created',
      checkoutUrl: checkoutResult.sessionUrl,
      sessionId: checkoutResult.sessionId,
      plan: {
        id: planId,
        name: plan.name,
        price: plan.price,
        trialDays: TRIAL_CONFIG.durationDays
      }
    });

  } catch (error) {
    console.error('❌ Start trial error:', error);
    res.status(500).json({ 
      error: 'Failed to start trial',
      message: error.message 
    });
  }
};

/**
 * Get Trial Status
 * GET /api/trial/status
 * 
 * Returns current trial state and remaining days
 */
exports.getTrialStatus = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate trial info based on user's trialEndsAt field
    const now = new Date();
    let trialInfo = {
      hasActiveTrial: false,
      trialStatus: 'none',
      trialPlan: null,
      trialStartDate: null,
      trialEndDate: null,
      daysRemaining: 0,
      hoursRemaining: 0,
      canStartTrial: false,
      canCancelTrial: false,
      willAutoCharge: false,
      chargeAmount: 0,
      chargeCurrency: 'USD'
    };

    // Check if user has used trial before
    if (user.hasUsedTrial) {
      trialInfo.trialStatus = 'used';
      trialInfo.canStartTrial = false;
      trialInfo.eligibilityReason = 'Trial already used';
    } else if (user.subscriptionTier && user.subscriptionTier !== 'free') {
      // Already on paid plan
      trialInfo.trialStatus = 'not_needed';
      trialInfo.canStartTrial = false;
      trialInfo.eligibilityReason = 'Already subscribed';
    } else if (user.trialEndsAt) {
      // Has trial date set
      const trialEnd = new Date(user.trialEndsAt);
      const msRemaining = trialEnd - now;
      
      if (msRemaining > 0) {
        // Active trial
        trialInfo.hasActiveTrial = true;
        trialInfo.trialStatus = 'active';
        trialInfo.trialEndDate = user.trialEndsAt;
        trialInfo.daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
        trialInfo.hoursRemaining = Math.ceil(msRemaining / (1000 * 60 * 60));
        trialInfo.canCancelTrial = true;
        trialInfo.canStartTrial = false;
      } else {
        // Trial expired
        trialInfo.trialStatus = 'expired';
        trialInfo.trialEndDate = user.trialEndsAt;
        trialInfo.canStartTrial = false;
        trialInfo.eligibilityReason = 'Trial expired';
      }
    } else {
      // Never started trial
      trialInfo.canStartTrial = true;
      trialInfo.eligibilityReason = 'Eligible for 7-day trial';
    }

    res.json({
      success: true,
      trial: trialInfo,
      user: {
        tier: user.subscriptionTier || 'free',
        status: user.subscriptionStatus || 'active'
      }
    });

  } catch (error) {
    console.error('❌ Get trial status error:', error);
    res.status(500).json({ 
      error: 'Failed to get trial status',
      message: error.message 
    });
  }
};

/**
 * Cancel Trial
 * POST /api/trial/cancel
 * 
 * Cancels active trial before it converts to paid subscription
 */
exports.cancelTrial = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await User.findByPk(userId);
    const subscription = await Subscription.findOne({
      where: { 
        userId,
        trialStatus: 'active'
      }
    });

    if (!subscription) {
      return res.status(404).json({ 
        error: 'No active trial found',
        code: 'NO_ACTIVE_TRIAL'
      });
    }

    // Cancel with Dodo Payments if we have a subscription ID
    if (subscription.dodoSubscriptionId) {
      try {
        await paymentService.cancelSubscription(subscription.dodoSubscriptionId);
        console.log('✅ Cancelled Dodo subscription:', subscription.dodoSubscriptionId);
      } catch (dodoError) {
        console.error('⚠️ Failed to cancel with Dodo:', dodoError.message);
        // Continue with local cancellation even if Dodo fails
      }
    }

    // Update subscription record
    await subscription.update({
      status: 'cancelled',
      trialStatus: 'cancelled',
      trialCancelledAt: new Date(),
      cancelReason: reason || 'User cancelled during trial',
      cancelAtPeriodEnd: false
    });

    // Downgrade user to free tier
    await user.update({
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      hasUsedTrial: true // Mark that they used their trial
    });

    // Send cancellation confirmation email
    try {
      await emailService.sendTrialCancelledEmail(
        user.email,
        user.username,
        subscription.trialEndDate
      );
    } catch (emailError) {
      console.error('Failed to send trial cancellation email:', emailError);
    }

    console.log('✅ Trial cancelled for user:', userId);

    res.json({
      success: true,
      message: 'Trial cancelled successfully',
      newTier: 'free',
      refunded: true // No charge was made during trial
    });

  } catch (error) {
    console.error('❌ Cancel trial error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel trial',
      message: error.message 
    });
  }
};

/**
 * Verify Trial Checkout (called after Dodo redirect)
 * POST /api/trial/verify
 */
exports.verifyTrialCheckout = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { sessionId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const subscription = await Subscription.findOne({
      where: { 
        userId,
        dodoSessionId: sessionId
      }
    });

    if (!subscription) {
      return res.status(404).json({ 
        error: 'Trial session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Check with Dodo if the checkout was completed
    const checkoutStatus = await paymentService.getCheckoutStatus(sessionId);

    if (checkoutStatus.completed) {
      // Activate trial
      const now = new Date();
      const trialEndDate = new Date(now);
      trialEndDate.setDate(trialEndDate.getDate() + TRIAL_CONFIG.durationDays);

      await subscription.update({
        status: 'trial',
        trialStatus: 'active',
        trialStartDate: now,
        trialEndDate: trialEndDate,
        paymentMethodCaptured: true,
        dodoSubscriptionId: checkoutStatus.subscriptionId,
        dodoCustomerId: checkoutStatus.customerId,
        tier: subscription.trialPlanId // Upgrade tier to trial plan
      });

      const user = await User.findByPk(userId);
      await user.update({
        subscriptionTier: subscription.trialPlanId,
        subscriptionStatus: 'trial',
        subscriptionStartDate: now,
        trialEndsAt: trialEndDate
      });

      // Send trial started email
      try {
        await emailService.sendTrialStartedEmail(
          user.email,
          user.username,
          trialEndDate
        );
      } catch (emailError) {
        console.error('Failed to send trial started email:', emailError);
      }

      console.log('✅ Trial activated for user:', userId, 'ends:', trialEndDate);

      return res.json({
        success: true,
        message: 'Trial activated successfully',
        trial: {
          status: 'active',
          plan: subscription.trialPlanId,
          startDate: now,
          endDate: trialEndDate,
          daysRemaining: TRIAL_CONFIG.durationDays
        }
      });
    }

    // Checkout not completed yet
    res.json({
      success: false,
      message: 'Checkout not yet completed',
      status: checkoutStatus.status || 'pending'
    });

  } catch (error) {
    console.error('❌ Verify trial checkout error:', error);
    res.status(500).json({ 
      error: 'Failed to verify trial',
      message: error.message 
    });
  }
};

/**
 * Get Trial Eligibility
 * GET /api/trial/eligibility
 */
exports.checkEligibility = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await User.findByPk(userId);
    const eligibility = await checkTrialEligibility(user);

    res.json({
      success: true,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      code: eligibility.code,
      plans: Object.keys(TRIAL_CONFIG.plans).map(planId => ({
        id: planId,
        name: TRIAL_CONFIG.plans[planId].name,
        price: TRIAL_CONFIG.plans[planId].price,
        trialDays: TRIAL_CONFIG.durationDays
      }))
    });

  } catch (error) {
    console.error('❌ Check eligibility error:', error);
    res.status(500).json({ 
      error: 'Failed to check eligibility',
      message: error.message 
    });
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is eligible for trial
 */
async function checkTrialEligibility(user) {
  // Already on paid plan
  if (user.subscriptionTier !== 'free') {
    return {
      eligible: false,
      reason: 'You already have an active subscription',
      code: 'ALREADY_SUBSCRIBED'
    };
  }

  // Already used trial before
  if (user.hasUsedTrial) {
    return {
      eligible: false,
      reason: 'You have already used your free trial',
      code: 'TRIAL_ALREADY_USED'
    };
  }

  // Check for active/pending trial
  const existingTrial = await Subscription.findOne({
    where: { 
      userId: user.id,
      trialStatus: ['pending', 'active']
    }
  });

  if (existingTrial) {
    if (existingTrial.trialStatus === 'active') {
      return {
        eligible: false,
        reason: 'You have an active trial',
        code: 'TRIAL_ACTIVE'
      };
    }
    if (existingTrial.trialStatus === 'pending') {
      return {
        eligible: false,
        reason: 'You have a pending trial checkout',
        code: 'TRIAL_PENDING'
      };
    }
  }

  // Check for past trials (converted or cancelled)
  const pastTrial = await Subscription.findOne({
    where: { 
      userId: user.id,
      trialStatus: ['converted', 'cancelled', 'expired']
    }
  });

  if (pastTrial) {
    return {
      eligible: false,
      reason: 'You have already used your free trial',
      code: 'TRIAL_ALREADY_USED'
    };
  }

  return {
    eligible: true,
    reason: 'Eligible for 7-day free trial',
    code: 'ELIGIBLE'
  };
}

/**
 * Handle trial activation from webhook
 * Called when Dodo sends subscription.active or checkout completed
 */
exports.activateTrialFromWebhook = async (webhookData) => {
  try {
    const { 
      session_id, 
      subscription_id, 
      customer_id,
      metadata 
    } = webhookData;

    const userId = metadata?.userId;
    if (!userId) {
      console.error('❌ No userId in webhook metadata');
      return { success: false, error: 'Missing userId' };
    }

    const subscription = await Subscription.findOne({
      where: { userId, dodoSessionId: session_id }
    });

    if (!subscription) {
      console.error('❌ No subscription found for session:', session_id);
      return { success: false, error: 'Subscription not found' };
    }

    // Already activated?
    if (subscription.trialStatus === 'active') {
      console.log('ℹ️ Trial already active for user:', userId);
      return { success: true, message: 'Already active' };
    }

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + TRIAL_CONFIG.durationDays);

    await subscription.update({
      status: 'trial',
      trialStatus: 'active',
      trialStartDate: now,
      trialEndDate: trialEndDate,
      paymentMethodCaptured: true,
      dodoSubscriptionId: subscription_id,
      dodoCustomerId: customer_id,
      tier: subscription.trialPlanId
    });

    const user = await User.findByPk(userId);
    if (user) {
      await user.update({
        subscriptionTier: subscription.trialPlanId,
        subscriptionStatus: 'trial',
        subscriptionStartDate: now,
        trialEndsAt: trialEndDate
      });

      // Send trial started email
      try {
        await emailService.sendTrialStartedEmail(
          user.email,
          user.username,
          trialEndDate
        );
      } catch (emailError) {
        console.error('Failed to send trial started email:', emailError);
      }
    }

    console.log('✅ [Webhook] Trial activated for user:', userId, 'ends:', trialEndDate);

    return { success: true, message: 'Trial activated' };

  } catch (error) {
    console.error('❌ activateTrialFromWebhook error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Handle trial conversion from webhook
 * Called when Dodo charges the card after trial ends
 */
exports.convertTrialFromWebhook = async (webhookData) => {
  try {
    const { subscription_id, payment_id } = webhookData;

    const subscription = await Subscription.findOne({
      where: { dodoSubscriptionId: subscription_id }
    });

    if (!subscription) {
      console.error('❌ No subscription found for:', subscription_id);
      return { success: false, error: 'Subscription not found' };
    }

    // Already converted?
    if (subscription.trialStatus === 'converted') {
      return { success: true, message: 'Already converted' };
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1); // Monthly billing

    await subscription.update({
      status: 'active',
      trialStatus: 'converted',
      trialConvertedAt: now,
      startDate: now,
      endDate: endDate,
      lastPaymentDate: now
    });

    const user = await User.findByPk(subscription.userId);
    if (user) {
      await user.update({
        subscriptionStatus: 'active',
        subscriptionStartDate: now,
        subscriptionEndDate: endDate,
        hasUsedTrial: true,
        trialEndsAt: null // Clear trial end date
      });

      // Send conversion email
      try {
        await emailService.sendTrialConvertedEmail(user, {
          planName: TRIAL_CONFIG.plans[subscription.trialPlanId]?.name || 'Pro Plan',
          amount: TRIAL_CONFIG.plans[subscription.trialPlanId]?.price || 3,
          nextBillingDate: endDate
        });
      } catch (emailError) {
        console.error('Failed to send trial converted email:', emailError);
      }
    }

    console.log('✅ [Webhook] Trial converted to paid for user:', subscription.userId);

    return { success: true, message: 'Trial converted' };

  } catch (error) {
    console.error('❌ convertTrialFromWebhook error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = exports;
