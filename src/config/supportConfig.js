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

  // Common support articles/FAQs
  helpResources: {
    gettingStarted: 'https://errorwise.tech/docs/getting-started',
    faq: 'https://errorwise.tech/docs/faq',
    documentations: 'https://errorwise.tech/docs',
    tutorials: 'https://errorwise.tech/tutorials',
    communityForum: null, // Add if available
  },

  // Social media for support announcements
  socialMedia: {
    twitter: null, // Add if available
    linkedin: null, // Add if available
    github: null, // Add if available
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
