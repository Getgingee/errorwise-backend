require('dotenv').config();
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

// Central query logger (A1 - Error Logging & Monitoring)
const queryLogger = require('./queryLogger');

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  MAX_RETRIES: 1,  // Reduced from 2 - faster fallback
  RETRY_DELAY_MS: 500,  // Reduced from 1000ms
  REQUEST_TIMEOUT_MS: 15000,  // Reduced from 30s to 15s - AI should respond faster
  CACHE_TTL_MS: 3600000, // 1 hour (increased for better cache hit rate)
  MAX_PROMPT_LENGTH: 4000,  // Reduced from 8000 - shorter prompts = faster responses
  MAX_URL_SCRAPE_TIMEOUT: 3000,  // Reduced from 10s to 3s
  MAX_URLS_TO_PROCESS: 1,  // Reduced from 2 to 1
  MAX_SCRAPED_CONTENT_LENGTH: 1500,  // Reduced from 3000
  // New performance settings
  ENABLE_STREAMING: true,  // Enable streaming for faster perceived response
  FAST_CACHE_TTL_MS: 300000,  // 5 min for frequently accessed items
  MAX_CACHE_SIZE: 2000,  // Increased cache size
  CONCURRENT_REQUESTS_LIMIT: 10,  // Limit concurrent AI requests
};

// A2: Fallback tracking statistics (in-memory, also logged to DB)
const fallbackStats = {
  totalRequests: 0,
  fallbackUsed: 0,
  fatalErrors: 0,
  lastReset: new Date().toISOString(),
};

// A2: User-friendly error messages
const USER_FRIENDLY_ERRORS = {
  timeout: {
    title: "Request Timeout",
    message: "The AI is taking longer than expected to respond. This can happen during peak usage.",
    suggestion: "Please try again in a moment, or try simplifying your error message."
  },
  invalidJson: {
    title: "Response Processing Error",
    message: "We received an unexpected response format from the AI.",
    suggestion: "Please try rephrasing your question or providing more context about the error."
  },
  rateLimit: {
    title: "Rate Limit Reached",
    message: "Too many requests in a short time. Our AI needs a brief moment to catch up.",
    suggestion: "Please wait a few seconds and try again."
  },
  allProvidersFailed: {
    title: "AI Service Temporarily Unavailable",
    message: "We're experiencing technical difficulties with our AI providers.",
    suggestion: "Please try again in a few minutes. If the issue persists, try rephrasing your error message."
  },
  validation: {
    title: "Invalid Input",
    message: "The error message provided couldn't be processed.",
    suggestion: "Please ensure your error message is at least 10 characters and doesn't contain unusual formatting."
  },
  generic: {
    title: "Something Went Wrong",
    message: "An unexpected error occurred while analyzing your request.",
    suggestion: "Please try again. If the issue persists, try rephrasing or simplifying your error message."
  }
};

// Simple in-memory cache with Redis fallback for distributed caching
const responseCache = new Map();
let redisCache = null;

// Try to initialize Redis cache
try {
  const { redis } = require('../utils/redisClient');
  redisCache = redis;
  console.log('✅ Redis cache enabled for AI responses');
} catch (e) {
  console.log('⚠️  Redis not available, using in-memory cache only');
}

/**
 * Get cached response from Redis or memory
 */
async function getCachedResponseFast(cacheKey) {
  // Try in-memory first (fastest)
  const memCached = responseCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < CONFIG.CACHE_TTL_MS) {
    console.log(`💾 Memory cache HIT: ${cacheKey.substring(0, 16)}...`);
    return memCached.response;
  }
  
  // Try Redis (shared across instances)
  if (redisCache) {
    try {
      const redisCached = await redisCache.get(`ai:${cacheKey}`);
      if (redisCached) {
        console.log(`💾 Redis cache HIT: ${cacheKey.substring(0, 16)}...`);
        // Also save to memory for faster subsequent access
        responseCache.set(cacheKey, { response: redisCached, timestamp: Date.now() });
        return redisCached;
      }
    } catch (e) {
      // Redis error, continue without
    }
  }
  
  return null;
}

/**
 * Save response to both memory and Redis cache
 */
async function cacheResponseFast(cacheKey, response) {
  // Save to memory
  responseCache.set(cacheKey, { response, timestamp: Date.now() });
  
  // Save to Redis for distributed caching
  if (redisCache) {
    try {
      await redisCache.set(`ai:${cacheKey}`, response, Math.floor(CONFIG.CACHE_TTL_MS / 1000));
    } catch (e) {
      // Redis error, continue
    }
  }
  
  // Cleanup memory if too large
  if (responseCache.size > CONFIG.MAX_CACHE_SIZE) {
    const keysToDelete = [];
    let count = 0;
    for (const key of responseCache.keys()) {
      if (count++ < 100) keysToDelete.push(key); // Remove oldest 100
      else break;
    }
    keysToDelete.forEach(k => responseCache.delete(k));
  }
}

// Log API key status on startup
console.log('\n🔑 AI Service Configuration:');
console.log(`   FREE tier: Google Gemini ${process.env.GEMINI_API_KEY ? '✅' : '❌ MISSING!'}`);
console.log(`   PRO tier: Claude Haiku ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌ MISSING!'}`);
console.log(`   TEAM tier: Claude Sonnet ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌ MISSING!'}`);
console.log(`   URL Scraping: ✅ Enabled (Pro/Team)`);
console.log(`   Cache TTL: ${CONFIG.CACHE_TTL_MS / 1000}s`);
console.log(`   Max Retries: ${CONFIG.MAX_RETRIES}`);
console.log(`   Request Timeout: ${CONFIG.REQUEST_TIMEOUT_MS / 1000}s\n`);

// Initialize AI clients
let genAI; // Google Gemini (for FREE tier)
let anthropic; // Anthropic Claude (for PRO/TEAM tiers)

// Initialize Gemini
try {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  WARNING: GEMINI_API_KEY not set. Free tier will use mock responses.');
  } else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini client initialized successfully (FREE tier)');
  }
} catch (error) {
  console.error('❌ Failed to initialize Gemini client:', error.message);
}

// Initialize Anthropic
try {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  WARNING: ANTHROPIC_API_KEY not set. Pro/Team tiers will use fallback.');
  } else {
    anthropic = new Anthropic({ 
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: CONFIG.REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
    console.log('✅ Anthropic client initialized successfully (PRO/TEAM tiers)');
  }
} catch (error) {
  console.error('❌ Failed to initialize Anthropic client:', error.message);
}

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

const TIER_CONFIG = {
  free: {
    primary: { 
      provider: 'anthropic',  // FREE tier uses Claude 3.5 Haiku
      model: 'claude-3-5-haiku-20241022',  // Confirmed working model ID
      maxTokens: 1000,
      temperature: 0.5,
    },
    fallback: { 
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',  // Older Haiku as fallback
      maxTokens: 1000,
      temperature: 0.5,
    },
    features: {
      batchAnalysis: false,
      urlScraping: false,
      conversationHistory: false,
    },
  },
  pro: {
    primary: { 
      provider: 'anthropic',  // PRO tier uses Claude 3.5 Haiku
      model: 'claude-3-5-haiku-20241022',  // Confirmed working model ID
      maxTokens: 2000,
      temperature: 0.4,
    },
    fallback: { 
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',  // Fallback to older Haiku
      maxTokens: 2000,
      temperature: 0.4,
    },
    features: {
      batchAnalysis: false,
      urlScraping: true,
      conversationHistory: true,
    },
  },
  team: {
    primary: { 
      provider: 'anthropic',  // TEAM tier uses Claude 3.5 Sonnet (BEST quality)
      model: 'claude-3-5-sonnet-20241022',  // Confirmed working model ID
      maxTokens: 4000,
      temperature: 0.3,
    },
    fallback: { 
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',  // Fallback to Haiku 3.5
      maxTokens: 4000,
      temperature: 0.3,
    },
    features: {
      batchAnalysis: true,
      urlScraping: true,
      conversationHistory: true,
    }
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Timeout wrapper for AI requests
 */
function withTimeout(promise, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`AI request timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Validate and sanitize input error message
 */
function validateAndSanitizeInput(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    throw new Error('Invalid error message: must be a non-empty string');
  }
  
  // Trim and limit length
  let sanitized = errorMessage.trim().slice(0, CONFIG.MAX_PROMPT_LENGTH);
  
  // Remove potential injection attacks
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+=/gi, ''); // Remove event handlers
  
  // Check for minimum meaningful content
  if (sanitized.length < 10) {
    throw new Error('Error message too short (minimum 10 characters)');
  }
  
  return sanitized;
}

/**
 * User request rate limiting (in-memory)
 */
const userRequestCounts = new Map();

function checkUserRateLimit(userId, tier) {
  if (!userId) return () => {}; // No cleanup needed if no userId
  
  const limits = {
    free: { concurrent: 1, perMinute: 5 },
    pro: { concurrent: 3, perMinute: 20 },
    team: { concurrent: 10, perMinute: 100 }
  };
  
  const limit = limits[tier] || limits.free;
  const userRequests = userRequestCounts.get(userId) || { concurrent: 0, perMinute: [] };
  
  // Check concurrent requests
  if (userRequests.concurrent >= limit.concurrent) {
    throw new Error(`Too many concurrent AI requests (max ${limit.concurrent} for ${tier} tier)`);
  }
  
  // Check per-minute limit
  const oneMinuteAgo = Date.now() - 60000;
  const recentRequests = userRequests.perMinute.filter(t => t > oneMinuteAgo);
  
  if (recentRequests.length >= limit.perMinute) {
    const retryAfter = Math.ceil((recentRequests[0] + 60000 - Date.now()) / 1000);
    throw new Error(`AI rate limit exceeded (${limit.perMinute}/min for ${tier} tier). Retry after ${retryAfter}s`);
  }
  
  // Track request
  userRequests.concurrent++;
  userRequests.perMinute.push(Date.now());
  userRequestCounts.set(userId, userRequests);
  
  // Return cleanup function
  return () => {
    userRequests.concurrent = Math.max(0, userRequests.concurrent - 1);
    userRequestCounts.set(userId, userRequests);
  };
}

/**
 * Validate AI response structure
 */
function validateAIResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid AI response format: not an object');
  }
  
  const required = ['explanation', 'solution'];
  for (const field of required) {
    if (!response[field] || typeof response[field] !== 'string' || response[field].length < 50) {
      throw new Error(`AI response invalid: ${field} is missing or too short (min 50 chars)`);
    }
  }
  
  return true;
}

/**
 * Generate cache key from request parameters
 */
function generateCacheKey(errorMessage, language, errorType, subscriptionTier) {
  const key = `${subscriptionTier}:${language}:${errorType}:${errorMessage}`;
  return Buffer.from(key).toString('base64').substring(0, 64);
}

/**
 * Get cached response if available and not expired
 */
function getCachedResponse(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;
  
  const isExpired = Date.now() - cached.timestamp > CONFIG.CACHE_TTL_MS;
  if (isExpired) {
    responseCache.delete(cacheKey);
    return null;
  }
  
  console.log(`💾 Cache HIT: ${cacheKey.substring(0, 16)}...`);
  return cached.response;
}

/**
 * Cache a response
 */
function cacheResponse(cacheKey, response) {
  responseCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
  });
  
  // Cleanup old entries if cache is too large
  if (responseCache.size > 1000) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

/**
 * Retry async function with exponential backoff
 * A2: Enhanced to handle API errors, invalid JSON, and timeouts
 */
async function retryWithBackoff(fn, retries = CONFIG.MAX_RETRIES, context = 'operation') {
  let lastError = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      
      // A2: Validate JSON response structure
      if (result && typeof result === 'object') {
        // Check for required fields
        if (!result.explanation && !result.solution) {
          throw new Error('Invalid response: missing explanation and solution');
        }
      }
      
      return result;
    } catch (error) {
      lastError = error;
      const isLastRetry = i === retries - 1;
      const errorMessage = error?.message || String(error);
      
      // A2: Categorize error type for better logging
      const errorType = categorizeAPIError(error);
      console.warn(`⚠️  [${context}] Attempt ${i + 1}/${retries} failed: ${errorType} - ${errorMessage}`);
      
      // Don't retry on client errors (4xx) except rate limits (429)
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        console.error(`❌ [${context}] Client error (${error.status}), not retrying`);
        throw error;
      }
      
      if (isLastRetry) {
        console.error(`❌ [${context}] All ${retries} attempts failed`);
        throw error;
      }
      
      // Exponential backoff with jitter
      const baseDelay = CONFIG.RETRY_DELAY_MS * Math.pow(2, i);
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;
      
      console.log(`⏳ [${context}] Retry ${i + 1}/${retries} after ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * A2: Categorize API errors for better logging and handling
 */
function categorizeAPIError(error) {
  const message = error?.message?.toLowerCase() || '';
  const status = error?.status || error?.statusCode;
  
  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'RATE_LIMIT';
  }
  if (message.includes('timeout') || message.includes('timed out') || message.includes('ETIMEDOUT')) {
    return 'TIMEOUT';
  }
  if (message.includes('json') || message.includes('parse') || message.includes('unexpected token')) {
    return 'INVALID_JSON';
  }
  if (status >= 500 || message.includes('internal server error') || message.includes('service unavailable')) {
    return 'SERVER_ERROR';
  }
  if (message.includes('network') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
    return 'NETWORK_ERROR';
  }
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden')) {
    return 'AUTH_ERROR';
  }
  
  return 'UNKNOWN';
}

/**
 * A2: Create user-friendly error response
 */
function createUserFriendlyError(errorType, detectedLanguage, detectedErrorType, originalError = null) {
  const errorConfig = USER_FRIENDLY_ERRORS[errorType] || USER_FRIENDLY_ERRORS.generic;
  
  return {
    explanation: `**${errorConfig.title}**\n\n${errorConfig.message}`,
    solution: `**What you can do:**\n\n${errorConfig.suggestion}`,
    codeExample: '',
    category: 'system-error',
    tags: ['error', 'system', errorType],
    confidence: 0.0,
    severity: 'info',
    provider: 'error-handler',
    model: 'none',
    language: detectedLanguage || 'unknown',
    errorType: detectedErrorType || 'unknown',
    timestamp: new Date().toISOString(),
    isUserFriendlyError: true,
    errorDetails: {
      type: errorType,
      originalError: originalError?.message || null,
    }
  };
}

/**
 * Validate and sanitize input parameters
 */
function validateInput(errorMessage, subscriptionTier) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    throw new Error('errorMessage must be a non-empty string');
  }
  
  if (errorMessage.length > CONFIG.MAX_PROMPT_LENGTH) {
    console.warn(`⚠️  Error message truncated from ${errorMessage.length} to ${CONFIG.MAX_PROMPT_LENGTH} chars`);
    return errorMessage.substring(0, CONFIG.MAX_PROMPT_LENGTH);
  }
  
  const validTiers = ['free', 'pro', 'team'];
  if (!validTiers.includes(subscriptionTier)) {
    console.warn(`⚠️  Invalid tier "${subscriptionTier}", defaulting to "free"`);
    return 'free';
  }
  
  return errorMessage;
}

/**
 * Truncate text to max length
 */
function truncateText(text, maxLength = 3000) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Clean cache (remove expired entries)
 */
function cleanCache() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CONFIG.CACHE_TTL_MS) {
      responseCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }
}

// Run cache cleanup every 10 minutes
setInterval(cleanCache, 600000);

// ============================================================================
// MOCK RESPONSES
// ============================================================================

// Enhanced mock responses with categories, tags, and code examples
const mockResponses = {
  default: {
    explanation: 'This appears to be a software error requiring systematic analysis. The error may involve programming logic, algorithmic issues, or runtime behavior that needs careful debugging to identify the root cause.',
    solution: 'Apply systematic debugging: 1) Verify variable declarations and types, 2) Check function logic and control flow, 3) Validate input/output expectations, 4) Review algorithm correctness and complexity, 5) Ensure proper error handling and edge cases.',
    codeExample: '// Systematic debugging approach\nconst debugValue = (value, context) => {\n  console.log(`[DEBUG] ${context}:`, value, typeof value);\n  if (value === undefined || value === null) {\n    throw new Error(`Invalid value in ${context}`);\n  }\n  return value;\n};\n\n// Usage\nconst result = debugValue(myVar, "myVar check");',
    category: 'general',
    tags: ['debugging', 'general', 'logic', 'runtime'],
    confidence: 0.4,
    severity: 'medium',
    domainKnowledge: 'General debugging methodology and systematic error analysis'
  },
  typeerror: {
    explanation: 'TypeError occurs when an operation is performed on a value of the wrong type. This is a fundamental type safety violation in dynamically-typed languages. Common scenarios: accessing properties on undefined/null, calling non-functions, or type coercion failures. Root cause: lack of type guards and validation at critical boundaries.',
    solution: 'Implement defensive programming: 1) Use optional chaining (?.) for safe property access, 2) Add type guards with typeof/instanceof checks, 3) Validate function parameters, 4) Use nullish coalescing (??) for default values, 5) Consider TypeScript for compile-time type safety.',
    codeExample: '// Problem: Unsafe property access\nconst name = user.profile.name; // TypeError if user/profile is undefined\n\n// Solution 1: Optional chaining\nconst name = user?.profile?.name ?? \'Guest\';\n\n// Solution 2: Type guard\nfunction getUserName(user) {\n  if (!user || typeof user !== \'object\') return \'Guest\';\n  if (!user.profile || typeof user.profile !== \'object\') return \'Guest\';\n  return user.profile.name ?? \'Guest\';\n}\n\n// Solution 3: Validation utility\nconst validateObject = (obj, path) => {\n  return path.split(\'.\').reduce((acc, key) => \n    acc && typeof acc === \'object\' ? acc[key] : undefined, obj);\n};\nconst name = validateObject(user, \'profile.name\') ?? \'Guest\';',
    category: 'runtime',
    tags: ['javascript', 'typescript', 'runtime', 'type-checking', 'null-safety', 'defensive-programming'],
    confidence: 0.95,
    severity: 'high',
    domainKnowledge: 'Type theory, null safety patterns, defensive programming, JavaScript runtime behavior',
    preventionTips: [
      'Use TypeScript with strict null checks enabled',
      'Enable ESLint rules: no-unsafe-member-access, no-unsafe-call',
      'Implement input validation at function boundaries',
      'Use type guard functions for complex validation',
      'Apply null object pattern for default values'
    ]
  },
  referenceerror: {
    explanation: 'ReferenceError occurs when trying to use a variable that has not been declared or is not in the current scope. This often happens with typos, using variables before declaration (temporal dead zone), or scope issues.',
    solution: 'Declare variables with const/let/var before use, check for typos, and ensure variables are in scope. Use strict mode to catch undeclared variables.',
    codeExample: '// Error: variable used before declaration\nconsole.log(x); // ReferenceError\nlet x = 5;\n\n// Fix: declare before use\nlet x = 5;\nconsole.log(x); // Works!',
    category: 'scope',
    tags: ['javascript', 'scope', 'variables', 'hoisting'],
    confidence: 0.9,
    severity: 'high'
  },
  syntaxerror: {
    explanation: 'SyntaxError indicates that the code violates JavaScript syntax rules. Common causes include missing brackets, unclosed strings, invalid operators, or reserved keywords used incorrectly.',
    solution: 'Use a linter (ESLint) and code formatter (Prettier) to catch syntax errors early. Check for matching brackets, quotes, and proper statement terminators.',
    codeExample: '// Error: missing closing bracket\nfunction test() {\n  console.log(\'hello\');\n// Missing }\n\n// Fix:\nfunction test() {\n  console.log(\'hello\');\n}',
    category: 'syntax',
    tags: ['javascript', 'syntax', 'parsing', 'compilation'],
    confidence: 0.95,
    severity: 'critical'
  },
  indentationerror: {
    explanation: 'IndentationError occurs in Python when the indentation is not consistent or incorrect for the code structure. Python uses indentation to define code blocks, making it syntax-critical.',
    solution: 'Use consistent indentation (4 spaces recommended by PEP 8). Configure your editor to use spaces instead of tabs. Use a Python formatter like Black.',
    codeExample: '# Error: inconsistent indentation\ndef greet():\n  print("Hello")\n    print("World")  # Wrong indentation\n\n# Fix:\ndef greet():\n    print("Hello")\n    print("World")  # Correct',
    category: 'syntax',
    tags: ['python', 'indentation', 'syntax', 'pep8'],
    confidence: 0.95,
    severity: 'critical'
  },
  nameerror: {
    explanation: 'NameError in Python occurs when trying to use a variable or function that hasn\'t been defined in the current scope. Common causes include typos, using before definition, or incorrect import statements.',
    solution: 'Define variables before use, check spelling, ensure proper imports, and verify scope. Use try-except to handle optional variables gracefully.',
    codeExample: '# Error: using undefined variable\nprint(user_name)  # NameError\n\n# Fix: define first\nuser_name = "John"\nprint(user_name)  # Works!',
    category: 'scope',
    tags: ['python', 'scope', 'variables', 'imports'],
    confidence: 0.9,
    severity: 'high'
  },
  nullpointer: {
    explanation: 'NullPointerException (Java) occurs when trying to use an object reference that points to null. This is similar to JavaScript TypeError and requires null safety checks.',
    solution: 'Always check for null before dereferencing. Use Optional<T> in Java 8+, or implement null object pattern. Enable null safety warnings.',
    codeExample: '// Error: null dereference\nString name = user.getName(); // NPE if user is null\n\n// Fix with null check\nif (user != null) {\n  String name = user.getName();\n}\n\n// Fix with Optional\nOptional.ofNullable(user)\n  .map(User::getName)\n  .orElse("Unknown");',
    category: 'runtime',
    tags: ['java', 'null-safety', 'runtime', 'optional'],
    confidence: 0.9,
    severity: 'high'
  },
  importerror: {
    explanation: 'ImportError occurs when Python cannot find or load a module. Common causes include missing packages, incorrect module names, or circular imports.',
    solution: 'Install missing packages with pip, check module spelling, verify PYTHONPATH, and restructure code to avoid circular dependencies.',
    codeExample: '# Error: module not found\nimport nonexistent_module  # ImportError\n\n# Fix: install package\n# pip install package-name\nimport actual_module',
    category: 'dependency',
    tags: ['python', 'imports', 'dependencies', 'modules'],
    confidence: 0.85,
    severity: 'medium'
  },
  networkerror: {
    explanation: 'Network errors occur during HTTP requests, API calls, or WebSocket connections. Common causes include CORS issues, network timeouts, server unavailability, or incorrect endpoints.',
    solution: 'Implement retry logic with exponential backoff, add proper error handling, check CORS configuration, verify endpoints, and add timeout settings.',
    codeExample: '// Error: unhandled fetch\nconst data = await fetch(url); // May fail\n\n// Fix: proper error handling\ntry {\n  const response = await fetch(url, { timeout: 5000 });\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  const data = await response.json();\n} catch (error) {\n  console.error(\'Network error:\', error);\n  // Implement retry or fallback\n}',
    category: 'network',
    tags: ['network', 'http', 'api', 'cors', 'timeout'],
    confidence: 0.8,
    severity: 'medium'
  },
  algorithmerror: {
    explanation: 'Algorithm error indicates incorrect logic in solving a computational problem. This involves wrong algorithm choice, incorrect implementation, off-by-one errors, boundary condition failures, or suboptimal time/space complexity. Common in: sorting, searching, graph traversal, dynamic programming, and recursion.',
    solution: 'Debug systematically: 1) Verify algorithm correctness with small test cases, 2) Check base cases and edge conditions, 3) Trace algorithm execution step-by-step, 4) Validate loop invariants, 5) Analyze time/space complexity, 6) Consider optimal algorithm alternatives (e.g., binary search vs linear, hash table vs array).',
    codeExample: '// Problem: Linear search - O(n) complexity\nfunction findValue(arr, target) {\n  for (let i = 0; i < arr.length; i++) {\n    if (arr[i] === target) return i;\n  }\n  return -1;\n}\n\n// Optimized: Binary search - O(log n) for sorted arrays\nfunction binarySearch(arr, target) {\n  let left = 0, right = arr.length - 1;\n  \n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    \n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  \n  return -1; // Not found\n}\n\n// Usage: Requires sorted array\nconst sortedArr = [1, 3, 5, 7, 9, 11, 13];\nconst index = binarySearch(sortedArr, 7); // Returns 3\n\n// Complexity: O(log n) time, O(1) space',
    category: 'algorithm',
    tags: ['algorithm', 'DSA', 'complexity', 'optimization', 'logic', 'searching', 'sorting'],
    confidence: 0.9,
    severity: 'medium',
    domainKnowledge: 'Algorithm design, complexity analysis (Big O notation), search algorithms, optimization techniques',
    preventionTips: [
      'Always analyze algorithm complexity before implementation',
      'Test with edge cases: empty input, single element, large datasets',
      'Use appropriate data structures (hash tables for O(1) lookup, heaps for priority queues)',
      'Verify loop invariants and termination conditions',
      'Consider trade-offs between time and space complexity'
    ],
    complexity: 'Binary search: O(log n) time, O(1) space. Linear search: O(n) time, O(1) space.'
  },
  indexerror: {
    explanation: 'Index error (Array/List IndexOutOfBounds) occurs when accessing array elements with invalid indices. Common causes: off-by-one errors in loops, accessing empty arrays, negative indices (except Python), or exceeding array bounds. This is a fundamental array access violation.',
    solution: 'Implement bounds checking: 1) Validate array length before access, 2) Use array methods (forEach, map, filter) instead of manual indexing, 3) Check loop boundaries (i < arr.length, not i <= arr.length), 4) Use optional chaining for safe access, 5) Guard against empty arrays.',
    codeExample: '// Problem: Off-by-one error\nconst arr = [1, 2, 3, 4, 5];\nfor (let i = 0; i <= arr.length; i++) { // BUG: should be i < arr.length\n  console.log(arr[i]); // Error on last iteration\n}\n\n// Solution 1: Correct loop bounds\nfor (let i = 0; i < arr.length; i++) {\n  console.log(arr[i]);\n}\n\n// Solution 2: Use array methods (preferred)\narr.forEach(item => console.log(item));\n\n// Solution 3: Safe access with validation\nfunction safeGet(arr, index, defaultValue = null) {\n  if (!Array.isArray(arr)) return defaultValue;\n  if (index < 0 || index >= arr.length) return defaultValue;\n  return arr[index];\n}\n\nconst value = safeGet(arr, 10, \'not found\'); // Returns \'not found\'',
    category: 'runtime',
    tags: ['array', 'indexing', 'bounds-checking', 'off-by-one', 'runtime', 'DSA'],
    confidence: 0.95,
    severity: 'high',
    domainKnowledge: 'Array data structure, index-based access, loop invariants, boundary conditions',
    preventionTips: [
      'Always use i < array.length, never i <= array.length',
      'Prefer array methods (map, filter, forEach) over manual loops',
      'Validate array length before accessing elements',
      'Use array.at(-1) for last element instead of array[array.length]',
      'Enable strict array bounds checking in development'
    ]
  },
  logicerror: {
    explanation: 'Logic error represents flawed reasoning in program design, causing incorrect results despite syntactically valid code. Unlike syntax/runtime errors, these don\'t crash but produce wrong output. Common sources: incorrect conditionals, flawed algorithm logic, wrong mathematical formulas, incorrect operator usage (= vs ==), or misunderstood requirements.',
    solution: 'Apply systematic logical analysis: 1) Define expected vs actual behavior precisely, 2) Use truth tables for complex conditions, 3) Trace execution with concrete examples, 4) Verify mathematical correctness of formulas, 5) Check operator precedence and associativity, 6) Review algorithm against formal specification, 7) Add assertions to verify assumptions.',
    codeExample: '// Problem: Logic error in conditional\nfunction isEligibleForDiscount(age, isPremium) {\n  // BUG: Wrong logic - OR should be AND\n  if (age > 60 || isPremium) {\n    return true;\n  }\n  return false;\n}\n\n// Intended: Discount for premium members over 60\n// Actual: Discount for ANYONE over 60 OR any premium member\n\n// Solution: Correct logical operator\nfunction isEligibleForDiscount(age, isPremium) {\n  return age > 60 && isPremium; // Both conditions must be true\n}\n\n// Logic error in calculation\nfunction calculateAverage(numbers) {\n  // BUG: Division should be by count, not total\n  const sum = numbers.reduce((a, b) => a + b, 0);\n  return sum / sum; // Always returns 1! Should be sum / numbers.length\n}\n\n// Solution: Correct mathematical formula\nfunction calculateAverage(numbers) {\n  if (numbers.length === 0) return 0; // Edge case\n  const sum = numbers.reduce((a, b) => a + b, 0);\n  return sum / numbers.length; // Correct average formula\n}',
    category: 'logic',
    tags: ['logic', 'reasoning', 'conditional', 'boolean-logic', 'algorithm', 'mathematics'],
    confidence: 0.85,
    severity: 'high',
    domainKnowledge: 'Boolean logic, propositional logic, mathematical reasoning, algorithm correctness, truth tables',
    preventionTips: [
      'Use truth tables to verify complex conditions',
      'Write unit tests for all logical branches',
      'Add assertions to validate assumptions and invariants',
      'Perform code review focusing on logic correctness',
      'Use mathematical proofs for algorithm correctness',
      'Test with boundary values and edge cases'
    ]
  },
  mathematicalerror: {
    explanation: 'Mathematical error involves incorrect mathematical operations, formulas, or numerical computations. Common issues: division by zero, integer overflow, floating-point precision errors, wrong formula implementation, incorrect unit conversions, or improper handling of mathematical edge cases (infinity, NaN).',
    solution: 'Apply mathematical rigor: 1) Validate mathematical preconditions (e.g., check for zero before division), 2) Use appropriate number types (integer vs float vs decimal), 3) Handle floating-point precision with tolerance margins, 4) Verify formulas against mathematical references, 5) Check for overflow/underflow in calculations, 6) Use standard math libraries for complex operations.',
    codeExample: '// Problem 1: Division by zero\nfunction divide(a, b) {\n  return a / b; // Error if b === 0\n}\n\n// Solution: Validate inputs\nfunction safeDivide(a, b) {\n  if (b === 0) {\n    throw new Error(\'Division by zero\');\n    // Or return: Infinity, null, or default value\n  }\n  return a / b;\n}\n\n// Problem 2: Floating-point precision\nfunction isEqual(a, b) {\n  return a === b; // 0.1 + 0.2 === 0.3 returns false!\n}\n\n// Solution: Use epsilon for comparison\nfunction floatEquals(a, b, epsilon = 1e-10) {\n  return Math.abs(a - b) < epsilon;\n}\n\nconsole.log(floatEquals(0.1 + 0.2, 0.3)); // true\n\n// Problem 3: Wrong formula for compound interest\nfunction wrongCompoundInterest(principal, rate, time) {\n  return principal * rate * time; // Simple interest formula!\n}\n\n// Solution: Correct compound interest formula\nfunction compoundInterest(principal, rate, time, n = 1) {\n  // A = P(1 + r/n)^(nt)\n  // n = number of times interest compounds per year\n  return principal * Math.pow(1 + rate / n, n * time);\n}\n\nconst amount = compoundInterest(1000, 0.05, 10, 4); // Quarterly compounding',
    category: 'mathematical',
    tags: ['mathematics', 'numerical-computation', 'floating-point', 'precision', 'formulas', 'algebra'],
    confidence: 0.9,
    severity: 'high',
    domainKnowledge: 'Numerical analysis, floating-point arithmetic (IEEE 754), mathematical formulas, error propagation, computational mathematics',
    preventionTips: [
      'Always validate mathematical preconditions (non-zero divisors, non-negative for sqrt)',
      'Use epsilon-based comparison for floating-point equality',
      'Consider using decimal/big number libraries for financial calculations',
      'Verify formulas against authoritative mathematical references',
      'Test with mathematical edge cases: 0, 1, infinity, very large/small numbers',
      'Document mathematical assumptions and invariants'
    ],
    complexity: 'Mathematical operations: O(1) for basic arithmetic, O(log n) for power operations'
  },
  architecturalerror: {
    explanation: 'Architectural issues involve system design problems, scalability concerns, or improper use of design patterns. Common causes: tight coupling, lack of separation of concerns, monolithic design when microservices are needed, missing abstractions, or violation of architectural principles like SOLID.',
    solution: 'Apply architectural best practices: 1) Identify coupling points and introduce abstractions, 2) Apply appropriate design patterns (Factory, Strategy, Observer, etc.), 3) Consider scalability requirements, 4) Implement proper separation of concerns, 5) Use dependency injection for loose coupling, 6) Document architectural decisions.',
    codeExample: '// Problem: Tight coupling\nclass UserService {\n  constructor() {\n    this.db = new MySQLDatabase(); // Tight coupling!\n  }\n}\n\n// Solution: Dependency injection with interface\nclass UserService {\n  constructor(database) {\n    this.database = database; // Loose coupling via interface\n  }\n  \n  async getUser(id) {\n    return await this.database.query(\'SELECT * FROM users WHERE id = ?\', [id]);\n  }\n}\n\n// Usage with any database\nconst mysqlDb = new MySQLDatabase();\nconst postgresDb = new PostgreSQLDatabase();\nconst userService = new UserService(mysqlDb); // Easy to swap!',
    category: 'architectural',
    tags: ['architecture', 'design-patterns', 'SOLID', 'scalability', 'coupling', 'abstraction'],
    confidence: 0.85,
    severity: 'high',
    domainKnowledge: 'Software architecture, design patterns (SOLID, DI, IoC), separation of concerns, scalability principles',
    preventionTips: [
      'Apply SOLID principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion)',
      'Use design patterns appropriately (not over-engineering)',
      'Document architectural decisions and rationale',
      'Regular architecture reviews and refactoring',
      'Consider scalability and maintainability from the start'
    ]
  },
  configurationerror: {
    explanation: 'Configuration errors occur due to incorrect environment setup, missing configuration files, wrong API keys, incorrect database connections, or misconfigured tools/services. These are operational issues that prevent proper application functionality.',
    solution: 'Systematic configuration management: 1) Use environment variables for sensitive data, 2) Validate configuration at startup, 3) Implement configuration schemas, 4) Use configuration management tools (dotenv, config), 5) Document required configurations, 6) Provide example configuration files, 7) Implement health checks.',
    codeExample: '// Problem: Hard-coded configuration\nconst API_URL = \'https://api.example.com\';\nconst API_KEY = \'12345\'; // Security risk!\n\n// Solution: Environment-based configuration\nrequire(\'dotenv\').config();\n\nconst config = {\n  api: {\n    url: process.env.API_URL || \'https://api.example.com\',\n    key: process.env.API_KEY,\n    timeout: parseInt(process.env.API_TIMEOUT) || 5000\n  },\n  database: {\n    host: process.env.DB_HOST,\n    port: parseInt(process.env.DB_PORT) || 5432,\n    name: process.env.DB_NAME\n  }\n};\n\n// Validate required config\nfunction validateConfig() {\n  const required = [\'API_KEY\', \'DB_HOST\', \'DB_NAME\'];\n  const missing = required.filter(key => !process.env[key]);\n  \n  if (missing.length > 0) {\n    throw new Error(`Missing required config: ${missing.join(\', \')}`);\n  }\n}\n\nvalidateConfig();\nmodule.exports = config;',
    category: 'configuration',
    tags: ['configuration', 'environment', 'devops', 'deployment', 'security'],
    confidence: 0.9,
    severity: 'medium',
    domainKnowledge: 'Configuration management, environment variables, 12-factor app principles, security best practices',
    preventionTips: [
      'Never commit sensitive data (use .gitignore for .env files)',
      'Provide .env.example with all required variables',
      'Validate configuration at application startup',
      'Use configuration management tools (AWS Systems Manager, Azure Key Vault)',
      'Document configuration requirements clearly'
    ]
  },
  deploymentissue: {
    explanation: 'Deployment issues arise during application deployment to production or staging environments. Common causes: environment differences, missing dependencies, incorrect build configuration, network/firewall issues, permission problems, or CI/CD pipeline failures.',
    solution: 'Implement robust deployment practices: 1) Use containerization (Docker) for consistency, 2) Implement CI/CD pipelines with automated testing, 3) Use infrastructure as code (Terraform, CloudFormation), 4) Implement health checks and readiness probes, 5) Use blue-green or canary deployments, 6) Monitor deployment metrics, 7) Have rollback procedures.',
    codeExample: '# Docker deployment example\n# Dockerfile\nFROM node:18-alpine\nWORKDIR /app\n\n# Copy package files\nCOPY package*.json ./\n\n# Install dependencies\nRUN npm ci --only=production\n\n# Copy application code\nCOPY . .\n\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=5s \\\n  CMD node healthcheck.js || exit 1\n\n# Run as non-root user\nUSER node\n\nEXPOSE 3000\nCMD ["node", "server.js"]\n\n# docker-compose.yml for local testing\nversion: \'3.8\'\nservices:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      - NODE_ENV=production\n      - DATABASE_URL=${DATABASE_URL}\n    restart: unless-stopped',
    category: 'deployment',
    tags: ['deployment', 'devops', 'ci-cd', 'docker', 'infrastructure', 'production'],
    confidence: 0.85,
    severity: 'high',
    domainKnowledge: 'DevOps practices, CI/CD pipelines, containerization, infrastructure as code, deployment strategies',
    preventionTips: [
      'Use identical environments for dev, staging, and production',
      'Automate deployments with CI/CD (GitHub Actions, GitLab CI, Jenkins)',
      'Implement comprehensive testing before deployment',
      'Use deployment strategies (blue-green, canary, rolling)',
      'Monitor deployments with alerts and rollback capabilities',
      'Document deployment procedures and runbooks'
    ]
  },
  performanceissue: {
    explanation: 'Performance issues manifest as slow response times, high resource usage, or system bottlenecks. Common causes: inefficient algorithms (O(n²) vs O(n log n)), N+1 query problems, missing database indexes, memory leaks, blocking operations, lack of caching, or poor resource management.',
    solution: 'Apply performance optimization strategies: 1) Profile code to identify bottlenecks, 2) Optimize algorithms and data structures, 3) Implement caching (Redis, CDN), 4) Add database indexes, 5) Use async/parallel processing, 6) Implement pagination/lazy loading, 7) Optimize queries and reduce N+1 problems, 8) Monitor resource usage.',
    codeExample: '// Problem: N+1 query issue\nasync function getUsers() {\n  const users = await User.findAll();\n  \n  // N+1 problem: separate query for each user\n  for (const user of users) {\n    user.posts = await Post.findAll({ where: { userId: user.id } });\n  }\n  \n  return users;\n}\n\n// Solution: Eager loading with JOIN\nasync function getUsersOptimized() {\n  const users = await User.findAll({\n    include: [{\n      model: Post,\n      as: \'posts\'\n    }]\n  });\n  \n  return users; // Single query with JOIN\n}\n\n// Additional optimization: Caching\nconst cache = new Map();\n\nasync function getUsersCached() {\n  const cacheKey = \'users_with_posts\';\n  \n  if (cache.has(cacheKey)) {\n    return cache.get(cacheKey);\n  }\n  \n  const users = await getUsersOptimized();\n  cache.set(cacheKey, users);\n  \n  // Expire cache after 5 minutes\n  setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);\n  \n  return users;\n}',
    category: 'performance',
    tags: ['performance', 'optimization', 'caching', 'database', 'algorithms', 'profiling'],
    confidence: 0.9,
    severity: 'high',
    domainKnowledge: 'Performance optimization, caching strategies, database optimization, algorithm complexity, profiling tools',
    preventionTips: [
      'Profile regularly using tools (Chrome DevTools, Node.js profiler)',
      'Implement monitoring and alerting for performance metrics',
      'Use appropriate data structures and algorithms',
      'Add database indexes on frequently queried columns',
      'Implement caching at multiple levels (application, database, CDN)',
      'Use pagination for large datasets',
      'Optimize database queries and avoid N+1 problems'
    ],
    complexity: 'Performance optimization often involves reducing time complexity from O(n²) to O(n log n) or O(n)'
  }
};

function createPrompt(errorMessage, language, errorType, subscriptionTier, codeContext = {}) {
  // Universal AI assistant for ANY problem - not just code
  let prompt = `You are ErrorWise AI, an intelligent assistant that helps ANYONE solve ANY problem in the real world.

💡 **WHO I HELP:**
• **Developers**: Debug code, optimize performance, learn new tech
• **Students**: Math, Science, Physics, Chemistry, Biology homework
• **Professionals**: Excel, Data Analysis, Business decisions, Marketing
• **Regular People**: Tech issues, DIY fixes, Learning anything new
• **Everyone**: Life advice, problem-solving, decision-making

🎯 **WHAT I DO:**
I solve real-world problems by:
• Understanding context naturally (you don't need to be technical)
• Giving practical solutions that actually work
• Explaining things clearly without jargon
• Adapting to your level (beginner or expert)
• Providing step-by-step guidance

� **MY KNOWLEDGE SPANS:**
• **Technology**: All programming languages, frameworks, tools, software troubleshooting
• **Mathematics**: Algebra, Calculus, Statistics, Geometry, Applied Math
• **Sciences**: Physics, Chemistry, Biology, Environmental Science
• **Business**: Excel, Finance, Marketing, Strategy, Management
• **Education**: Learning techniques, Study methods, Career guidance
• **Daily Life**: Tech support, Productivity tips, Problem-solving
• **Indian Context**: Full support for हिंदी, தமிழ், తెలుగు, മലയാളം, ಕನ್ನಡ, বাংলা and all Indian languages, culture, and context

📋 **YOUR PROBLEM:**
Issue: """${errorMessage}"""
${language ? `Context: ${language}` : 'General Question'}
${errorType ? `Type: ${errorType}` : ''}
`;
  
  // Add code context if provided (for programming problems)
  if (codeContext.codeSnippet) {
    prompt += `\n📄 **CODE/DATA PROVIDED:**\n`;
    if (codeContext.fileName) {
      prompt += `File: ${codeContext.fileName}\n`;
    }
    if (codeContext.lineNumber) {
      prompt += `Line: ${codeContext.lineNumber}\n`;
    }
    prompt += `Code Snippet:\n\`\`\`${language}\n${codeContext.codeSnippet}\n\`\`\`\n`;
  }

  // Add framework and dependencies context with versions
  if (codeContext.framework) {
    prompt += `Framework: ${codeContext.framework}\n`;
  }
  if (codeContext.dependencies && codeContext.dependencies.length > 0) {
    prompt += `Dependencies: ${codeContext.dependencies.join(', ')}\n`;
    prompt += `⚠️ Ensure solutions work with these specific versions - check for breaking changes.\n`;
  }

  // Add stack trace if available
  if (codeContext.stackTrace && codeContext.stackTrace.length > 0) {
    prompt += `\n📊 **STACK TRACE:**\n`;
    codeContext.stackTrace.slice(0, 3).forEach((frame, idx) => {
      prompt += `${idx + 1}. ${frame.function} at ${frame.file}:${frame.line}:${frame.column}\n`;
    });
  }
  
  // Add URL context if available (scraped documentation/resources)
  if (codeContext.urlContext && codeContext.urlContext.length > 0) {
    prompt += `\n🔗 **REFERENCED DOCUMENTATION:**\n`;
    codeContext.urlContext.forEach((urlInfo, idx) => {
      if (urlInfo.relevance !== 'low') {
        prompt += `\n${idx + 1}. Source: ${urlInfo.url}\n`;
        prompt += `   Summary: ${urlInfo.summary}\n`;
        if (urlInfo.keyPoints && urlInfo.keyPoints.length > 0) {
          prompt += `   Key Points:\n`;
          urlInfo.keyPoints.forEach(point => {
            prompt += `   • ${point}\n`;
          });
        }
      }
    });
    prompt += `\n⚠️ Use this documentation context to provide more accurate and specific solutions.\n`;
  }
  
  prompt += `\n🎯 **PROVIDE REAL-WORLD SOLUTIONS:**\n`;
  prompt += `1. **Clear Explanation**: What's the problem and why it happened (in simple terms)\n`;
  prompt += `2. **Working Solution**: Give practical steps that actually work in real life\n`;
  prompt += `3. **Current Standards**: Use 2025 best practices, latest tools, modern approaches\n`;
  prompt += `4. **Real Constraints**: Consider time, cost, difficulty, resources available\n`;
  prompt += `5. **Practical Examples**: Show actual working examples (code, formulas, steps)\n`;
  prompt += `6. **Easy to Follow**: Break complex solutions into simple steps anyone can do\n`;
  if (codeContext.urlContext && codeContext.urlContext.length > 0) {
    prompt += `7. **Documentation-Based**: Use official sources provided for accuracy\n`;
  }
  prompt += `\n⚠️ CRITICAL: Solutions must be:\n`;
  prompt += `• Tested and proven to work (not experimental)\n`;
  prompt += `• Accessible to regular people (not just experts)\n`;
  prompt += `• Available with current tools/resources (no outdated methods)\n`;
  prompt += `• Safe and ethical (no harmful advice)\n\n`;

  switch (subscriptionTier) {
    case 'free':
      prompt += '📤 **RESPONSE FORMAT (JSON):**\n';
      prompt += '{\n';
      prompt += '  "explanation": "Write a clear, friendly explanation (3-4 sentences) of what the problem is, why it occurred, and what principle/concept is involved. Use simple language anyone can understand.",\n';
      prompt += '  "solution": "Provide a precise, accurate solution with clear steps (3-4 sentences). Make it actionable - what should the person DO right now? Include specific commands, settings, or actions.",\n';
      prompt += '  "codeExample": "Show working code/formula/example that demonstrates the solution (if applicable). Include comments explaining what changed.",\n';
      prompt += '  "sources": [\n';
      prompt += '    {\n';
      prompt += '      "title": "Official documentation or authoritative resource title",\n';
      prompt += '      "url": "https://example.com/relevant-docs",\n';
      prompt += '      "description": "Brief description of what this source covers (1-2 sentences)"\n';
      prompt += '    },\n';
      prompt += '    {\n';
      prompt += '      "title": "Second relevant resource (tutorial, guide, or reference)",\n';
      prompt += '      "url": "https://example.com/helpful-resource",\n';
      prompt += '      "description": "Why this source is helpful for understanding or solving the problem"\n';
      prompt += '    }\n';
      prompt += '  ],\n';
      prompt += '  "category": "Type of problem (e.g., code-syntax, math-algebra, tech-setup, excel-formula, general-advice)",\n';
      prompt += '  "tags": ["relevant", "keywords", "describing", "this", "problem"],\n';
      prompt += '  "confidence": 0.85,\n';
      prompt += '  "domainKnowledge": "Brief mention of the relevant concept (e.g., \'Functions\', \'Quadratic Equations\', \'WiFi Connectivity\')"\n';
      prompt += '}\n\n';
      prompt += '⚠️ **IMPORTANT:**\n';
      prompt += '• Use simple, conversational language - like explaining to a friend\n';
      prompt += '• Avoid jargon unless necessary (then explain it)\n';
      prompt += '• Solutions must be PRECISE and ACCURATE - this is critical for free users\n';
      prompt += '• Provide 2 high-quality, authoritative sources/references (official docs, MDN, W3C, trusted tutorials)\n';
      prompt += '• Sources must be real, working URLs from reputable platforms (no placeholders)\n';
      prompt += '• Examples should be real-world and practical\n';
      prompt += '• Give free users the SAME quality as paid tiers - just shorter format\n';
      prompt += '• Respond in valid JSON format\n';
      break;
    case 'pro':
      prompt += '📤 **RESPONSE FORMAT (JSON):**\n';
      prompt += '{\n';
      prompt += '  "explanation": "Write a comprehensive explanation (5-6 sentences) covering the root cause, why this happens, technical concepts, and broader context. Clear professional language.",\n';
      prompt += '  "solution": "Provide a comprehensive solution with 3-4 specific steps. Explain each step clearly and include alternative approaches when relevant.",\n';
      prompt += '  "codeExample": "Show a complete, production-ready code example with detailed comments explaining the logic and best practices.",\n';
      prompt += '  "category": "Specify the error category and sub-type",\n';
      prompt += '  "tags": ["relevant", "keywords", "covering", "language", "framework", "concept"],\n';
      prompt += '  "confidence": 0.9,\n';
      prompt += '  "domainKnowledge": "Explain the technical concepts and principles involved in detail.",\n';
      prompt += '  "preventionTips": ["Practical tip 1", "Practical tip 2", "Testing strategy"],\n';
      prompt += '  "complexity": "Time and space complexity if algorithm-related, or implementation complexity"\n';
      prompt += '}\n\n';
      prompt += '⚠️ **IMPORTANT:**\n';
      prompt += '• Use clear, professional English with proper technical terminology\n';
      prompt += '• Explain concepts thoroughly but in an accessible way\n';
      prompt += '• Include practical best practices and prevention strategies\n';
      prompt += '• Make all code examples complete and production-ready\n';
      prompt += '• Use proper grammar and sentence structure throughout\n';
      prompt += '• For Indian language queries: Respond in the same language with proper script and cultural context\n';
      prompt += '• For Indian cultural/food topics: Provide accurate historical facts, regional variations, and authentic details\n';
      prompt += '• For India-related updates: Include latest developments, government initiatives, and global impact\n';
      break;
    case 'team':
      prompt += '📤 **OUTPUT FORMAT (JSON):**\n';
      prompt += '{\n';
      prompt += '  "explanation": "Comprehensive 7-10 line explanation covering: deep root cause analysis, theoretical foundations (mathematical/logical/algorithmic/architectural/business), why current approach is suboptimal, performance implications, scalability considerations, and practical/business impact",\n';
      prompt += '  "solution": "Multi-faceted solution with: immediate fix, optimal approach, scalable implementation, production considerations, and business/operational implications. Include multiple solution strategies if applicable.",\n';
      prompt += '  "codeExample": "Enterprise-grade code/guidance with: proper error handling, input validation, edge cases, performance optimizations, security considerations, monitoring hooks, and comprehensive comments explaining logic, complexity, trade-offs, and business rationale",\n';
      prompt += '  "category": "granular error/query classification with hierarchy",\n';
      prompt += '  "tags": ["language", "framework", "library", "error-type", "domain", "algorithm", "pattern", "complexity-class", "paradigm", "tool", "methodology", "concept", "business-domain"],\n';
      prompt += '  "confidence": 0.95,\n';
      prompt += '  "domainKnowledge": "In-depth explanation of all domain knowledge applied including: algorithms (with complexity), data structures (with trade-offs), mathematical concepts (with proofs/reasoning), design patterns, architectural patterns, methodologies (Agile/DevOps/etc.), business concepts, industry standards, and theoretical foundations",\n';
      prompt += '  "preventionTips": ["architectural best practice", "testing strategy", "monitoring approach", "code review checklist item", "process improvement", "documentation standard"],\n';
      prompt += '  "complexity": "Detailed complexity analysis: time complexity (best/average/worst case), space complexity, implementation complexity, operational complexity, and optimization opportunities",\n';
      prompt += '  "relatedErrors": ["similar error pattern 1 with brief context", "similar error pattern 2 with brief context", "related concept/issue"],\n';
      prompt += '  "debugging": ["systematic debugging step 1", "diagnostic command/tool", "validation technique", "monitoring strategy"],\n';
      prompt += '  "alternatives": ["alternative approach 1 with pros/cons/use cases", "alternative approach 2 with technical and business trade-offs"],\n';
      prompt += '  "resources": ["relevant algorithm/concept reference", "best practice guide", "documentation link", "tool/framework resource", "methodology guide"]\n';
      prompt += '}\n\n';
      prompt += '⚠️ **CRITICAL REQUIREMENTS:**\n';
      prompt += '• Apply rigorous mathematical and logical reasoning\n';
      prompt += '• For algorithms: provide optimal solution with complexity proof\n';
      prompt += '• For logic errors: show correct reasoning path with formal logic if needed\n';
      prompt += '• For mathematical problems: include formulas, proofs, or derivations\n';
      prompt += '• For DSA: explain choice of data structure and algorithm with trade-off analysis\n';
      prompt += '• For architecture: explain patterns, scalability, and system design\n';
      prompt += '• For processes: reference methodologies, best practices, and industry standards\n';
      prompt += '• For tools: explain proper usage, configuration, and integration\n';
      prompt += '• Include quantitative analysis where relevant (performance metrics, probabilities, etc.)\n';
      prompt += '• Consider business impact, operational concerns, and team collaboration aspects\n';
      prompt += '• Cross-reference with computer science theory, industry best practices, and business principles\n';
      prompt += '• For Indian language queries: Provide responses in the requested language (Hindi, Sanskrit, Kannada, Marathi, Bengali, Odia, Kashmiri, Punjabi, Tamil, Telugu, Malayalam, Rajasthani) with proper Unicode script support\n';
      prompt += '• For Indian cultural topics: Reference authentic sources, provide historical context (Vedic period, Mughal era, modern India), regional variations across states, and accurate cultural practices\n';
      prompt += '• For Indian cuisine: Include regional authenticity (North: Punjabi, Mughlai; South: Tamil, Kerala, Karnataka; East: Bengali, Odia; West: Gujarati, Maharashtrian), traditional cooking methods (tandoor, tawa, pressure cooking), ingredient origins, nutritional facts, and festival-specific dishes\n';
      prompt += '• For India global updates: Cover tech industry (Bangalore/Hyderabad startups, unicorns), ISRO achievements, government initiatives (Digital India, Make in India, Startup India), international collaborations, Indian diaspora contributions, economic indicators, and cultural exports\n';
      break;
    default:
      prompt += 'Provide a comprehensive JSON response explaining the error across all relevant domains and how to fix it properly.\n';
  }

  prompt += `\n✅ **QUALITY CHECKLIST:**\n`;
  prompt += `• Solutions are technically accurate and can be directly applied\n`;
  prompt += `• Explanations use clear, natural English that's easy to read\n`;
  prompt += `• Code examples are syntactically correct and follow best practices\n`;
  prompt += `• All sentences are grammatically correct with proper punctuation\n`;
  prompt += `• Technical concepts are explained in an accessible way\n`;
  prompt += `• Solutions are practical and actionable\n`;
  prompt += `• Response is in valid JSON format\n`;

  return prompt;
}

function detectErrorType(errorMessage) {
  const msg = errorMessage ? errorMessage.toLowerCase() : '';
  
  // Syntax errors
  if (msg.includes('syntax') || msg.includes('unexpected token') || msg.includes('unexpected identifier')) {
    return 'syntax';
  }
  
  // Type errors
  if (msg.includes('type') && msg.includes('error')) return 'type';
  if (msg.includes('cannot read property') || msg.includes('cannot read properties')) return 'type';
  if (msg.includes('undefined is not') || msg.includes('null is not')) return 'type';
  
  // Reference/Scope errors
  if (msg.includes('reference') || msg.includes('is not defined')) return 'scope';
  if (msg.includes('name') && msg.includes('error')) return 'scope';
  
  // Index/Array errors
  if (msg.includes('index') && (msg.includes('error') || msg.includes('out of') || msg.includes('bounds'))) {
    return 'index';
  }
  
  // Algorithm/Performance errors
  if (msg.includes('time limit') || msg.includes('timeout exceeded') || msg.includes('maximum call stack')) {
    return 'algorithm';
  }
  if (msg.includes('stack overflow') || msg.includes('recursion')) return 'algorithm';
  
  // Mathematical errors
  if (msg.includes('division by zero') || msg.includes('divide by zero')) return 'mathematical';
  if (msg.includes('overflow') || msg.includes('underflow')) return 'mathematical';
  if (msg.includes('nan') || msg.includes('infinity')) return 'mathematical';
  
  // Logic errors
  if (msg.includes('assertion') || msg.includes('expected') || msg.includes('incorrect result')) {
    return 'logic';
  }
  
  // Network errors
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('cors')) return 'network';
  if (msg.includes('timeout') && !msg.includes('limit')) return 'network';
  if (msg.includes('connection') || msg.includes('refused')) return 'network';
  
  // Import/Dependency errors
  if (msg.includes('import') || msg.includes('module')) return 'dependency';
  if (msg.includes('cannot find') && msg.includes('module')) return 'dependency';
  
  // Architectural errors
  if (msg.includes('architecture') || msg.includes('design pattern')) return 'architectural';
  if (msg.includes('coupling') || msg.includes('solid')) return 'architectural';
  if (msg.includes('microservice') || msg.includes('monolith')) return 'architectural';
  
  // Configuration errors
  if (msg.includes('config') || msg.includes('environment')) return 'configuration';
  if (msg.includes('api key') || msg.includes('credentials')) return 'configuration';
  if (msg.includes('.env') || msg.includes('missing variable')) return 'configuration';
  
  // Deployment errors
  if (msg.includes('deploy') || msg.includes('build failed')) return 'deployment';
  if (msg.includes('ci/cd') || msg.includes('pipeline')) return 'deployment';
  if (msg.includes('docker') || msg.includes('container')) return 'deployment';
  
  // Performance errors
  if (msg.includes('slow') || msg.includes('performance') || msg.includes('bottleneck')) return 'performance';
  if (msg.includes('n+1') || msg.includes('memory leak')) return 'performance';
  
  // Permission errors
  if (msg.includes('permission') || msg.includes('access') || msg.includes('denied')) return 'permission';
  
  // Indentation (Python)
  if (msg.includes('indentation')) return 'syntax';
  
  // Default to runtime
  return 'runtime';
}

function detectLanguage(errorMessage, codeSnippet = '') {
  const msg = errorMessage ? errorMessage.toLowerCase() : '';
  const code = codeSnippet ? codeSnippet.toLowerCase() : '';
  
  // Check for Indian language scripts using Unicode ranges
  const text = (errorMessage || '') + ' ' + (codeSnippet || '');
  
  // Devanagari script (Hindi, Sanskrit, Marathi, Rajasthani)
  if (/[\u0900-\u097F]/.test(text)) {
    if (/संस्कृत|वेद|श्लोक/.test(text)) return 'sanskrit';
    if (/मराठी|महाराष्ट्र/.test(text)) return 'marathi';
    if (/राजस्थानी|राजस्थान/.test(text)) return 'rajasthani';
    return 'hindi'; // Default Devanagari to Hindi
  }
  
  // Bengali script
  if (/[\u0980-\u09FF]/.test(text)) return 'bengali';
  
  // Gurmukhi script (Punjabi)
  if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';
  
  // Odia script
  if (/[\u0B00-\u0B7F]/.test(text)) return 'odia';
  
  // Tamil script
  if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
  
  // Telugu script
  if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
  
  // Kannada script
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kannada';
  
  // Malayalam script
  if (/[\u0D00-\u0D7F]/.test(text)) return 'malayalam';
  
  // Perso-Arabic script (Kashmiri, Urdu)
  if (/[\u0600-\u06FF]/.test(text) && /کٲشُر|کشمیر/.test(text)) return 'kashmiri';
  
  // JavaScript/TypeScript detection
  if (msg.includes('typeerror') || msg.includes('referenceerror') || msg.includes('syntaxerror')) return 'javascript';
  if (msg.includes('ts(') || code.includes('interface ') || code.includes(': string') || code.includes(': number')) return 'typescript';
  
  // Python detection
  if (msg.includes('indentationerror') || msg.includes('nameerror') || msg.includes('attributeerror')) return 'python';
  if (msg.includes('modulenotfounderror') || msg.includes('importerror')) return 'python';
  if (code.includes('def ') || code.includes('import ') || code.includes('print(')) return 'python';
  
  // Java detection
  if (msg.includes('nullpointerexception') || msg.includes('classnotfoundexception')) return 'java';
  if (msg.includes('arrayindexoutofboundsexception') || msg.includes('illegalargumentexception')) return 'java';
  if (code.includes('public class') || code.includes('public static void')) return 'java';
  
  // C/C++ detection
  if (msg.includes('segmentation fault') || msg.includes('core dumped')) return 'c++';
  if (msg.includes('undefined reference') || msg.includes('cannot find symbol')) return 'c++';
  if (code.includes('#include') || code.includes('std::')) return 'c++';
  
  // Go detection
  if (msg.includes('panic') || msg.includes('goroutine')) return 'go';
  if (code.includes('func ') || code.includes('package ') || code.includes('go ')) return 'go';
  
  // Rust detection
  if (msg.includes('borrow checker') || msg.includes('lifetime')) return 'rust';
  if (code.includes('fn ') || code.includes('impl ') || code.includes('trait ')) return 'rust';
  
  // PHP detection
  if (msg.includes('parse error') || msg.includes('fatal error')) return 'php';
  if (code.includes('<?php') || code.includes('function ')) return 'php';
  
  // Ruby detection
  if (msg.includes('nomethoderror') || msg.includes('undefined method')) return 'ruby';
  if (code.includes('def ') && code.includes('end')) return 'ruby';
  
  return 'javascript'; // default
}

function categorizeError(errorMessage) {
  const msg = errorMessage.toLowerCase();
  
  // Direct error type matching with expanded patterns
  const errorPatterns = {
    // Runtime errors
    typeerror: mockResponses.typeerror,
    'type error': mockResponses.typeerror,
    'cannot read property': mockResponses.typeerror,
    'cannot read properties': mockResponses.typeerror,
    'undefined is not': mockResponses.typeerror,
    'null is not': mockResponses.typeerror,
    
    // Scope errors
    referenceerror: mockResponses.referenceerror,
    'reference error': mockResponses.referenceerror,
    'is not defined': mockResponses.referenceerror,
    
    // Syntax errors
    syntaxerror: mockResponses.syntaxerror,
    'syntax error': mockResponses.syntaxerror,
    'unexpected token': mockResponses.syntaxerror,
    'unexpected identifier': mockResponses.syntaxerror,
    
    // Python specific
    indentationerror: mockResponses.indentationerror,
    nameerror: mockResponses.nameerror,
    'name error': mockResponses.nameerror,
    
    // Java/Kotlin
    nullpointer: mockResponses.nullpointer,
    'null pointer': mockResponses.nullpointer,
    'nullpointerexception': mockResponses.nullpointer,
    
    // Import/Module errors
    importerror: mockResponses.importerror,
    'import error': mockResponses.importerror,
    modulenotfound: mockResponses.importerror,
    'module not found': mockResponses.importerror,
    'cannot find module': mockResponses.importerror,
    
    // Network errors
    network: mockResponses.networkerror,
    'network error': mockResponses.networkerror,
    cors: mockResponses.networkerror,
    timeout: mockResponses.networkerror,
    fetch: mockResponses.networkerror,
    'failed to fetch': mockResponses.networkerror,
    
    // Algorithm errors
    algorithm: mockResponses.algorithmerror,
    'time limit exceeded': mockResponses.algorithmerror,
    'timeout exceeded': mockResponses.algorithmerror,
    'stack overflow': mockResponses.algorithmerror,
    'recursion': mockResponses.algorithmerror,
    'maximum call stack': mockResponses.algorithmerror,
    
    // Index errors
    indexerror: mockResponses.indexerror,
    'index error': mockResponses.indexerror,
    'index out of': mockResponses.indexerror,
    'indexoutofbounds': mockResponses.indexerror,
    'out of bounds': mockResponses.indexerror,
    'array index': mockResponses.indexerror,
    
    // Logic errors
    logic: mockResponses.logicerror,
    'logic error': mockResponses.logicerror,
    'incorrect result': mockResponses.logicerror,
    'wrong output': mockResponses.logicerror,
    'assertion failed': mockResponses.logicerror,
    'expected': mockResponses.logicerror,
    
    // Mathematical errors
    mathematical: mockResponses.mathematicalerror,
    'division by zero': mockResponses.mathematicalerror,
    'divide by zero': mockResponses.mathematicalerror,
    'overflow': mockResponses.mathematicalerror,
    'underflow': mockResponses.mathematicalerror,
    'nan': mockResponses.mathematicalerror,
    'infinity': mockResponses.mathematicalerror,
    'precision': mockResponses.mathematicalerror,
    
    // Architectural errors
    architecture: mockResponses.architecturalerror,
    'design pattern': mockResponses.architecturalerror,
    coupling: mockResponses.architecturalerror,
    'solid principle': mockResponses.architecturalerror,
    microservice: mockResponses.architecturalerror,
    monolith: mockResponses.architecturalerror,
    
    // Configuration errors
    config: mockResponses.configurationerror,
    configuration: mockResponses.configurationerror,
    'api key': mockResponses.configurationerror,
    'environment variable': mockResponses.configurationerror,
    '.env': mockResponses.configurationerror,
    credentials: mockResponses.configurationerror,
    
    // Deployment errors
    deploy: mockResponses.deploymentissue,
    deployment: mockResponses.deploymentissue,
    'build failed': mockResponses.deploymentissue,
    'ci/cd': mockResponses.deploymentissue,
    pipeline: mockResponses.deploymentissue,
    docker: mockResponses.deploymentissue,
    container: mockResponses.deploymentissue,
    
    // Performance errors
    performance: mockResponses.performanceissue,
    'slow query': mockResponses.performanceissue,
    'n+1': mockResponses.performanceissue,
    'memory leak': mockResponses.performanceissue,
    bottleneck: mockResponses.performanceissue
  };
  
  // Check for pattern matches
  for (const [pattern, response] of Object.entries(errorPatterns)) {
    if (msg.includes(pattern)) {
      return response;
    }
  }
  
  // Fallback to default
  return mockResponses.default;
}

// Enhanced function to extract stack trace information
function parseStackTrace(errorMessage) {
  const lines = errorMessage.split('\n');
  const stackFrames = [];
  
  for (const line of lines) {
    // Match common stack trace patterns
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (match) {
      stackFrames.push({
        function: match[1],
        file: match[2],
        line: parseInt(match[3]),
        column: parseInt(match[4])
      });
    }
  }
  
  return stackFrames.length > 0 ? stackFrames : null;
}

// Helper function to call OpenAI
async function callOpenAI(prompt, systemMessage, model, maxTokens, detectedLanguage, detectedErrorType, stackTrace, conversationHistory = []) {
  // Build messages array with conversation history
  const messages = [
    { role: 'system', content: systemMessage }
  ];
  
  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    conversationHistory.forEach(msg => {
      messages.push({ role: 'user', content: msg.query });
      messages.push({ role: 'assistant', content: JSON.stringify({
        explanation: msg.explanation,
        solution: msg.solution,
        category: msg.category
      })});
    });
  }
  
  // Add current prompt
  messages.push({ role: 'user', content: prompt });
  
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: "json_object" }
  });
  
  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty OpenAI response');
  
  const parsed = JSON.parse(content);
  return {
    explanation: parsed.explanation || 'Unable to analyze this error.',
    solution: parsed.solution || 'Please review the code and error message.',
    codeExample: parsed.codeExample || '',
    category: parsed.category || detectedErrorType,
    tags: parsed.tags || [detectedLanguage, detectedErrorType],
    confidence: parsed.confidence || 0.7,
    domainKnowledge: parsed.domainKnowledge || '',
    preventionTips: parsed.preventionTips || [],
    complexity: parsed.complexity || '',
    relatedErrors: parsed.relatedErrors || [],
    debugging: parsed.debugging || [],
    alternatives: parsed.alternatives || [],
    resources: parsed.resources || [],
    provider: 'openai',
    model,
    language: detectedLanguage,
    errorType: detectedErrorType,
    stackTrace,
    timestamp: new Date().toISOString()
  };
}

// Helper function to call Gemini
async function callGemini(prompt, model, detectedLanguage, detectedErrorType, stackTrace, conversationHistory = []) {
  try {
    console.log(`🔵 Calling Gemini API with model: ${model}`);
    
    // Build conversation context for Gemini
    let enhancedPrompt = prompt;
    if (conversationHistory && conversationHistory.length > 0) {
      const context = conversationHistory.map((msg, idx) => 
        `Previous Query ${idx + 1}: ${msg.query}\nPrevious Response: ${msg.explanation}\n`
      ).join('\n');
      enhancedPrompt = `${context}\n\nCurrent Query: ${prompt}`;
    }
    
    const geminiModel = genAI.getGenerativeModel({ model });
    const result = await geminiModel.generateContent(enhancedPrompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text) {
      console.error('❌ Gemini returned empty response');
      throw new Error('Empty Gemini response');
    }
    
    console.log('✅ Gemini response received, parsing JSON...');
    let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    console.log('✅ Gemini JSON parsed successfully');
    
    return {
      explanation: parsed.explanation || 'Unable to analyze this error.',
      solution: parsed.solution || 'Please review the code and error message.',
      codeExample: parsed.codeExample || '',
      category: parsed.category || detectedErrorType,
      tags: parsed.tags || [detectedLanguage, detectedErrorType],
      confidence: parsed.confidence || 0.7,
      domainKnowledge: parsed.domainKnowledge || '',
      preventionTips: parsed.preventionTips || [],
      complexity: parsed.complexity || '',
      relatedErrors: parsed.relatedErrors || [],
      debugging: parsed.debugging || [],
      alternatives: parsed.alternatives || [],
      resources: parsed.resources || [],
      provider: 'gemini',
      model,
      language: detectedLanguage,
      errorType: detectedErrorType,
      stackTrace,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Gemini API Error:', error.message);
    console.error('❌ Error details:', error);
    throw error;
  }
}

// ============================================================================
// ANTHROPIC CLAUDE API CALLER
// ============================================================================

/**
 * Call Anthropic Claude API with retry logic and error handling
 */
async function callAnthropic(prompt, systemMessage, model, maxTokens, detectedLanguage, detectedErrorType, stackTrace, conversationHistory = [], temperature = 0.3) {
  if (!anthropic) {
    throw new Error('Anthropic client not initialized. Check ANTHROPIC_API_KEY.');
  }
  
  console.log(`🔵 Calling Anthropic Claude: ${model} (max_tokens: ${maxTokens})`);
  
  // Build messages array with conversation history
  const messages = [];
  
  // Add conversation history if provided (limit to last 5 for context)
  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-5);
    recentHistory.forEach(msg => {
      messages.push({ role: 'user', content: msg.query });
      messages.push({ 
        role: 'assistant', 
        content: JSON.stringify({
          explanation: msg.explanation,
          solution: msg.solution,
          category: msg.category
        })
      });
    });
  }
  
  // Add current prompt
  messages.push({ role: 'user', content: truncateText(prompt, CONFIG.MAX_PROMPT_LENGTH) });
  
  // Call API with retry logic
  const response = await retryWithBackoff(async () => {
    return await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage,
      messages,
    });
  });
  
  // Extract and validate response
  const content = response.content?.[0]?.text;
  if (!content) {
    throw new Error('Empty Anthropic response');
  }
  
  console.log(`✅ Anthropic response received (${content.length} chars)`);
  
  // Parse JSON response (handle markdown wrapping)
  let cleanText = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  
  let parsed;
  try {
    parsed = JSON.parse(cleanText);
  } catch (parseError) {
    console.error('❌ Failed to parse Anthropic JSON response:', parseError.message);
    console.error('Raw response:', cleanText.substring(0, 200));
    
    // Attempt to extract JSON from text
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Invalid JSON response from Anthropic');
    }
  }
  
  // Return structured response with all fields
  return {
    explanation: parsed.explanation || 'Unable to analyze this error.',
    solution: parsed.solution || 'Please review the code and error message.',
    codeExample: parsed.codeExample || '',
    category: parsed.category || detectedErrorType,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [detectedLanguage, detectedErrorType],
    confidence: Number(parsed.confidence) || 0.7,
    severity: parsed.severity || 'medium',
    domainKnowledge: parsed.domainKnowledge || '',
    preventionTips: Array.isArray(parsed.preventionTips) ? parsed.preventionTips : [],
    complexity: parsed.complexity || '',
    relatedErrors: Array.isArray(parsed.relatedErrors) ? parsed.relatedErrors : [],
    debugging: Array.isArray(parsed.debugging) ? parsed.debugging : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    provider: 'anthropic',
    model,
    language: detectedLanguage,
    errorType: detectedErrorType,
    stackTrace,
    timestamp: new Date().toISOString(),
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    },
  };
}

// Helper function to get mock response
function getMockResponse(errorMessage, detectedLanguage, detectedErrorType, stackTrace) {
  const mockResponse = categorizeError(errorMessage);
  
  return {
    explanation: mockResponse.explanation || 'Unable to analyze this error.',
    solution: mockResponse.solution || 'Please review the code and error message.',
    codeExample: mockResponse.codeExample || '',
    category: mockResponse.category || detectedErrorType,
    tags: mockResponse.tags || [detectedLanguage, detectedErrorType],
    confidence: mockResponse.confidence || 0.5,
    severity: mockResponse.severity || 'medium',
    domainKnowledge: mockResponse.domainKnowledge || '',
    preventionTips: mockResponse.preventionTips || [],
    complexity: mockResponse.complexity || '',
    provider: 'mock',
    language: detectedLanguage,
    errorType: detectedErrorType,
    stackTrace,
    timestamp: new Date().toISOString(),
    note: 'Enhanced mock response. Configure API keys for AI-powered analysis.'
  };
}

// ============================================================================
// URL SCRAPING AND SUMMARIZATION
// ============================================================================

/**
 * Detect URLs in error message or code snippet
 */
function detectURLs(text) {
  if (!text) return [];
  
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const urls = text.match(urlRegex) || [];
  
  // Filter out common non-documentation URLs
  return urls.filter(url => {
    const lower = url.toLowerCase();
    return !lower.includes('localhost') && 
           !lower.includes('127.0.0.1') &&
           !lower.includes('.jpg') &&
           !lower.includes('.png') &&
           !lower.includes('.gif') &&
           !lower.includes('.mp4');
  });
}

/**
 * Scrape and extract content from a URL
 */
async function scrapeURL(url) {
  try {
    console.log(`🌐 Scraping URL: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    const html = response.data;
    
    // Extract text content (remove HTML tags)
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove styles
      .replace(/<[^>]+>/g, ' ')                          // Remove HTML tags
      .replace(/\s+/g, ' ')                              // Normalize whitespace
      .trim();
    
    // Limit to first 3000 characters for context
    if (text.length > 3000) {
      text = text.substring(0, 3000) + '...';
    }
    
    console.log(`✅ Scraped ${text.length} characters from ${url}`);
    
    return {
      url,
      content: text,
      success: true
    };
    
  } catch (error) {
    console.log(`⚠️ Failed to scrape ${url}: ${error.message}`);
    return {
      url,
      content: null,
      success: false,
      error: error.message
    };
  }
}

/**
 * Summarize scraped URL content using AI
 */
async function summarizeURLContent(url, content, errorContext) {
  try {
    console.log(`📝 Summarizing content from ${url}`);
    
    // Use Gemini for quick summarization
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are analyzing documentation/content from a URL to help solve a programming error.

**URL:** ${url}

**Error Context:** ${errorContext}

**Content from URL (first 3000 chars):**
${content}

**Task:** Summarize the MOST RELEVANT information from this content that could help solve the error. Focus on:
1. Key concepts or definitions related to the error
2. Common causes or solutions mentioned
3. Code examples or patterns that apply
4. Best practices or warnings

Respond in JSON format:
{
  "summary": "Clear, concise summary of relevant information",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "relevance": "high|medium|low - how relevant is this to the error"
}

Keep it concise and focused only on what helps solve the error.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    console.log(`✅ Summarized URL content (relevance: ${parsed.relevance})`);
    
    return {
      url,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      relevance: parsed.relevance || 'medium',
      success: true
    };
    
  } catch (error) {
    console.log(`⚠️ Failed to summarize ${url}: ${error.message}`);
    return {
      url,
      summary: `Content from ${url} (could not fully analyze)`,
      keyPoints: [],
      relevance: 'low',
      success: false
    };
  }
}

/**
 * Process URLs found in error message
 */
async function processURLs(errorMessage, codeSnippet) {
  const fullText = `${errorMessage || ''} ${codeSnippet || ''}`;
  const urls = detectURLs(fullText);
  
  if (urls.length === 0) {
    return [];
  }
  
  console.log(`🔗 Found ${urls.length} URL(s) in error message`);
  
  // Limit to first 2 URLs to avoid too much processing
  const urlsToProcess = urls.slice(0, 2);
  
  const results = [];
  
  for (const url of urlsToProcess) {
    try {
      // Scrape the URL
      const scraped = await scrapeURL(url);
      
      if (scraped.success && scraped.content) {
        // Summarize the content
        const summary = await summarizeURLContent(url, scraped.content, errorMessage);
        results.push(summary);
      } else {
        results.push({
          url,
          summary: `Referenced URL: ${url} (could not access)`,
          keyPoints: [],
          relevance: 'low',
          success: false
        });
      }
    } catch (error) {
      console.log(`⚠️ Error processing URL ${url}:`, error.message);
    }
  }
  
  return results;
}

// ============================================================================
// MAIN ERROR ANALYSIS FUNCTION
// ============================================================================

// Import model configuration
const modelConfig = require('../config/modelConfig');

/**
 * Analyze error with AI providers, caching, and fallback handling
 * Now with central query logging (A1 - Error Logging & Monitoring)
 * Updated: Supports user-preferred model selection
 */
async function analyzeError({ 
  errorMessage, 
  codeSnippet, 
  fileName, 
  lineNumber, 
  language, 
  errorType, 
  subscriptionTier = 'free', 
  framework, 
  dependencies, 
  conversationHistory = [],
  userId = null,
  // Model selection
  preferredModel = null,
  // Additional context for logging
  anonymousId = null,
  ipAddress = null,
  userAgent = null
}) {
  // Rate limit check and cleanup tracking
  let cleanupRateLimit = () => {};
  
  // Track timing for latency measurement
  const startTime = Date.now();
  
  // Variables for logging context
  let detectedLanguage = null;
  let detectedErrorType = null;
  let validTier = 'free';
  let usedModel = 'unknown';
  let usedProvider = 'unknown';
  
  try {
    // 1. Input validation and sanitization (prevents injection attacks)
    const sanitizedMessage = validateAndSanitizeInput(errorMessage);
    validTier = ['free', 'pro', 'team'].includes(subscriptionTier) ? subscriptionTier : 'free';
    
    // 2. User rate limiting (prevents abuse)
    cleanupRateLimit = checkUserRateLimit(userId, validTier);
    
    // Auto-detect language and error type if not provided
    detectedLanguage = language || detectLanguage(sanitizedMessage, codeSnippet);
    detectedErrorType = errorType || detectErrorType(sanitizedMessage);
    
    console.log(`\n📊 Analyzing error: ${detectedErrorType} (${detectedLanguage}) [${validTier} tier]`);
    
    // PERFORMANCE: Check cache first (skip for conversation history)
    const cacheKey = generateCacheKey(sanitizedMessage, detectedLanguage, detectedErrorType, validTier);
    const cachedResponse = conversationHistory.length === 0 ? await getCachedResponseFast(cacheKey) : null;
    
    if (cachedResponse) {
      // Log cached response
      const latencyMs = Date.now() - startTime;
      console.log(`⚡ Cache hit! Response in ${latencyMs}ms`);
      queryLogger.logSuccess({
        userId,
        anonymousId,
        rawError: errorMessage,
        model: cachedResponse.model || 'cached',
        provider: cachedResponse.provider || 'cache',
        confidence: cachedResponse.confidence,
        latencyMs,
        subscriptionTier: validTier,
        detectedLanguage,
        detectedErrorType,
        cached: true,
        ipAddress,
        userAgent,
        metadata: { framework, dependencies, cached: true }
      }).catch(err => console.error('Logging error:', err.message));
      
      return { ...cachedResponse, cached: true };
    }
    
    // Parse stack trace if available
    const stackTrace = parseStackTrace(sanitizedMessage);
    
    // Get tier config and features
    const tierConfig = TIER_CONFIG[validTier];
    const features = tierConfig.features;
    
    // ========================================================================
    // USER MODEL PREFERENCE - Override tier default with user's preferred model
    // ========================================================================
    let resolvedModel = null;
    if (preferredModel) {
      // Use model configuration to resolve and validate
      resolvedModel = modelConfig.resolveModelForRequest(preferredModel, validTier);
      if (resolvedModel) {
        console.log(`🎯 Using user's preferred model: ${resolvedModel.name} (${resolvedModel.apiId})`);
      }
    }
    
    // Process URLs in error message (only if enabled for tier)
    let urlContext = [];
    if (features.urlScraping) {
      try {
        console.log('🔗 URL scraping enabled for this tier...');
        urlContext = await processURLs(sanitizedMessage, codeSnippet);
      } catch (urlError) {
        console.warn('⚠️  URL processing failed:', urlError.message);
      }
    }
  
    // Prepare enhanced code context
    const codeContext = {
      codeSnippet,
      fileName,
      lineNumber,
      framework,
      dependencies,
      stackTrace,
      urlContext
    };
    
    const prompt = createPrompt(sanitizedMessage, detectedLanguage, detectedErrorType, validTier, codeContext);

    // Enhanced system message with natural, clear English and Indian cultural context
    const systemMessage = `You are an expert AI assistant who helps developers and learners understand and solve programming issues. You also have deep knowledge of Indian languages, culture, cuisine, and global updates relevant to India.

**YOUR STRENGTHS:**
- Deep knowledge of programming languages, frameworks, and tools
- Strong understanding of algorithms, data structures, and software design
- Expertise in debugging, problem-solving, and best practices
- Ability to explain complex concepts in clear, simple English
- Knowledge of industry standards and modern development practices
- **Multilingual Support**: Fluent in all major Indian languages with proper Unicode script support:
  • Hindi (हिंदी) - Devanagari script
  • Sanskrit (संस्कृत) - Devanagari script
  • Kannada (ಕನ್ನಡ) - Kannada script
  • Marathi (मराठी) - Devanagari script
  • Bengali (বাংলা) - Bengali script
  • Odia (ଓଡ଼ିଆ) - Odia script
  • Kashmiri (کٲشُر) - Perso-Arabic script
  • Punjabi (ਪੰਜਾਬੀ) - Gurmukhi script
  • Tamil (தமிழ்) - Tamil script
  • Telugu (తెలుగు) - Telugu script
  • Malayalam (മലയാളം) - Malayalam script
  • Rajasthani (राजस्थानी) - Devanagari script
- **Indian Cultural Expertise**: Festivals, traditions, classical arts, dance forms, music, philosophy, literature, historical periods
- **Indian Cuisine Knowledge**: Authentic regional recipes, ingredients, cooking techniques, nutritional facts, festival foods across all Indian states
- **India Global Updates**: Tech industry, startups, ISRO, government initiatives, economic developments, international relations, diaspora contributions

**YOUR COMMUNICATION STYLE:**
- Write in clear, natural English that's easy to understand (or in the requested Indian language with proper script)
- Be friendly and professional in your explanations
- Use proper grammar, punctuation, and sentence structure
- Avoid unnecessary jargon - explain technical terms when you use them
- Make your solutions actionable and practical
- Think like a helpful teacher who wants the user to succeed
- **For Indian language queries**: Respond in the same language with authentic cultural context
- **For Indian topics**: Provide accurate facts, regional variations, and historical context

**YOUR APPROACH:**
1. Understand the problem thoroughly before explaining
2. Identify the root cause clearly and simply
3. Explain why the error happens in plain English (or requested language)
4. Provide step-by-step solutions that anyone can follow
5. Include working code examples when relevant
6. Share best practices to prevent similar issues
7. Consider edge cases and real-world scenarios
8. **For Indian cultural/food queries**: Include historical context, regional authenticity, and verified facts
9. **For India updates**: Cover latest developments with credible information

**CRITICAL OUTPUT REQUIREMENTS:**
- ONLY return valid JSON - NO explanatory text before or after
- Do NOT write "Here is my response" or any preamble
- Your FIRST character must be { and LAST character must be }
- Write explanations that flow naturally and read well
- Make solutions practical and immediately applicable
- Ensure all code examples are complete, correct, and well-commented
- Use professional but friendly language throughout
- Focus on helping the user learn and improve
- **For multilingual responses**: Use proper Unicode encoding for Indian scripts
- **For cultural content**: Ensure authenticity and accuracy with proper regional attributions
- **For food content**: Include authentic ingredient names, traditional methods, and regional variations
- **For India updates**: Cite recent developments with context (government policies, tech achievements, global collaborations)

Remember: Your goal is to help users understand their issues and learn from them, not just provide quick fixes. Write clearly, explain thoroughly, and be genuinely helpful. When dealing with Indian languages, culture, or cuisine, ensure authenticity and respect for regional diversity.`;

    // Build provider chain based on tier (with user preference override)
    const providers = [];
    
    // If user has a preferred model, use it as primary
    if (resolvedModel) {
      providers.push({
        provider: 'anthropic',
        model: resolvedModel.apiId,
        maxTokens: Math.min(resolvedModel.maxTokens, modelConfig.getMaxTokensForTier(validTier)),
        temperature: tierConfig.primary?.temperature || 0.3
      });
      console.log(`📌 Primary provider set to user's choice: ${resolvedModel.name}`);
    } else if (tierConfig.primary) {
      providers.push(tierConfig.primary);
    }
    
    // Add fallback options
    if (tierConfig.secondary) providers.push(tierConfig.secondary);
    if (tierConfig.tertiary) providers.push(tierConfig.tertiary);
    if (tierConfig.fallback) providers.push(tierConfig.fallback);
    
    // A2: Track fallback state
    const primaryModel = providers[0]?.model || 'unknown';
    let fallbackUsed = false;
    let totalRetryCount = 0;
    let lastErrorCategory = null;

    // A2: Update fallback stats
    fallbackStats.totalRequests++;

    // Try each provider in order with retry logic
    for (let i = 0; i < providers.length; i++) {
      const config = providers[i];
      const isLastProvider = i === providers.length - 1;
      const isPrimaryProvider = i === 0;
      
      // A2: Track if we're using fallback
      if (!isPrimaryProvider) {
        fallbackUsed = true;
        fallbackStats.fallbackUsed++;
        console.log(`🔄 [A2] Switching to fallback provider: ${config.provider} (${config.model})`);
      }
      
      // A2: Retry loop for each provider (retry once before moving to fallback)
      let providerRetries = 0;
      const maxProviderRetries = CONFIG.MAX_RETRIES;
      
      while (providerRetries < maxProviderRetries) {
        try {
          const attemptNumber = providerRetries + 1;
          console.log(`🤖 [Attempt ${attemptNumber}/${maxProviderRetries}] Trying ${config.provider.toUpperCase()} (${isPrimaryProvider ? 'primary' : 'fallback'} for ${validTier} tier)`);
          
          let result;
          usedModel = config.model;
          usedProvider = config.provider;
          
          if (config.provider === 'gemini') {
            result = await withTimeout(
              callGemini(
                prompt, 
                config.model, 
                detectedLanguage, 
                detectedErrorType, 
                stackTrace, 
                features.conversationHistory ? conversationHistory : []
              ),
              CONFIG.REQUEST_TIMEOUT_MS
            );
          }
          else if (config.provider === 'anthropic') {
            result = await withTimeout(
              callAnthropic(
                prompt, 
                systemMessage, 
                config.model, 
                config.maxTokens, 
                detectedLanguage, 
                detectedErrorType, 
                stackTrace, 
                features.conversationHistory ? conversationHistory : [],
                config.temperature
              ),
              CONFIG.REQUEST_TIMEOUT_MS
            );
          } 
          else if (config.provider === 'mock') {
            console.log('🎯 Using enhanced mock response (fallback)');
            result = getMockResponse(sanitizedMessage, detectedLanguage, detectedErrorType, stackTrace);
          }
          else {
            break; // Skip disabled providers
          }
          
          // A2: Validate AI response structure (including JSON validation)
          if (result && !result.error) {
            try {
              validateAIResponse(result);
            } catch (validationError) {
              // A2: Invalid JSON/response structure - retry
              lastErrorCategory = 'INVALID_JSON';
              throw new Error(`Invalid response structure: ${validationError.message}`);
            }
          }
          
          // PERFORMANCE: Cache successful response (except for conversations)
          if (conversationHistory.length === 0 && result && !result.error) {
            cacheResponseFast(cacheKey, result).catch(() => {}); // Non-blocking
          }
          
          // A2: Log successful query with fallback tracking
          const latencyMs = Date.now() - startTime;
          console.log(`✅ AI response in ${latencyMs}ms`);
          const confidence = result?.confidence || 0.5;
          
          // Prepare logging data with A2 fields
          const logData = {
            userId,
            anonymousId,
            rawError: errorMessage,
            model: config.model,
            provider: config.provider,
            confidence,
            latencyMs,
            subscriptionTier: validTier,
            detectedLanguage,
            detectedErrorType,
            cached: false,
            ipAddress,
            userAgent,
            metadata: { framework, dependencies, codeSnippet: !!codeSnippet },
            // A2: Fallback tracking fields
            fallbackUsed,
            primaryModelAttempted: primaryModel,
            retryCount: totalRetryCount,
            errorCategory: lastErrorCategory
          };
          
          // Check if low confidence
          if (confidence < 0.6) {
            queryLogger.logLowConfidence(logData).catch(err => console.error('Logging error:', err.message));
          } else {
            queryLogger.logSuccess(logData).catch(err => console.error('Logging error:', err.message));
          }
          
          // A2: Add fallback info to result
          result.fallbackUsed = fallbackUsed;
          result.primaryModelAttempted = primaryModel;
          result.retriesUsed = totalRetryCount;
          
          console.log(`✅ [A2] Success with ${config.provider}/${config.model} (fallback: ${fallbackUsed}, retries: ${totalRetryCount})`);
          
          return result;
          
        } catch (error) {
          providerRetries++;
          totalRetryCount++;
          
          // A2: Categorize the error
          lastErrorCategory = categorizeAPIError(error);
          const errorMessage_log = error?.message || String(error);
          
          console.error(`❌ [Attempt ${providerRetries}/${maxProviderRetries}] ${config.provider.toUpperCase()} error (${lastErrorCategory}):`, errorMessage_log);
          
          // A2: Check if we should retry or move to fallback
          const shouldRetry = providerRetries < maxProviderRetries && 
                              !['AUTH_ERROR'].includes(lastErrorCategory); // Don't retry auth errors
          
          if (shouldRetry) {
            // A2: Exponential backoff with jitter
            const baseDelay = CONFIG.RETRY_DELAY_MS * Math.pow(2, providerRetries - 1);
            const jitter = Math.random() * 500;
            const delay = baseDelay + jitter;
            
            console.log(`⏳ [A2] Retrying ${config.provider} in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // A2: Max retries reached for this provider, move to fallback
          console.log(`🔄 [A2] ${config.provider} failed after ${providerRetries} attempts, trying next provider...`);
          break; // Exit retry loop, continue to next provider
        }
      }
      
      // If this is the last provider and we're here, all providers failed
      if (isLastProvider) {
        console.error('❌ [A2] All providers failed after retries');
        fallbackStats.fatalErrors++;
        
        // A2: Log failure with fallback tracking
        const latencyMs = Date.now() - startTime;
        queryLogger.logFailure({
          userId,
          anonymousId,
          rawError: errorMessage,
          model: usedModel,
          provider: usedProvider,
          failureReason: `All providers failed (last error: ${lastErrorCategory})`,
          latencyMs,
          subscriptionTier: validTier,
          detectedLanguage,
          detectedErrorType,
          ipAddress,
          userAgent,
          metadata: { framework, dependencies, allProvidersFailed: true },
          // A2: Fallback tracking
          fallbackUsed,
          primaryModelAttempted: primaryModel,
          retryCount: totalRetryCount,
          errorCategory: lastErrorCategory
        }).catch(err => console.error('Logging error:', err.message));
        
        // A2: Return user-friendly error instead of generic "something went wrong"
        const userFriendlyError = createUserFriendlyError(
          lastErrorCategory === 'TIMEOUT' ? 'timeout' :
          lastErrorCategory === 'RATE_LIMIT' ? 'rateLimit' :
          lastErrorCategory === 'INVALID_JSON' ? 'invalidJson' :
          'allProvidersFailed',
          detectedLanguage,
          detectedErrorType,
          { message: `All providers failed after ${totalRetryCount} total attempts` }
        );
        
        // A2: Return user-friendly error with fallback info
        return {
          ...userFriendlyError,
          stackTrace,
          errorId: cacheKey.substring(0, 8),
          fallbackUsed,
          primaryModelAttempted: primaryModel,
          retriesUsed: totalRetryCount
        };
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error in analyzeError:', error);
    cleanupRateLimit(); // Clean up rate limit tracking on error
    
    // A2: Categorize the unexpected error
    const unexpectedErrorCategory = categorizeAPIError(error);
    
    // Log unexpected failure (A1 - Central Error Logging)
    const latencyMs = Date.now() - startTime;
    queryLogger.logFailure({
      userId,
      anonymousId,
      rawError: errorMessage,
      model: usedModel,
      provider: usedProvider,
      failureReason: error?.message || 'Unexpected error',
      latencyMs,
      subscriptionTier: validTier,
      detectedLanguage: detectedLanguage || 'unknown',
      detectedErrorType: detectedErrorType || 'unknown',
      ipAddress,
      userAgent,
      metadata: { framework, dependencies, unexpectedError: true },
      // A2: Error tracking
      errorCategory: unexpectedErrorCategory
    }).catch(err => console.error('Logging error:', err.message));
    
    // A2: Return user-friendly error instead of generic message
    const userFriendlyError = createUserFriendlyError(
      'generic',
      detectedLanguage || 'unknown',
      detectedErrorType || 'unknown',
      error
    );
    
    return {
      ...userFriendlyError,
      timestamp: new Date().toISOString(),
    };
  } finally {
    // Always cleanup rate limit tracking (for successful requests)
    cleanupRateLimit();
  }
}

// ============================================================================
// BATCH ANALYSIS & STATISTICS
// ============================================================================

/**
 * Batch error analysis for team tier (with concurrency control)
 */
async function analyzeBatchErrors(errors, subscriptionTier = 'team', concurrency = 3) {
  if (subscriptionTier !== 'team') {
    throw new Error('Batch analysis is only available for team tier subscriptions');
  }
  
  if (!Array.isArray(errors) || errors.length === 0) {
    throw new Error('errors must be a non-empty array');
  }
  
  console.log(`📊 Batch analyzing ${errors.length} errors with concurrency ${concurrency}`);
  
  const results = [];
  
  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < errors.length; i += concurrency) {
    const batch = errors.slice(i, i + concurrency);
    console.log(`   Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(errors.length / concurrency)}`);
    
    const batchResults = await Promise.allSettled(
      batch.map(error => analyzeError({ ...error, subscriptionTier }))
    );
    
    results.push(...batchResults.map((result, batchIndex) => ({
      index: i + batchIndex,
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason?.message : null,
      timestamp: new Date().toISOString(),
    })));
  }
  
  console.log(`✅ Batch analysis complete: ${results.filter(r => r.status === 'fulfilled').length}/${errors.length} successful`);
  
  return results;
}

/**
 * Get comprehensive error statistics and patterns from history
 */
function getErrorStatistics(errorHistory) {
  if (!Array.isArray(errorHistory)) {
    throw new Error('errorHistory must be an array');
  }
  
  const stats = {
    totalErrors: errorHistory.length,
    byLanguage: {},
    byCategory: {},
    byType: {},
    byProvider: {},
    byConfidence: { high: 0, medium: 0, low: 0 },
    commonPatterns: [],
    timeDistribution: {},
    successRate: 0,
  };
  
  errorHistory.forEach(error => {
    // Count by language
    if (error.language) {
      stats.byLanguage[error.language] = (stats.byLanguage[error.language] || 0) + 1;
    }
    
    // Count by category
    if (error.category) {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
    }
    
    // Count by type
    if (error.errorType) {
      stats.byType[error.errorType] = (stats.byType[error.errorType] || 0) + 1;
    }
    
    // Count by provider
    if (error.provider) {
      stats.byProvider[error.provider] = (stats.byProvider[error.provider] || 0) + 1;
    }
    
    // Count by confidence
    if (error.confidence) {
      if (error.confidence >= 0.8) stats.byConfidence.high++;
      else if (error.confidence >= 0.5) stats.byConfidence.medium++;
      else stats.byConfidence.low++;
    }
    
    // Time distribution (by hour)
    if (error.timestamp) {
      const hour = new Date(error.timestamp).getHours();
      stats.timeDistribution[hour] = (stats.timeDistribution[hour] || 0) + 1;
    }
  });
  
  // Calculate success rate
  const successfulAnalyses = errorHistory.filter(e => 
    e.provider !== 'none' && e.provider !== 'error' && !e.error
  ).length;
  stats.successRate = errorHistory.length > 0 
    ? (successfulAnalyses / errorHistory.length * 100).toFixed(2) 
    : 0;
  
  return stats;
}

/**
 * Get service health status
 */
function getServiceHealth() {
  return {
    status: anthropic ? 'healthy' : 'degraded',
    providers: {
      anthropic: anthropic ? 'available' : 'unavailable',
      mock: 'available',
    },
    cache: {
      size: responseCache.size,
      maxSize: 1000,
    },
    config: {
      maxRetries: CONFIG.MAX_RETRIES,
      cacheTTL: CONFIG.CACHE_TTL_MS / 1000 + 's',
      timeout: CONFIG.REQUEST_TIMEOUT_MS / 1000 + 's',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Clear response cache
 */
function clearCache() {
  const size = responseCache.size;
  responseCache.clear();
  console.log(`🧹 Cleared ${size} cache entries`);
  return { cleared: size, timestamp: new Date().toISOString() };
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use analyzeError instead
 */
async function explainError(errorMessage, subscriptionTier = 'free') {
  console.warn('⚠️  explainError is deprecated. Use analyzeError instead.');
  const result = await analyzeError({ errorMessage, subscriptionTier });
  return {
    explanation: result.explanation,
    solution: result.solution
  };
}

// ============================================================================
// CONVERSATIONAL AI SUPPORT
// ============================================================================

/**
 * Analyze error with conversation context
 * Used for follow-up questions in chat mode
 */
async function analyzeWithContext({ messages, newMessage, userId, subscriptionTier = 'pro' }) {
  const startTime = Date.now();
  
  try {
    // Build conversation history for AI
    const conversationHistory = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Get the appropriate model for this tier
    const modelConfig = require('../config/modelConfig');
    const model = modelConfig.resolveModelForRequest('auto', subscriptionTier, newMessage);
    const modelId = model.apiId || 'claude-3-5-haiku-20241022';
    
    // Create system prompt for follow-up context
    const systemPrompt = `You are ErrorWise AI, a helpful coding assistant specialized in debugging and error analysis.

CONTEXT: You are in a follow-up conversation about a coding error. The user has already received an initial analysis and is now asking clarifying questions.

RULES:
- Reference the previous context when answering
- Be concise but thorough
- Provide code examples when helpful
- If the user is asking about something unrelated to the original error, gently redirect
- Use markdown formatting for code blocks

Previous conversation is provided in the messages.`;

    // Make API call with conversation history
    if (!anthropic) {
      throw new Error('AI provider not available');
    }
    
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 2000,
      system: systemPrompt,
      messages: conversationHistory
    });
    
    const aiResponse = response.content[0]?.text || 'Unable to generate response';
    
    // Log the query
    if (queryLogger) {
      queryLogger.logQuery({
        type: 'follow_up',
        userId,
        messageLength: newMessage.length,
        contextLength: conversationHistory.length,
        model: modelId,
        responseTime: Date.now() - startTime,
        tier: subscriptionTier
      }).catch(e => console.warn('Query logging failed:', e.message));
    }
    
    return {
      response: aiResponse,
      model: modelId,
      contextUsed: conversationHistory.length,
      responseTime: Date.now() - startTime
    };
    
  } catch (error) {
    console.error('Analyze with context error:', error);
    
    // Return a helpful fallback response
    return {
      response: "I apologize, but I'm having trouble processing your follow-up question. Could you please rephrase it or provide more details about what aspect of the error you'd like me to clarify?",
      model: 'fallback',
      error: error.message
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// ========================================
// A2: Get Fallback Statistics
// ========================================
function getFallbackStats() {
  const total = fallbackStats.totalRequests || 1;
  return {
    ...fallbackStats,
    fallbackRate: ((fallbackStats.fallbacksUsed / total) * 100).toFixed(2) + '%',
    primarySuccessRate: ((fallbackStats.primarySuccesses / total) * 100).toFixed(2) + '%',
    fatalErrorRate: ((fallbackStats.fatalErrors / total) * 100).toFixed(2) + '%',
    timestamp: new Date().toISOString()
  };
}

module.exports = { 
  // Main functions
  analyzeError,
  analyzeBatchErrors,
  analyzeWithContext, // Conversational AI support
  
  // Statistics & monitoring
  getErrorStatistics,
  getServiceHealth,
  clearCache,
  getFallbackStats,  // A2: Fallback statistics
  
  // Utility functions
  detectLanguage,
  detectErrorType,
  parseStackTrace,
  createUserFriendlyError,  // A2: User-friendly error messages
  
  // Backward compatibility
  explainError,
  
  // Constants (for testing/monitoring)
  CONFIG,
  TIER_CONFIG,
};