/**
 * Referral Controller (F3)
 * 
 * Referral program with rewards:
 * - +25 free queries for both referrer and referee
 * - +1 month Pro for paid referral
 * - Dashboard & share link (errorwise.app/refer/USERNAME)
 * 
 * @ticket F3 - Referral Program
 * @epic EPIC F — Early Retention Hooks
 */

const User = require('../models/User');
const Event = require('../models/Event');
const eventTracking = require('../services/eventTrackingService');
const { Op } = require('sequelize');
const crypto = require('crypto');

// Event constants for F3
const REFERRAL_EVENTS = {
  REFERRAL_LINK_CREATED: 'referral_link_created',
  REFERRAL_LINK_CLICKED: 'referral_link_clicked',
  REFERRAL_SIGNUP: 'referral_signup',
  REFERRAL_REWARD_EARNED: 'referral_reward_earned',
  REFERRAL_PRO_REWARD: 'referral_pro_reward'
};

// Referral configuration
const REFERRAL_CONFIG = {
  FREE_QUERIES_BONUS: 25,      // +25 queries for both users
  PRO_MONTHS_BONUS: 1,         // +1 month Pro for paid referral
  MAX_REFERRALS_PER_DAY: 10,   // Anti-abuse limit
  MIN_QUERIES_TO_UNLOCK: 3,    // Referee must use 3 queries before bonus
  REFERRAL_CODE_LENGTH: 8
};

/**
 * Generate unique referral code from username
 */
function generateReferralCode(username, userId) {
  const base = username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hash = crypto.createHash('md5').update(userId).digest('hex').substring(0, 4);
  return `${base.substring(0, 8)}-${hash}`;
}

/**
 * Get or create referral link for user
 * GET /api/referral/link
 */
async function getReferralLink(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate referral code
    const referralCode = generateReferralCode(user.username, userId);
    const referralLink = `https://errorwise.tech/refer/${referralCode}`;
    
    // Track link creation/view
    await eventTracking.trackEvent({
      eventName: REFERRAL_EVENTS.REFERRAL_LINK_CREATED,
      userId,
      properties: { referralCode }
    });
    
    res.json({
      success: true,
      referralCode,
      referralLink,
      rewards: {
        signupBonus: `+${REFERRAL_CONFIG.FREE_QUERIES_BONUS} queries for you and your friend`,
        paidBonus: `+${REFERRAL_CONFIG.PRO_MONTHS_BONUS} month Pro when your friend upgrades`
      },
      shareMessages: {
        twitter: `I've been using @ErrorWise to debug errors faster! Use my link to get ${REFERRAL_CONFIG.FREE_QUERIES_BONUS} free queries: ${referralLink} 🚀`,
        email: `Hey! I've been using ErrorWise to solve coding errors faster with AI. Sign up with my link and we both get ${REFERRAL_CONFIG.FREE_QUERIES_BONUS} free queries: ${referralLink}`,
        generic: `Get ${REFERRAL_CONFIG.FREE_QUERIES_BONUS} free queries on ErrorWise: ${referralLink}`
      }
    });
    
  } catch (error) {
    console.error('Error getting referral link:', error);
    res.status(500).json({ error: 'Failed to get referral link' });
  }
}

/**
 * Track referral link click
 * POST /api/referral/click
 * Body: { referralCode }
 */
async function trackReferralClick(req, res) {
  try {
    const { referralCode } = req.body;
    
    if (!referralCode) {
      return res.status(400).json({ error: 'Referral code required' });
    }
    
    // Find referrer by code
    const users = await User.findAll();
    let referrer = null;
    
    for (const user of users) {
      if (generateReferralCode(user.username, user.id) === referralCode) {
        referrer = user;
        break;
      }
    }
    
    if (!referrer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }
    
    // Track click
    await eventTracking.trackEvent({
      eventName: REFERRAL_EVENTS.REFERRAL_LINK_CLICKED,
      userId: referrer.id,
      properties: {
        referralCode,
        referrerId: referrer.id
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'Referral tracked',
      referrerName: referrer.username.substring(0, 3) + '***'
    });
    
  } catch (error) {
    console.error('Error tracking referral click:', error);
    res.status(500).json({ error: 'Failed to track referral' });
  }
}

/**
 * Process referral signup (called after new user registration)
 * POST /api/referral/signup
 * Body: { referralCode, newUserId }
 */
async function processReferralSignup(referralCode, newUserId) {
  try {
    if (!referralCode || !newUserId) {
      return { success: false, error: 'Missing parameters' };
    }
    
    // Find referrer
    const users = await User.findAll();
    let referrer = null;
    
    for (const user of users) {
      if (generateReferralCode(user.username, user.id) === referralCode) {
        referrer = user;
        break;
      }
    }
    
    if (!referrer) {
      return { success: false, error: 'Invalid referral code' };
    }
    
    // Check if new user exists
    const newUser = await User.findByPk(newUserId);
    if (!newUser) {
      return { success: false, error: 'New user not found' };
    }
    
    // Prevent self-referral
    if (referrer.id === newUserId) {
      return { success: false, error: 'Cannot refer yourself' };
    }
    
    // Check referral abuse (daily limit)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayReferrals = await Event.count({
      where: {
        user_id: referrer.id,
        event_name: REFERRAL_EVENTS.REFERRAL_SIGNUP,
        timestamp: { [Op.gte]: today }
      }
    });
    
    if (todayReferrals >= REFERRAL_CONFIG.MAX_REFERRALS_PER_DAY) {
      return { success: false, error: 'Daily referral limit reached' };
    }
    
    // Track referral signup
    await eventTracking.trackEvent({
      eventName: REFERRAL_EVENTS.REFERRAL_SIGNUP,
      userId: referrer.id,
      properties: {
        referralCode,
        refereeId: newUserId,
        refereeEmail: newUser.email?.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Masked email
      }
    });
    
    // Award bonus to new user immediately
    // (Referrer bonus awarded when referee completes MIN_QUERIES_TO_UNLOCK queries)
    const newUserCurrentUsed = newUser.queriesUsedThisPeriod || 0;
    await newUser.update({
      queriesUsedThisPeriod: Math.max(0, newUserCurrentUsed - REFERRAL_CONFIG.FREE_QUERIES_BONUS)
    });
    
    console.log(`✅ Referral: ${referrer.username} referred new user. New user got +${REFERRAL_CONFIG.FREE_QUERIES_BONUS} queries.`);
    
    return { 
      success: true, 
      referrerId: referrer.id,
      bonusAwarded: REFERRAL_CONFIG.FREE_QUERIES_BONUS
    };
    
  } catch (error) {
    console.error('Error processing referral signup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check and award referrer bonus when referee becomes active
 * Called after user completes queries
 */
async function checkAndAwardReferrerBonus(userId) {
  try {
    // Find if this user was referred
    const referralEvent = await Event.findOne({
      where: {
        event_name: REFERRAL_EVENTS.REFERRAL_SIGNUP,
        [Op.and]: [
          Event.sequelize.where(
            Event.sequelize.literal("properties->>'refereeId'"),
            userId
          )
        ]
      }
    });
    
    if (!referralEvent) {
      return { success: false, reason: 'No referral found' };
    }
    
    // Check if bonus already awarded
    const bonusAwarded = await Event.findOne({
      where: {
        event_name: REFERRAL_EVENTS.REFERRAL_REWARD_EARNED,
        [Op.and]: [
          Event.sequelize.where(
            Event.sequelize.literal("properties->>'refereeId'"),
            userId
          )
        ]
      }
    });
    
    if (bonusAwarded) {
      return { success: false, reason: 'Bonus already awarded' };
    }
    
    // Check if referee has completed enough queries
    const referee = await User.findByPk(userId);
    if (!referee) {
      return { success: false, reason: 'Referee not found' };
    }
    
    const refereeQueries = await Event.count({
      where: {
        user_id: userId,
        event_name: 'query_success'
      }
    });
    
    if (refereeQueries < REFERRAL_CONFIG.MIN_QUERIES_TO_UNLOCK) {
      return { 
        success: false, 
        reason: `Referee needs ${REFERRAL_CONFIG.MIN_QUERIES_TO_UNLOCK - refereeQueries} more queries` 
      };
    }
    
    // Award bonus to referrer
    const referrerId = referralEvent.user_id;
    const referrer = await User.findByPk(referrerId);
    
    if (referrer) {
      const currentUsed = referrer.queriesUsedThisPeriod || 0;
      await referrer.update({
        queriesUsedThisPeriod: Math.max(0, currentUsed - REFERRAL_CONFIG.FREE_QUERIES_BONUS)
      });
      
      // Track reward earned
      await eventTracking.trackEvent({
        eventName: REFERRAL_EVENTS.REFERRAL_REWARD_EARNED,
        userId: referrerId,
        properties: {
          refereeId: userId,
          bonusQueries: REFERRAL_CONFIG.FREE_QUERIES_BONUS
        }
      });
      
      console.log(`✅ Referrer ${referrer.username} earned +${REFERRAL_CONFIG.FREE_QUERIES_BONUS} queries for referral.`);
      
      return { success: true, bonusAwarded: REFERRAL_CONFIG.FREE_QUERIES_BONUS };
    }
    
    return { success: false, reason: 'Referrer not found' };
    
  } catch (error) {
    console.error('Error checking referrer bonus:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Award Pro bonus when referee upgrades to paid
 */
async function awardProReferralBonus(refereeId) {
  try {
    // Find referral event
    const referralEvent = await Event.findOne({
      where: {
        event_name: REFERRAL_EVENTS.REFERRAL_SIGNUP,
        [Op.and]: [
          Event.sequelize.where(
            Event.sequelize.literal("properties->>'refereeId'"),
            refereeId
          )
        ]
      }
    });
    
    if (!referralEvent) {
      return { success: false, reason: 'No referral found' };
    }
    
    // Check if Pro bonus already awarded
    const proBonusAwarded = await Event.findOne({
      where: {
        event_name: REFERRAL_EVENTS.REFERRAL_PRO_REWARD,
        [Op.and]: [
          Event.sequelize.where(
            Event.sequelize.literal("properties->>'refereeId'"),
            refereeId
          )
        ]
      }
    });
    
    if (proBonusAwarded) {
      return { success: false, reason: 'Pro bonus already awarded' };
    }
    
    const referrerId = referralEvent.user_id;
    const referrer = await User.findByPk(referrerId);
    
    if (!referrer) {
      return { success: false, reason: 'Referrer not found' };
    }
    
    // Add 1 month to referrer's subscription
    const currentEndDate = referrer.subscriptionEndDate || new Date();
    const newEndDate = new Date(Math.max(currentEndDate.getTime(), Date.now()));
    newEndDate.setMonth(newEndDate.getMonth() + REFERRAL_CONFIG.PRO_MONTHS_BONUS);
    
    // If referrer is free, upgrade to pro
    if (referrer.subscriptionTier === 'free') {
      await referrer.update({
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: newEndDate
      });
    } else {
      // Extend existing subscription
      await referrer.update({
        subscriptionEndDate: newEndDate
      });
    }
    
    // Track Pro reward
    await eventTracking.trackEvent({
      eventName: REFERRAL_EVENTS.REFERRAL_PRO_REWARD,
      userId: referrerId,
      properties: {
        refereeId,
        proMonthsAwarded: REFERRAL_CONFIG.PRO_MONTHS_BONUS,
        newEndDate: newEndDate.toISOString()
      }
    });
    
    console.log(`✅ Referrer ${referrer.username} earned +${REFERRAL_CONFIG.PRO_MONTHS_BONUS} month(s) Pro!`);
    
    return { success: true, proMonthsAwarded: REFERRAL_CONFIG.PRO_MONTHS_BONUS };
    
  } catch (error) {
    console.error('Error awarding Pro referral bonus:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get referral dashboard for user
 * GET /api/referral/dashboard
 */
async function getReferralDashboard(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const referralCode = generateReferralCode(user.username, userId);
    
    // Get referral stats
    const [clicks, signups, rewardsEarned, proRewards] = await Promise.all([
      Event.count({
        where: {
          user_id: userId,
          event_name: REFERRAL_EVENTS.REFERRAL_LINK_CLICKED
        }
      }),
      Event.count({
        where: {
          user_id: userId,
          event_name: REFERRAL_EVENTS.REFERRAL_SIGNUP
        }
      }),
      Event.count({
        where: {
          user_id: userId,
          event_name: REFERRAL_EVENTS.REFERRAL_REWARD_EARNED
        }
      }),
      Event.count({
        where: {
          user_id: userId,
          event_name: REFERRAL_EVENTS.REFERRAL_PRO_REWARD
        }
      })
    ]);
    
    // Get recent referrals
    const recentReferrals = await Event.findAll({
      where: {
        user_id: userId,
        event_name: REFERRAL_EVENTS.REFERRAL_SIGNUP
      },
      order: [['timestamp', 'DESC']],
      limit: 10,
      attributes: ['properties', 'timestamp'],
      raw: true
    });
    
    // Pending rewards (signed up but not yet active)
    const pending = signups - rewardsEarned;
    
    res.json({
      success: true,
      referralCode,
      referralLink: `https://errorwise.tech/refer/${referralCode}`,
      stats: {
        totalClicks: clicks,
        totalSignups: signups,
        rewardsEarned,
        proRewardsEarned: proRewards,
        pendingRewards: pending > 0 ? pending : 0,
        totalQueriesEarned: rewardsEarned * REFERRAL_CONFIG.FREE_QUERIES_BONUS,
        totalProMonthsEarned: proRewards * REFERRAL_CONFIG.PRO_MONTHS_BONUS
      },
      conversionRate: clicks > 0 ? ((signups / clicks) * 100).toFixed(1) + '%' : '0%',
      recentReferrals: recentReferrals.map(r => ({
        maskedEmail: r.properties?.refereeEmail || '***@***',
        timestamp: r.timestamp
      })),
      rewards: {
        perSignup: `+${REFERRAL_CONFIG.FREE_QUERIES_BONUS} queries`,
        perPaidUpgrade: `+${REFERRAL_CONFIG.PRO_MONTHS_BONUS} month Pro`
      }
    });
    
  } catch (error) {
    console.error('Error getting referral dashboard:', error);
    res.status(500).json({ error: 'Failed to get referral dashboard' });
  }
}

/**
 * Validate referral code
 * GET /api/referral/validate/:code
 */
async function validateReferralCode(req, res) {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({ valid: false, error: 'Code required' });
    }
    
    // Find referrer by code
    const users = await User.findAll();
    let referrer = null;
    
    for (const user of users) {
      if (generateReferralCode(user.username, user.id) === code) {
        referrer = user;
        break;
      }
    }
    
    if (referrer) {
      res.json({
        valid: true,
        referrerName: referrer.username.substring(0, 3) + '***',
        bonus: `You'll get +${REFERRAL_CONFIG.FREE_QUERIES_BONUS} free queries!`
      });
    } else {
      res.json({
        valid: false,
        error: 'Invalid referral code'
      });
    }
    
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({ valid: false, error: 'Validation failed' });
  }
}

/**
 * Get referral leaderboard (top referrers)
 * GET /api/referral/leaderboard
 */
async function getReferralLeaderboard(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Get top referrers by signup count
    const topReferrers = await Event.findAll({
      where: {
        event_name: REFERRAL_EVENTS.REFERRAL_SIGNUP
      },
      attributes: [
        'user_id',
        [Event.sequelize.fn('COUNT', '*'), 'referralCount']
      ],
      group: ['user_id'],
      order: [[Event.sequelize.fn('COUNT', '*'), 'DESC']],
      limit,
      raw: true
    });
    
    // Get user details
    const leaderboard = [];
    for (const entry of topReferrers) {
      const user = await User.findByPk(entry.user_id, {
        attributes: ['username']
      });
      
      if (user) {
        leaderboard.push({
          rank: leaderboard.length + 1,
          username: user.username.substring(0, 3) + '***',
          referrals: parseInt(entry.referralCount)
        });
      }
    }
    
    res.json({
      success: true,
      leaderboard
    });
    
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
}

module.exports = {
  getReferralLink,
  trackReferralClick,
  processReferralSignup,
  checkAndAwardReferrerBonus,
  awardProReferralBonus,
  getReferralDashboard,
  validateReferralCode,
  getReferralLeaderboard,
  generateReferralCode,
  REFERRAL_EVENTS,
  REFERRAL_CONFIG
};
