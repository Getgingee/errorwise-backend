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
 * ARCHITECTURE: Event-Driven Cache Sync
 * - Database is SINGLE SOURCE OF TRUTH
 * - Events trigger cache updates AFTER DB commits
 * - Solves dual-write consistency problems
 * - Cache failures don't block DB operations
 */

const { v4: uuidv4 } = require('uuid');
const ErrorQuery = require('../models/ErrorQuery');
const User = require('../models/User');
const aiService = require('../services/aiService');
const conversationalAI = require('../services/conversationalAI');
const { hasFeature, getLimit } = require('../config/tierConfig');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const redisService = require('../services/redisService');
const { eventEmitter, getContextFromCache, getFollowUpCountFromCache } = require('../services/cacheSync');

// Redis key prefix for conversation context
const CONTEXT_PREFIX = 'conv_ctx:';
const CONTEXT_TTL = 30 * 60; // 30 minutes in seconds

// Redis key prefix for follow-up counts
const FOLLOWUP_COUNT_PREFIX = 'conv_followups:';

/**
 * Generate engaging, conversational follow-up chips based on AI response
 * Made for non-tech users - friendly and helpful!
 * Returns chip objects with action property for frontend handling
 */
function generateConversationalChips(previousMessages, latestResponse) {
  const chips = [];
  const responseLower = latestResponse.toLowerCase();
  
  // For code-related responses
  if (responseLower.includes('```') || responseLower.includes('function') || responseLower.includes('const ')) {
    chips.push({
      text: "🤔 Can you explain this simpler?",
      type: "follow_up",
      message: "Can you explain this in simpler terms, like you're explaining to someone who's not very technical?"
    });
    chips.push({
      text: "📝 Show me step by step",
      type: "follow_up",
      message: "Can you break this down into simple step-by-step instructions?"
    });
  }
  
  // If solution involves trying something
  if (responseLower.includes('try') || responseLower.includes('should work') || responseLower.includes('fix')) {
    chips.push({
      text: "😕 What if it still doesn't work?",
      type: "follow_up",
      message: "What should I do if this solution doesn't work? Are there alternative approaches?"
    });
    chips.push({
      text: "🔄 Any other ways to fix this?",
      type: "follow_up",
      message: "Are there other alternative ways to solve this problem?"
    });
  }
  
  // If response mentions settings or configuration
  if (responseLower.includes('setting') || responseLower.includes('config') || responseLower.includes('option')) {
    chips.push({
      text: "📍 Where do I find this setting?",
      type: "follow_up",
      message: "Can you give me the exact location or path to find this setting?"
    });
    chips.push({
      text: "🖼️ Can you show me exactly?",
      type: "follow_up",
      message: "Can you provide more detailed instructions on where to find this?"
    });
  }
  
  // If response mentions installing or downloading
  if (responseLower.includes('install') || responseLower.includes('download') || responseLower.includes('update')) {
    chips.push({
      text: "📥 How do I install this?",
      type: "follow_up",
      message: "Can you provide step-by-step installation instructions?"
    });
    chips.push({
      text: "⚠️ Is it safe to download?",
      type: "follow_up",
      message: "Is this download safe? Where is the official source?"
    });
  }
  
  // If response mentions restarting or refreshing
  if (responseLower.includes('restart') || responseLower.includes('refresh') || responseLower.includes('reboot')) {
    chips.push({
      text: "💡 What should I save first?",
      type: "follow_up",
      message: "What things should I save or backup before restarting?"
    });
  }
  
  // If about password or login issues
  if (responseLower.includes('password') || responseLower.includes('login') || responseLower.includes('account')) {
    chips.push({
      text: "🔐 How do I reset my password?",
      type: "follow_up",
      message: "How do I reset my password if I forgot it?"
    });
    chips.push({
      text: "📧 What if I forgot my email too?",
      type: "follow_up",
      message: "What options do I have if I also forgot my email address?"
    });
  }
  
  // If about payment or billing
  if (responseLower.includes('payment') || responseLower.includes('card') || responseLower.includes('charge')) {
    chips.push({
      text: "💳 Is my payment info safe?",
      type: "follow_up",
      message: "How is my payment information protected?"
    });
    chips.push({
      text: "📞 How do I contact support?",
      type: "follow_up",
      message: "How can I contact customer support for billing issues?"
    });
  }
  
  // Generic helpful chips based on response length
  if (latestResponse.length > 500) {
    chips.push({
      text: "📋 Give me the quick version",
      type: "follow_up",
      message: "Can you give me a shorter, summarized version of this?"
    });
  }
  
  // Always add some engaging options
  if (chips.length < 3) {
    chips.push({
      text: "🤷 I'm confused, help!",
      type: "follow_up",
      message: "I'm still confused. Can you explain this differently?"
    });
    chips.push({
      text: "✨ Any tips to prevent this?",
      type: "follow_up",
      message: "What can I do to prevent this issue from happening again?"
    });
  }
  
  // Success chip - special action to close conversation
  chips.push({
    text: "✅ That fixed it, thanks!",
    type: "close_conversation",
    message: "Thank you, that solved my problem!"
  });
  
  // Remove duplicates by text and limit to 4 chips
  const seen = new Set();
  return chips.filter(chip => {
    if (seen.has(chip.text)) return false;
    seen.add(chip.text);
    return true;
  }).slice(0, 4);
}

/**
 * Get or create conversation context from Redis (read-only cache)
 * Falls back to DB if cache miss
 */
async function getContext(conversationId) {
  try {
    const key = `${CONTEXT_PREFIX}${conversationId}`;
    console.log(`[Context] Looking for key: ${key}`);
    
    // Try to get from cache first (uses cache sync service)
    const context = await getContextFromCache(conversationId);
    
    if (context) {
      console.log(`[Context] Cache HIT for ${conversationId}, messages: ${context.messages?.length || 0}`);
      return context;
    }
    
    // Cache miss - return null, controller will fetch from DB
    console.log(`[Context] Cache MISS for ${conversationId}, will fetch from DB`);
    return null;
  } catch (error) {
    console.error('[Context] Error getting context:', error.message);
    return null; // Allow fallback to DB
  }
}

/**
 * Get follow-up count from cache (read-only)
 */
async function getFollowUpCount(conversationId) {
  try {
    const count = await getFollowUpCountFromCache(conversationId);
    return count || 0;
  } catch (error) {
    console.error('[Context] Error getting follow-up count:', error.message);
    return 0;
  }
}

/**
 * DEPRECATED: Use event-driven cache sync instead
 * This function is kept for backward compatibility but should not be used
 */
async function saveContext(conversationId, messages, metadata = {}) {
  try {
    const context = {
      messages,
      metadata,
      lastUpdated: Date.now()
    };
    // Note: Events will handle cache updates now
    console.warn('[Context] Direct saveContext call detected - use events instead');
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
    
    // Normalize response: create 'response' field from explanation + solution
    const normalizedAnalysis = {
      ...analysis,
      response: [analysis.explanation, analysis.solution].filter(Boolean).join('\n\n'),
      model: analysis.model || 'anthropic'
    };
    
    // WRITE TO DATABASE FIRST (Source of Truth)
    const errorQuery = await ErrorQuery.create({
      id: conversationId,
      userId,
      errorMessage: errorMessage.substring(0, 10000),
      language,
      framework,
      aiResponse: normalizedAnalysis.response,
      aiModel: normalizedAnalysis.model,
      responseTime,
      userSubscriptionTier: effectiveTier,
      isConversation: canFollowUp,
      conversationTurn: 1
    });
    
    // EMIT EVENT FOR ASYNC CACHE UPDATE (Non-blocking)
    // Cache will be updated by cacheSync service listening to this event
    if (canFollowUp) {
      eventEmitter.emitConversationStarted(conversationId, userId, {
        language,
        framework,
        tier: effectiveTier,
        initialMessages: [
          { role: 'user', content: errorMessage },
          { role: 'assistant', content: normalizedAnalysis.response }
        ]
      });
    }
    
    // Generate suggested follow-up questions
    const suggestedQuestions = generateConversationalChips(
      [{ role: 'user', content: errorMessage }],
      normalizedAnalysis.response
    );
    
    res.json({
      success: true,
      conversationId,
      analysis: {
        response: normalizedAnalysis.response,
        model: normalizedAnalysis.model,
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
    if (!context || !context.messages) {
      console.log(`[Chat Follow-up] No context in Redis for: ${conversationId}`);
      console.log(`[Chat Follow-up] Context expires after 30 mins`);
      
      return res.status(404).json({
        success: false,
        error: 'Conversation session expired. Please submit a new query to start fresh.',
        code: 'CONVERSATION_EXPIRED',
        hint: 'Conversation context is stored temporarily. Submit your original query again to continue.'
      });
    }
    
    // Ensure context.messages is an array
    if (!Array.isArray(context.messages)) {
      context.messages = [];
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
    console.log(`[Chat Follow-up] Getting AI response for message: "${message.substring(0, 50)}..."`);
    
    const analysis = await aiService.analyzeWithContext({
      messages: context.messages,
      newMessage: message,
      userId,
      subscriptionTier: effectiveTier
    });
    const responseTime = Date.now() - startTime;
    
    console.log(`[Chat Follow-up] Analysis received:`, {
      hasResponse: !!analysis?.response,
      hasModel: !!analysis?.model,
      analysisKeys: analysis ? Object.keys(analysis) : 'undefined'
    });
    
    // Defensive check: ensure analysis exists and has response
    if (!analysis || !analysis.response) {
      console.error('[Chat Follow-up] Invalid analysis response:', analysis);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate follow-up response',
        code: 'ANALYSIS_FAILED'
      });
    }
    
    // Add assistant response to context
    context.messages.push({ role: 'assistant', content: analysis.response });
    
    const metadata = context.metadata || {
      language: context.language,
      framework: context.framework,
      tier: effectiveTier,
      userId
    };
    
    // WRITE TO DATABASE FIRST (Source of Truth)
    // Calculate new follow-up count before saving
    const newFollowUpCount = followUpCount + 1;
    
    // Save follow-up to database (use explanation + solution fields since ErrorQuery doesn't have aiResponse)
    const followUp = await ErrorQuery.create({
      userId,
      rawError: message.substring(0, 10000), // Required field - use the follow-up message
      errorMessage: message.substring(0, 10000),
      explanation: analysis.response,
      solution: '', // Follow-ups combine into explanation
      errorCategory: 'follow-up',
      aiProvider: analysis.model || 'anthropic',
      responseTime,
      userSubscriptionTier: effectiveTier,
      tags: ['follow-up', conversationId] // Store conversationId in tags for reference
    });
    
    // EMIT EVENT FOR ASYNC CACHE UPDATE (Non-blocking)
    // Cache will be updated by cacheSync service listening to this event
    eventEmitter.emitFollowUpSent(conversationId, userId, newFollowUpCount, {
      language: metadata.language,
      framework: metadata.framework,
      tier: effectiveTier,
      messageCount: context.messages.length
    });
    
    // Generate DYNAMIC contextual follow-up chips based on conversation
    const remainingFollowUps = maxFollowUps === -1 ? 999 : maxFollowUps - newFollowUpCount;
    const suggestedChips = remainingFollowUps > 0 
      ? conversationalAI.generateDynamicChips(
          context.messages,
          analysis.response,
          context.metadata || {},
          effectiveTier
        )
      : [
          {
            text: "✅ That fixed it, thanks!",
            type: "close_conversation",
            message: "Thank you, that solved my problem!"
          }
        ];
    
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
    console.error('[Chat Follow-up] Error occurred:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
      conversationId: req.body?.conversationId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to process follow-up',
      details: error.message
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
    
    // Try to get fresh context from Redis first (if still in memory)
    let redisContext = await getContext(conversationId);
    
    if (redisContext && redisContext.messages && redisContext.messages.length > 0) {
      // Return from Redis cache - this is the most current data
      return res.json({
        success: true,
        conversationId,
        source: 'redis-cache',
        messageCount: redisContext.messages.length,
        messages: redisContext.messages.map((msg, idx) => ({
          role: msg.role,
          content: msg.content,
          turn: idx + 1,
          timestamp: msg.timestamp || new Date()
        }))
      });
    }
    
    // Fallback to database if Redis cache expired
    const originalMessage = await ErrorQuery.findOne({
      where: {
        id: conversationId,
        userId
      },
      attributes: ['id', 'errorMessage', 'aiResponse', 'explanation', 'solution', 'aiProvider', 'aiModel', 'createdAt', 'feedback']
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
        role: 'user',
        content: originalMessage.errorMessage,
        turn: 1,
        timestamp: originalMessage.createdAt
      },
      {
        id: `${originalMessage.id}-response`,
        role: 'assistant',
        content: originalMessage.aiResponse || [originalMessage.explanation, originalMessage.solution].filter(Boolean).join('\n\n'),
        model: originalMessage.aiProvider || originalMessage.aiModel,
        feedback: originalMessage.feedback,
        timestamp: originalMessage.createdAt
      },
      ...followUps.map((msg, idx) => ({
        id: msg.id,
        role: 'user',
        content: msg.errorMessage,
        turn: idx + 2,
        timestamp: msg.createdAt
      })),
      ...followUps.map((msg, idx) => ({
        id: `${msg.id}-response`,
        role: 'assistant',
        content: msg.explanation,
        model: msg.aiProvider,
        feedback: msg.feedback,
        turn: idx + 2,
        timestamp: msg.createdAt
      }))
    ];
    
    res.json({
      success: true,
      conversationId,
      source: 'database',
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
    const saved = await redisService.set(`${CONTEXT_PREFIX}${conversationId}`, context, CONTEXT_TTL);
    if (saved) {
      console.log(`[Context] Saved conversation context to Redis for: ${conversationId}`);
    } else {
      console.warn(`[Context] Redis not connected, context NOT saved for: ${conversationId}`);
    }
    return saved;
  } catch (error) {
    console.error(`[Context] Failed to save context to Redis:`, error.message);
    return false;
  }
};
