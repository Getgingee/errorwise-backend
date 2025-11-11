const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { checkQueryLimit, addSubscriptionInfo } = require('../middleware/subscriptionMiddleware');
const conversationalAI = require('../services/conversationalAI');
const User = require('../models/User');

// All conversational routes require authentication
router.use(authMiddleware);
router.use(addSubscriptionInfo);

/**
 * POST /api/conversation/ask
 * Conversational AI endpoint - Google Assistant-like experience
 */
router.post('/ask', checkQueryLimit, async (req, res) => {
  try {
    const {
      message,
      conversationId,
      language = 'english',
      includeWebSearch = true
    } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required',
        message: 'Please provide a message to get started.'
      });
    }

    // Get user's subscription tier
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'subscriptionTier', 'subscriptionStatus']
    });

    const tier = user.subscriptionTier || 'free';

    // Get conversational response
    const response = await conversationalAI.getConversationalResponse({
      userId: req.user.id,
      message,
      conversationId,
      tier,
      language,
      includeWebSearch: includeWebSearch && (tier === 'pro' || tier === 'team') // Only Pro/Team get web search
    });

    res.json({
      success: true,
      ...response
    });

  } catch (error) {
    console.error('Conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process conversation',
      details: error.message
    });
  }
});

/**
 * GET /api/conversation/history/:conversationId
 * Get conversation history
 */
router.get('/history/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const history = conversationalAI.getConversationHistory(conversationId);

    if (!history) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: 'This conversation may have expired or does not exist.'
      });
    }

    // Verify conversation belongs to user
    if (history.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'You do not have access to this conversation.'
      });
    }

    res.json({
      success: true,
      conversation: {
        id: history.id,
        messages: history.messages,
        context: history.context,
        createdAt: history.createdAt
      }
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation history',
      details: error.message
    });
  }
});

/**
 * DELETE /api/conversation/:conversationId
 * Clear conversation context
 */
router.delete('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const history = conversationalAI.getConversationHistory(conversationId);

    if (history && history.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'You cannot delete this conversation.'
      });
    }

    conversationalAI.clearConversation(conversationId);

    res.json({
      success: true,
      message: 'Conversation cleared successfully'
    });

  } catch (error) {
    console.error('Clear conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear conversation',
      details: error.message
    });
  }
});

/**
 * POST /api/conversation/scrape
 * Web scraping endpoint (Pro/Team only)
 */
router.post('/scrape', async (req, res) => {
  try {
    const { query, context = {} } = req.body;

    // Get user's subscription tier
    const user = await User.findByPk(req.user.id, {
      attributes: ['subscriptionTier']
    });

    const tier = user.subscriptionTier || 'free';

    // Only Pro and Team users can use web scraping
    if (tier === 'free') {
      return res.status(403).json({
        error: 'Feature not available',
        message: 'Web scraping is only available for Pro and Team subscribers.',
        upgrade: true,
        requiredTier: 'pro'
      });
    }

    const results = await conversationalAI.scrapeWebForSolutions(query, context);

    res.json({
      success: true,
      results,
      count: results.length
    });

  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scrape web',
      details: error.message
    });
  }
});

module.exports = router;
