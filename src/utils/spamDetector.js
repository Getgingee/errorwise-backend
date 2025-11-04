/**
 * Spam Content Detector
 * Pattern-based detection for spam submissions
 */

/**
 * Common spam keywords (case-insensitive)
 */
const SPAM_KEYWORDS = [
  // Common spam phrases
  'click here', 'buy now', 'limited time', 'act now', 'order now',
  'special promotion', 'once in a lifetime', 'free money', 'risk free',
  'satisfaction guaranteed', 'no obligation', 'dont hesitate',
  
  // SEO spam
  'increase traffic', 'boost ranking', 'seo services', 'link building',
  'guaranteed ranking', 'top of google', 'search engine',
  
  // Financial spam
  'make money fast', 'work from home', 'passive income', 'get rich',
  'earn extra cash', 'financial freedom', 'investment opportunity',
  'credit card', 'loan approved', 'debt consolidation',
  
  // Pharmaceutical spam
  'viagra', 'cialis', 'pharmacy', 'prescription', 'weight loss',
  'diet pills', 'male enhancement',
  
  // Casino/gambling spam
  'online casino', 'poker', 'slots', 'jackpot', 'lottery',
  'sports betting', 'casino online',
  
  // Generic spam
  'unsubscribe', 'remove from list', 'opt out', 'click below',
  'this is not spam', 'dear friend', 'congratulations you won'
];

/**
 * Suspicious URL patterns
 */
const SUSPICIOUS_URL_PATTERNS = [
  /bit\.ly/i,           // URL shorteners (often used for spam)
  /tinyurl\.com/i,
  /goo\.gl/i,
  /ow\.ly/i,
  /t\.co/i,
  /buff\.ly/i,
  /adf\.ly/i,
  
  // Multiple URLs in short text (likely spam)
  /https?:\/\/.*https?:\/\/.*https?:\/\//gi, // 3+ URLs
  
  // Suspicious TLDs
  /\.xyz$/i,
  /\.top$/i,
  /\.click$/i,
  /\.loan$/i,
  /\.gq$/i,
  /\.ml$/i,
  /\.cf$/i,
  /\.ga$/i
];

/**
 * Detect spam in text content
 * @param {string} content - Text content to check
 * @returns {{ isSpam: boolean, confidence: number, reasons: string[] }}
 */
function detectSpam(content) {
  if (!content || typeof content !== 'string') {
    return { isSpam: false, confidence: 0, reasons: [] };
  }
  
  const text = content.toLowerCase();
  const reasons = [];
  let spamScore = 0;
  
  // 1. Check for spam keywords
  const foundKeywords = SPAM_KEYWORDS.filter(keyword => text.includes(keyword.toLowerCase()));
  if (foundKeywords.length > 0) {
    spamScore += foundKeywords.length * 10; // 10 points per keyword
    reasons.push(`Contains spam keywords: ${foundKeywords.slice(0, 3).join(', ')}${foundKeywords.length > 3 ? '...' : ''}`);
  }
  
  // 2. Check for excessive URLs
  const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
  if (urlMatches.length > 3) {
    spamScore += urlMatches.length * 5; // 5 points per URL after 3
    reasons.push(`Excessive URLs: ${urlMatches.length} links found`);
  }
  
  // 3. Check for suspicious URL patterns
  const suspiciousUrls = SUSPICIOUS_URL_PATTERNS.filter(pattern => pattern.test(content));
  if (suspiciousUrls.length > 0) {
    spamScore += 30; // High penalty
    reasons.push('Contains suspicious URL shorteners or domains');
  }
  
  // 4. Check for excessive capitalization
  const capitalLetters = (content.match(/[A-Z]/g) || []).length;
  const totalLetters = (content.match(/[a-zA-Z]/g) || []).length;
  if (totalLetters > 20 && capitalLetters / totalLetters > 0.5) {
    spamScore += 20;
    reasons.push('Excessive capitalization (SHOUTING)');
  }
  
  // 5. Check for excessive punctuation
  const punctuationCount = (content.match(/[!?]{2,}/g) || []).length;
  if (punctuationCount > 3) {
    spamScore += 15;
    reasons.push('Excessive punctuation (!!!, ???)');
  }
  
  // 6. Check for gibberish (random characters)
  const gibberishPattern = /([a-z])\1{4,}|[qwxz]{3,}/i; // Same letter 5+ times or unusual letter combos
  if (gibberishPattern.test(content)) {
    spamScore += 25;
    reasons.push('Contains gibberish or random characters');
  }
  
  // 7. Check for extremely short content with URLs
  if (content.length < 50 && urlMatches.length > 0) {
    spamScore += 20;
    reasons.push('Very short message with links');
  }
  
  // 8. Check for repeated phrases
  const words = text.split(/\s+/);
  const repeatedPhrases = findRepeatedPhrases(words, 3); // 3-word phrases
  if (repeatedPhrases.length > 2) {
    spamScore += 15;
    reasons.push('Contains repeated phrases');
  }
  
  // 9. Check for excessive emojis
  const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
  if (emojiCount > 10) {
    spamScore += 10;
    reasons.push('Excessive emoji usage');
  }
  
  // 10. Check character encoding anomalies
  const nonAsciiCount = (content.match(/[^\x00-\x7F]/g) || []).length;
  if (nonAsciiCount > content.length * 0.3 && content.length > 20) {
    spamScore += 15;
    reasons.push('High non-ASCII character ratio');
  }
  
  // Calculate confidence (0-100%)
  const confidence = Math.min(Math.floor(spamScore), 100);
  
  // Spam threshold: 50+ points
  const isSpam = spamScore >= 50;
  
  return {
    isSpam,
    confidence,
    spamScore,
    reasons,
    details: {
      keywords: foundKeywords.length,
      urls: urlMatches.length,
      suspiciousUrls: suspiciousUrls.length > 0,
      capitalization: capitalLetters && totalLetters ? (capitalLetters / totalLetters * 100).toFixed(1) + '%' : '0%',
      length: content.length
    }
  };
}

/**
 * Find repeated phrases in text
 */
function findRepeatedPhrases(words, phraseLength) {
  const phrases = new Map();
  
  for (let i = 0; i <= words.length - phraseLength; i++) {
    const phrase = words.slice(i, i + phraseLength).join(' ');
    phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
  }
  
  return Array.from(phrases.entries())
    .filter(([phrase, count]) => count > 1)
    .map(([phrase]) => phrase);
}

/**
 * Check for duplicate submissions (same content multiple times)
 * Uses Redis to track recent submissions
 */
const recentSubmissions = new Map(); // In-memory for now, use Redis in production

function isDuplicate(content, email, windowMs = 3600000) { // 1 hour default
  const key = `${email}:${hashContent(content)}`;
  const now = Date.now();
  
  if (recentSubmissions.has(key)) {
    const lastSubmission = recentSubmissions.get(key);
    if (now - lastSubmission < windowMs) {
      return true; // Duplicate within time window
    }
  }
  
  // Store this submission
  recentSubmissions.set(key, now);
  
  // Cleanup old entries (simple implementation)
  if (recentSubmissions.size > 10000) {
    const entriesToDelete = [];
    recentSubmissions.forEach((time, k) => {
      if (now - time > windowMs) {
        entriesToDelete.push(k);
      }
    });
    entriesToDelete.forEach(k => recentSubmissions.delete(k));
  }
  
  return false;
}

/**
 * Simple hash function for content
 */
function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Express middleware for spam detection
 * @param {string[]} fields - Fields to check for spam (e.g., ['message', 'content'])
 */
function spamDetectionMiddleware(fields = ['message', 'content', 'description']) {
  return (req, res, next) => {
    try {
      const { body } = req;
      
      // Check each specified field
      for (const field of fields) {
        if (body[field]) {
          const result = detectSpam(body[field]);
          
          if (result.isSpam) {
            console.warn(`🚨 Spam detected in ${field} | Confidence: ${result.confidence}% | Reasons: ${result.reasons.join(', ')} | IP: ${req.ip}`);
            
            // Log but don't immediately reject (to analyze false positives)
            // In production, you might want to reject high-confidence spam
            if (result.confidence >= 80) {
              return res.status(400).json({
                success: false,
                code: 'SPAM_DETECTED',
                message: 'Your submission appears to be spam. Please ensure your content is legitimate.',
              });
            }
            
            // For medium confidence, flag for manual review
            req.flaggedAsSpam = true;
            req.spamDetails = result;
          }
        }
      }
      
      // Check for duplicate submissions
      const contentToCheck = fields.map(f => body[f]).filter(Boolean).join(' ');
      const email = body.email || 'anonymous';
      
      if (contentToCheck && isDuplicate(contentToCheck, email)) {
        console.warn(`🔁 Duplicate submission detected | Email: ${email} | IP: ${req.ip}`);
        
        return res.status(429).json({
          success: false,
          code: 'DUPLICATE_SUBMISSION',
          message: 'You have already submitted this content recently. Please wait before submitting again.',
        });
      }
      
      next();
    } catch (error) {
      console.error('❌ Spam detection error:', error);
      next(error); // Don't block on error
    }
  };
}

module.exports = {
  detectSpam,
  isDuplicate,
  spamDetectionMiddleware,
  SPAM_KEYWORDS,
  SUSPICIOUS_URL_PATTERNS
};
