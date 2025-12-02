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
 * 
 * Note: Context is stored in Redis for multi-worker support (cluster mode)
 */

const { v4: uuidv4 } = require('uuid');
const ErrorQuery = require('../models/ErrorQuery');
const User = require('../models/User');
const aiService = require('../services/aiService');
const { hasFeature, getLimit } = require('../config/tierConfig');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const redisService = require('../services/redisService');

// Redis key prefix for conversation context
const CONTEXT_PREFIX = 'conv_ctx:';
const CONTEXT_TTL = 30 * 60; // 30 minutes in seconds

// Redis key prefix for follow-up counts
const FOLLOWUP_COUNT_PREFIX = 'conv_followups:';

/**
 * Generate engaging, conversational follow-up chips based on AI response
 * Made for non-tech users - friendly and helpful!
 */
function generateConversationalChips(previousMessages, latestResponse) {
  const chips = [];
  const responseLower = latestResponse.toLowerCase();
  
  // For code-related responses
  if (responseLower.includes('```') || responseLower.includes('function') || responseLower.includes('const ')) {
    chips.push("🤔 Can you explain this simpler?");
    chips.push("📝 Show me step by step");
  }
  
  // If solution involves trying something
  if (responseLower.includes('try') || responseLower.includes('should work') || responseLower.includes('fix')) {
    chips.push("😕 What if it still doesn't work?");
    chips.push("🔄 Any other ways to fix this?");
  }
  
  // If response mentions settings or configuration
  if (responseLower.includes('setting') || responseLower.includes('config') || responseLower.includes('option')) {
    chips.push("📍 Where do I find this setting?");
    chips.push("🖼️ Can you show me exactly?");
  }
  
  // If response mentions installing or downloading
  if (responseLower.includes('install') || responseLower.includes('download') || responseLower.includes('update')) {
    chips.push("📥 How do I install this?");
    chips.push("⚠️ Is it safe to download?");
  }
  
  // If response mentions restarting or refreshing
  if (responseLower.includes('restart') || responseLower.includes('refresh') || responseLower.includes('reboot')) {
    chips.push("💡 What should I save first?");
  }
  
  // If about password or login issues
  if (responseLower.includes('password') || responseLower.includes('login') || responseLower.includes('account')) {
    chips.push("🔐 How do I reset my password?");
    chips.push("📧 What if I forgot my email too?");
  }
  
  // If about payment or billing
  if (responseLower.includes('payment') || responseLower.includes('card') || responseLower.includes('charge')) {
    chips.push("💳 Is my payment info safe?");
    chips.push("📞 How do I contact support?");
  }
  
  // Generic helpful chips based on response length
  if (latestResponse.length > 500) {
    chips.push("📋 Give me the quick version");
  }
  
  // Always add some engaging options
  if (chips.length < 3) {
    chips.push("🤷 I'm confused, help!");
    chips.push("✨ Any tips to prevent this?");
  }
  
  // Success chip
  chips.push("✅ That fixed it, thanks!");
  
  // Remove duplicates and limit to 4 chips
  return [...new Set(chips)].slice(0, 4);
}

/**
 * Get or create conversation context from Redis
 */
async function getContext(conversationId) {
  try {
    const context = await redisService.get(`${CONTEXT_PREFIX}${conversationId}`);
    return context;
  } catch (error) {
    console.error('[Context] Redis get error:', error.message);
    return null;
  }
}

/**
 * Save conversation context to Redis (shared across all workers)
 */
async function saveContext(conversationId, messages, metadata = {}) {
  try {
    const context = {
      messages,
      metadata,
      lastUpdated: Date.now()
    };
    await redisService.set(`${CONTEXT_PREFIX}${conversationId}`, context, CONTEXT_TTL);
    return true;
  } catch (error) {
    console.error('[Context] Redis save error:', error.message);
    return false;
  }
}

/**
 * Get follow-up count from Redis
 */
async function getFollowUpCount(conversationId) {
  try {
    const count = await redisService.get(`${FOLLOWUP_COUNT_PREFIX}${conversationId}`);
    return count || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Increment follow-up count in Redis
 */
async function incrementFollowUpCount(conversationId) {
  try {
    const current = await getFollowUpCount(conversationId);
    await redisService.set(`${FOLLOWUP_COUNT_PREFIX}${conversationId}`, current + 1, CONTEXT_TTL);
    return current + 1;
  } catch (error) {
    return 1;
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
    
    // Check if follow-ups are enabled for this tier
    const canFollowUp = hasFeature(effectiveTier, 'followUpQuestions');
    const maxFollowUps = getLimit(effectiveTier, 'maxFollowUps');
    
    console.log(`[Chat] User ${userId} tier: ${effectiveTier}, canFollowUp: ${canFollowUp}, maxFollowUps: ${maxFollowUps}`);
    
    // Get AI analysis
    const startTime = Date.now();
    const analysis = await aiService.analyzeError({
      errorMessage,
      language,
      framework,
      additionalContext,
      userId,
      subscriptionTier: effectiveTier,
      conversationMode: canFollowUp
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
      isConversation: canFollowUp,
      conversationTurn: 1
    });
    
    // Initialize conversation context for follow-ups in Redis
    if (canFollowUp) {
      await saveContext(conversationId, [
        { role: 'user', content: errorMessage },
        { role: 'assistant', content: analysis.response }
      ], {
        language,
        framework,
        tier: effectiveTier,
        userId
      });
    }
    
    // Generate suggested follow-up questions
    const suggestedQuestions = generateConversationalChips(
      [{ role: 'user', content: errorMessage }],
      analysis.response
    );
    
    res.json({
      success: true,
      conversationId,
      analysis: {
        response: analysis.response,
        model: analysis.model,
        cached: analysis.cached || false
      },
      conversation: {
        id: conversationId,
        canFollowUp,
        maxFollowUps,
        followUpsRemaining: maxFollowUps,
        followUpsUsed: 0,
        suggestedQuestions
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
    
    console.log(`[Chat Follow-up] User ${userId}, Tier: ${effectiveTier}, ConvId: ${conversationId}`);
    
    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID and message are required'
      });
    }
    
    // Check feature access
    const canFollowUp = hasFeature(effectiveTier, 'followUpQuestions');
    console.log(`[Chat Follow-up] canFollowUp: ${canFollowUp}`);
    
    if (!canFollowUp) {
      return res.status(403).json({
        success: false,
        error: 'Follow-up questions require Pro or Team subscription',
        code: 'FOLLOWUP_BLOCKED'
      });
    }
    
    // Get conversation context from Redis (shared across all workers)
    let context = await getContext(conversationId);
    
    // If no context in Redis, the conversation has expired
    if (!context) {
      console.log(`[Chat Follow-up] No context in Redis for: ${conversationId}`);
      console.log(`[Chat Follow-up] Context expires after 30 mins`);
      
      return res.status(404).json({
        success: false,
        error: 'Conversation session expired. Please submit a new query to start fresh.',
        code: 'CONVERSATION_EXPIRED',
        hint: 'Conversation context is stored temporarily. Submit your original query again to continue.'
      });
    }
    
    // Check follow-up limit using Redis counter (shared across workers)
    const followUpCount = await getFollowUpCount(conversationId);
    
    const maxFollowUps = getLimit(effectiveTier, 'maxFollowUps');
    console.log(`[Chat Follow-up] Follow-up count: ${followUpCount}/${maxFollowUps}`);
    
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
    await saveContext(conversationId, context.messages, context.metadata);
    
    // Increment follow-up count in Redis
    const newFollowUpCount = await incrementFollowUpCount(conversationId);
    
    // Save follow-up to database (use explanation + solution fields since ErrorQuery doesn't have aiResponse)
    const followUp = await ErrorQuery.create({
      userId,
      errorMessage: message.substring(0, 10000),
      explanation: analysis.response,
      solution: '', // Follow-ups combine into explanation
      errorCategory: 'follow-up',
      aiProvider: analysis.model || 'anthropic',
      responseTime,
      userSubscriptionTier: effectiveTier,
      tags: ['follow-up', conversationId] // Store conversationId in tags for reference
    });
    
    // Generate contextual follow-up chips
    const remainingFollowUps = maxFollowUps === -1 ? 999 : maxFollowUps - newFollowUpCount;
    const suggestedChips = remainingFollowUps > 0 
      ? generateConversationalChips(context.messages, analysis.response)
      : ["Thanks for the help! 👍"];
    
    res.json({
      success: true,
      messageId: followUp.id,
      response: analysis.response,
      model: analysis.model,
      conversation: {
        id: conversationId,
        turn: newFollowUpCount + 1,
        followUpsUsed: newFollowUpCount,
        followUpsRemaining: maxFollowUps === -1 ? 'unlimited' : remainingFollowUps,
        canContinue: remainingFollowUps > 0
      },
      // Suggested follow-up chips for continued conversation
      suggestedChips,
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
    
    // Get the original message
    const originalMessage = await ErrorQuery.findOne({
      where: {
        id: conversationId,
        userId
      },
      attributes: ['id', 'errorMessage', 'explanation', 'solution', 'aiProvider', 'createdAt', 'feedback']
    });
    
    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    // Get follow-up messages (stored with conversationId in tags)
    const followUps = await ErrorQuery.findAll({
      where: {
        userId,
        tags: { [Op.contains]: [conversationId] }
      },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'errorMessage', 'explanation', 'aiProvider', 'createdAt', 'feedback']
    });
    
    // Format for frontend - combine original + follow-ups
    const messages = [
      {
        id: originalMessage.id,
        userMessage: originalMessage.errorMessage,
        aiResponse: [originalMessage.explanation, originalMessage.solution].filter(Boolean).join('\n\n'),
        model: originalMessage.aiProvider,
        turn: 1,
        feedback: originalMessage.feedback,
        timestamp: originalMessage.createdAt
      },
      ...followUps.map((msg, idx) => ({
        id: msg.id,
        userMessage: msg.errorMessage,
        aiResponse: msg.explanation,
        model: msg.aiProvider,
        turn: idx + 2,
        feedback: msg.feedback,
        timestamp: msg.createdAt
      }))
    ];
    
    res.json({
      success: true,
      conversationId,
      messageCount: messages.length,
      messages
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
    
    // Clear from Redis
    await redisService.del(`${CONTEXT_PREFIX}${conversationId}`);
    await redisService.del(`${FOLLOWUP_COUNT_PREFIX}${conversationId}`);
    
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

/**
 * Export saveContext for use by other controllers (e.g., errorController)
 * This allows the error analysis to save context for follow-up questions
 * Stores in Redis for multi-worker support
 */
exports.saveConversationContext = async function(conversationId, errorMessage, aiResponse, metadata = {}) {
  try {
    const context = {
      messages: [
        { role: 'user', content: errorMessage },
        { role: 'assistant', content: aiResponse }
      ],
      metadata,
      lastUpdated: Date.now()
    };
    await redisService.set(`${CONTEXT_PREFIX}${conversationId}`, context, CONTEXT_TTL);
    console.log(`[Context] Saved conversation context to Redis for: ${conversationId}`);
  } catch (error) {
    console.error(`[Context] Failed to save context to Redis:`, error.message);
  }
};
