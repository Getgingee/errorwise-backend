/**
 * VideoMeeting Model
 * Tracks scheduled and instant video meetings for teams
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VideoMeeting = sequelize.define('VideoMeeting', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'Team Meeting'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  room_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  meeting_type: {
    type: DataTypes.ENUM('instant', 'scheduled', 'recurring'),
    defaultValue: 'instant'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'active', 'ended', 'cancelled'),
    defaultValue: 'scheduled'
  },
  // Scheduling
  scheduled_start: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scheduled_end: {
    type: DataTypes.DATE,
    allowNull: true
  },
  actual_start: {
    type: DataTypes.DATE,
    allowNull: true
  },
  actual_end: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Host info
  host_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Meeting settings
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      waitingRoom: false,
      muteOnEntry: true,
      allowScreenShare: true,
      allowRecording: false,
      allowChat: true,
      maxParticipants: 10,
      autoEndMinutes: 60,
      requireAuth: true
    }
  },
  // Participants tracking
  participants: {
    type: DataTypes.JSONB,
    defaultValue: []
    // Array of { userId, username, joinedAt, leftAt, role }
  },
  // Meeting notes (collaborative)
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Shared error context (for debugging sessions)
  shared_context: {
    type: DataTypes.JSONB,
    defaultValue: null
    // Can include: errorId, analysisId, codeSnippets, etc.
  },
  // Recording info (if enabled)
  recording_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  // Chat history
  chat_history: {
    type: DataTypes.JSONB,
    defaultValue: []
    // Array of { userId, username, message, timestamp }
  },
  // Invite link
  invite_code: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  // Password protection
  password: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  tableName: 'video_meetings',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['team_id'] },
    { fields: ['host_id'] },
    { fields: ['status'] },
    { fields: ['scheduled_start'] },
    { fields: ['invite_code'] },
    { fields: ['room_id'] }
  ]
});

// Generate short invite code
VideoMeeting.generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

module.exports = VideoMeeting;
