/**
 * Subscription Plans Controller
 * Handles fetching pricing plans from Dodo Payments or database
 */

/**
 * Get all subscription plans
 * @route GET /api/subscriptions/plans
 */
exports.getPlans = async (req, res) => {
  try {
    // Fetch plans from environment config
    // In production, this would fetch from Dodo Payments API or database
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        description: 'Perfect for getting started',
        features: [
          'Up to 100 error analyses per month',
          'Basic AI model access',
          'Standard response time',
          'Email support',
          'Community access'
        ],
        isPopular: false,
        limits: {
          errorAnalysesPerMonth: 100,
          teamMembers: 1
        }
      },
      {
        id: process.env.DODO_PRO_PLAN_ID || 'pro',
        productId: process.env.DODO_PRO_PRODUCT_ID,
        name: 'Pro',
        price: 3,
        currency: 'USD',
        interval: 'month',
        description: 'For professional developers',
        features: [
          'Unlimited error analyses',
          'Advanced AI models (GPT-4, Claude, etc.)',
          'Priority support',
          'Code context understanding',
          'Integration with CI/CD',
          'Advanced analytics dashboard'
        ],
        isPopular: true,
        limits: {
          errorAnalysesPerMonth: -1, // Unlimited
          teamMembers: 1
        },
        dodoPlanId: process.env.DODO_PRO_PLAN_ID
      },
      {
        id: process.env.DODO_TEAM_PLAN_ID || 'team',
        name: 'Team',
        price: null, // Custom pricing
        currency: 'USD',
        interval: 'month',
        description: 'For development teams',
        features: [
          'Everything in Pro',
          'Unlimited team members',
          'Shared error library',
          'Team analytics',
          'SSO & SAML',
          'Priority email & chat support',
          'Custom integrations',
          'Service Level Agreement (SLA)'
        ],
        isPopular: false,
        limits: {
          errorAnalysesPerMonth: -1, // Unlimited
          teamMembers: -1 // Unlimited
        },
        dodoPlanId: process.env.DODO_TEAM_PLAN_ID,
        contactRequired: true
      }
    ];

    res.json({
      success: true,
      plans: plans,
      currency: 'USD'
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription plans',
      message: error.message
    });
  }
};

/**
 * Get a specific plan by ID
 * @route GET /api/subscriptions/plans/:planId
 */
exports.getPlanById = async (req, res) => {
  try {
    const { planId } = req.params;

    // In production, query database or Dodo Payments API
    const allPlans = [
      { id: 'free', name: 'Free', price: 0 },
      { id: process.env.DODO_PRO_PLAN_ID, name: 'Pro', price: 3 },
      { id: process.env.DODO_TEAM_PLAN_ID, name: 'Team', price: null }
    ];

    const plan = allPlans.find(p => p.id === planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }

    res.json({
      success: true,
      plan: plan
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan',
      message: error.message
    });
  }
};

/**
 * Get Dodo Payments configuration
 * @route GET /api/subscriptions/config
 */
exports.getDodoConfig = async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        proPlanId: process.env.DODO_PRO_PLAN_ID,
        proProductId: process.env.DODO_PRO_PRODUCT_ID,
        teamPlanId: process.env.DODO_TEAM_PLAN_ID,
        // Don't expose sensitive keys
        hasApiKey: !!process.env.DODO_PAYMENTS_API_KEY
      }
    });
  } catch (error) {
    console.error('Error fetching Dodo config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configuration'
    });
  }
};
