/**
 * Event Model - Event Tracking Layer (D1)
 * 
 * Records all user events for analytics, retention tracking,
 * and month-1 success metrics evaluation.
 * 
 * @ticket D1 – Implement basic event tracking
 * @epic EPIC D — Analytics & Success Metrics (Month-1 Evaluation)
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Event = sequelize.define('Event', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // User identification
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: 'User ID (null for anonymous events)'
  },
  
  // Anonymous session tracking
  anonymous_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Session ID for anonymous users'
  },
  
  // Event name (the action that occurred)
  event_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Event type: signup_created, query_submitted, etc.'
  },
  
  // Event timestamp
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  
  // User's subscription tier at time of event
  subscription_tier: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'free'
  },
  
  // Event properties (JSON)
  properties: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Event-specific properties (confidence, plan, etc.)'
  },
  
  // Session ID for grouping events
  session_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Session identifier for grouping related events'
  },
  
  // IP hash for geographic/abuse analysis
  ip_hash: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  
  // User agent
  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // Page/source where event occurred
  page: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Page or component where event was triggered'
  }
}, {
  tableName: 'events',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // Events are immutable
  indexes: [
    // Index for user queries
    { fields: ['user_id'] },
    // Index for event type queries
    { fields: ['event_name'] },
    // Index for time-based queries
    { fields: ['timestamp'] },
    // Index for session grouping
    { fields: ['session_id'] },
    // Index for anonymous users
    { fields: ['anonymous_id'] },
    // Composite index for analytics
    { fields: ['event_name', 'timestamp'] },
    // Composite index for user journey
    { fields: ['user_id', 'event_name', 'timestamp'] },
    // Tier-based analytics
    { fields: ['subscription_tier', 'event_name'] }
  ]
});

// Define event name constants
Event.EVENTS = {
  // User lifecycle
  SIGNUP_CREATED: 'signup_created',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  
  // Query events
  QUERY_SUBMITTED: 'query_submitted',
  QUERY_SUCCESS: 'query_success',
  QUERY_FAILED: 'query_failed',
  RESULT_VIEWED: 'result_viewed',
  
  // Feedback events
  THUMBS_UP: 'thumbs_up',
  THUMBS_DOWN: 'thumbs_down',
  
  // Usage/limit events (C3)
  LIMIT_80PCT_REACHED: 'limit_80pct_reached',
  LIMIT_REACHED: 'limit_reached',
  USAGE_WARNING_SHOWN: 'usage_warning_shown',
  
  // Upgrade events (C4)
  UPGRADE_CLICKED: 'upgrade_clicked',
  UPGRADE_STARTED: 'upgrade_started',
  UPGRADE_COMPLETED: 'upgrade_completed',
  UPGRADE_FAILED: 'upgrade_failed',
  
  // Smart upgrade events (E1)
  SMART_UPGRADE_SHOWN: 'smart_upgrade_shown',
  SMART_UPGRADE_CLICKED: 'smart_upgrade_clicked',
  SMART_UPGRADE_DISMISSED: 'smart_upgrade_dismissed',
  
  // Compare plans events (E2)
  COMPARE_MODAL_OPENED: 'compare_modal_opened',
  COMPARE_PLAN_SELECTED: 'compare_plan_selected',
  COMPARE_UPGRADE_CLICKED: 'compare_upgrade_clicked',
  
  // Weekly digest events (F1)
  WEEKLY_DIGEST_SENT: 'weekly_digest_sent',
  WEEKLY_DIGEST_OPENED: 'weekly_digest_opened',
  WEEKLY_DIGEST_CLICKED: 'weekly_digest_clicked',
  WEEKLY_DIGEST_UNSUBSCRIBED: 'weekly_digest_unsubscribed',
  
  // Feedback events (F2)
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  FEEDBACK_YES: 'feedback_yes',
  FEEDBACK_NO: 'feedback_no',
  FEEDBACK_PARTIAL: 'feedback_partial',
  SHARE_BONUS_EARNED: 'share_bonus_earned',
  SHARE_COMPLETED: 'share_completed',
  
  // Referral events (F3)
  REFERRAL_LINK_CREATED: 'referral_link_created',
  REFERRAL_LINK_CLICKED: 'referral_link_clicked',
  REFERRAL_SIGNUP: 'referral_signup',
  REFERRAL_REWARD_EARNED: 'referral_reward_earned',
  REFERRAL_PRO_REWARD: 'referral_pro_reward',
  
  // Session events
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  
  // Feature usage
  FEATURE_USED: 'feature_used',
  
  // Trial events
  TRIAL_STARTED: 'trial_started',
  TRIAL_ENDING_SOON: 'trial_ending_soon',
  TRIAL_ENDED: 'trial_ended',
  
  // Testimonial
  TESTIMONIAL_SUBMITTED: 'testimonial_submitted'
};

module.exports = Event;
