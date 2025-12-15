/**
 * Video Meeting Controller
 * Handles all video meeting operations for teams
 * Features: Schedule, Start, Join, End, Notes, Chat, Screen Share Context
 */

const { v4: uuidv4 } = require('uuid');
const VideoMeeting = require('../models/VideoMeeting');
const Team = require('../models/Team');
const TeamMember = require('../models/TeamMember');
const User = require('../models/User');
const { Op } = require('sequelize');

/**
 * Schedule a new meeting
 * POST /api/teams/:teamId/meetings
 */
exports.scheduleMeeting = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;
    const {
      title,
      description,
      scheduledStart,
      scheduledEnd,
      settings,
      password
    } = req.body;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to schedule meetings'
      });
    }

    if (!membership.permissions?.can_start_video_chat) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You do not have permission to schedule meetings'
      });
    }

    // Generate unique room ID and invite code
    const roomId = `ew-${teamId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;
    const inviteCode = VideoMeeting.generateInviteCode();

    const meeting = await VideoMeeting.create({
      team_id: teamId,
      title: title || 'Team Meeting',
      description,
      room_id: roomId,
      meeting_type: scheduledStart ? 'scheduled' : 'instant',
      status: scheduledStart ? 'scheduled' : 'active',
      scheduled_start: scheduledStart ? new Date(scheduledStart) : new Date(),
      scheduled_end: scheduledEnd ? new Date(scheduledEnd) : null,
      actual_start: !scheduledStart ? new Date() : null,
      host_id: userId,
      settings: {
        waitingRoom: settings?.waitingRoom ?? false,
        muteOnEntry: settings?.muteOnEntry ?? true,
        allowScreenShare: settings?.allowScreenShare ?? true,
        allowRecording: settings?.allowRecording ?? false,
        allowChat: settings?.allowChat ?? true,
        maxParticipants: settings?.maxParticipants ?? 10,
        autoEndMinutes: settings?.autoEndMinutes ?? 60,
        requireAuth: settings?.requireAuth ?? true
      },
      invite_code: inviteCode,
      password: password || null
    });

    res.status(201).json({
      success: true,
      message: 'Meeting scheduled successfully',
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        roomId: meeting.room_id,
        status: meeting.status,
        scheduledStart: meeting.scheduled_start,
        scheduledEnd: meeting.scheduled_end,
        inviteCode: meeting.invite_code,
        inviteLink: `${process.env.FRONTEND_URL}/meeting/${meeting.invite_code}`,
        joinUrl: `${process.env.FRONTEND_URL}/team/${teamId}/meeting/${meeting.id}`,
        hasPassword: !!meeting.password,
        settings: meeting.settings
      }
    });
  } catch (error) {
    console.error('Schedule meeting error:', error);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
};

/**
 * Start an instant meeting
 * POST /api/teams/:teamId/meetings/instant
 */
exports.startInstantMeeting = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;
    const { title, sharedContext } = req.body;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' },
      include: [{ model: Team, as: 'team' }]
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to start meetings'
      });
    }

    if (!membership.permissions?.can_start_video_chat) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You do not have permission to start meetings'
      });
    }

    // Generate unique room ID
    const roomId = `ew-${teamId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;
    const inviteCode = VideoMeeting.generateInviteCode();

    const meeting = await VideoMeeting.create({
      team_id: teamId,
      title: title || `${req.user.username}'s Meeting`,
      room_id: roomId,
      meeting_type: 'instant',
      status: 'active',
      actual_start: new Date(),
      host_id: userId,
      invite_code: inviteCode,
      shared_context: sharedContext || null,
      participants: [{
        userId,
        username: req.user.username,
        joinedAt: new Date().toISOString(),
        role: 'host'
      }],
      settings: {
        waitingRoom: false,
        muteOnEntry: false,
        allowScreenShare: true,
        allowRecording: false,
        allowChat: true,
        maxParticipants: 10,
        autoEndMinutes: 60,
        requireAuth: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Meeting started',
      meeting: {
        id: meeting.id,
        title: meeting.title,
        roomId: meeting.room_id,
        status: meeting.status,
        startedAt: meeting.actual_start,
        inviteCode: meeting.invite_code,
        inviteLink: `${process.env.FRONTEND_URL}/meeting/${meeting.invite_code}`,
        joinUrl: `${process.env.FRONTEND_URL}/team/${teamId}/meeting/${meeting.id}`,
        sharedContext: meeting.shared_context,
        settings: meeting.settings,
        jitsiConfig: {
          domain: 'meet.jit.si',
          roomName: meeting.room_id,
          displayName: req.user.username,
          isModerator: true
        }
      }
    });
  } catch (error) {
    console.error('Start instant meeting error:', error);
    res.status(500).json({ error: 'Failed to start meeting' });
  }
};

/**
 * Join a meeting
 * POST /api/teams/:teamId/meetings/:meetingId/join
 */
exports.joinMeeting = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;
    const { password } = req.body;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to join meetings'
      });
    }

    // Get meeting
    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(400).json({ error: 'Meeting has ended' });
    }

    // Check password if required
    if (meeting.password && meeting.password !== password) {
      return res.status(401).json({ error: 'Invalid meeting password' });
    }

    // Check participant limit
    const activeParticipants = meeting.participants.filter(p => !p.leftAt);
    if (activeParticipants.length >= meeting.settings.maxParticipants) {
      return res.status(400).json({ error: 'Meeting is full' });
    }

    // Add participant
    const existingParticipant = meeting.participants.find(p => p.userId === userId);
    if (existingParticipant && !existingParticipant.leftAt) {
      // Already in meeting, just return join info
    } else {
      meeting.participants = [
        ...meeting.participants.filter(p => p.userId !== userId),
        {
          userId,
          username: req.user.username,
          joinedAt: new Date().toISOString(),
          role: meeting.host_id === userId ? 'host' : 'participant'
        }
      ];
      await meeting.save();
    }

    res.json({
      success: true,
      message: 'Joined meeting',
      meeting: {
        id: meeting.id,
        title: meeting.title,
        roomId: meeting.room_id,
        status: meeting.status,
        sharedContext: meeting.shared_context,
        notes: meeting.notes,
        settings: meeting.settings,
        participants: meeting.participants.filter(p => !p.leftAt),
        isHost: meeting.host_id === userId,
        jitsiConfig: {
          domain: 'meet.jit.si',
          roomName: meeting.room_id,
          displayName: req.user.username,
          isModerator: meeting.host_id === userId
        }
      }
    });
  } catch (error) {
    console.error('Join meeting error:', error);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
};

/**
 * Leave a meeting
 * POST /api/teams/:teamId/meetings/:meetingId/leave
 */
exports.leaveMeeting = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;

    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Update participant's left time
    meeting.participants = meeting.participants.map(p => {
      if (p.userId === userId && !p.leftAt) {
        return { ...p, leftAt: new Date().toISOString() };
      }
      return p;
    });
    await meeting.save();

    res.json({
      success: true,
      message: 'Left meeting'
    });
  } catch (error) {
    console.error('Leave meeting error:', error);
    res.status(500).json({ error: 'Failed to leave meeting' });
  }
};

/**
 * End a meeting (host only)
 * POST /api/teams/:teamId/meetings/:meetingId/end
 */
exports.endMeeting = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;

    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Only host can end meeting
    if (meeting.host_id !== userId) {
      return res.status(403).json({ error: 'Only the host can end the meeting' });
    }

    // Mark all participants as left
    meeting.participants = meeting.participants.map(p => {
      if (!p.leftAt) {
        return { ...p, leftAt: new Date().toISOString() };
      }
      return p;
    });

    meeting.status = 'ended';
    meeting.actual_end = new Date();
    await meeting.save();

    res.json({
      success: true,
      message: 'Meeting ended',
      duration: Math.round((meeting.actual_end - meeting.actual_start) / 1000 / 60) // in minutes
    });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ error: 'Failed to end meeting' });
  }
};

/**
 * Update meeting notes (collaborative)
 * PATCH /api/teams/:teamId/meetings/:meetingId/notes
 */
exports.updateNotes = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;
    const { notes } = req.body;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    meeting.notes = notes;
    await meeting.save();

    res.json({
      success: true,
      message: 'Notes updated',
      notes: meeting.notes
    });
  } catch (error) {
    console.error('Update notes error:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
};

/**
 * Add chat message
 * POST /api/teams/:teamId/meetings/:meetingId/chat
 */
exports.addChatMessage = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;
    const { message } = req.body;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (!meeting.settings.allowChat) {
      return res.status(403).json({ error: 'Chat is disabled for this meeting' });
    }

    const chatMessage = {
      id: uuidv4(),
      userId,
      username: req.user.username,
      message,
      timestamp: new Date().toISOString()
    };

    meeting.chat_history = [...(meeting.chat_history || []), chatMessage];
    await meeting.save();

    res.json({
      success: true,
      message: chatMessage
    });
  } catch (error) {
    console.error('Add chat message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

/**
 * Share error context in meeting
 * POST /api/teams/:teamId/meetings/:meetingId/share-error
 */
exports.shareErrorContext = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;
    const { errorId, analysisId, errorText, codeSnippet, notes } = req.body;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    meeting.shared_context = {
      ...meeting.shared_context,
      errorId,
      analysisId,
      errorText,
      codeSnippet,
      notes,
      sharedBy: req.user.username,
      sharedAt: new Date().toISOString()
    };
    await meeting.save();

    res.json({
      success: true,
      message: 'Error context shared',
      sharedContext: meeting.shared_context
    });
  } catch (error) {
    console.error('Share error context error:', error);
    res.status(500).json({ error: 'Failed to share error context' });
  }
};

/**
 * Get team's meetings (upcoming and past)
 * GET /api/teams/:teamId/meetings
 */
exports.getTeamMeetings = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;
    const { status, limit = 15 } = req.query;
    const cursor = req.query.cursor;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const parsedLimit = Math.min(parseInt(limit) || 15, 50);
    const whereClause = { team_id: teamId };
    if (status) {
      whereClause.status = status;
    }
    if (cursor) {
      whereClause.id = { [Op.lt]: cursor };
    }

    const meetings = await VideoMeeting.findAll({
      where: whereClause,
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit: parsedLimit + 1,
      include: [{
        model: User,
        as: 'host',
        attributes: ['id', 'username', 'email']
      }]
    });

    const hasMore = meetings.length > parsedLimit;
    if (hasMore) meetings.pop();

    const nextCursor = hasMore && meetings.length > 0 ? meetings[meetings.length - 1].id : null;

    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      success: true,
      meetings: meetings.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        status: m.status,
        meetingType: m.meeting_type,
        scheduledStart: m.scheduled_start,
        scheduledEnd: m.scheduled_end,
        actualStart: m.actual_start,
        actualEnd: m.actual_end,
        host: m.host,
        participantCount: m.participants?.length || 0,
        hasNotes: !!m.notes,
        hasSharedContext: !!m.shared_context,
        inviteCode: m.invite_code,
        createdAt: m.created_at
      })),
      pagination: {
        hasMore,
        nextCursor
      }
    });
  } catch (error) {
    console.error('Get team meetings error:', error);
    res.status(500).json({ error: 'Failed to get meetings' });
  }
};

/**
 * Get meeting details
 * GET /api/teams/:teamId/meetings/:meetingId
 */
exports.getMeetingDetails = async (req, res) => {
  try {
    const { teamId, meetingId } = req.params;
    const userId = req.user.id;

    // Verify team membership
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const meeting = await VideoMeeting.findOne({
      where: { id: meetingId, team_id: teamId },
      include: [{
        model: User,
        as: 'host',
        attributes: ['id', 'username', 'email']
      }]
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        roomId: meeting.room_id,
        status: meeting.status,
        meetingType: meeting.meeting_type,
        scheduledStart: meeting.scheduled_start,
        scheduledEnd: meeting.scheduled_end,
        actualStart: meeting.actual_start,
        actualEnd: meeting.actual_end,
        host: meeting.host,
        isHost: meeting.host_id === userId,
        participants: meeting.participants,
        notes: meeting.notes,
        sharedContext: meeting.shared_context,
        chatHistory: meeting.chat_history,
        settings: meeting.settings,
        inviteCode: meeting.invite_code,
        inviteLink: `${process.env.FRONTEND_URL}/meeting/${meeting.invite_code}`,
        hasPassword: !!meeting.password
      }
    });
  } catch (error) {
    console.error('Get meeting details error:', error);
    res.status(500).json({ error: 'Failed to get meeting details' });
  }
};

/**
 * Join by invite code
 * GET /api/meetings/join/:inviteCode
 */
exports.joinByInviteCode = async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.user.id;

    const meeting = await VideoMeeting.findOne({
      where: { invite_code: inviteCode },
      include: [{
        model: Team,
        as: 'team'
      }]
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      return res.status(400).json({ error: 'Meeting has ended' });
    }

    // Verify user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: meeting.team_id, user_id: userId, status: 'active' }
    });

    if (!membership && meeting.settings.requireAuth) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to join this meeting'
      });
    }

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        teamId: meeting.team_id,
        teamName: meeting.team?.name,
        status: meeting.status,
        hasPassword: !!meeting.password,
        joinUrl: `${process.env.FRONTEND_URL}/team/${meeting.team_id}/meeting/${meeting.id}`
      }
    });
  } catch (error) {
    console.error('Join by invite code error:', error);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
};
