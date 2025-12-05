/**
 * Session Cleanup Job
 * Cleans up stale sessions and orphaned Redis keys
 * Runs every hour to prevent memory bloat
 */

const cron = require('node-cron');
const { redis, redisClient } = require('../utils/redisClient');
const logger = require('../utils/logger');

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';
const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours of inactivity

async function cleanupStaleSessions() {
  const startTime = Date.now();
  let cleaned = 0;
  let errors = 0;

  try {
    logger.info('Starting session cleanup job...');

    // Get all session keys
    const sessionKeys = await redis.keys(`${SESSION_PREFIX}*`);
    
    for (const key of sessionKeys) {
      try {
        const session = await redis.get(key);
        
        if (!session) {
          // Empty session - delete
          await redis.del([key]);
          cleaned++;
          continue;
        }

        // Check last activity
        const lastActivity = session.lastActivity || session.createdAt;
        if (!lastActivity) {
          // No activity timestamp - delete
          await redis.del([key]);
          cleaned++;
          continue;
        }

        const inactiveTime = Date.now() - lastActivity;
        if (inactiveTime > STALE_THRESHOLD) {
          // Stale session - delete
          await redis.del([key]);
          cleaned++;
          
          // Also remove from user sessions index
          if (session.userId) {
            const token = key.replace(SESSION_PREFIX, '');
            await redis.hDel(`${USER_SESSIONS_PREFIX}${session.userId}`, token);
          }
        }
      } catch (err) {
        errors++;
        logger.error(`Error processing session ${key}:`, err);
      }
    }

    // Cleanup orphaned user session indexes
    const userSessionKeys = await redis.keys(`${USER_SESSIONS_PREFIX}*`);
    for (const key of userSessionKeys) {
      try {
        const sessions = await redisClient.hGetAll(key);
        if (!sessions || Object.keys(sessions).length === 0) {
          await redis.del([key]);
          cleaned++;
        }
      } catch (err) {
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Session cleanup complete: ${cleaned} sessions cleaned, ${errors} errors, ${duration}ms`);
    console.log(` Session cleanup: ${cleaned} stale sessions removed (${duration}ms)`);

    return { cleaned, errors, duration };
  } catch (error) {
    logger.error('Session cleanup job failed:', error);
    console.error(' Session cleanup failed:', error.message);
    return { cleaned, errors: errors + 1, duration: Date.now() - startTime };
  }
}

// Run cleanup every hour
function startSessionCleanupJob() {
  // Run immediately on startup (after 1 minute delay)
  setTimeout(() => {
    cleanupStaleSessions().catch(err => {
      logger.error('Initial session cleanup failed:', err);
    });
  }, 60 * 1000);

  // Schedule hourly cleanup
  cron.schedule('0 * * * *', async () => {
    await cleanupStaleSessions();
  });

  console.log(' Session cleanup job scheduled (hourly)');
}

module.exports = {
  cleanupStaleSessions,
  startSessionCleanupJob
};
