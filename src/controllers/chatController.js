/**
 * Conversational AI Controller
 * 
 * Handles chat-based error analysis with context memory.
 * Pro and Team users can have multi-turn conversations.
 * 
 * Features:
 * - Start a new conversation
 * - Send follow-up messages
 * - Get conversation history
 * - Context memory (AI remembers previous messages)
 */

const { v4: uuidv4 } = require('uuid');
const ErrorQuery = require('../models/ErrorQuery');
const User = require('../models/User');
const aiService = require('../services/aiService');
const { hasFeature, getLimit } = require('../config/tierConfig');
const { Op } = require('sequelize');

// In-memory conversation context (could be Redis for production scale)
const conversationContexts = new Map();
const CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get or create conversation context
 */
function getContext(conversationId) {
  const context = conversationContexts.get(conversationId);
  if (context && Date.now() - context.lastUpdated < CONTEXT_TTL) {
    return context;
  }
  return null;
}

/**
 * Save conversation context
 */
function saveContext(conversationId, messages, metadata = {}) {
  conversationContexts.set(conversationId, {
    messages,
    metadata,
    lastUpdated: Date.now()
  });
  
  // Cleanup old contexts periodically
  if (conversationContexts.size > 1000) {
    const now = Date.now();
    for (const [id, ctx] of conversationContexts) {
      if (now - ctx.lastUpdated > CONTEXT_TTL) {
        conversationContexts.delete(id);
      }
    }
  }
}

/**
 * Start a new conversation
 * POST /api/chat/start
 */
exports.startConversation = async (req, res) => {
  try {
    const { errorMessage, language, framework, additionalContext } = req.body;
    const userId = req.user.id;
    const effectiveTier = req.userTier || 'free';
    
    if (!errorMessage) {
      return res.status(400).json({
        success: false,
        error: 'Error message is required'
      });
    }
    
    // Create conversation ID
    const conversationId = uuidv4();
    
    // Check if conversational mode is enabled
    const isConversational = hasFeature(effectiveTier, 'conversationalMode');
    
    // Get AI analysis
    const startTime = Date.now();
    const analysis = await aiService.analyzeError({
      errorMessage,
      language,
      framework,
      additionalContext,
      userId,
      subscriptionTier: effectiveTier,
      conversationMode: isConversational
    });
    const responseTime = Date.now() - startTime;
    
    // Save to database
    const errorQuery = await ErrorQuery.create({
      id: conversationId,
      userId,
      errorMessage: errorMessage.substring(0, 10000),
      language,
      framework,
      aiResponse: analysis.response,
      aiModel: analysis.model,
      responseTime,
      userSubscriptionTier: effectiveTier,
      isConversation: isConversational,
      conversationTurn: 1
    });
    
    // Initialize conversation context
    if (isConversational) {
      saveContext(conversationId, [
        { role: 'user', content: errorMessage },
        { role: 'assistant', content: analysis.response }
      ], {
        language,
        framework,
        tier: effectiveTier,
        userId
      });
    }
    
    res.json({
      success: true,
      conversationId,
      analysis: {
        response: analysis.response,
        model: analysis.model,
        cached: analysis.cached || false
      },
      conversation: {
        isConversational,
        canFollowUp: isConversational,
        maxFollowUps: isConversational ? getLimit(effectiveTier, 'maxFollowUps') : 0,
        followUpsUsed: 0
      },
      meta: {
        responseTime,
        tier: effectiveTier
      }
    });
    
  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start conversation'
    });
  }
};

/**
 * Send a follow-up message
 * POST /api/chat/follow-up
 */
exports.sendFollowUp = async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const userId = req.user.id;
    const effectiveTier = req.userTier || 'free';
    
    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID and message are required'
      });
    }
    
    // Check feature access (middleware should have done this, but double-check)
    if (!hasFeature(effectiveTier, 'followUpQuestions')) {
      return res.status(403).json({
        success: false,
        error: 'Follow-up questions require Pro or Team',
        code: 'FOLLOWUP_BLOCKED'
      });
    }
    
    // Get conversation context
    let context = getContext(conversationId);
    
    // If no context in memory, try to rebuild from database
    if (!context) {
      const previousMessages = await ErrorQuery.findAll({
        where: {
          [Op.or]: [
            { id: conversationId },
            { parentId: conversationId }
          ],
          userId
        },
        order: [['createdAt', 'ASC']],
        limit: 20
      });
      
      if (previousMessages.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
      
      // Rebuild context
      const messages = [];
      for (const msg of previousMessages) {
        messages.push({ role: 'user', content: msg.errorMessage });
        if (msg.aiResponse) {
          messages.push({ role: 'assistant', content: msg.aiResponse });
        }
      }
      
      context = { messages, metadata: { tier: effectiveTier, userId } };
    }
    
    // Check follow-up limit
    const followUpCount = await ErrorQuery.count({
      where: {
        parentId: conversationId,
        userId
      }
    });
    
    const maxFollowUps = getLimit(effectiveTier, 'maxFollowUps');
    if (maxFollowUps !== -1 && followUpCount >= maxFollowUps) {
      return res.status(403).json({
        success: false,
        error: `Maximum ${maxFollowUps} follow-ups reached`,
        code: 'FOLLOWUP_LIMIT_REACHED',
        limit: maxFollowUps,
        used: followUpCount
      });
    }
    
    // Add user message to context
    context.messages.push({ role: 'user', content: message });
    
    // Get AI response with context
    const startTime = Date.now();
    const analysis = await aiService.analyzeWithContext({
      messages: context.messages,
      newMessage: message,
      userId,
      subscriptionTier: effectiveTier
    });
    const responseTime = Date.now() - startTime;
    
    // Add assistant response to context
    context.messages.push({ role: 'assistant', content: analysis.response });
    saveContext(conversationId, context.messages, context.metadata);
    
    // Save follow-up to database
    const followUp = await ErrorQuery.create({
      userId,
      errorMessage: message.substring(0, 10000),
      aiResponse: analysis.response,
      aiModel: analysis.model,
      responseTime,
      userSubscriptionTier: effectiveTier,
      parentId: conversationId,
      isConversation: true,
      conversationTurn: followUpCount + 2
    });
    
    res.json({
      success: true,
      messageId: followUp.id,
      response: analysis.response,
      model: analysis.model,
      conversation: {
        id: conversationId,
        turn: followUpCount + 2,
        followUpsUsed: followUpCount + 1,
        followUpsRemaining: maxFollowUps === -1 ? 'unlimited' : maxFollowUps - followUpCount - 1
      },
      meta: {
        responseTime,
        contextLength: context.messages.length
      }
    });
    
  } catch (error) {
    console.error('Follow-up error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process follow-up'
    });
  }
};

/**
 * Get conversation history
 * GET /api/chat/:conversationId
 */
exports.getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    // Get all messages in this conversation
    const messages = await ErrorQuery.findAll({
      where: {
        [Op.or]: [
          { id: conversationId },
          { parentId: conversationId }
        ],
        userId
      },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'errorMessage', 'aiResponse', 'aiModel', 'createdAt', 'conversationTurn', 'feedback']
    });
    
    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    // Format for frontend
    const conversation = messages.map(msg => ({
      id: msg.id,
      userMessage: msg.errorMessage,
      aiResponse: msg.aiResponse,
      model: msg.aiModel,
      turn: msg.conversationTurn,
      feedback: msg.feedback,
      timestamp: msg.createdAt
    }));
    
    res.json({
      success: true,
      conversationId,
      messageCount: messages.length,
      messages: conversation
    });
    
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation'
    });
  }
};

/**
 * Get user's recent conversations
 * GET /api/chat/history
 */
exports.getConversationHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    // Get root conversations (not follow-ups)
    const conversations = await ErrorQuery.findAll({
      where: {
        userId,
        parentId: null
      },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: ['id', 'errorMessage', 'aiModel', 'createdAt', 'isConversation', 'language', 'framework']
    });
    
    // Get follow-up counts for each
    const conversationIds = conversations.map(c => c.id);
    const followUpCounts = await ErrorQuery.findAll({
      where: {
        parentId: { [Op.in]: conversationIds }
      },
      attributes: [
        'parentId',
        [ErrorQuery.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['parentId'],
      raw: true
    });
    
    const countsMap = {};
    followUpCounts.forEach(c => {
      countsMap[c.parentId] = parseInt(c.count);
    });
    
    const result = conversations.map(conv => ({
      id: conv.id,
      preview: conv.errorMessage.substring(0, 100) + (conv.errorMessage.length > 100 ? '...' : ''),
      model: conv.aiModel,
      language: conv.language,
      framework: conv.framework,
      isConversation: conv.isConversation,
      followUpCount: countsMap[conv.id] || 0,
      createdAt: conv.createdAt
    }));
    
    res.json({
      success: true,
      conversations: result,
      pagination: {
        limit,
        offset,
        hasMore: conversations.length === limit
      }
    });
    
  } catch (error) {
    console.error('Get conversation history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation history'
    });
  }
};

/**
 * Clear conversation context (end conversation)
 * DELETE /api/chat/:conversationId
 */
exports.endConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Clear from memory
    conversationContexts.delete(conversationId);
    
    res.json({
      success: true,
      message: 'Conversation ended'
    });
    
  } catch (error) {
    console.error('End conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end conversation'
    });
  }
};
