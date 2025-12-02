/**
 * Library Learning Service
 * 
 * Self-learning system that:
 * 1. Tracks errors users encounter (user-specific + system-wide)
 * 2. Verifies solutions from PRODUCT-SPECIFIC forums (Adobe, Microsoft, etc.)
 * 3. Auto-adds verified, high-quality solutions to the shared library
 * 4. Links back to original forum sources for credibility
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
  
  // Auto-approve threshold
  AUTO_APPROVE_SCORE: 0.85,
  
  // Queue check interval (every 6 hours)
  QUEUE_CHECK_INTERVAL_MS: 6 * 60 * 60 * 1000,
  
  // Rate limiting for forum API calls
  FORUM_RATE_LIMIT: {
    requestsPerMinute: 30,
    requestsPerHour: 200,
    cooldownMs: 2000 // 2 seconds between requests
  }
};

// ============================================================================
// PRODUCT-SPECIFIC FORUM SOURCES
// Maps product keywords to their official forums/communities
// ============================================================================

const PRODUCT_FORUMS = {
  // Adobe Products
  adobe: {
    photoshop: {
      name: 'Adobe Photoshop',
      forums: [
        'https://community.adobe.com/t5/photoshop-ecosystem/ct-p/ct-photoshop',
        'https://helpx.adobe.com/photoshop/kb/troubleshoot-photoshop.html'
      ],
      searchUrl: 'https://community.adobe.com/t5/forums/searchpage/tab/message?filter=location&q={query}&location=category:ct-photoshop',
      keywords: ['photoshop', 'psd', 'adobe photoshop', 'ps cc', 'photoshop cc']
    },
    illustrator: {
      name: 'Adobe Illustrator',
      forums: ['https://community.adobe.com/t5/illustrator/ct-p/ct-illustrator'],
      searchUrl: 'https://community.adobe.com/t5/forums/searchpage/tab/message?filter=location&q={query}&location=category:ct-illustrator',
      keywords: ['illustrator', 'ai file', 'adobe illustrator']
    },
    premiere: {
      name: 'Adobe Premiere Pro',
      forums: ['https://community.adobe.com/t5/premiere-pro/ct-p/ct-premiere-pro'],
      searchUrl: 'https://community.adobe.com/t5/forums/searchpage/tab/message?q={query}&location=category:ct-premiere-pro',
      keywords: ['premiere', 'premiere pro', 'video editing adobe']
    },
    aftereffects: {
      name: 'Adobe After Effects',
      forums: ['https://community.adobe.com/t5/after-effects/ct-p/ct-after-effects'],
      keywords: ['after effects', 'ae', 'motion graphics adobe']
    },
    acrobat: {
      name: 'Adobe Acrobat',
      forums: ['https://community.adobe.com/t5/acrobat/ct-p/ct-acrobat'],
      keywords: ['acrobat', 'pdf', 'adobe reader', 'acrobat reader']
    }
  },
  
  // Microsoft Products
  microsoft: {
    windows: {
      name: 'Microsoft Windows',
      forums: [
        'https://answers.microsoft.com/en-us/windows',
        'https://learn.microsoft.com/en-us/troubleshoot/windows-client/'
      ],
      searchUrl: 'https://answers.microsoft.com/en-us/search/search?SearchTerm={query}&tab=All&status=all&adlt=off&adlt_set=off&filters=all',
      keywords: ['windows', 'win10', 'win11', 'windows 10', 'windows 11', 'bsod', 'blue screen']
    },
    office: {
      name: 'Microsoft Office',
      forums: ['https://answers.microsoft.com/en-us/msoffice'],
      searchUrl: 'https://answers.microsoft.com/en-us/search/search?SearchTerm={query}&IsSuggest=false',
      keywords: ['excel', 'word', 'powerpoint', 'outlook', 'office 365', 'microsoft 365']
    },
    azure: {
      name: 'Microsoft Azure',
      forums: [
        'https://learn.microsoft.com/en-us/answers/tags/133/azure',
        'https://stackoverflow.com/questions/tagged/azure'
      ],
      keywords: ['azure', 'azure devops', 'azure functions', 'azure storage']
    },
    vscode: {
      name: 'Visual Studio Code',
      forums: [
        'https://github.com/microsoft/vscode/issues',
        'https://stackoverflow.com/questions/tagged/visual-studio-code'
      ],
      keywords: ['vscode', 'visual studio code', 'vs code']
    }
  },
  
  // Gaming
  gaming: {
    steam: {
      name: 'Steam',
      forums: ['https://steamcommunity.com/discussions/'],
      searchUrl: 'https://steamcommunity.com/discussions/search/?q={query}',
      keywords: ['steam', 'steam error', 'steam client']
    },
    epic: {
      name: 'Epic Games',
      forums: ['https://www.epicgames.com/help/'],
      keywords: ['epic games', 'epic launcher', 'fortnite', 'unreal']
    },
    nvidia: {
      name: 'NVIDIA',
      forums: ['https://www.nvidia.com/en-us/geforce/forums/'],
      keywords: ['nvidia', 'geforce', 'cuda', 'gpu driver']
    },
    amd: {
      name: 'AMD',
      forums: ['https://community.amd.com/'],
      keywords: ['amd', 'radeon', 'ryzen', 'amd driver']
    }
  },
  
  // Development
  development: {
    nodejs: {
      name: 'Node.js',
      forums: [
        'https://stackoverflow.com/questions/tagged/node.js',
        'https://github.com/nodejs/node/issues'
      ],
      searchUrl: 'https://stackoverflow.com/search?q={query}+[node.js]',
      keywords: ['node', 'nodejs', 'npm', 'node.js']
    },
    python: {
      name: 'Python',
      forums: [
        'https://stackoverflow.com/questions/tagged/python',
        'https://discuss.python.org/'
      ],
      searchUrl: 'https://stackoverflow.com/search?q={query}+[python]',
      keywords: ['python', 'pip', 'python3', 'django', 'flask']
    },
    react: {
      name: 'React',
      forums: [
        'https://stackoverflow.com/questions/tagged/reactjs',
        'https://github.com/facebook/react/issues'
      ],
      keywords: ['react', 'reactjs', 'react native', 'jsx']
    },
    angular: {
      name: 'Angular',
      forums: ['https://stackoverflow.com/questions/tagged/angular'],
      keywords: ['angular', 'ng', 'angular cli']
    },
    vue: {
      name: 'Vue.js',
      forums: ['https://stackoverflow.com/questions/tagged/vue.js'],
      keywords: ['vue', 'vuejs', 'vue.js', 'nuxt']
    },
    java: {
      name: 'Java',
      forums: ['https://stackoverflow.com/questions/tagged/java'],
      keywords: ['java', 'jvm', 'spring', 'maven', 'gradle']
    },
    dotnet: {
      name: '.NET',
      forums: [
        'https://stackoverflow.com/questions/tagged/.net',
        'https://learn.microsoft.com/en-us/answers/tags/3/dotnet'
      ],
      keywords: ['.net', 'dotnet', 'c#', 'csharp', 'asp.net']
    }
  },
  
  // Mobile
  mobile: {
    android: {
      name: 'Android',
      forums: [
        'https://stackoverflow.com/questions/tagged/android',
        'https://support.google.com/android/community'
      ],
      keywords: ['android', 'android studio', 'google play', 'apk']
    },
    ios: {
      name: 'iOS/Apple',
      forums: [
        'https://stackoverflow.com/questions/tagged/ios',
        'https://discussions.apple.com/'
      ],
      keywords: ['ios', 'iphone', 'ipad', 'xcode', 'swift', 'apple']
    }
  },
  
  // Databases
  database: {
    mysql: {
      name: 'MySQL',
      forums: ['https://stackoverflow.com/questions/tagged/mysql'],
      keywords: ['mysql', 'mariadb']
    },
    postgresql: {
      name: 'PostgreSQL',
      forums: ['https://stackoverflow.com/questions/tagged/postgresql'],
      keywords: ['postgresql', 'postgres', 'psql']
    },
    mongodb: {
      name: 'MongoDB',
      forums: ['https://www.mongodb.com/community/forums/'],
      keywords: ['mongodb', 'mongo', 'mongoose']
    },
    redis: {
      name: 'Redis',
      forums: ['https://stackoverflow.com/questions/tagged/redis'],
      keywords: ['redis', 'cache']
    }
  },
  
  // Cloud
  cloud: {
    aws: {
      name: 'Amazon Web Services',
      forums: ['https://repost.aws/', 'https://stackoverflow.com/questions/tagged/amazon-web-services'],
      keywords: ['aws', 'amazon', 's3', 'ec2', 'lambda', 'dynamodb']
    },
    gcp: {
      name: 'Google Cloud',
      forums: ['https://stackoverflow.com/questions/tagged/google-cloud-platform'],
      keywords: ['gcp', 'google cloud', 'firebase', 'gcs']
    },
    vercel: {
      name: 'Vercel',
      forums: ['https://github.com/vercel/vercel/discussions'],
      keywords: ['vercel', 'next.js', 'nextjs']
    },
    railway: {
      name: 'Railway',
      forums: ['https://help.railway.app/', 'https://discord.gg/railway'],
      keywords: ['railway', 'railway.app']
    }
  }
};

// ============================================================================
// RATE LIMITER FOR FORUM REQUESTS
// ============================================================================

const forumRateLimiter = {
  requests: [],
  
  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    
    // Clean old requests
    this.requests = this.requests.filter(t => t > oneHourAgo);
    
    const requestsLastMinute = this.requests.filter(t => t > oneMinuteAgo).length;
    const requestsLastHour = this.requests.length;
    
    return requestsLastMinute < CONFIG.FORUM_RATE_LIMIT.requestsPerMinute &&
           requestsLastHour < CONFIG.FORUM_RATE_LIMIT.requestsPerHour;
  },
  
  recordRequest() {
    this.requests.push(Date.now());
  },
  
  getStats() {
    const now = Date.now();
    return {
      lastMinute: this.requests.filter(t => t > now - 60000).length,
      lastHour: this.requests.filter(t => t > now - 3600000).length,
      limits: CONFIG.FORUM_RATE_LIMIT
    };
  }
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
// PRODUCT DETECTION & FORUM VERIFICATION
// ============================================================================

/**
 * Detect product/application from error message and context
 */
function detectProductFromError(errorMessage, additionalContext = {}) {
  const errorLower = (errorMessage || '').toLowerCase();
  const contextLower = JSON.stringify(additionalContext || {}).toLowerCase();
  const combined = errorLower + ' ' + contextLower;
  
  const detectedProducts = [];
  
  // Check against all forum sources
  for (const [vendor, config] of Object.entries(FORUM_SOURCES)) {
    for (const product of config.products) {
      if (combined.includes(product.toLowerCase())) {
        detectedProducts.push({
          vendor,
          product,
          forums: config.forums,
          rateLimit: config.rateLimit || { perMinute: 30, perHour: 200 }
        });
      }
    }
  }
  
  // Additional keyword matching for common patterns
  const keywordPatterns = {
    adobe: /\b(psd|ai file|indd|prproj|aep|lightroom catalog)\b/i,
    microsoft: /\b(\.docx?|\.xlsx?|\.pptx?|ntfs|registry|dll|exe|msi)\b/i,
    apple: /\b(\.app|cocoa|nswindow|uikit|swift error|xcode)\b/i,
    google: /\b(firebase|gcp|bigquery|dataflow|pubsub)\b/i,
    gaming: /\b(steam api|epic games|origin|battlenet|directx|vulkan)\b/i,
    database: /\b(sqlstate|pg_|mysql_|mongodb|redis|elasticsearch)\b/i
  };
  
  for (const [vendor, pattern] of Object.entries(keywordPatterns)) {
    if (pattern.test(combined) && !detectedProducts.some(p => p.vendor === vendor)) {
      const config = FORUM_SOURCES[vendor];
      if (config) {
        detectedProducts.push({
          vendor,
          product: 'auto-detected',
          forums: config.forums,
          rateLimit: config.rateLimit || { perMinute: 30, perHour: 200 }
        });
      }
    }
  }
  
  return detectedProducts;
}

/**
 * Search product-specific forums
 */
async function searchProductForums(errorMessage, productInfo) {
  const results = [];
  
  for (const forum of productInfo.forums) {
    // Check rate limit
    if (!forumRateLimiter.checkLimit(forum)) {
      console.log(`⏳ Rate limited for forum: ${forum}`);
      continue;
    }
    
    try {
      const searchTerms = extractSearchTerms(errorMessage);
      const searchQuery = encodeURIComponent(`site:${forum} ${searchTerms}`);
      
      // Use a search API or direct forum API based on the forum
      let forumResults = [];
      
      // Special handling for specific forums
      if (forum.includes('stackoverflow.com')) {
        forumResults = await searchStackOverflow(errorMessage);
      } else if (forum.includes('github.com')) {
        forumResults = await searchGitHubIssues(errorMessage, productInfo.product);
      } else if (forum.includes('community.adobe.com')) {
        forumResults = await searchAdobeCommunity(errorMessage, productInfo.product);
      } else if (forum.includes('answers.microsoft.com')) {
        forumResults = await searchMicrosoftAnswers(errorMessage, productInfo.product);
      } else if (forum.includes('discussions.apple.com')) {
        forumResults = await searchAppleDiscussions(errorMessage, productInfo.product);
      } else {
        // Generic forum search via Google Custom Search or fallback
        forumResults = await searchGenericForum(forum, searchTerms);
      }
      
      if (forumResults.length > 0) {
        results.push({
          forum,
          vendor: productInfo.vendor,
          product: productInfo.product,
          results: forumResults,
          topResult: forumResults[0]
        });
      }
      
    } catch (error) {
      console.warn(`Forum search failed for ${forum}:`, error.message);
    }
  }
  
  return results;
}

/**
 * Search Adobe Community forums
 */
async function searchAdobeCommunity(errorMessage, product) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    const productFilter = product !== 'auto-detected' ? product : '';
    
    // Adobe Community doesn't have a public API, so we'd use a search engine
    // For now, return placeholder that redirects to community search
    return [{
      title: `Search Adobe Community for: ${searchTerms.substring(0, 50)}`,
      link: `https://community.adobe.com/t5/forums/searchpage/tab/message?q=${encodeURIComponent(searchTerms + ' ' + productFilter)}`,
      source: 'adobe-community',
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Adobe Community search failed:', error.message);
    return [];
  }
}

/**
 * Search Microsoft Answers forums
 */
async function searchMicrosoftAnswers(errorMessage, product) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    
    return [{
      title: `Search Microsoft Answers for: ${searchTerms.substring(0, 50)}`,
      link: `https://answers.microsoft.com/en-us/search/search?SearchTerm=${encodeURIComponent(searchTerms)}`,
      source: 'microsoft-answers',
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Microsoft Answers search failed:', error.message);
    return [];
  }
}

/**
 * Search Apple Discussions
 */
async function searchAppleDiscussions(errorMessage, product) {
  try {
    const searchTerms = extractSearchTerms(errorMessage);
    
    return [{
      title: `Search Apple Discussions for: ${searchTerms.substring(0, 50)}`,
      link: `https://discussions.apple.com/search?q=${encodeURIComponent(searchTerms)}`,
      source: 'apple-discussions',
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Apple Discussions search failed:', error.message);
    return [];
  }
}

/**
 * Generic forum search (fallback)
 */
async function searchGenericForum(forum, searchTerms) {
  try {
    return [{
      title: `Search ${forum} for: ${searchTerms.substring(0, 50)}`,
      link: `https://www.google.com/search?q=site:${encodeURIComponent(forum)}+${encodeURIComponent(searchTerms)}`,
      source: forum,
      isSearchLink: true
    }];
  } catch (error) {
    console.warn('Generic forum search failed:', error.message);
    return [];
  }
}

// ============================================================================
// INTERNET VERIFICATION (WITH PRODUCT-SPECIFIC FORUMS)
// ============================================================================

/**
 * Verify solution against internet sources (including product-specific forums)
 */
async function verifyFromInternetSources(tracker) {
  const sources = [];
  let verificationScore = 0;
  
  try {
    // Step 1: Detect product from error
    const detectedProducts = detectProductFromError(tracker.originalError, {
      language: tracker.language,
      category: tracker.category
    });
    
    console.log(`🔎 Detected products: ${detectedProducts.map(p => p.vendor + ':' + p.product).join(', ') || 'none'}`);
    
    // Step 2: Search product-specific forums FIRST
    for (const productInfo of detectedProducts) {
      const forumResults = await searchProductForums(tracker.originalError, productInfo);
      
      for (const result of forumResults) {
        sources.push({
          source: result.forum,
          type: 'product-forum',
          vendor: result.vendor,
          product: result.product,
          results: result.results.length,
          topResult: result.topResult
        });
        
        // Higher weight for product-specific forums
        verificationScore += result.results.some(r => !r.isSearchLink) ? 0.35 : 0.15;
      }
      
      // Rate limit between products
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 3: Search Stack Overflow (general programming)
    const stackOverflowResults = await searchStackOverflow(tracker.originalError);
    if (stackOverflowResults.length > 0) {
      sources.push({
        source: 'stackoverflow',
        type: 'general',
        results: stackOverflowResults.length,
        topResult: stackOverflowResults[0]
      });
      verificationScore += 0.2;
    }
    
    // Step 4: Search GitHub Issues
    const githubResults = await searchGitHubIssues(tracker.originalError, tracker.language);
    if (githubResults.length > 0) {
      sources.push({
        source: 'github',
        type: 'general',
        results: githubResults.length,
        topResult: githubResults[0]
      });
      verificationScore += 0.15;
    }
    
    // Step 5: Check official documentation
    const docResults = await searchOfficialDocs(tracker.originalError, tracker.language);
    if (docResults.found) {
      sources.push({
        source: 'official-docs',
        type: 'documentation',
        url: docResults.url,
        title: docResults.title
      });
      verificationScore += 0.15;
    }
    
  } catch (error) {
    console.error('Internet verification error:', error.message);
  }
  
  tracker.sources = sources;
  tracker.verificationScore = Math.max(tracker.verificationScore, verificationScore);
  tracker.detectedProducts = detectProductFromError(tracker.originalError);
  
  return {
    verified: verificationScore >= 0.5,
    score: verificationScore,
    sources,
    products: tracker.detectedProducts
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
// USER-SPECIFIC SOLUTIONS (Separate from system library)
// ============================================================================

/**
 * Save user's own solution (different from system library)
 */
async function saveUserSolution(userId, errorData, solutionData) {
  try {
    // Check if user already has this solution saved
    const existingEntry = await ErrorLibrary.findOne({
      where: {
        userId,
        type: 'user',
        errorPattern: normalizeErrorPattern(errorData.errorMessage)
      }
    });
    
    if (existingEntry) {
      // Update existing user solution
      await existingEntry.update({
        solution: solutionData.solution,
        explanation: solutionData.explanation || existingEntry.explanation,
        notes: solutionData.notes || existingEntry.notes,
        sourceUrl: solutionData.sourceUrl || existingEntry.sourceUrl,
        lastModified: new Date()
      });
      
      console.log(`📝 Updated user solution: ${existingEntry.id} for user ${userId}`);
      return { updated: true, entry: existingEntry };
    }
    
    // Create new user solution
    const entry = await ErrorLibrary.create({
      type: 'user', // User-saved solution
      userId,
      errorCode: generateErrorCode({ 
        pattern: normalizeErrorPattern(errorData.errorMessage),
        language: errorData.language
      }),
      errorPattern: normalizeErrorPattern(errorData.errorMessage),
      title: solutionData.title || generateTitle(errorData.errorMessage, errorData.errorType),
      errorMessage: errorData.errorMessage,
      category: mapCategory(errorData.category),
      explanation: solutionData.explanation,
      solution: solutionData.solution,
      notes: solutionData.notes, // User's personal notes
      sourceUrl: solutionData.sourceUrl, // Link to forum/source
      tags: solutionData.tags || generateTags({
        language: errorData.language,
        errorType: errorData.errorType,
        category: errorData.category,
        originalError: errorData.errorMessage
      }),
      difficulty: solutionData.difficulty || 'medium',
      isPublic: false, // User solutions are private by default
      isActive: true
    });
    
    console.log(`✅ Saved user solution: ${entry.id} for user ${userId}`);
    return { created: true, entry };
    
  } catch (error) {
    console.error('Failed to save user solution:', error.message);
    throw error;
  }
}

/**
 * Get user's saved solutions with optional filtering
 */
async function getUserSolutions(userId, filters = {}) {
  try {
    const where = {
      userId,
      type: 'user',
      isActive: true
    };
    
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${filters.search}%` } },
        { errorMessage: { [Op.iLike]: `%${filters.search}%` } },
        { solution: { [Op.iLike]: `%${filters.search}%` } }
      ];
    }
    
    const solutions = await ErrorLibrary.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: filters.limit || 50
    });
    
    return solutions;
    
  } catch (error) {
    console.error('Failed to get user solutions:', error.message);
    throw error;
  }
}

/**
 * Get combined library entries (system + user) for search
 * User solutions appear first, clearly marked
 */
async function getCombinedLibrary(userId, searchQuery) {
  try {
    const searchPattern = `%${searchQuery}%`;
    
    // Get user's solutions first
    const userSolutions = await ErrorLibrary.findAll({
      where: {
        userId,
        type: 'user',
        isActive: true,
        [Op.or]: [
          { title: { [Op.iLike]: searchPattern } },
          { errorMessage: { [Op.iLike]: searchPattern } },
          { solution: { [Op.iLike]: searchPattern } },
          { tags: { [Op.contains]: [searchQuery.toLowerCase()] } }
        ]
      },
      order: [['helpfulCount', 'DESC']],
      limit: 10
    });
    
    // Get system solutions
    const systemSolutions = await ErrorLibrary.findAll({
      where: {
        type: 'system',
        isActive: true,
        isPublic: true,
        [Op.or]: [
          { title: { [Op.iLike]: searchPattern } },
          { errorMessage: { [Op.iLike]: searchPattern } },
          { solution: { [Op.iLike]: searchPattern } },
          { tags: { [Op.contains]: [searchQuery.toLowerCase()] } }
        ]
      },
      order: [['helpfulCount', 'DESC'], ['viewCount', 'DESC']],
      limit: 20
    });
    
    // Combine with clear differentiation
    return {
      userSolutions: userSolutions.map(s => ({
        ...s.toJSON(),
        isUserSaved: true,
        label: 'Your Solution'
      })),
      systemSolutions: systemSolutions.map(s => ({
        ...s.toJSON(),
        isUserSaved: false,
        label: s.sourceUrl ? 'Verified from Community' : 'System Library'
      }))
    };
    
  } catch (error) {
    console.error('Failed to get combined library:', error.message);
    throw error;
  }
}

/**
 * Delete user's solution
 */
async function deleteUserSolution(userId, entryId) {
  try {
    const entry = await ErrorLibrary.findOne({
      where: {
        id: entryId,
        userId,
        type: 'user'
      }
    });
    
    if (!entry) {
      return { success: false, message: 'Solution not found or not owned by user' };
    }
    
    await entry.update({ isActive: false });
    console.log(`🗑️ Deleted user solution: ${entryId} for user ${userId}`);
    
    return { success: true, message: 'Solution deleted' };
    
  } catch (error) {
    console.error('Failed to delete user solution:', error.message);
    throw error;
  }
}

// ============================================================================
// LIBRARY ADDITION (System learned entries)
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
  
  // Product detection
  detectProductFromError,
  searchProductForums,
  
  // User-specific solutions
  saveUserSolution,
  getUserSolutions,
  getCombinedLibrary,
  deleteUserSolution,
  
  // Queue management
  processVerificationQueue,
  
  // Statistics
  getLearningStats,
  cleanupOldPatterns,
  
  // Service lifecycle
  startLearningService,
  stopLearningService,
  
  // Configuration
  CONFIG,
  FORUM_SOURCES
};
