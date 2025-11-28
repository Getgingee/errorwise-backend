/**
 * A3: Confidence Threshold & User Messaging
 * Utility for handling low confidence responses
 * 
 * @ticket A3 – Add confidence threshold and user-facing warning
 * @epic EPIC A — Reliability & Error Handling
 */

const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Generate user-friendly message for low confidence responses
 * @param {number} confidence - Confidence score (0-1)
 * @param {Object} context - Additional context
 * @returns {Object} Low confidence warning object
 */
const getLowConfidenceMessage = (confidence, context = {}) => {
  const { errorType, language } = context;
  
  const baseMessage = "This answer might be incomplete. Here are 1–2 likely causes; if it doesn't match, try clarifying your error.";
  
  // Default suggestions
  let suggestions = [
    "Try providing more context about your error",
    "Include the full stack trace if available"
  ];

  // Customize suggestions based on error type
  if (errorType === 'syntax') {
    suggestions = [
      "Double-check the line numbers mentioned",
      "Verify your code syntax around the error location"
    ];
  } else if (errorType === 'runtime') {
    suggestions = [
      "Check your variable values at runtime",
      "Add logging to trace the issue"
    ];
  } else if (errorType === 'type') {
    suggestions = [
      "Verify the types of your variables",
      "Check for null or undefined values"
    ];
  } else if (language) {
    const langLower = language.toLowerCase();
    if (langLower === 'python') {
      suggestions = [
        "Check Python documentation for this error",
        "Ensure all packages are installed (pip install)"
      ];
    } else if (langLower === 'javascript' || langLower === 'typescript') {
      suggestions = [
        "Check for async/await issues or missing imports",
        "Verify npm packages are properly installed"
      ];
    } else if (langLower === 'java') {
      suggestions = [
        "Check for null pointer or class path issues",
        "Verify all dependencies are in your build file"
      ];
    }
  }

  return {
    isLowConfidence: true,
    confidenceScore: confidence,
    warningMessage: baseMessage,
    suggestions: suggestions,
    disclaimer: "If this doesn't match your issue, try rephrasing your error description with more details."
  };
};

/**
 * Check if confidence is below threshold
 * @param {number} confidence - Confidence score (0-1)
 * @returns {boolean} True if confidence is low
 */
const isLowConfidence = (confidence) => {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
};

/**
 * Enhance response with confidence metadata
 * @param {Object} response - Original API response
 * @param {number} confidence - Confidence score (0-1)
 * @param {Object} context - Additional context
 * @returns {Object} Enhanced response with confidence data
 */
const enhanceResponseWithConfidence = (response, confidence, context = {}) => {
  const enhanced = {
    ...response,
    confidence: confidence,
    isLowConfidence: isLowConfidence(confidence)
  };

  if (enhanced.isLowConfidence) {
    enhanced.confidenceWarning = getLowConfidenceMessage(confidence, context);
  }

  return enhanced;
};

/**
 * Get confidence distribution bucket for analytics
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string} Confidence bucket name
 */
const getConfidenceBucket = (confidence) => {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  if (confidence >= 0.4) return 'low';
  return 'very_low';
};

/**
 * Get confidence color for UI
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string} Color name
 */
const getConfidenceColor = (confidence) => {
  if (confidence >= 0.8) return 'green';
  if (confidence >= 0.6) return 'yellow';
  if (confidence >= 0.4) return 'orange';
  return 'red';
};

module.exports = {
  LOW_CONFIDENCE_THRESHOLD,
  getLowConfidenceMessage,
  isLowConfidence,
  enhanceResponseWithConfidence,
  getConfidenceBucket,
  getConfidenceColor
};
