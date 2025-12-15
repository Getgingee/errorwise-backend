/**
 * Support Contact Helper Utilities
 * 
 * Provides helper functions to include support contact information
 * in API responses, error messages, and email templates
 */

const supportConfig = require('../config/supportConfig');

/**
 * Get support contact information for API responses
 * Used by frontend to display contact options
 */
function getSupportContactInfo(userTier = 'free') {
  return {
    supportEmail: supportConfig.supportEmail,
    email: supportConfig.supportEmail,
    category: 'general',
    responseTime: supportConfig.getResponseTimeBytier(userTier).responseTime,
    hours: supportConfig.supportHours,
    ticketSystem: supportConfig.ticketSystem.enabled
  };
}

/**
 * Get error response with support contact info
 * Used when API encounters errors that user might need help with
 */
function getErrorResponseWithSupport(error, userTier = 'free') {
  return {
    success: false,
    error: error.message || 'An error occurred',
    supportContact: {
      message: supportConfig.templates.errorContactMessage,
      email: supportConfig.supportEmail,
      responseTime: supportConfig.getResponseTimeBytier(userTier).responseTime
    }
  };
}

/**
 * Get support info for email footer
 * Used in email templates
 */
function getSupportEmailFooter() {
  return `
---
${supportConfig.templates.emailFooter}
Support Hours: ${supportConfig.supportHours.weekdays} (${supportConfig.supportHours.timezone})
  `.trim();
}

/**
 * Get support category email
 * Used when routing support requests
 */
function getEmailByCategory(category = 'general') {
  return supportConfig.getEmailForCategory(category);
}

/**
 * Generate support ticket email content
 */
function generateSupportTicketEmail(userData) {
  return supportConfig.generateTicketEmail(userData);
}

/**
 * Get landing page contact section data
 * Used by frontend for contact us page
 */
function getLandingPageContactInfo() {
  return {
    heading: supportConfig.templates.contactUsHeading,
    subheading: supportConfig.templates.contactUsSubheading,
    email: supportConfig.supportEmail,
    categories: Object.entries(supportConfig.supportCategories).map(([key, data]) => ({
      id: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      description: data.description,
      email: data.email
    })),
    hours: supportConfig.supportHours,
    helpResources: supportConfig.helpResources
  };
}

/**
 * Get in-app support page data
 * Used by frontend for support/help pages within the app
 */
function getInAppSupportInfo(userTier = 'free') {
  const responseSLA = supportConfig.getResponseTimeBytier(userTier);
  
  return {
    intro: supportConfig.templates.supportIntro,
    email: supportConfig.supportEmail,
    tier: userTier,
    responseTime: responseSLA.responseTime,
    responseDescription: responseSLA.description,
    supportHours: supportConfig.supportHours,
    ticketSystem: {
      enabled: supportConfig.ticketSystem.enabled,
      autoReplyMessage: supportConfig.ticketSystem.autoReplyMessage,
      message: supportConfig.templates.ticketSubmitMessage
    },
    helpResources: supportConfig.helpResources,
    categories: Object.entries(supportConfig.supportCategories).map(([key, data]) => ({
      id: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      description: data.description,
      email: data.email
    }))
  };
}

/**
 * Check if user can create support tickets based on tier
 */
function canCreateSupportTicket(userTier = 'free') {
  // All tiers can create support tickets
  return true;
}

/**
 * Get expected response time for user tier
 */
function getExpectedResponseTime(userTier = 'free') {
  return supportConfig.getResponseTimeBytier(userTier).responseTime;
}

module.exports = {
  getSupportContactInfo,
  getErrorResponseWithSupport,
  getSupportEmailFooter,
  getEmailByCategory,
  generateSupportTicketEmail,
  getLandingPageContactInfo,
  getInAppSupportInfo,
  canCreateSupportTicket,
  getExpectedResponseTime,
  supportConfig // Export full config if needed
};
