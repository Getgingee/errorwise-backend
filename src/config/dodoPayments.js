require('dotenv').config();

const dodoPaymentsConfig = {
  // Dodo Payments API Keys
  apiKey: process.env.DODO_API_KEY,
  secretKey: process.env.DODO_SECRET_KEY,
  merchantId: process.env.DODO_MERCHANT_ID,
  
  // Webhook configuration
  webhookSecret: process.env.DODO_WEBHOOK_SECRET,
  
  // API Configuration
  apiUrl: process.env.DODO_API_URL || 'https://api.dodopayments.com/v1',
  environment: process.env.DODO_ENVIRONMENT || 'sandbox', // 'sandbox' or 'production'
  
  // Currency
  currency: process.env.DEFAULT_CURRENCY || 'USD',
  
  // Subscription plans configuration - Aligned with ErrorWise vision
  plans: {
    free: {
      id: 'free',
      name: 'Free Plan',
      price: 0,
      interval: 'month', // Monthly plan with daily limits
      dodoProductId: null,
      features: {
        dailyQueries: 3,
        errorExplanation: true,
        fixSuggestions: false,
        documentationLinks: false,
        errorHistory: false,
        teamFeatures: false,
        supportLevel: 'community'
      }
    },
    
    pro: {
      id: process.env.DODO_PRO_PLAN_ID || 'plan_pro_monthly',
      name: 'Pro Plan',
      price: 2, // $2/month - accessible pricing
      interval: 'month',
      trialDays: 7,
      dodoProductId: process.env.DODO_PRO_PRODUCT_ID,
      features: {
        dailyQueries: -1, // Unlimited
        errorExplanation: true,
        fixSuggestions: true,
        documentationLinks: true,
        errorHistory: true,
        teamFeatures: false,
        supportLevel: 'email',
        advancedAnalysis: true
      }
    },
    
    team: {
      id: process.env.DODO_TEAM_PLAN_ID || 'plan_team_monthly',
      name: 'Team Plan',
      price: 8, // $8/month - team collaboration
      interval: 'month',
      trialDays: 14,
      dodoProductId: process.env.DODO_TEAM_PRODUCT_ID,
      features: {
        dailyQueries: -1, // Unlimited
        errorExplanation: true,
        fixSuggestions: true,
        documentationLinks: true,
        errorHistory: true,
        teamFeatures: true,
        sharedHistory: true,
        teamDashboard: true,
        supportLevel: 'priority',
        teamMembers: 10
      }
    }
  },
  
  // Yearly plans with attractive discounts
  yearlyPlans: {
    pro_yearly: {
      id: process.env.DODO_PRO_YEARLY_PLAN_ID || 'plan_pro_yearly',
      name: 'Pro Plan (Yearly)',
      price: 20, // $20/year - 2 months free!
      interval: 'year',
      discount: 17, // ~17% discount
      monthlyEquivalent: 1.67
    },
    
    team_yearly: {
      id: process.env.DODO_TEAM_YEARLY_PLAN_ID || 'plan_team_yearly',
      name: 'Team Plan (Yearly)',
      price: 80, // $80/year - 2 months free!
      interval: 'year',
      discount: 17, // ~17% discount
      monthlyEquivalent: 6.67
    }
  },
  
  // Payment method types supported by Dodo Payments
  paymentMethods: ['card', 'bank_transfer', 'digital_wallet', 'upi'],
  
  // Billing configuration
  billing: {
    // Grace period in days for failed payments
    gracePeriod: 7,
    
    // Number of retry attempts for failed payments
    maxRetries: 3,
    
    // Billing cycle behavior
    billingCycle: 'monthly', // 'monthly', 'yearly', 'custom'
    
    // Proration behavior
    prorationEnabled: true,
    
    // Collection method
    collectionMethod: 'automatic' // 'automatic' or 'manual'
  },
  
  // Tax configuration
  tax: {
    automaticTax: process.env.DODO_AUTOMATIC_TAX === 'true',
    taxCalculation: 'inclusive', // 'inclusive' or 'exclusive'
    defaultTaxRate: parseFloat(process.env.DEFAULT_TAX_RATE) || 0.0
  },
  
  // Payment gateway specific settings
  gateway: {
    // Timeout settings
    timeoutSeconds: 30,
    
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000, // milliseconds
    
    // 3DS authentication
    enforce3DS: process.env.DODO_ENFORCE_3DS === 'true',
    
    // Fraud detection
    fraudDetection: {
      enabled: true,
      riskThreshold: 'medium', // 'low', 'medium', 'high'
      blockHighRisk: true
    }
  },
  
  // Webhook configuration
  webhooks: {
    endpointUrl: process.env.DODO_WEBHOOK_URL || `${process.env.BACKEND_URL}/api/webhooks/dodo`,
    
    // Events to listen for
    events: [
      'payment.succeeded',
      'payment.failed',
      'subscription.created',
      'subscription.updated',
      'subscription.cancelled',
      'subscription.expired',
      'invoice.created',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.created',
      'customer.updated'
    ],
    
    // Security
    verifySignature: true,
    tolerance: 300 // seconds - webhook tolerance for timestamp validation
  },
  
  // Customer portal configuration
  customerPortal: {
    enabled: true,
    
    // Portal URL (if Dodo provides a customer portal)
    portalUrl: process.env.DODO_CUSTOMER_PORTAL_URL,
    
    // Features available in the portal
    features: {
      viewInvoices: true,
      downloadInvoices: true,
      updatePaymentMethod: true,
      cancelSubscription: true,
      changeSubscription: true,
      viewUsage: true
    },
    
    // Customization
    branding: {
      logo: process.env.COMPANY_LOGO_URL,
      primaryColor: '#2563eb',
      company: 'ErrorWise'
    }
  },
  
  // Supported currencies (if Dodo supports multiple)
  supportedCurrencies: [
    'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'
  ],
  
  // Regional settings
  regions: {
    default: 'US',
    supported: ['US', 'EU', 'IN', 'CA', 'AU', 'JP']
  }
};

module.exports = dodoPaymentsConfig;