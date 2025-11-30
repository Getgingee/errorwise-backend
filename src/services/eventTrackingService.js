/**
 * Event Tracking Service (D1)
 * 
 * Provides centralized event tracking for analytics and metrics.
 * All user actions should be tracked through this service.
 * 
 * @ticket D1 – Implement basic event tracking
 * @epic EPIC D — Analytics & Success Metrics (Month-1 Evaluation)
 */

const crypto = require('crypto');
const Event = require('../models/Event');
const { Op } = require('sequelize');

// Event name constants (re-exported for convenience)
const EVENTS = Event.EVENTS;

/**
 * Hash IP address for privacy
 */
function hashIP(ip) {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || 'errorwise-event-salt';
  return crypto.createHash('sha256').update(ip + salt).digest('hex').substring(0, 32);
}

/**
 * Truncate user agent
 */
function truncateUserAgent(ua) {
  if (!ua) return null;
  return ua.substring(0, 255);
}

/**
 * Track an event
 * 
 * @param {Object} params - Event parameters
 * @param {string} params.eventName - Event name (use EVENTS constants)
 * @param {string} [params.userId] - User ID (null for anonymous)
 * @param {string} [params.anonymousId] - Anonymous session ID
 * @param {string} [params.subscriptionTier] - User's subscription tier
 * @param {Object} [params.properties] - Event-specific properties
 * @param {string} [params.sessionId] - Session ID
 * @param {string} [params.ipAddress] - Client IP address
 * @param {string} [params.userAgent] - Client user agent
 * @param {string} [params.page] - Page where event occurred
 * @returns {Promise<Object>} Created event
 */
async function trackEvent({
  eventName,
  userId = null,
  anonymousId = null,
  subscriptionTier = 'free',
  properties = {},
  sessionId = null,
  ipAddress = null,
  userAgent = null,
  page = null
}) {
  try {
    const event = await Event.create({
      event_name: eventName,
      user_id: userId,
      anonymous_id: anonymousId,
      subscription_tier: subscriptionTier,
      properties,
      session_id: sessionId,
      ip_hash: hashIP(ipAddress),
      user_agent: truncateUserAgent(userAgent),
      page,
      timestamp: new Date()
    });
    
    // Log for debugging in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📊 Event tracked: ${eventName}`, {
        userId: userId?.substring(0, 8) || 'anon',
        tier: subscriptionTier,
        props: Object.keys(properties)
      });
    }
    
    return event;
  } catch (error) {
    // Don't let event tracking break the main flow
    console.error('❌ Failed to track event:', error.message);
    return null;
  }
}

// ============================================================================
// CONVENIENCE METHODS FOR COMMON EVENTS
// ============================================================================

/**
 * Track user signup
 */
async function trackSignup(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.SIGNUP_CREATED,
    userId,
    subscriptionTier: 'free',
    properties: {
      ...properties,
      signupMethod: properties.signupMethod || 'email'
    },
    ...context
  });
}

/**
 * Track query submitted
 */
async function trackQuerySubmitted(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.QUERY_SUBMITTED,
    userId,
    properties: {
      ...properties,
      queryLength: properties.queryLength || 0
    },
    ...context
  });
}

/**
 * Track query success
 */
async function trackQuerySuccess(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.QUERY_SUCCESS,
    userId,
    properties: {
      ...properties,
      confidence: properties.confidence,
      latencyMs: properties.latencyMs,
      cached: properties.cached || false
    },
    ...context
  });
}

/**
 * Track query failure
 */
async function trackQueryFailed(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.QUERY_FAILED,
    userId,
    properties: {
      ...properties,
      errorType: properties.errorType,
      errorMessage: properties.errorMessage?.substring(0, 200)
    },
    ...context
  });
}

/**
 * Track thumbs up/down feedback
 */
async function trackFeedback(userId, isPositive, properties = {}, context = {}) {
  return trackEvent({
    eventName: isPositive ? EVENTS.THUMBS_UP : EVENTS.THUMBS_DOWN,
    userId,
    properties: {
      ...properties,
      queryId: properties.queryId
    },
    ...context
  });
}

/**
 * Track 80% limit reached (C3)
 */
async function trackLimit80Percent(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.LIMIT_80PCT_REACHED,
    userId,
    properties: {
      ...properties,
      currentUsage: properties.currentUsage,
      limit: properties.limit,
      percentUsed: properties.percentUsed || 80
    },
    ...context
  });
}

/**
 * Track limit reached (C3)
 */
async function trackLimitReached(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.LIMIT_REACHED,
    userId,
    properties: {
      ...properties,
      currentUsage: properties.currentUsage,
      limit: properties.limit
    },
    ...context
  });
}

/**
 * Track upgrade clicked (C4)
 */
async function trackUpgradeClicked(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.UPGRADE_CLICKED,
    userId,
    properties: {
      ...properties,
      source: properties.source, // 'header', 'limit_banner', 'pricing_page'
      currentTier: properties.currentTier,
      targetTier: properties.targetTier || 'pro'
    },
    ...context
  });
}

/**
 * Track upgrade completed (C4)
 */
async function trackUpgradeCompleted(userId, properties = {}, context = {}) {
  return trackEvent({
    eventName: EVENTS.UPGRADE_COMPLETED,
    userId,
    subscriptionTier: properties.newTier || 'pro',
    properties: {
      ...properties,
      previousTier: properties.previousTier,
      newTier: properties.newTier,
      amount: properties.amount,
      paymentMethod: properties.paymentMethod
    },
    ...context
  });
}

// ============================================================================
// ANALYTICS QUERIES (D2, D3)
// ============================================================================

/**
 * Get event counts by type for a time period
 */
async function getEventCounts(period = 'day', eventNames = null) {
  const thresholds = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };
  
  const since = new Date(Date.now() - (thresholds[period] || thresholds.day));
  
  const where = {
    timestamp: { [Op.gte]: since }
  };
  
  if (eventNames) {
    where.event_name = { [Op.in]: eventNames };
  }
  
  const counts = await Event.findAll({
    where,
    attributes: [
      'event_name',
      [Event.sequelize.fn('COUNT', '*'), 'count']
    ],
    group: ['event_name'],
    raw: true
  });
  
  return counts.reduce((acc, row) => {
    acc[row.event_name] = parseInt(row.count);
    return acc;
  }, {});
}

/**
 * Get unique users who performed an event
 */
async function getUniqueUsers(eventName, period = 'day') {
  const thresholds = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };
  
  const since = new Date(Date.now() - (thresholds[period] || thresholds.day));
  
  const result = await Event.findAll({
    where: {
      event_name: eventName,
      timestamp: { [Op.gte]: since },
      user_id: { [Op.ne]: null }
    },
    attributes: [
      [Event.sequelize.fn('COUNT', Event.sequelize.fn('DISTINCT', Event.sequelize.col('user_id'))), 'count']
    ],
    raw: true
  });
  
  return parseInt(result[0]?.count || 0);
}

/**
 * Get signups in a time period
 */
async function getSignupCount(period = 'week') {
  return getUniqueUsers(EVENTS.SIGNUP_CREATED, period);
}

/**
 * Get active users (users who submitted at least 1 query)
 */
async function getActiveUsers(period = 'week') {
  return getUniqueUsers(EVENTS.QUERY_SUBMITTED, period);
}

/**
 * Get upgrade funnel metrics
 */
async function getUpgradeFunnel(period = 'month') {
  const thresholds = {
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000
  };
  
  const since = new Date(Date.now() - (thresholds[period] || thresholds.month));
  
  const [
    activeUsers,
    limitReachedUsers,
    upgradeClickedUsers,
    upgradeCompletedUsers
  ] = await Promise.all([
    getUniqueUsers(EVENTS.QUERY_SUBMITTED, period),
    getUniqueUsers(EVENTS.LIMIT_REACHED, period),
    getUniqueUsers(EVENTS.UPGRADE_CLICKED, period),
    getUniqueUsers(EVENTS.UPGRADE_COMPLETED, period)
  ]);
  
  return {
    period,
    since: since.toISOString(),
    activeUsers,
    limitReachedUsers,
    upgradeClickedUsers,
    upgradeCompletedUsers,
    conversionRates: {
      limitToClick: limitReachedUsers > 0 
        ? ((upgradeClickedUsers / limitReachedUsers) * 100).toFixed(2) + '%' 
        : '0%',
      clickToComplete: upgradeClickedUsers > 0 
        ? ((upgradeCompletedUsers / upgradeClickedUsers) * 100).toFixed(2) + '%' 
        : '0%',
      overallConversion: activeUsers > 0 
        ? ((upgradeCompletedUsers / activeUsers) * 100).toFixed(2) + '%' 
        : '0%'
    }
  };
}

/**
 * Get daily active users for the last N days
 */
async function getDailyActiveUsers(days = 7) {
  const results = [];
  
  for (let i = 0; i < days; i++) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    
    const count = await Event.count({
      where: {
        event_name: EVENTS.QUERY_SUBMITTED,
        timestamp: { [Op.between]: [dayStart, dayEnd] },
        user_id: { [Op.ne]: null }
      },
      distinct: true,
      col: 'user_id'
    });
    
    results.push({
      date: dayStart.toISOString().split('T')[0],
      activeUsers: count
    });
  }
  
  return results.reverse();
}

/**
 * Calculate Day-7 retention rate
 */
async function getDay7Retention() {
  // Get users who signed up 7-14 days ago
  const signupStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const signupEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Get cohort of users who signed up in that window
  const signupCohort = await Event.findAll({
    where: {
      event_name: EVENTS.SIGNUP_CREATED,
      timestamp: { [Op.between]: [signupStart, signupEnd] },
      user_id: { [Op.ne]: null }
    },
    attributes: ['user_id'],
    group: ['user_id'],
    raw: true
  });
  
  const cohortUserIds = signupCohort.map(e => e.user_id);
  
  if (cohortUserIds.length === 0) {
    return { cohortSize: 0, returnedUsers: 0, retentionRate: '0%' };
  }
  
  // Check how many returned in the last 7 days
  const returnedUsers = await Event.count({
    where: {
      event_name: EVENTS.QUERY_SUBMITTED,
      timestamp: { [Op.gte]: signupEnd },
      user_id: { [Op.in]: cohortUserIds }
    },
    distinct: true,
    col: 'user_id'
  });
  
  return {
    cohortSize: cohortUserIds.length,
    returnedUsers,
    retentionRate: ((returnedUsers / cohortUserIds.length) * 100).toFixed(2) + '%'
  };
}

/**
 * Get comprehensive metrics for D2 dashboard
 */
async function getDashboardMetrics() {
  const [
    eventCounts,
    signupsThisWeek,
    activeUsersThisWeek,
    dailyActiveUsers,
    upgradeFunnel,
    day7Retention
  ] = await Promise.all([
    getEventCounts('week'),
    getSignupCount('week'),
    getActiveUsers('week'),
    getDailyActiveUsers(7),
    getUpgradeFunnel('month'),
    getDay7Retention()
  ]);
  
  // Calculate success rate from events
  const querySubmitted = eventCounts[EVENTS.QUERY_SUBMITTED] || 0;
  const querySuccess = eventCounts[EVENTS.QUERY_SUCCESS] || 0;
  const queryFailed = eventCounts[EVENTS.QUERY_FAILED] || 0;
  
  const successRate = querySubmitted > 0 
    ? ((querySuccess / querySubmitted) * 100).toFixed(2) + '%'
    : '0%';
  
  // Get thumbs up/down ratio
  const thumbsUp = eventCounts[EVENTS.THUMBS_UP] || 0;
  const thumbsDown = eventCounts[EVENTS.THUMBS_DOWN] || 0;
  const totalFeedback = thumbsUp + thumbsDown;
  const satisfactionRate = totalFeedback > 0
    ? ((thumbsUp / totalFeedback) * 100).toFixed(2) + '%'
    : 'N/A';
  
  return {
    period: 'week',
    generatedAt: new Date().toISOString(),
    
    // Key metrics
    signupsThisWeek,
    activeUsersThisWeek,
    totalQueriesThisWeek: querySubmitted,
    
    // Quality metrics
    querySuccessRate: successRate,
    queryFailures: queryFailed,
    satisfactionRate,
    
    // Upgrade metrics
    upgradeClicks: eventCounts[EVENTS.UPGRADE_CLICKED] || 0,
    upgradeCompleted: eventCounts[EVENTS.UPGRADE_COMPLETED] || 0,
    usersHitLimit: eventCounts[EVENTS.LIMIT_REACHED] || 0,
    
    // Retention
    day7Retention,
    
    // Trends
    dailyActiveUsers,
    
    // Full funnel
    upgradeFunnel,
    
    // All event counts
    eventCounts
  };
}

/**
 * Get Month-1 Success Criteria metrics (D3)
 */
async function getMonth1Metrics() {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // MAU - Monthly Active Users
  const mau = await Event.count({
    where: {
      event_name: EVENTS.QUERY_SUBMITTED,
      timestamp: { [Op.gte]: monthAgo },
      user_id: { [Op.ne]: null }
    },
    distinct: true,
    col: 'user_id'
  });
  
  // Total signups this month
  const newSignups = await Event.count({
    where: {
      event_name: EVENTS.SIGNUP_CREATED,
      timestamp: { [Op.gte]: monthAgo }
    }
  });
  
  // Users who hit trial limit
  const usersHitLimit = await Event.count({
    where: {
      event_name: EVENTS.LIMIT_REACHED,
      timestamp: { [Op.gte]: monthAgo },
      user_id: { [Op.ne]: null }
    },
    distinct: true,
    col: 'user_id'
  });
  
  // Upgrade attempts
  const upgradeAttempts = await Event.count({
    where: {
      event_name: EVENTS.UPGRADE_CLICKED,
      timestamp: { [Op.gte]: monthAgo }
    }
  });
  
  // Paying users (completed upgrades)
  const payingUsers = await Event.count({
    where: {
      event_name: EVENTS.UPGRADE_COMPLETED,
      timestamp: { [Op.gte]: monthAgo },
      user_id: { [Op.ne]: null }
    },
    distinct: true,
    col: 'user_id'
  });
  
  // Day-7 retention
  const retention = await getDay7Retention();
  
  // Define thresholds for success evaluation
  const thresholds = {
    mau: { good: 100, ok: 50, current: mau },
    day7Retention: { good: 30, ok: 15, current: parseFloat(retention.retentionRate) },
    usersHitLimit: { good: 20, ok: 10, current: usersHitLimit },
    upgradeAttempts: { good: 10, ok: 5, current: upgradeAttempts },
    payingUsers: { good: 5, ok: 2, current: payingUsers }
  };
  
  // Evaluate each metric
  const evaluateMetric = (metric, value) => {
    if (value >= metric.good) return 'GOOD ✅';
    if (value >= metric.ok) return 'OK 🟡';
    return 'BAD 🔴';
  };
  
  return {
    period: 'month',
    generatedAt: new Date().toISOString(),
    since: monthAgo.toISOString(),
    
    metrics: {
      mau: {
        value: mau,
        evaluation: evaluateMetric(thresholds.mau, mau),
        thresholds: { good: '≥100', ok: '≥50', bad: '<50' }
      },
      newSignups: {
        value: newSignups,
        note: 'Total new signups this month'
      },
      day7Retention: {
        value: retention.retentionRate,
        cohortSize: retention.cohortSize,
        returnedUsers: retention.returnedUsers,
        evaluation: evaluateMetric(thresholds.day7Retention, parseFloat(retention.retentionRate)),
        thresholds: { good: '≥30%', ok: '≥15%', bad: '<15%' }
      },
      usersHitLimit: {
        value: usersHitLimit,
        evaluation: evaluateMetric(thresholds.usersHitLimit, usersHitLimit),
        thresholds: { good: '≥20', ok: '≥10', bad: '<10' },
        note: 'Users who feel the pain → best upgrade candidates'
      },
      upgradeAttempts: {
        value: upgradeAttempts,
        evaluation: evaluateMetric(thresholds.upgradeAttempts, upgradeAttempts),
        thresholds: { good: '≥10', ok: '≥5', bad: '<5' }
      },
      payingUsers: {
        value: payingUsers,
        evaluation: evaluateMetric(thresholds.payingUsers, payingUsers),
        thresholds: { good: '≥5', ok: '≥2', bad: '<2' }
      }
    },
    
    summary: {
      totalScore: Object.values(thresholds).filter(t => 
        evaluateMetric(t, t.current).includes('GOOD')
      ).length,
      maxScore: 5,
      recommendation: payingUsers >= 2 && mau >= 50 
        ? '✅ Continue investing in ErrorWise'
        : '🔄 Needs improvement before scaling'
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Event constants
  EVENTS,
  
  // Core tracking
  trackEvent,
  
  // Convenience methods
  trackSignup,
  trackQuerySubmitted,
  trackQuerySuccess,
  trackQueryFailed,
  trackFeedback,
  trackLimit80Percent,
  trackLimitReached,
  trackUpgradeClicked,
  trackUpgradeCompleted,
  
  // Analytics queries
  getEventCounts,
  getUniqueUsers,
  getSignupCount,
  getActiveUsers,
  getUpgradeFunnel,
  getDailyActiveUsers,
  getDay7Retention,
  
  // Dashboard (D2)
  getDashboardMetrics,
  
  // Month-1 metrics (D3)
  getMonth1Metrics
};
