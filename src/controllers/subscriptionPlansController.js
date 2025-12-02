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
    // Comprehensive plans for everyday non-tech users
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        description: 'Get started with basic error help',
        tagline: 'Perfect for trying out ErrorWise',
        features: {
          // Queries
          monthlyQueries: 50,
          dailyQueries: 10,
          
          // Core Features
          errorExplanation: true,
          fixSuggestions: true,
          codeExamples: false,
          preventionTips: false,
          documentationLinks: false,
          
          // History
          errorHistory: true,
          historyDays: 7,
          exportHistory: false,
          
          // AI & Search
          aiModel: 'gemini-flash',
          aiTokens: 800,
          urlScrapingContext: false,
          webSearch: false,
          
          // Support
          supportLevel: 'community',
          responseTime: 'standard',
          
          // Advanced
          multiLanguage: false,
          advancedAnalysis: false,
          followUpQuestions: 0,
          
          // Team
          teamFeatures: false,
          teamMembers: 1
        },
        featureList: [
          '50 error solutions/month',
          '10 queries per day',
          'Plain English explanations',
          'Basic step-by-step fixes',
          '7-day history',
          'Community support',
          'Works with any error type'
        ],
        notIncluded: [
          'Unlimited queries',
          'Web search for latest solutions',
          'Follow-up questions',
          'Export history',
          'Multi-language support',
          'Advanced AI models'
        ],
        isPopular: false,
        limits: {
          errorAnalysesPerMonth: 50,
          errorAnalysesPerDay: 10,
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
        description: 'Unlimited help with any tech problem',
        tagline: 'Best for individuals who need reliable tech help',
        trialDays: 7,
        features: {
          // Queries
          monthlyQueries: -1, // Unlimited
          dailyQueries: -1,
          
          // Core Features
          errorExplanation: true,
          fixSuggestions: true,
          codeExamples: true,
          preventionTips: true,
          documentationLinks: true,
          
          // History
          errorHistory: true,
          historyDays: -1, // Unlimited
          exportHistory: true,
          
          // AI & Search
          aiModel: 'claude-haiku',
          aiTokens: 1500,
          urlScrapingContext: true,
          webSearch: true,
          
          // Support
          supportLevel: 'email',
          responseTime: 'priority',
          
          // Advanced
          multiLanguage: true,
          advancedAnalysis: true,
          followUpQuestions: 5,
          
          // Team
          teamFeatures: false,
          teamMembers: 1,
          
          // Pro Exclusive
          visualGuides: true,
          howToTutorials: true,
          latestUpdates: true,
          indiaSolutions: true,
          savedSolutions: true,
          libraryAccess: true
        },
        featureList: [
          'UNLIMITED error solutions',
          'Ask anything about tech',
          'Web search for latest fixes',
          '5 follow-up questions per query',
          'Visual guides & screenshots',
          'How-to tutorials',
          'Prevention tips',
          'Multi-language support (10+ languages)',
          'Unlimited history storage',
          'Export to JSON/CSV',
          'Save solutions to your library',
          'Faster AI responses',
          'Email support',
          'India-specific solutions'
        ],
        highlights: [
          'Unlimited queries',
          'Web search enabled',
          'Follow-up questions',
          'Save your solutions'
        ],
        isPopular: true,
        limits: {
          errorAnalysesPerMonth: -1,
          errorAnalysesPerDay: -1,
          teamMembers: 1
        },
        dodoPlanId: process.env.DODO_PRO_PLAN_ID
      },
      {
        id: process.env.DODO_TEAM_PLAN_ID || 'team',
        productId: process.env.DODO_TEAM_PRODUCT_ID,
        name: 'Team',
        price: 8,
        currency: 'USD',
        interval: 'month',
        description: 'Share tech support with your team or family',
        tagline: 'Perfect for small businesses, offices, or families',
        trialDays: 14,
        features: {
          // Queries
          monthlyQueries: -1,
          dailyQueries: -1,
          
          // Core Features (everything from Pro)
          errorExplanation: true,
          fixSuggestions: true,
          codeExamples: true,
          preventionTips: true,
          documentationLinks: true,
          
          // History
          errorHistory: true,
          historyDays: -1,
          exportHistory: true,
          sharedHistory: true,
          
          // AI & Search
          aiModel: 'claude-sonnet',
          aiTokens: 2500,
          urlScrapingContext: true,
          webSearch: true,
          
          // Support
          supportLevel: 'priority',
          responseTime: 'immediate',
          
          // Advanced
          multiLanguage: true,
          advancedAnalysis: true,
          followUpQuestions: 10,
          
          // Team Features
          teamFeatures: true,
          teamMembers: 10,
          teamDashboard: true,
          teamAnalytics: true,
          memberManagement: true,
          rolePermissions: true,
          
          // Team Exclusive
          sharedSolutions: true,
          teamLibrary: true,
          usageReports: true,
          apiAccess: true,
          customIntegrations: true,
          priorityQueue: true,
          dedicatedSupport: true
        },
        featureList: [
          'Everything in Pro',
          'Up to 10 team members',
          'Team dashboard & analytics',
          'Shared solution library',
          'Help teammates with their errors',
          'Member usage reports',
          'Best AI model (Claude Sonnet)',
          '10 follow-up questions per query',
          'Priority support queue',
          'API access for integrations',
          'Custom integrations',
          'Dedicated account support'
        ],
        highlights: [
          '10 team members',
          'Shared library',
          'Team analytics',
          'API access'
        ],
        isPopular: false,
        limits: {
          errorAnalysesPerMonth: -1,
          errorAnalysesPerDay: -1,
          teamMembers: 10
        },
        dodoPlanId: process.env.DODO_TEAM_PLAN_ID,
        contactRequired: false
      }
    ];

    res.json({
      success: true,
      plans: plans,
      currency: 'USD',
      // Feature comparison matrix for UI
      comparisonMatrix: {
        categories: [
          {
            name: 'Queries & Limits',
            features: [
              { key: 'monthlyQueries', label: 'Monthly Queries', free: '50', pro: 'Unlimited', team: 'Unlimited' },
              { key: 'dailyQueries', label: 'Daily Queries', free: '10', pro: 'Unlimited', team: 'Unlimited' },
              { key: 'followUpQuestions', label: 'Follow-up Questions', free: '0', pro: '5 per query', team: '10 per query' }
            ]
          },
          {
            name: 'Core Features',
            features: [
              { key: 'errorExplanation', label: 'Error Explanations', free: true, pro: true, team: true },
              { key: 'fixSuggestions', label: 'Fix Suggestions', free: true, pro: true, team: true },
              { key: 'codeExamples', label: 'Code Examples', free: false, pro: true, team: true },
              { key: 'preventionTips', label: 'Prevention Tips', free: false, pro: true, team: true },
              { key: 'webSearch', label: 'Web Search for Solutions', free: false, pro: true, team: true },
              { key: 'visualGuides', label: 'Visual Guides', free: false, pro: true, team: true }
            ]
          },
          {
            name: 'History & Export',
            features: [
              { key: 'historyDays', label: 'History Storage', free: '7 days', pro: 'Unlimited', team: 'Unlimited' },
              { key: 'exportHistory', label: 'Export History', free: false, pro: true, team: true },
              { key: 'savedSolutions', label: 'Save Solutions', free: false, pro: true, team: true }
            ]
          },
          {
            name: 'AI & Language',
            features: [
              { key: 'aiModel', label: 'AI Model', free: 'Basic', pro: 'Advanced', team: 'Best' },
              { key: 'multiLanguage', label: 'Multi-language Support', free: false, pro: true, team: true }
            ]
          },
          {
            name: 'Team Features',
            features: [
              { key: 'teamMembers', label: 'Team Members', free: '1', pro: '1', team: 'Up to 10' },
              { key: 'sharedHistory', label: 'Shared History', free: false, pro: false, team: true },
              { key: 'teamDashboard', label: 'Team Dashboard', free: false, pro: false, team: true },
              { key: 'teamAnalytics', label: 'Usage Analytics', free: false, pro: false, team: true },
              { key: 'apiAccess', label: 'API Access', free: false, pro: false, team: true }
            ]
          },
          {
            name: 'Support',
            features: [
              { key: 'supportLevel', label: 'Support Level', free: 'Community', pro: 'Email', team: 'Priority' },
              { key: 'responseTime', label: 'Response Time', free: 'Standard', pro: 'Priority', team: 'Immediate' }
            ]
          }
        ]
      }
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
