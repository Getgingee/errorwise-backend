const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const { demoRateLimiter, getUsageStats, DEMO_LIMIT } = require('../middleware/demoRateLimiter');

/**
 * PUBLIC DEMO ENDPOINT - No authentication required
 * Uses enhanced browser fingerprinting + IP tracking
 * STRICT LIMIT: 2 demos per device per 24 hours
 * Cannot be bypassed by:
 * - Refreshing browser
 * - Clearing cookies/cache
 * - Using incognito mode (same browser/IP)
 * - Multiple tabs
 */

/**
 * GET /api/public/demo/status
 * Check remaining demos for current device
 */
router.get('/status', async (req, res) => {
  try {
    const stats = await getUsageStats(req);
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('Error getting demo status:', error);
    res.status(500).json({
      error: 'Failed to get demo status'
    });
  }
});

/**
 * POST /api/public/demo/analyze
 * Public demo endpoint with STRICT rate limiting
 * Uses browser fingerprinting + IP tracking
 */
router.post('/analyze', demoRateLimiter, async (req, res) => {
  try {
    const { errorMessage } = req.body;

    // Input validation
    if (!errorMessage || typeof errorMessage !== 'string') {
      return res.status(400).json({
        error: 'Please provide an error message or question to analyze'
      });
    }

    const trimmedMessage = errorMessage.trim();

    // Length validation
    if (trimmedMessage.length < 10) {
      return res.status(400).json({
        error: 'Please provide more details (at least 10 characters)'
      });
    }

    if (trimmedMessage.length > 2000) {
      return res.status(400).json({
        error: 'Message too long. Please keep it under 2000 characters'
      });
    }

    // Usage info is already in req.demoUsage from middleware
    const demoUsage = req.demoUsage;
    
    console.log(`✅ Demo request allowed - Fingerprint: ${demoUsage.fingerprint}... | Remaining: ${demoUsage.remaining}`);

    // Call REAL AI service with FREE tier for demo
    const analysis = await aiService.analyzeError({
      errorMessage: trimmedMessage,
      errorType: 'general',
      subscriptionTier: 'free',
      userId: null,
      codeSnippet: null
    });
    
    console.log('✅ AI analysis successful', analysis?.provider || 'unknown provider');

    // Return FULL ANALYSIS with demo usage info
    const response = {
      explanation: analysis.explanation || 'Here\'s what we found:',
      solution: analysis.solution || 'Here are steps to resolve this issue.',
      codeExample: analysis.codeExample || null,
      category: analysis.category || 'General',
      confidence: Math.round((analysis.confidence || 0.85) * 100),
      // Demo tracking info
      isDemo: true,
      demoInfo: {
        remainingDemos: demoUsage.remaining,
        totalDemos: DEMO_LIMIT,
        resetTime: demoUsage.resetTime,
        message: demoUsage.remaining === 0
          ? '🎯 You\'ve used your last free demo! Sign up to get unlimited analyses with saved history.'
          : demoUsage.remaining === 1
          ? '⚡ Last demo remaining! Sign up to continue with unlimited access.'
          : `📊 ${demoUsage.remaining} demo${demoUsage.remaining > 1 ? 's' : ''} remaining today`
      },
      proFeatures: {
        withPro: [
          'Unlimited daily analyses',
          'Save and access analysis history',
          'Code examples and documentation',
          'Priority AI processing',
          'Export to PDF/Markdown',
          'Advanced error tracking',
          'Team collaboration features'
        ],
        demoLimitation: `Demo users get ${DEMO_LIMIT} analyses per day. Sign up for unlimited access!`
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Demo analysis error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error name:', error.name);
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    // Temporarily include error details in production for debugging
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message || 'Something went wrong. Please try again or sign up for better support!',
      errorName: error.name,
      // Include debug info temporarily
      debugHint: error.message?.substring(0, 200)
    });
  }
});

/**
 * POST /api/public/demo/explain
 * Simpler public endpoint - quick error explanation
 * Same restrictions as /analyze but lighter response
 */
router.post('/explain', demoRateLimiter, async (req, res) => {
  try {
    const { errorMessage } = req.body;

    // Input validation
    if (!errorMessage || typeof errorMessage !== 'string') {
      return res.status(400).json({
        error: 'Please provide an error message or question'
      });
    }

    const trimmedMessage = errorMessage.trim();

    // Length validation
    if (trimmedMessage.length < 10) {
      return res.status(400).json({
        error: 'Please provide more details (at least 10 characters)'
      });
    }

    if (trimmedMessage.length > 2000) {
      return res.status(400).json({
        error: 'Message too long. Please keep it under 2000 characters'
      });
    }
    
    // Usage info from middleware
    const demoUsage = req.demoUsage;
    
    console.log(`📝 Explain request - Fingerprint: ${demoUsage.fingerprint}... | Remaining: ${demoUsage.remaining}`);

    // Call AI service with FREE tier
    const analysis = await aiService.analyzeError({
      errorMessage: trimmedMessage,
      errorType: 'general',
      subscriptionTier: 'free',
      userId: null,
      codeSnippet: null
    });
    
    
    console.log('✅ Explanation generated', analysis.provider || 'unknown provider');

    // Return simplified response
    const response = {
      explanation: analysis.explanation || 'Here\'s what we found:',
      solution: analysis.solution || 'Here are steps to resolve this issue.',
      category: analysis.category || 'General',
      confidence: Math.round((analysis.confidence || 0.85) * 100),

      // Demo info
      isDemo: true,
      remainingDemos: demoUsage.remaining,
      totalDemos: DEMO_LIMIT,
      resetTime: demoUsage.resetTime,

      // Upgrade prompt
      upgradeMessage: demoUsage.remaining === 0
        ? '🎯 Last demo used! Sign up for unlimited access.'
        : demoUsage.remaining === 1
        ? '⚡ Only 1 demo remaining! Sign up to continue.'
        : `📊 ${demoUsage.remaining} demo${demoUsage.remaining > 1 ? 's' : ''} remaining today.`,

      upgradeUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register`
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Explain error:', error.message);
    res.status(500).json({
      error: 'Failed to generate explanation',
      message: 'Something went wrong. Please try again or sign up for better support!',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});/**
 * GET /api/public/demo/examples
 * Get example questions for users to try
 */
router.get('/examples', (req, res) => {
  const examples = [
    'TypeError: Cannot read property of undefined in JavaScript',
    'How to fix "Module not found" error in React?',
    'Python IndexError: list index out of range',
    'What causes high CPU usage in Node.js applications?',
    'How do I resolve CORS errors in my web application?'
  ];
  
  res.json({ examples });
});

/**
 * GET /api/public/demo/stats
 * Get current session stats (for debugging/monitoring)
 */


module.exports = router;


