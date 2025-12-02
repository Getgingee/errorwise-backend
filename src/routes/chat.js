/**
 * Chat Routes (Conversational AI)
 * 
 * Multi-turn conversation support for Pro and Team users.
 * Free users can only do single-turn (no follow-ups).
 * 
 * Routes:
 * - POST /api/chat/start - Start new conversation
 * - POST /api/chat/follow-up - Send follow-up (Pro/Team)
 * - GET /api/chat/:id - Get conversation
 * - GET /api/chat/history - Get all conversations
 * - DELETE /api/chat/:id - End conversation
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { authMiddleware } = require('../middleware/auth');
const { requireFeature, checkQueryLimit, checkFollowUpLimit } = require('../middleware/tierAccess');
const chatController = require('../controllers/chatController');

// Light rate limiter for starting new conversations only
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: { error: 'Too many requests. Please wait a moment.' }
});

// No rate limiting on follow-ups - keep conversation flowing!

// All routes require authentication
router.use(authMiddleware);

/**
 * Start a new conversation
 * Available to all tiers, but only Pro/Team get follow-up ability
 */
router.post('/start', 
  chatLimiter,
  checkQueryLimit('queriesPerDay'),
  chatController.startConversation
);

/**
 * Send a follow-up message - Available to all tiers!
 * Free: 3 follow-ups, Pro: 5, Team: 10
 */
router.post('/follow-up',
  authMiddleware,
  chatController.sendFollowUp
);

/**
 * Get a specific conversation
 */
router.get('/:conversationId', chatController.getConversation);

/**
 * Get conversation history
 */
router.get('/', chatController.getConversationHistory);

/**
 * End/clear a conversation
 */
router.delete('/:conversationId', chatController.endConversation);

module.exports = router;
