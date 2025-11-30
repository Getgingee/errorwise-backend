/**
 * Compare Plans Controller (E2)
 * 
 * Provides plan comparison data for modal/page.
 * Tracks modal opens vs upgrade clicks.
 * 
 * @ticket E2 – Compare Plans Modal
 * @epic EPIC E — Conversion Optimisation
 */

const User = require('../models/User');
const Event = require('../models/Event');
const eventTracking = require('../services/eventTrackingService');
const { Op } = require('sequelize');

// Event constants for E2
const COMPARE_EVENTS = {
  COMPARE_MODAL_OPENED: 'compare_modal_opened',
  COMPARE_PLAN_SELECTED: 'compare_plan_selected',
  COMPARE_UPGRADE_CLICKED: 'compare_upgrade_clicked'
};

// Plan definitions
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: 'Free forever',
    description: 'Perfect for trying out ErrorWise',
    queryLimit: 50,
    features: [
      { text: '50 queries per month', included: true, highlight: false },
      { text: 'Basic AI models', included: true, highlight: false },
      { text: '7-day error history', included: true, highlight: false },
      { text: 'Community support', included: true, highlight: false },
      { text: 'Advanced AI (Claude, GPT-4)', included: false, highlight: false },
      { text: 'Unlimited queries', included: false, highlight: false },
      { text: 'Priority support', included: false, highlight: false },
      { text: 'Team features', included: false, highlight: false }
    ],
    cta: 'Current Plan',
    ctaVariant: 'outline'
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 3,
    yearlyPrice: 30,
    priceLabel: '$3/month',
    yearlyPriceLabel: '$30/year (save 17%)',
    description: 'For serious developers',
    queryLimit: -1, // unlimited
    popular: true,
    features: [
      { text: 'Unlimited queries', included: true, highlight: true },
      { text: 'Advanced AI models (Claude, GPT-4)', included: true, highlight: true },
      { text: 'Unlimited error history', included: true, highlight: false },
      { text: 'Priority email support', included: true, highlight: false },
      { text: 'Follow-up questions', included: true, highlight: true },
      { text: 'Code snippets & examples', included: true, highlight: false },
      { text: 'Export history', included: true, highlight: false },
      { text: 'Team features', included: false, highlight: false }
    ],
    cta: 'Upgrade to Pro',
    ctaVariant: 'primary'
  },
  team: {
    id: 'team',
    name: 'Team',
    price: 8,
    yearlyPrice: 80,
    priceLabel: '$8/month',
    yearlyPriceLabel: '$80/year (save 17%)',
    description: 'For teams up to 10',
    queryLimit: -1, // unlimited
    features: [
      { text: 'Everything in Pro', included: true, highlight: false },
      { text: 'Up to 10 team members', included: true, highlight: true },
      { text: 'Shared error library', included: true, highlight: true },
      { text: 'Team analytics dashboard', included: true, highlight: false },
      { text: 'Priority support', included: true, highlight: false },
      { text: 'Admin controls', included: true, highlight: false },
      { text: 'SSO (coming soon)', included: true, highlight: false },
      { text: 'Custom integrations', included: true, highlight: false }
    ],
    cta: 'Upgrade to Team',
    ctaVariant: 'secondary'
  }
};

// One-time query packs (E2 mentions this)
const QUERY_PACKS = [
  {
    id: 'pack_50',
    queries: 50,
    price: 5,
    priceLabel: '$5',
    pricePerQuery: '$0.10',
    popular: false,
    description: 'Small pack for occasional use'
  },
  {
    id: 'pack_150',
    queries: 150,
    price: 12,
    priceLabel: '$12',
    pricePerQuery: '$0.08',
    popular: true,
    description: 'Best value for regular users'
  },
  {
    id: 'pack_500',
    queries: 500,
    price: 30,
    priceLabel: '$30',
    pricePerQuery: '$0.06',
    popular: false,
    description: 'Bulk pack for power users'
  }
];

/**
 * Get plan comparison data
 * GET /api/plans/compare
 */
async function getPlansComparison(req, res) {
  try {
    const userId = req.user?.id;
    let currentTier = 'free';
    
    if (userId) {
      const user = await User.findByPk(userId);
      currentTier = user?.subscriptionTier || 'free';
    }
    
    // Mark current plan
    const plans = Object.values(PLANS).map(plan => ({
      ...plan,
      isCurrent: plan.id === currentTier,
      cta: plan.id === currentTier ? 'Current Plan' : plan.cta,
      disabled: plan.id === currentTier
    }));
    
    // Comparison table for easier rendering
    const comparisonTable = {
      headers: ['Feature', 'Free', 'Pro', 'Team'],
      rows: [
        ['Monthly queries', '50', 'Unlimited', 'Unlimited'],
        ['AI Models', 'Basic', 'Advanced', 'Advanced'],
        ['Error history', '7 days', 'Unlimited', 'Unlimited'],
        ['Follow-up questions', '❌', '✅', '✅'],
        ['Priority support', '❌', 'Email', 'Priority'],
        ['Team members', '1', '1', 'Up to 10'],
        ['Shared library', '❌', '❌', '✅'],
        ['Team analytics', '❌', '❌', '✅']
      ]
    };
    
    res.json({
      success: true,
      currentTier,
      plans,
      queryPacks: QUERY_PACKS,
      comparisonTable,
      faq: [
        {
          q: 'Can I switch plans anytime?',
          a: 'Yes! You can upgrade or downgrade at any time. Changes take effect immediately.'
        },
        {
          q: 'What happens to unused queries?',
          a: 'Free tier queries reset monthly. Query packs never expire.'
        },
        {
          q: 'Is there a refund policy?',
          a: 'Yes, we offer a 7-day money-back guarantee for all paid plans.'
        }
      ]
    });
    
  } catch (error) {
    console.error('Error getting plans comparison:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
}

/**
 * Track compare modal opened
 * POST /api/plans/track-modal-open
 */
async function trackModalOpen(req, res) {
  try {
    const userId = req.user?.id;
    const { source, page } = req.body;
    
    await eventTracking.trackEvent({
      eventName: COMPARE_EVENTS.COMPARE_MODAL_OPENED,
      userId,
      properties: {
        source: source || 'unknown', // 'header', 'limit_banner', 'footer', etc.
        page: page || 'unknown'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id'],
      page
    });
    
    res.json({
      success: true,
      message: 'Modal open tracked'
    });
    
  } catch (error) {
    console.error('Error tracking modal open:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Track plan selected in comparison
 * POST /api/plans/track-select
 */
async function trackPlanSelected(req, res) {
  try {
    const userId = req.user?.id;
    const { planId, billingCycle } = req.body;
    
    if (!planId || !['free', 'pro', 'team'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }
    
    await eventTracking.trackEvent({
      eventName: COMPARE_EVENTS.COMPARE_PLAN_SELECTED,
      userId,
      properties: {
        planId,
        billingCycle: billingCycle || 'monthly'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });
    
    res.json({
      success: true,
      message: 'Plan selection tracked'
    });
    
  } catch (error) {
    console.error('Error tracking plan selection:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Track upgrade clicked from comparison
 * POST /api/plans/track-upgrade-click
 */
async function trackUpgradeFromComparison(req, res) {
  try {
    const userId = req.user?.id;
    const { planId, billingCycle, isQueryPack, packId } = req.body;
    
    const user = userId ? await User.findByPk(userId) : null;
    
    await eventTracking.trackEvent({
      eventName: COMPARE_EVENTS.COMPARE_UPGRADE_CLICKED,
      userId,
      properties: {
        planId,
        billingCycle: billingCycle || 'monthly',
        isQueryPack: isQueryPack || false,
        packId: packId || null,
        currentTier: user?.subscriptionTier || 'free'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });
    
    // Also track as regular upgrade click
    if (userId && !isQueryPack) {
      await eventTracking.trackUpgradeClicked(userId, {
        source: 'compare_modal',
        currentTier: user?.subscriptionTier || 'free',
        targetTier: planId,
        billingCycle
      });
    }
    
    res.json({
      success: true,
      message: 'Upgrade click tracked'
    });
    
  } catch (error) {
    console.error('Error tracking upgrade click:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
}

/**
 * Get compare modal analytics (admin)
 * GET /api/plans/analytics
 */
async function getCompareAnalytics(req, res) {
  try {
    // Admin only
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const period = req.query.period || 'week';
    const thresholds = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    
    const since = new Date(Date.now() - (thresholds[period] || thresholds.week));
    
    const [modalOpens, planSelections, upgradeClicks] = await Promise.all([
      Event.count({
        where: {
          event_name: COMPARE_EVENTS.COMPARE_MODAL_OPENED,
          timestamp: { [Op.gte]: since }
        }
      }),
      Event.count({
        where: {
          event_name: COMPARE_EVENTS.COMPARE_PLAN_SELECTED,
          timestamp: { [Op.gte]: since }
        }
      }),
      Event.count({
        where: {
          event_name: COMPARE_EVENTS.COMPARE_UPGRADE_CLICKED,
          timestamp: { [Op.gte]: since }
        }
      })
    ]);
    
    // Breakdown by plan
    const clicksByPlan = await Event.findAll({
      where: {
        event_name: COMPARE_EVENTS.COMPARE_UPGRADE_CLICKED,
        timestamp: { [Op.gte]: since }
      },
      attributes: [
        [Event.sequelize.literal("properties->>'planId'"), 'planId'],
        [Event.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [Event.sequelize.literal("properties->>'planId'")],
      raw: true
    });
    
    // Calculate conversion funnel
    const modalToClickRate = modalOpens > 0 
      ? ((upgradeClicks / modalOpens) * 100).toFixed(2) + '%' 
      : '0%';
    
    res.json({
      success: true,
      period,
      since: since.toISOString(),
      metrics: {
        modalOpens,
        planSelections,
        upgradeClicks,
        modalToClickRate
      },
      byPlan: clicksByPlan.reduce((acc, r) => { 
        acc[r.planId] = parseInt(r.count); 
        return acc; 
      }, {})
    });
    
  } catch (error) {
    console.error('Error getting compare analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
}

module.exports = {
  getPlansComparison,
  trackModalOpen,
  trackPlanSelected,
  trackUpgradeFromComparison,
  getCompareAnalytics,
  PLANS,
  QUERY_PACKS,
  COMPARE_EVENTS
};
