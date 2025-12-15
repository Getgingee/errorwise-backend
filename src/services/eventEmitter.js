/**
 * Event Emitter Service
 * 
 * Centralized event system for cache synchronization and async operations.
 * This prevents dual-write problems by using events to propagate updates.
 * 
 * Pattern: Database as source of truth, events trigger cache updates
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

class ChatEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
    this.setupListeners();
  }

  /**
   * Setup all event listeners
   */
  setupListeners() {
    // Conversation started event
    this.on('conversation:started', async (data) => {
      try {
        console.log(`[Event] Conversation started: ${data.conversationId}`);
        // Cache will be updated by subscriber
      } catch (error) {
        logger.error('[Event] conversation:started error:', error);
      }
    });

    // Follow-up message sent event
    this.on('followup:sent', async (data) => {
      try {
        console.log(`[Event] Follow-up sent for: ${data.conversationId}`);
        // Cache will be updated by subscriber
      } catch (error) {
        logger.error('[Event] followup:sent error:', error);
      }
    });

    // Conversation ended event
    this.on('conversation:ended', async (data) => {
      try {
        console.log(`[Event] Conversation ended: ${data.conversationId}`);
        // Cache cleanup will be handled by subscriber
      } catch (error) {
        logger.error('[Event] conversation:ended error:', error);
      }
    });

    // Cache invalidation event
    this.on('cache:invalidate', async (data) => {
      try {
        console.log(`[Event] Cache invalidation: ${data.key}`);
        // Subscribers will handle cache deletion
      } catch (error) {
        logger.error('[Event] cache:invalidate error:', error);
      }
    });
  }

  /**
   * Emit conversation started event
   * This should be called AFTER successful database write
   */
  emitConversationStarted(conversationId, userId, metadata) {
    this.emit('conversation:started', {
      conversationId,
      userId,
      metadata,
      timestamp: new Date()
    });
  }

  /**
   * Emit follow-up message sent event
   * This should be called AFTER successful database write
   */
  emitFollowUpSent(conversationId, userId, messageCount, metadata) {
    this.emit('followup:sent', {
      conversationId,
      userId,
      messageCount,
      metadata,
      timestamp: new Date()
    });
  }

  /**
   * Emit conversation ended event
   */
  emitConversationEnded(conversationId, userId) {
    this.emit('conversation:ended', {
      conversationId,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * Emit cache invalidation event
   */
  emitCacheInvalidate(key) {
    this.emit('cache:invalidate', {
      key,
      timestamp: new Date()
    });
  }
}

// Export singleton instance
module.exports = new ChatEventEmitter();
