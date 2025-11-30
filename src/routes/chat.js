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

// Rate limiters
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  message: { error: 'Too many messages. Please slow down.' }
});

const followUpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 follow-ups per minute
  message: { error: 'Too many follow-up messages.' }
});

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
 * Send a follow-up message (Pro/Team only)
 */
router.post('/follow-up',
  followUpLimiter,
  requireFeature('followUpQuestions'),
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
