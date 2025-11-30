/**
 * Social Proof Controller (E3)
 * 
 * Provides social proof data for landing page:
 * - User count metric
 * - Micro-testimonials
 * - Success metrics
 * 
 * @ticket E3 – Social Proof Section on Landing
 * @epic EPIC E — Conversion Optimisation
 */

const User = require('../models/User');
const Event = require('../models/Event');
const { Op } = require('sequelize');

// Initial placeholder testimonials (to be replaced with real ones)
const TESTIMONIALS = [
  {
    id: 1,
    name: 'Alex Chen',
    role: 'Full Stack Developer',
    company: 'TechStartup',
    avatar: null, // Will use initials
    rating: 5,
    text: 'ErrorWise saved me hours of debugging. The AI explanations are spot-on!',
    isPlaceholder: true // Mark so we know to replace later
  },
  {
    id: 2,
    name: 'Sarah Miller',
    role: 'Backend Engineer',
    company: 'DataCorp',
    avatar: null,
    rating: 5,
    text: 'Finally, an error tool that actually understands my stack traces.',
    isPlaceholder: true
  },
  {
    id: 3,
    name: 'James Park',
    role: 'Senior Developer',
    company: 'CloudServices Inc',
    avatar: null,
    rating: 5,
    text: 'The Pro plan is worth every penny. Unlimited queries changed my workflow.',
    isPlaceholder: true
  }
];

// Success metrics to show
const SUCCESS_METRICS = [
  {
    id: 'errors_solved',
    label: 'Errors Solved',
    value: 0, // Will be calculated
    suffix: '+',
    icon: '🐛'
  },
  {
    id: 'time_saved',
    label: 'Hours Saved',
    value: 0, // Will be calculated
    suffix: '+',
    icon: '⏱️'
  },
  {
    id: 'satisfaction',
    label: 'Satisfaction Rate',
    value: 0, // Will be calculated
    suffix: '%',
    icon: '👍'
  }
];

/**
 * Get social proof data for landing page
 * GET /api/social-proof
 */
async function getSocialProof(req, res) {
  try {
    // Get real user count
    const totalUsers = await User.count({
      where: {
        deletedAt: null
      }
    });
    
    // Get total queries (errors solved)
    const totalQueries = await Event.count({
      where: {
        event_name: 'query_success'
      }
    });
    
    // Get satisfaction rate (thumbs up vs total feedback)
    const [thumbsUp, thumbsDown] = await Promise.all([
      Event.count({ where: { event_name: 'thumbs_up' } }),
      Event.count({ where: { event_name: 'thumbs_down' } })
    ]);
    
    const totalFeedback = thumbsUp + thumbsDown;
    const satisfactionRate = totalFeedback > 0 
      ? Math.round((thumbsUp / totalFeedback) * 100)
      : 95; // Default to 95% if no feedback yet
    
    // Estimate time saved (avg 15 mins per error)
    const hoursSaved = Math.round((totalQueries * 15) / 60);
    
    // Build metrics with real data
    const metrics = [
      {
        ...SUCCESS_METRICS[0],
        value: totalQueries || 1000, // Fallback for new deployment
        displayValue: formatNumber(totalQueries || 1000)
      },
      {
        ...SUCCESS_METRICS[1],
        value: hoursSaved || 500,
        displayValue: formatNumber(hoursSaved || 500)
      },
      {
        ...SUCCESS_METRICS[2],
        value: satisfactionRate,
        displayValue: satisfactionRate.toString()
      }
    ];
    
    // User count display (show as "X+ developers")
    const userCountDisplay = formatUserCount(totalUsers);
    
    // Trusted by section
    const trustedBy = {
      headline: `Trusted by ${userCountDisplay} developers`,
      subtext: 'Join developers who debug smarter, not harder'
    };
    
    // Get recent activity (last 24h) for "live" feeling
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentQueries = await Event.count({
      where: {
        event_name: 'query_success',
        timestamp: { [Op.gte]: dayAgo }
      }
    });
    
    res.json({
      success: true,
      userCount: totalUsers,
      userCountDisplay,
      trustedBy,
      metrics,
      testimonials: TESTIMONIALS,
      recentActivity: {
        queriesLast24h: recentQueries,
        message: recentQueries > 0 
          ? `${recentQueries} errors solved in the last 24 hours`
          : 'Developers solving errors right now'
      },
      badges: [
        { text: '🔒 Secure', tooltip: 'Your code stays private' },
        { text: '⚡ Fast', tooltip: 'Answers in seconds' },
        { text: '🧠 AI-Powered', tooltip: 'Claude & GPT-4' }
      ]
    });
    
  } catch (error) {
    console.error('Error getting social proof:', error);
    // Return fallback data so landing page still works
    res.json({
      success: true,
      userCount: 100,
      userCountDisplay: '100+',
      trustedBy: {
        headline: 'Trusted by 100+ developers',
        subtext: 'Join developers who debug smarter, not harder'
      },
      metrics: SUCCESS_METRICS.map(m => ({
        ...m,
        value: m.id === 'satisfaction' ? 95 : 1000,
        displayValue: m.id === 'satisfaction' ? '95' : '1,000'
      })),
      testimonials: TESTIMONIALS,
      recentActivity: {
        queriesLast24h: 50,
        message: 'Developers solving errors right now'
      },
      badges: [
        { text: '🔒 Secure', tooltip: 'Your code stays private' },
        { text: '⚡ Fast', tooltip: 'Answers in seconds' },
        { text: '🧠 AI-Powered', tooltip: 'Claude & GPT-4' }
      ]
    });
  }
}

/**
 * Get live activity feed
 * GET /api/social-proof/live
 * 
 * Returns recent anonymized activity for social proof
 */
async function getLiveActivity(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    // Get recent successful queries (anonymized)
    const recentQueries = await Event.findAll({
      where: {
        event_name: 'query_success'
      },
      order: [['timestamp', 'DESC']],
      limit,
      attributes: ['timestamp', 'properties'],
      raw: true
    });
    
    // Format as activity feed
    const activities = recentQueries.map((event, index) => {
      const props = event.properties || {};
      const timeAgo = formatTimeAgo(new Date(event.timestamp));
      
      return {
        id: index,
        message: `A developer solved a ${props.errorCategory || 'code'} error`,
        timeAgo,
        icon: '✅'
      };
    });
    
    res.json({
      success: true,
      activities
    });
    
  } catch (error) {
    console.error('Error getting live activity:', error);
    res.json({
      success: true,
      activities: [
        { id: 0, message: 'A developer solved a code error', timeAgo: '2 mins ago', icon: '✅' }
      ]
    });
  }
}

/**
 * Submit testimonial (authenticated users only)
 * POST /api/social-proof/testimonial
 */
async function submitTestimonial(req, res) {
  try {
    const userId = req.user.id;
    const { text, rating, allowPublic } = req.body;
    
    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'Testimonial must be at least 10 characters' });
    }
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Store as event for now (can move to dedicated table later)
    await Event.create({
      user_id: userId,
      event_name: 'testimonial_submitted',
      properties: {
        text: text.substring(0, 500), // Limit length
        rating,
        allowPublic: allowPublic || false,
        userName: user.username,
        userEmail: user.email
      },
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Thank you for your testimonial! It will be reviewed shortly.'
    });
    
  } catch (error) {
    console.error('Error submitting testimonial:', error);
    res.status(500).json({ error: 'Failed to submit testimonial' });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function formatUserCount(count) {
  if (count >= 10000) return Math.floor(count / 1000) * 1000 + '+';
  if (count >= 1000) return Math.floor(count / 100) * 100 + '+';
  if (count >= 100) return Math.floor(count / 50) * 50 + '+';
  if (count >= 10) return Math.floor(count / 10) * 10 + '+';
  return count + '+';
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' mins ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  return Math.floor(seconds / 86400) + ' days ago';
}

module.exports = {
  getSocialProof,
  getLiveActivity,
  submitTestimonial,
  TESTIMONIALS
};
