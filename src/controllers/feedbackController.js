/**
 * Feedback Controller (F2)
 * 
 * "Did this help?" → Yes / No / Partially
 * With optional reason text field.
 * Track "Yes rate" as quality signal.
 * 
 * Bonus: Offer sharing bonus (+10 free queries) for "Yes" answers
 * 
 * @ticket F2 – Simple Success Feedback
 * @epic EPIC F — Early Retention Hooks
 */

const User = require('../models/User');
const Event = require('../models/Event');
const ErrorQuery = require('../models/ErrorQuery');
const eventTracking = require('../services/eventTrackingService');
const { Op } = require('sequelize');

// Event constants for F2
const FEEDBACK_EVENTS = {
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  FEEDBACK_YES: 'feedback_yes',
  FEEDBACK_NO: 'feedback_no',
  FEEDBACK_PARTIAL: 'feedback_partial',
  SHARE_BONUS_EARNED: 'share_bonus_earned',
  SHARE_COMPLETED: 'share_completed'
};

// Feedback types
const FEEDBACK_TYPES = {
  YES: 'yes',
  NO: 'no',
  PARTIAL: 'partial'
};

// Sharing bonus configuration
const SHARE_BONUS = {
  QUERIES: 10, // Bonus queries for sharing
  ENABLED: true
};

/**
 * Submit feedback for a query result
 * POST /api/feedback
 * Body: { queryId, feedback: 'yes'|'no'|'partial', reason?, wouldShare? }
 */
async function submitFeedback(req, res) {
  try {
    const userId = req.user.id;
    const { queryId, feedback, reason, wouldShare } = req.body;
    
    // Validate feedback type
    if (!feedback || !Object.values(FEEDBACK_TYPES).includes(feedback)) {
      return res.status(400).json({ 
        error: 'Invalid feedback. Must be yes, no, or partial.' 
      });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // =========================================================================
    // SAVE FEEDBACK TO ERRORQUERY MODEL (for quality tracking & improvements)
    // =========================================================================
    if (queryId) {
      try {
        // Map feedback types to ErrorQuery enum values
        const feedbackValueMap = {
          [FEEDBACK_TYPES.YES]: 'up',
          [FEEDBACK_TYPES.NO]: 'down',
          [FEEDBACK_TYPES.PARTIAL]: 'down' // Partial counts as needs improvement
        };
        
        const errorQuery = await ErrorQuery.findByPk(queryId);
        if (errorQuery && errorQuery.userId === userId) {
          await errorQuery.update({
            feedback: feedbackValueMap[feedback],
            feedbackComment: reason ? reason.substring(0, 500) : null,
            feedbackAt: new Date()
          });
          console.log(`[Feedback] Saved to ErrorQuery ${queryId}: ${feedback}`);
        }
      } catch (dbError) {
        // Don't fail the request if DB update fails, just log it
        console.error('[Feedback] Failed to update ErrorQuery:', dbError.message);
      }
    }
    
    // Map feedback to event name
    const feedbackEventMap = {
      [FEEDBACK_TYPES.YES]: FEEDBACK_EVENTS.FEEDBACK_YES,
      [FEEDBACK_TYPES.NO]: FEEDBACK_EVENTS.FEEDBACK_NO,
      [FEEDBACK_TYPES.PARTIAL]: FEEDBACK_EVENTS.FEEDBACK_PARTIAL
    };
    
    // Track the specific feedback event
    await eventTracking.trackEvent({
      eventName: feedbackEventMap[feedback],
      userId,
      subscriptionTier: user.subscriptionTier,
      properties: {
        queryId: queryId || null,
        feedback,
        reason: reason ? reason.substring(0, 500) : null, // Limit reason length
        wouldShare: wouldShare || false
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.headers['x-session-id']
    });
    
    // Also track as generic thumbs up/down for existing funnel
    if (feedback === FEEDBACK_TYPES.YES) {
      await eventTracking.trackFeedback(userId, true, { queryId });
    } else if (feedback === FEEDBACK_TYPES.NO) {
      await eventTracking.trackFeedback(userId, false, { queryId });
    }
    
    // Handle sharing bonus offer for "Yes" feedback
    let bonusOffered = false;
    let bonusMessage = null;
    
    if (feedback === FEEDBACK_TYPES.YES && SHARE_BONUS.ENABLED) {
      bonusOffered = true;
      bonusMessage = `🎉 Glad it helped! Share your success and get +${SHARE_BONUS.QUERIES} free queries!`;
    }
    
    // Response messages
    const responseMessages = {
      [FEEDBACK_TYPES.YES]: 'Great! Glad we could help! 🎉',
      [FEEDBACK_TYPES.NO]: 'Sorry to hear that. We\'ll improve! Your feedback helps us.',
      [FEEDBACK_TYPES.PARTIAL]: 'Thanks for the feedback! We\'ll use it to improve.'
    };
    
    res.json({
      success: true,
      message: responseMessages[feedback],
      bonusOffered,
      bonusMessage,
      bonusQueries: bonusOffered ? SHARE_BONUS.QUERIES : 0,
      savedToQuery: !!queryId
    });
    
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
}

/**
 * Claim sharing bonus
 * POST /api/feedback/claim-bonus
 * Body: { queryId, shareMethod: 'twitter'|'linkedin'|'copy' }
 */
async function claimShareBonus(req, res) {
  try {
    const userId = req.user.id;
    const { queryId, shareMethod } = req.body;
    
    if (!shareMethod) {
      return res.status(400).json({ error: 'Share method required' });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user already claimed bonus for this query
    const existingBonus = await Event.findOne({
      where: {
        user_id: userId,
        event_name: FEEDBACK_EVENTS.SHARE_BONUS_EARNED,
        [Op.and]: [
          Event.sequelize.where(
            Event.sequelize.literal("properties->>'queryId'"),
            queryId
          )
        ]
      }
    });
    
    if (existingBonus) {
      return res.status(400).json({ 
        error: 'Bonus already claimed for this query',
        alreadyClaimed: true
      });
    }
    
    // Check daily limit (max 3 share bonuses per day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayBonuses = await Event.count({
      where: {
        user_id: userId,
        event_name: FEEDBACK_EVENTS.SHARE_BONUS_EARNED,
        timestamp: { [Op.gte]: today }
      }
    });
    
    if (todayBonuses >= 3) {
      return res.status(400).json({ 
        error: 'Daily share bonus limit reached (3 per day)',
        dailyLimitReached: true
      });
    }
    
    // Award bonus queries
    // For free tier: add to trial queries
    // For paid tier: just track the share
    if (user.subscriptionTier === 'free') {
      const currentLimit = 50; // Free tier limit
      const newUsed = Math.max(0, (user.queriesUsedThisPeriod || 0) - SHARE_BONUS.QUERIES);
      
      await user.update({
        queriesUsedThisPeriod: newUsed
      });
    }
    
    // Track bonus earned
    await eventTracking.trackEvent({
      eventName: FEEDBACK_EVENTS.SHARE_BONUS_EARNED,
      userId,
      properties: {
        queryId,
        shareMethod,
        bonusQueries: SHARE_BONUS.QUERIES
      }
    });
    
    // Track share completed
    await eventTracking.trackEvent({
      eventName: FEEDBACK_EVENTS.SHARE_COMPLETED,
      userId,
      properties: {
        shareMethod
      }
    });
    
    res.json({
      success: true,
      message: `🎉 You earned +${SHARE_BONUS.QUERIES} free queries!`,
      bonusQueries: SHARE_BONUS.QUERIES,
      newQueriesUsed: user.queriesUsedThisPeriod
    });
    
  } catch (error) {
    console.error('Error claiming share bonus:', error);
    res.status(500).json({ error: 'Failed to claim bonus' });
  }
}

/**
 * Get share content for social media
 * GET /api/feedback/share-content
 */
async function getShareContent(req, res) {
  try {
    const { queryId, errorType } = req.query;
    
    // Generate share content
    const shareContent = {
      twitter: {
        text: `Just solved a ${errorType || 'tricky'} error in seconds with @ErrorWise! 🐛✨\n\nStop wasting hours debugging - let AI help you.\n\n#Programming #DevTools #AI`,
        url: 'https://errorwise.tech?ref=twitter'
      },
      linkedin: {
        text: `I've been using ErrorWise to debug errors faster. It's like having a senior developer on call 24/7!\n\nHighly recommend for any developer looking to save time on debugging. 🚀`,
        url: 'https://errorwise.tech?ref=linkedin'
      },
      copy: {
        text: `Check out ErrorWise - it helped me solve coding errors in seconds! https://errorwise.tech?ref=share`
      }
    };
    
    res.json({
      success: true,
      shareContent
    });
    
  } catch (error) {
    console.error('Error getting share content:', error);
    res.status(500).json({ error: 'Failed to get share content' });
  }
}

/**
 * Get feedback statistics (Yes rate as quality signal)
 * GET /api/feedback/stats
 */
async function getFeedbackStats(req, res) {
  try {
    // Admin only for full stats
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    
    const period = req.query.period || 'week';
    const thresholds = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };
    
    const since = new Date(Date.now() - (thresholds[period] || thresholds.week));
    
    // Get feedback counts
    const [yesCount, noCount, partialCount] = await Promise.all([
      Event.count({
        where: {
          event_name: FEEDBACK_EVENTS.FEEDBACK_YES,
          timestamp: { [Op.gte]: since }
        }
      }),
      Event.count({
        where: {
          event_name: FEEDBACK_EVENTS.FEEDBACK_NO,
          timestamp: { [Op.gte]: since }
        }
      }),
      Event.count({
        where: {
          event_name: FEEDBACK_EVENTS.FEEDBACK_PARTIAL,
          timestamp: { [Op.gte]: since }
        }
      })
    ]);
    
    const totalFeedback = yesCount + noCount + partialCount;
    const positiveCount = yesCount + (partialCount * 0.5); // Partial counts as half
    
    const yesRate = totalFeedback > 0 
      ? ((yesCount / totalFeedback) * 100).toFixed(1) 
      : 0;
    
    const satisfactionRate = totalFeedback > 0 
      ? ((positiveCount / totalFeedback) * 100).toFixed(1) 
      : 0;
    
    const response = {
      success: true,
      period,
      metrics: {
        totalFeedback,
        yesRate: yesRate + '%',
        satisfactionRate: satisfactionRate + '%',
        breakdown: {
          yes: yesCount,
          no: noCount,
          partial: partialCount
        }
      }
    };
    
    // Add detailed stats for admins
    if (isAdmin) {
      // Get share stats
      const [sharesCompleted, bonusesEarned] = await Promise.all([
        Event.count({
          where: {
            event_name: FEEDBACK_EVENTS.SHARE_COMPLETED,
            timestamp: { [Op.gte]: since }
          }
        }),
        Event.count({
          where: {
            event_name: FEEDBACK_EVENTS.SHARE_BONUS_EARNED,
            timestamp: { [Op.gte]: since }
          }
        })
      ]);
      
      // Get recent feedback reasons
      const recentNegative = await Event.findAll({
        where: {
          event_name: { [Op.in]: [FEEDBACK_EVENTS.FEEDBACK_NO, FEEDBACK_EVENTS.FEEDBACK_PARTIAL] },
          timestamp: { [Op.gte]: since }
        },
        attributes: ['properties', 'timestamp'],
        order: [['timestamp', 'DESC']],
        limit: 10,
        raw: true
      });
      
      response.adminMetrics = {
        sharesCompleted,
        bonusesEarned,
        bonusQueriesAwarded: bonusesEarned * SHARE_BONUS.QUERIES,
        recentNegativeFeedback: recentNegative.map(e => ({
          reason: e.properties?.reason || 'No reason provided',
          feedback: e.properties?.feedback,
          timestamp: e.timestamp
        }))
      };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Error getting feedback stats:', error);
    res.status(500).json({ error: 'Failed to get feedback stats' });
  }
}

/**
 * Get user's feedback history
 * GET /api/feedback/history
 */
async function getUserFeedbackHistory(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    
    const feedbackHistory = await Event.findAll({
      where: {
        user_id: userId,
        event_name: { 
          [Op.in]: [
            FEEDBACK_EVENTS.FEEDBACK_YES, 
            FEEDBACK_EVENTS.FEEDBACK_NO, 
            FEEDBACK_EVENTS.FEEDBACK_PARTIAL
          ] 
        }
      },
      order: [['timestamp', 'DESC']],
      limit,
      attributes: ['event_name', 'properties', 'timestamp'],
      raw: true
    });
    
    // Get bonus history
    const bonusHistory = await Event.findAll({
      where: {
        user_id: userId,
        event_name: FEEDBACK_EVENTS.SHARE_BONUS_EARNED
      },
      order: [['timestamp', 'DESC']],
      limit: 10,
      attributes: ['properties', 'timestamp'],
      raw: true
    });
    
    res.json({
      success: true,
      feedbackHistory: feedbackHistory.map(f => ({
        type: f.event_name.replace('feedback_', ''),
        queryId: f.properties?.queryId,
        reason: f.properties?.reason,
        timestamp: f.timestamp
      })),
      bonusHistory: bonusHistory.map(b => ({
        queries: b.properties?.bonusQueries,
        shareMethod: b.properties?.shareMethod,
        timestamp: b.timestamp
      })),
      totalBonusEarned: bonusHistory.length * SHARE_BONUS.QUERIES
    });
    
  } catch (error) {
    console.error('Error getting feedback history:', error);
    res.status(500).json({ error: 'Failed to get feedback history' });
  }
}

module.exports = {
  submitFeedback,
  claimShareBonus,
  getShareContent,
  getFeedbackStats,
  getUserFeedbackHistory,
  FEEDBACK_EVENTS,
  FEEDBACK_TYPES,
  SHARE_BONUS
};
