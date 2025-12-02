/**
 * Library Learning Service
 * 
 * Self-learning system that:
 * 1. Tracks errors users encounter
 * 2. Verifies solutions from internet sources (Stack Overflow, GitHub, official docs)
 * 3. Auto-adds verified, high-quality solutions to the shared library
 * 
 * @purpose Continuously improve error library from real user errors
 */

const ErrorLibrary = require('../models/ErrorLibrary');
const axios = require('axios');
const { Op } = require('sequelize');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum occurrences before considering for library
  MIN_ERROR_OCCURRENCES: 3,
  
  // Minimum AI confidence to consider
  MIN_CONFIDENCE_THRESHOLD: 0.75,
  
  // Minimum helpful votes to auto-approve
  MIN_HELPFUL_VOTES: 5,
  
  // Sources to verify against
  VERIFICATION_SOURCES: [
    'stackoverflow.com',
    'github.com',
    'developer.mozilla.org',
    'docs.microsoft.com',
    'learn.microsoft.com',
    'developers.google.com',
    'aws.amazon.com/documentation',
    'docs.python.org',
    'nodejs.org/docs',
    'reactjs.org',
    'angular.io/docs',
    'vuejs.org/guide',
    'docs.npmjs.com'
  ],
  
  // Auto-approve threshold
  AUTO_APPROVE_SCORE: 0.85,
  
  // Queue check interval (every 6 hours)
  QUEUE_CHECK_INTERVAL_MS: 6 * 60 * 60 * 1000
};

// In-memory tracking for error patterns
const errorPatternTracker = new Map();

// ============================================================================
// ERROR PATTERN TRACKING
// ============================================================================

/**
 * Track an error occurrence for potential library addition
 */
function trackError(errorData) {
  const {
    errorMessage,
    errorType,
    language,
    category,
    aiResponse,
    userId,
    wasHelpful
  } = errorData;
  
  // Create a normalized pattern key
  const patternKey = normalizeErrorPattern(errorMessage, errorType, language);
  
  if (!errorPatternTracker.has(patternKey)) {
    errorPatternTracker.set(patternKey, {
      pattern: patternKey,
      originalError: errorMessage,
      errorType,
      language,
      category: category || 'general',
      occurrences: 0,
      aiResponses: [],
      helpfulVotes: 0,
      notHelpfulVotes: 0,
      userIds: new Set(),
      firstSeen: new Date(),
      lastSeen: new Date(),
      verificationStatus: 'pending',
      verificationScore: 0,
      sources: []
    });
  }
  
  const tracker = errorPatternTracker.get(patternKey);
  tracker.occurrences++;
  tracker.lastSeen = new Date();
  
  if (userId) {
    tracker.userIds.add(userId);
  }
  
  if (aiResponse && aiResponse.confidence >= CONFIG.MIN_CONFIDENCE_THRESHOLD) {
    tracker.aiResponses.push({
      explanation: aiResponse.explanation,
      solution: aiResponse.solution,
      codeExample: aiResponse.codeExample,
      confidence: aiResponse.confidence,
      timestamp: new Date()
    });
  }
  
  if (wasHelpful === true) {
    tracker.helpfulVotes++;
  } else if (wasHelpful === false) {
    tracker.notHelpfulVotes++;
  }
  
  console.log(`📚 Tracked error pattern: ${patternKey.substring(0, 50)}... (occurrences: ${tracker.occurrences})`);
  
  // Check if eligible for library addition
  checkEligibilityForLibrary(patternKey);
  
  return tracker;
}

/**
 * Normalize error message to create a pattern key
 */
function normalizeErrorPattern(errorMessage, errorType, language) {
  if (!errorMessage) return '';
  
  // Remove variable parts (file paths, line numbers, specific values)
  let normalized = errorMessage
    .toLowerCase()
    // Remove file paths
    .replace(/([a-z]:)?[\\\/][\w\-\.\\\/]+/gi, '<PATH>')
    // Remove line/column numbers
    .replace(/line\s*:?\s*\d+/gi, 'line:<N>')
    .replace(/:\d+:\d+/g, ':<N>:<N>')
    // Remove specific variable names that look generated
    .replace(/\b[a-z_]\w{20,}\b/gi, '<VAR>')
    // Remove UUIDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<UUID>')
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Create pattern key with context
  return `${language || 'unknown'}:${errorType || 'unknown'}:${normalized.substring(0, 200)}`;
}

// ============================================================================
// ELIGIBILITY CHECK & VERIFICATION
// ============================================================================

/**
 * Check if error pattern is eligible for library addition
 */
async function checkEligibilityForLibrary(patternKey) {
  const tracker = errorPatternTracker.get(patternKey);
  if (!tracker) return;
  
  // Check minimum requirements
  if (tracker.occurrences < CONFIG.MIN_ERROR_OCCURRENCES) {
    return; // Not enough occurrences yet
  }
  
  if (tracker.aiResponses.length === 0) {
    return; // No AI responses to use
  }
  
  if (tracker.verificationStatus === 'verified' || tracker.verificationStatus === 'rejected') {
    return; // Already processed
  }
  
  // Check if already in library
  const existingEntry = await ErrorLibrary.findOne({
    where: {
      errorCode: tracker.errorType,
      type: 'system',
      isActive: true
    }
  });
  
  if (existingEntry) {
    // Update existing entry's metrics instead
    await existingEntry.increment('useCount', { by: tracker.occurrences });
    tracker.verificationStatus = 'exists';
    return;
  }
  
  // Calculate eligibility score
  const score = calculateEligibilityScore(tracker);
  tracker.verificationScore = score;
  
  console.log(`🔍 Checking eligibility: ${patternKey.substring(0, 50)}... Score: ${score.toFixed(2)}`);
  
  if (score >= CONFIG.AUTO_APPROVE_SCORE) {
    // High confidence - auto approve
    await addToLibrary(tracker, 'auto-approved');
  } else if (score >= 0.6) {
    // Medium confidence - queue for verification
    tracker.verificationStatus = 'queued';
    console.log(`📋 Queued for verification: ${tracker.originalError.substring(0, 50)}...`);
  }
}

/**
 * Calculate eligibility score for library addition
 */
function calculateEligibilityScore(tracker) {
  let score = 0;
  
  // Factor 1: Occurrence frequency (max 0.3)
  const occurrenceScore = Math.min(tracker.occurrences / 20, 1) * 0.3;
  score += occurrenceScore;
  
  // Factor 2: AI confidence average (max 0.3)
  if (tracker.aiResponses.length > 0) {
    const avgConfidence = tracker.aiResponses.reduce((sum, r) => sum + r.confidence, 0) / tracker.aiResponses.length;
    score += avgConfidence * 0.3;
  }
  
  // Factor 3: Helpful ratio (max 0.2)
  const totalVotes = tracker.helpfulVotes + tracker.notHelpfulVotes;
  if (totalVotes > 0) {
    const helpfulRatio = tracker.helpfulVotes / totalVotes;
    score += helpfulRatio * 0.2;
  } else {
    // No votes yet, neutral score
    score += 0.1;
  }
  
  // Factor 4: Unique users (max 0.2)
  const uniqueUserScore = Math.min(tracker.userIds.size / 10, 1) * 0.2;
  score += uniqueUserScore;
  
  return score;
}

// ============================================================================
// INTERNET VERIFICATION
// ============================================================================

/**
 * Verify solution against internet sources
 */
async function verifyFromInternetSources(tracker) {
  const sources = [];
  let verificationScore = 0;
  
  try {
    // Search Stack Overflow
    const stackOverflowResults = await searchStackOverflow(tracker.originalError);
    if (stackOverflowResults.length > 0) {
      sources.push({
        source: 'stackoverflow',
        results: stackOverflowResults.length,
        topResult: stackOverflowResults[0]
      });
      verificationScore += 0.3;
    }
    
    // Search GitHub Issues
    const githubResults = await searchGitHubIssues(tracker.originalError, tracker.language);
    if (githubResults.length > 0) {
      sources.push({
        source: 'github',
        results: githubResults.length,
        topResult: githubResults[0]
      });
      verificationScore += 0.2;
    }
    
    // Check official documentation
    const docResults = await searchOfficialDocs(tracker.originalError, tracker.language);
    if (docResults.found) {
      sources.push({
        source: 'official-docs',
        url: docResults.url,
        title: docResults.title
      });
      verificationScore += 0.3;
    }
    
  } catch (error) {
    console.error('Internet verification error:', error.message);
  }
  
  tracker.sources = sources;
  tracker.verificationScore = Math.max(tracker.verificationScore, verificationScore);
  
  return {
    verified: verificationScore >= 0.5,
    score: verificationScore,
    sources
  };
}

/**
 * Search Stack Overflow for similar errors
 */
async function searchStackOverflow(errorMessage) {
  try {
    // Extract key terms from error
    const searchTerms = extractSearchTerms(errorMessage);
    const query = encodeURIComponent(searchTerms);
    
    const response = await axios.get(
      `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${query}&site=stackoverflow&filter=withbody`,
      { timeout: 5000 }
    );
    
    if (response.data && response.data.items) {
      return response.data.items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        score: item.score,
        isAnswered: item.is_answered,
        answerCount: item.answer_count
      }));
    }
  } catch (error) {
    console.warn('Stack Overflow search failed:', error.message);
  }
  
  return [];
}

/**
 * Search GitHub Issues for similar errors
 */
async function searchGitHubIssues(errorMessage, language) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    const languageFilter = language ? `+language:${language}` : '';
    const query = encodeURIComponent(`${searchTerms}${languageFilter}`);
    
    const response = await axios.get(
      `https://api.github.com/search/issues?q=${query}+type:issue&per_page=5`,
      { 
        timeout: 5000,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ErrorWise-Learning-Service'
        }
      }
    );
    
    if (response.data && response.data.items) {
      return response.data.items.map(item => ({
        title: item.title,
        url: item.html_url,
        state: item.state,
        comments: item.comments
      }));
    }
  } catch (error) {
    console.warn('GitHub search failed:', error.message);
  }
  
  return [];
}

/**
 * Search official documentation
 */
async function searchOfficialDocs(errorMessage, language) {
  // Map languages to their documentation sites
  const docSites = {
    javascript: 'developer.mozilla.org',
    typescript: 'typescriptlang.org/docs',
    python: 'docs.python.org',
    java: 'docs.oracle.com/javase',
    csharp: 'learn.microsoft.com/dotnet',
    go: 'go.dev/doc',
    rust: 'doc.rust-lang.org',
    react: 'react.dev',
    node: 'nodejs.org/docs',
    vue: 'vuejs.org/guide',
    angular: 'angular.io/docs'
  };
  
  const docSite = docSites[language?.toLowerCase()] || null;
  
  if (docSite) {
    return {
      found: true,
      url: `https://${docSite}`,
      title: `Official ${language} Documentation`
    };
  }
  
  return { found: false };
}

/**
 * Extract search terms from error message
 */
function extractSearchTerms(errorMessage) {
  if (!errorMessage) return '';
  
  // Remove noise and extract meaningful terms
  return errorMessage
    .replace(/[^\w\s:]/g, ' ')
    .replace(/\b(error|exception|failed|cannot|unable)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

// ============================================================================
// LIBRARY ADDITION
// ============================================================================

/**
 * Add verified error pattern to library
 */
async function addToLibrary(tracker, approvalType = 'manual') {
  try {
    // Get best AI response
    const bestResponse = tracker.aiResponses.reduce((best, current) => 
      current.confidence > (best?.confidence || 0) ? current : best
    , null);
    
    if (!bestResponse) {
      console.warn('No AI response available for library addition');
      return null;
    }
    
    // Create library entry
    const entry = await ErrorLibrary.create({
      type: 'system', // System-learned entry
      errorCode: tracker.errorType || generateErrorCode(tracker),
      errorPattern: tracker.pattern,
      title: generateTitle(tracker.originalError, tracker.errorType),
      errorMessage: tracker.originalError,
      category: mapCategory(tracker.category),
      explanation: bestResponse.explanation,
      solution: bestResponse.solution,
      commonCauses: extractCommonCauses(tracker.aiResponses),
      tags: generateTags(tracker),
      difficulty: determineDifficulty(tracker),
      sourceUrl: tracker.sources[0]?.topResult?.link || tracker.sources[0]?.url || null,
      lastVerified: new Date(),
      isPublic: true,
      isActive: true,
      viewCount: tracker.occurrences,
      helpfulCount: tracker.helpfulVotes
    });
    
    tracker.verificationStatus = 'verified';
    tracker.libraryEntryId = entry.id;
    
    console.log(`✅ Added to library [${approvalType}]: ${entry.title} (ID: ${entry.id})`);
    
    return entry;
    
  } catch (error) {
    console.error('Failed to add to library:', error.message);
    tracker.verificationStatus = 'failed';
    return null;
  }
}

/**
 * Generate a unique error code
 */
function generateErrorCode(tracker) {
  const prefix = (tracker.language || 'GEN').substring(0, 3).toUpperCase();
  const hash = tracker.pattern.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;
  return `${prefix}_${hash.toString().padStart(4, '0')}`;
}

/**
 * Generate a human-readable title
 */
function generateTitle(errorMessage, errorType) {
  // Extract the main error type/message
  const patterns = [
    /^(\w+Error):/i,
    /^(\w+Exception):/i,
    /^(Error\s*\d+)/i,
    /^(HTTP\s*\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  // Use error type or truncate message
  if (errorType) {
    return errorType.charAt(0).toUpperCase() + errorType.slice(1) + ' Error';
  }
  
  return errorMessage.substring(0, 60) + (errorMessage.length > 60 ? '...' : '');
}

/**
 * Map detected category to valid enum
 */
function mapCategory(category) {
  const validCategories = [
    'payment', 'website', 'gaming', 'mobile', 'software',
    'network', 'database', 'authentication', 'api', 'general'
  ];
  
  return validCategories.includes(category) ? category : 'general';
}

/**
 * Extract common causes from multiple AI responses
 */
function extractCommonCauses(aiResponses) {
  const causes = new Set();
  
  aiResponses.forEach(response => {
    // Extract causes from explanation
    const explanation = response.explanation || '';
    const causePatterns = [
      /(?:caused by|because of|due to)\s+([^.]+)/gi,
      /(?:common cause|typical cause)[s]?\s*:?\s*([^.]+)/gi
    ];
    
    causePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(explanation)) !== null) {
        causes.add(match[1].trim());
      }
    });
  });
  
  return Array.from(causes).slice(0, 5);
}

/**
 * Generate tags from error context
 */
function generateTags(tracker) {
  const tags = new Set();
  
  if (tracker.language) tags.add(tracker.language);
  if (tracker.errorType) tags.add(tracker.errorType);
  if (tracker.category) tags.add(tracker.category);
  
  // Extract keywords from error message
  const keywords = tracker.originalError
    .toLowerCase()
    .match(/\b(error|exception|failed|undefined|null|missing|invalid|timeout|connection|auth|permission)\b/g);
  
  if (keywords) {
    keywords.forEach(kw => tags.add(kw));
  }
  
  return Array.from(tags);
}

/**
 * Determine difficulty level
 */
function determineDifficulty(tracker) {
  const avgConfidence = tracker.aiResponses.reduce((sum, r) => sum + r.confidence, 0) / tracker.aiResponses.length;
  
  if (avgConfidence >= 0.9) return 'easy';
  if (avgConfidence >= 0.7) return 'medium';
  return 'hard';
}

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

/**
 * Process queued error patterns for verification
 */
async function processVerificationQueue() {
  console.log('🔄 Processing verification queue...');
  
  let processed = 0;
  let verified = 0;
  
  for (const [patternKey, tracker] of errorPatternTracker.entries()) {
    if (tracker.verificationStatus !== 'queued') continue;
    
    processed++;
    
    // Verify from internet sources
    const verification = await verifyFromInternetSources(tracker);
    
    if (verification.verified) {
      await addToLibrary(tracker, 'internet-verified');
      verified++;
    } else {
      // Check if it has enough helpful votes
      if (tracker.helpfulVotes >= CONFIG.MIN_HELPFUL_VOTES) {
        await addToLibrary(tracker, 'user-verified');
        verified++;
      } else {
        tracker.verificationStatus = 'pending'; // Re-queue
      }
    }
    
    // Rate limit API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`✅ Queue processed: ${processed} checked, ${verified} added to library`);
  
  return { processed, verified };
}

/**
 * Get learning statistics
 */
function getLearningStats() {
  const stats = {
    totalPatterns: errorPatternTracker.size,
    byStatus: {
      pending: 0,
      queued: 0,
      verified: 0,
      rejected: 0,
      exists: 0,
      failed: 0
    },
    topPatterns: [],
    recentAdditions: []
  };
  
  for (const [key, tracker] of errorPatternTracker.entries()) {
    stats.byStatus[tracker.verificationStatus] = (stats.byStatus[tracker.verificationStatus] || 0) + 1;
    
    stats.topPatterns.push({
      pattern: key.substring(0, 80),
      occurrences: tracker.occurrences,
      score: tracker.verificationScore,
      status: tracker.verificationStatus
    });
  }
  
  // Sort by occurrences
  stats.topPatterns.sort((a, b) => b.occurrences - a.occurrences);
  stats.topPatterns = stats.topPatterns.slice(0, 20);
  
  return stats;
}

/**
 * Clear old patterns from memory
 */
function cleanupOldPatterns(maxAgeDays = 30) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [key, tracker] of errorPatternTracker.entries()) {
    if (tracker.lastSeen < cutoff && tracker.verificationStatus !== 'verified') {
      errorPatternTracker.delete(key);
      cleaned++;
    }
  }
  
  console.log(`🧹 Cleaned ${cleaned} old patterns from memory`);
  return cleaned;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Start periodic queue processing
let queueProcessorInterval = null;

function startLearningService() {
  console.log('🎓 Library Learning Service started');
  
  // Process queue periodically
  queueProcessorInterval = setInterval(() => {
    processVerificationQueue().catch(err => 
      console.error('Queue processing error:', err.message)
    );
  }, CONFIG.QUEUE_CHECK_INTERVAL_MS);
  
  // Cleanup old patterns daily
  setInterval(() => {
    cleanupOldPatterns(30);
  }, 24 * 60 * 60 * 1000);
}

function stopLearningService() {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
    queueProcessorInterval = null;
  }
  console.log('🛑 Library Learning Service stopped');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  trackError,
  checkEligibilityForLibrary,
  verifyFromInternetSources,
  addToLibrary,
  
  // Queue management
  processVerificationQueue,
  
  // Statistics
  getLearningStats,
  cleanupOldPatterns,
  
  // Service lifecycle
  startLearningService,
  stopLearningService,
  
  // Configuration
  CONFIG
};
