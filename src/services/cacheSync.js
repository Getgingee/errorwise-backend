/**
 * Cache Synchronization Service
 * 
 * Listens to chat events and updates cache accordingly.
 * Ensures cache is always in sync with database.
 * 
 * This solves the dual-write problem by:
 * 1. Database is the SINGLE SOURCE OF TRUTH
 * 2. Events trigger cache updates AFTER DB commits
 * 3. Cache failures don't block DB operations
 * 4. Cache invalidation is event-driven
 */

const redisService = require('./redisService');
const eventEmitter = require('./eventEmitter');
const logger = require('../utils/logger');

const CONTEXT_PREFIX = 'conv_ctx:';
const CONTEXT_TTL = 30 * 60; // 30 minutes
const FOLLOWUP_COUNT_PREFIX = 'conv_followups:';

/**
 * Initialize cache sync listeners
 * Call this once during app startup
 */
function initializeCacheSync() {
  console.log('[CacheSync] Initializing event listeners...');

  /**
   * Listen: Conversation Started Event
   * Action: Initialize Redis context cache
   */
  eventEmitter.on('conversation:started', async (data) => {
    try {
      const { conversationId, metadata } = data;
      console.log(`[CacheSync] Setting initial context for: ${conversationId}`);

      const context = {
        messages: [
          // Messages will be loaded from DB on next read if needed
        ],
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString()
        },
        lastUpdated: Date.now()
      };

      // Non-blocking cache write - don't wait or fail
      redisService.set(`${CONTEXT_PREFIX}${conversationId}`, context, CONTEXT_TTL)
        .catch(error => {
          logger.warn(`[CacheSync] Failed to cache conversation ${conversationId}:`, error.message);
          // Don't fail the operation - DB already has the data
        });

      // Initialize follow-up counter at 0
      redisService.set(`${FOLLOWUP_COUNT_PREFIX}${conversationId}`, 0, CONTEXT_TTL)
        .catch(error => {
          logger.warn(`[CacheSync] Failed to set follow-up counter:`, error.message);
        });

    } catch (error) {
      logger.error('[CacheSync] Error handling conversation:started:', error);
    }
  });

  /**
   * Listen: Follow-up Message Sent Event
   * Action: Update Redis context with new message
   */
  eventEmitter.on('followup:sent', async (data) => {
    try {
      const { conversationId, messageCount, metadata } = data;
      console.log(`[CacheSync] Updating context for follow-up: ${conversationId}`);

      // Update follow-up counter
      await redisService.set(
        `${FOLLOWUP_COUNT_PREFIX}${conversationId}`,
        messageCount,
        CONTEXT_TTL
      ).catch(error => {
        logger.warn(`[CacheSync] Failed to update follow-up count:`, error.message);
      });

      // Update context metadata
      const contextKey = `${CONTEXT_PREFIX}${conversationId}`;
      const existingContext = await redisService.get(contextKey);

      if (existingContext) {
        existingContext.messageCount = messageCount;
        existingContext.lastUpdated = Date.now();
        
        await redisService.set(contextKey, existingContext, CONTEXT_TTL)
          .catch(error => {
            logger.warn(`[CacheSync] Failed to update conversation context:`, error.message);
          });
      }

    } catch (error) {
      logger.error('[CacheSync] Error handling followup:sent:', error);
    }
  });

  /**
   * Listen: Conversation Ended Event
   * Action: Clean up conversation cache
   */
  eventEmitter.on('conversation:ended', async (data) => {
    try {
      const { conversationId } = data;
      console.log(`[CacheSync] Cleaning up cache for ended conversation: ${conversationId}`);

      // Delete context
      await redisService.del(`${CONTEXT_PREFIX}${conversationId}`)
        .catch(error => {
          logger.warn(`[CacheSync] Failed to delete context:`, error.message);
        });

      // Delete follow-up counter
      await redisService.del(`${FOLLOWUP_COUNT_PREFIX}${conversationId}`)
        .catch(error => {
          logger.warn(`[CacheSync] Failed to delete follow-up counter:`, error.message);
        });

    } catch (error) {
      logger.error('[CacheSync] Error handling conversation:ended:', error);
    }
  });

  /**
   * Listen: Cache Invalidation Event
   * Action: Delete specific cache key
   */
  eventEmitter.on('cache:invalidate', async (data) => {
    try {
      const { key } = data;
      console.log(`[CacheSync] Invalidating cache key: ${key}`);

      await redisService.del(key)
        .catch(error => {
          logger.warn(`[CacheSync] Failed to invalidate cache:`, error.message);
        });

    } catch (error) {
      logger.error('[CacheSync] Error handling cache:invalidate:', error);
    }
  });

  console.log('[CacheSync] Event listeners initialized ✓');
}

/**
 * Get conversation context from Redis (read-optimized)
 * Falls back to null if cache miss (controller will fetch from DB)
 */
async function getContextFromCache(conversationId) {
  try {
    const key = `${CONTEXT_PREFIX}${conversationId}`;
    const context = await redisService.get(key);
    return context;
  } catch (error) {
    logger.warn(`[CacheSync] Error reading context from cache:`, error.message);
    return null; // Allow fallback to DB
  }
}

/**
 * Get follow-up count from cache
 */
async function getFollowUpCountFromCache(conversationId) {
  try {
    const count = await redisService.get(`${FOLLOWUP_COUNT_PREFIX}${conversationId}`);
    return count || 0;
  } catch (error) {
    logger.warn(`[CacheSync] Error reading follow-up count:`, error.message);
    return 0; // Allow operation to continue
  }
}

module.exports = {
  initializeCacheSync,
  getContextFromCache,
  getFollowUpCountFromCache,
  eventEmitter
};
