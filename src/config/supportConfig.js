/**
 * Contact & Support Configuration
 * Centralized contact information for all user-facing features
 * 
 * This configuration is used across:
 * - Landing page contact section
 * - In-app support pages
 * - Email templates
 * - Error messages
 * - Help center
 */

const SUPPORT_CONFIG = {
  // Primary contact email for all inquiries and support tickets
  supportEmail: 'hi@getgingee.com',
  
  // Alternative contact methods
  contactMethods: {
    email: 'hi@getgingee.com',
    phone: null, // Add phone if available
    address: null, // Add physical address if available
  },

  // Support categories and their emails
  supportCategories: {
    // General inquiries and feature requests
    general: {
      email: 'hi@getgingee.com',
      description: 'General inquiries, feature requests, feedback'
    },
    
    // Technical support and bug reports
    technical: {
      email: 'hi@getgingee.com',
      description: 'Technical issues, bugs, errors, troubleshooting'
    },
    
    // Billing and subscription issues
    billing: {
      email: 'hi@getgingee.com',
      description: 'Subscription, billing, payment issues, invoices'
    },
    
    // Enterprise or partnership inquiries
    business: {
      email: 'hi@getgingee.com',
      description: 'Business inquiries, partnerships, collaborations'
    },
    
    // Security and privacy concerns
    security: {
      email: 'hi@getgingee.com',
      description: 'Security vulnerabilities, privacy concerns, data requests'
    }
  },

  // Support response times (SLA)
  responseTimes: {
    free: {
      tier: 'Free',
      responseTime: '24-48 hours',
      description: 'Standard support via email'
    },
    pro: {
      tier: 'Pro',
      responseTime: '12-24 hours',
      description: 'Priority email support'
    },
    team: {
      tier: 'Team',
      responseTime: '4-12 hours',
      description: 'Premium priority support'
    }
  },

  // Support hours
  supportHours: {
    timezone: 'IST', // Indian Standard Time
    weekdays: '9:00 AM - 6:00 PM',
    weekends: 'Email support available (response on next business day)',
    holidays: 'Email support available (response on next business day)'
  },

  // Ticket system
  ticketSystem: {
    enabled: true,
    autoReplyMessage: 'Thank you for contacting ErrorWise! We have received your inquiry. Our team will get back to you shortly.',
    ticketPrefix: 'EW',
  },

  // Frequently Asked Questions
  faqs: [
    {
      id: 'sla-response-time',
      question: 'How quickly will I get a response?',
      answerByTier: {
        free: 'As a Free user, we guarantee a response within 24-48 hours via email.',
        pro: 'As a Pro user, we prioritize your request and respond within 12-24 hours.',
        team: 'As a Team user, you receive premium support with a guaranteed response within 4-12 hours.'
      },
      category: 'support'
    },
    {
      id: 'support-hours',
      question: 'What are your support hours?',
      answer: 'We offer email support 24/7, with response times varying by subscription tier. Our team actively responds weekdays from 9:00 AM to 6:00 PM IST. Weekend and holiday inquiries receive responses on the next business day.',
      category: 'support'
    },
    {
      id: 'upgrade-plan',
      question: 'How do I upgrade my plan?',
      answer: 'You can upgrade your plan anytime from your account settings. Simply go to Settings > Subscription and select your desired plan. Your upgrade takes effect immediately.',
      category: 'billing'
    },
    {
      id: 'downgrade-plan',
      question: 'Can I downgrade my plan?',
      answer: 'Yes, you can downgrade at any time. Downgrade changes take effect at the end of your current billing cycle. No refunds are issued for partial months.',
      category: 'billing'
    },
    {
      id: 'cancel-subscription',
      question: 'How do I cancel my subscription?',
      answer: 'You can cancel anytime from Settings > Subscription > Cancel Plan. Your access continues until the end of your current billing period.',
      category: 'billing'
    },
    {
      id: 'data-security',
      question: 'Is my data secure?',
      answer: 'Yes. We use industry-standard encryption (AES-256), secure HTTPS connections, and regular security audits. Your data is encrypted both in transit and at rest.',
      category: 'security'
    },
    {
      id: 'api-availability',
      question: 'What is your API uptime guarantee?',
      answer: 'We maintain a 99.9% uptime SLA. Real-time status is available at status.errorwise.com.',
      category: 'technical'
    },
    {
      id: 'integration-support',
      question: 'Do you support integrations?',
      answer: 'Yes! We support integrations with popular platforms. Check our documentation at errorwise.tech/docs/integrations for available options.',
      category: 'technical'
    }
  ],

  // Common support articles/FAQs
  helpResources: [
    {
      id: 'getting-started',
      title: 'Getting Started Guide',
      url: 'https://errorwise.tech/docs/getting-started',
      description: 'Learn the basics of ErrorWise',
      category: 'documentation'
    },
    {
      id: 'faq-docs',
      title: 'FAQ Documentation',
      url: 'https://errorwise.tech/docs/faq',
      description: 'Common questions and answers',
      category: 'faq'
    },
    {
      id: 'api-docs',
      title: 'API Documentation',
      url: 'https://errorwise.tech/docs/api',
      description: 'Complete API reference for developers',
      category: 'documentation'
    },
    {
      id: 'tutorials',
      title: 'Video Tutorials',
      url: 'https://errorwise.tech/tutorials',
      description: 'Step-by-step video guides',
      category: 'tutorial'
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting Guide',
      url: 'https://errorwise.tech/docs/troubleshooting',
      description: 'Solve common problems',
      category: 'help'
    },
    {
      id: 'status-page',
      title: 'System Status',
      url: 'https://status.errorwise.com',
      description: 'Real-time service status',
      category: 'status'
    }
  ],

  // System status information
  systemStatus: {
    lastChecked: new Date().toISOString(),
    overallStatus: 'operational', // operational, degraded, maintenance, down
    statusMessage: 'All systems operational',
    services: [
      {
        id: 'api-service',
        name: 'API Service',
        status: 'operational', // operational, degraded, down
        uptime: '99.99%',
        lastIncident: null,
        description: 'Main API endpoints'
      },
      {
        id: 'ai-service',
        name: 'AI Processing Service',
        status: 'operational',
        uptime: '99.98%',
        lastIncident: null,
        description: 'Error analysis and AI features'
      },
      {
        id: 'auth-service',
        name: 'Authentication Service',
        status: 'operational',
        uptime: '99.99%',
        lastIncident: null,
        description: 'User login and session management'
      },
      {
        id: 'database-service',
        name: 'Database Service',
        status: 'operational',
        uptime: '99.99%',
        lastIncident: null,
        description: 'Data storage and retrieval'
      },
      {
        id: 'cache-service',
        name: 'Cache Service',
        status: 'operational',
        uptime: '99.95%',
        lastIncident: null,
        description: 'Performance optimization layer'
      }
    ]
  },

  // Support page configuration
  supportPageConfig: {
    showFAQTab: true,
    showStatusTab: true,
    showTicketForm: true,
    enableFeedback: true,
    maxAttachmentSize: 5 * 1024 * 1024, // 5MB
    supportedFileTypes: ['.jpg', '.png', '.pdf', '.txt', '.log'],
  },

  // Support text templates
  templates: {
    // Landing page contact section
    contactUsHeading: 'Get in Touch',
    contactUsSubheading: 'Have questions? We\'d love to hear from you!',
    
    // Support page intro
    supportIntro: 'We\'re here to help! Reach out to our support team at hi@getgingee.com for any questions or issues.',
    
    // Email footer
    emailFooter: 'Questions? Contact us at hi@getgingee.com',
    
    // Error message fallback
    errorContactMessage: 'If you continue to experience issues, please contact our support team at hi@getgingee.com',
    
    // Support ticket submit message
    ticketSubmitMessage: 'Your support request has been submitted successfully. We\'ll respond to hi@getgingee.com within the expected timeframe.',
  },

  // Get support contact by category
  getEmailForCategory: function(category = 'general') {
    return (this.supportCategories[category] || this.supportCategories.general).email;
  },

  // Get response time SLA by tier
  getResponseTimeBytier: function(tier = 'free') {
    return this.responseTimes[tier.toLowerCase()] || this.responseTimes.free;
  },

  // Generate support ticket subject line
  generateTicketSubject: function(category, userTopic) {
    return `[${this.ticketSystem.ticketPrefix}] ${category.toUpperCase()} - ${userTopic}`;
  },

  // Generate support ticket email body
  generateTicketEmail: function(userData) {
    return `
Support Ticket

Name: ${userData.name || 'N/A'}
Email: ${userData.email || 'N/A'}
User Tier: ${userData.tier || 'Free'}
Category: ${userData.category || 'General'}
Subject: ${userData.subject || 'No subject'}

Message:
${userData.message || 'No message provided'}

---
Ticket submitted: ${new Date().toISOString()}
User ID: ${userData.userId || 'N/A'}
    `.trim();
  }
};

module.exports = SUPPORT_CONFIG;
