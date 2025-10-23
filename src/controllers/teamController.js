const Team = require('../models/Team');
const TeamMember = require('../models/TeamMember');
const SharedError = require('../models/SharedError');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new team (Team subscription required)
 */
exports.createTeam = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, maxMembers = -1 } = req.body; // -1 means unlimited

    // Check if user has team subscription
    const user = await User.findByPk(userId, {
      include: [{
        model: Subscription,
        as: 'subscription'
      }]
    });

    if (!user || user.subscription_tier !== 'team') {
      return res.status(403).json({
        error: 'Team subscription required',
        message: 'You need a Team subscription to create teams'
      });
    }

    // Generate unique video room ID
    const videoRoomId = `errorwise-team-${uuidv4()}`;

    // Create team with unlimited members by default
    const team = await Team.create({
      name,
      description,
      owner_id: userId,
      subscription_id: user.subscription?.id,
      max_members: maxMembers,
      video_room_id: videoRoomId
    });

    // Add owner as team member
    await TeamMember.create({
      team_id: team.id,
      user_id: userId,
      role: 'owner',
      status: 'active',
      joined_at: new Date(),
      permissions: {
        can_invite_members: true,
        can_manage_errors: true,
        can_start_video_chat: true,
        can_view_analytics: true
      }
    });

    res.status(201).json({
      message: 'Team created successfully',
      team: {
        ...team.toJSON(),
        member_count: 1,
        role: 'owner',
        unlimited_members: team.max_members === -1
      }
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
};

/**
 * Get user's teams
 */
exports.getUserTeams = async (req, res) => {
  try {
    const userId = req.user.id;

    const teams = await Team.findAll({
      include: [
        {
          model: TeamMember,
          as: 'members',
          where: { user_id: userId },
          attributes: ['role', 'status', 'joined_at']
        },
        {
          model: TeamMember,
          as: 'all_members',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'email']
          }]
        }
      ]
    });

    const teamsWithCounts = teams.map(team => ({
      ...team.toJSON(),
      member_count: team.all_members.length,
      role: team.members[0]?.role,
      status: team.members[0]?.status
    }));

    res.json({ teams: teamsWithCounts });
  } catch (error) {
    console.error('Get user teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

/**
 * Invite user to team
 */
exports.inviteToTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role = 'member' } = req.body;
    const inviterId = req.user.id;

    // Check if inviter has permission
    const inviterMembership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: inviterId },
      include: [{
        model: Team,
        as: 'team'
      }]
    });

    if (!inviterMembership || !['owner', 'admin'].includes(inviterMembership.role)) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You do not have permission to invite members'
      });
    }

    // Find user to invite
    const userToInvite = await User.findOne({ where: { email } });
    if (!userToInvite) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this email address'
      });
    }

    // Check if user is already a member
    const existingMember = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userToInvite.id }
    });

    if (existingMember) {
      return res.status(400).json({
        error: 'Already a member',
        message: 'User is already a member of this team'
      });
    }

    // Check team member limit (only if not unlimited)
    const team = inviterMembership.team;
    if (team.max_members > 0) {
      const memberCount = await TeamMember.count({
        where: { team_id: teamId, status: { [sequelize.Op.in]: ['pending', 'active'] } }
      });

      if (memberCount >= team.max_members) {
        return res.status(400).json({
          error: 'Team full',
          message: 'Team has reached maximum member limit'
        });
      }
    }

    // Create invitation
    const invitation = await TeamMember.create({
      team_id: teamId,
      user_id: userToInvite.id,
      role,
      status: 'pending',
      invited_by: inviterId
    });

    // TODO: Send invitation email

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        user: {
          username: userToInvite.username,
          email: userToInvite.email
        },
        role,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Invite to team error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
};

/**
 * Accept team invitation
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    const invitation = await TeamMember.findOne({
      where: { 
        team_id: teamId, 
        user_id: userId, 
        status: 'pending' 
      }
    });

    if (!invitation) {
      return res.status(404).json({
        error: 'Invitation not found',
        message: 'No pending invitation found for this team'
      });
    }

    await invitation.update({
      status: 'active',
      joined_at: new Date()
    });

    res.json({
      message: 'Successfully joined the team',
      team_id: teamId,
      role: invitation.role
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
};

/**
 * Share error with team
 */
exports.shareError = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { errorQueryId, title, description, category, priority = 'medium' } = req.body;
    const userId = req.user.id;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to share errors'
      });
    }

    const sharedError = await SharedError.create({
      team_id: teamId,
      shared_by: userId,
      error_query_id: errorQueryId,
      title,
      description,
      category,
      priority
    });

    res.status(201).json({
      message: 'Error shared with team successfully',
      shared_error: sharedError
    });
  } catch (error) {
    console.error('Share error error:', error);
    res.status(500).json({ error: 'Failed to share error' });
  }
};

/**
 * Get team shared errors
 */
exports.getTeamErrors = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20, status, category } = req.query;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to view shared errors'
      });
    }

    const whereClause = { team_id: teamId };
    if (status) whereClause.status = status;
    if (category) whereClause.category = category;

    const { count, rows: sharedErrors } = await SharedError.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'sharedBy',
          attributes: ['id', 'username']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      shared_errors: sharedErrors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get team errors error:', error);
    res.status(500).json({ error: 'Failed to fetch team errors' });
  }
};

/**
 * Start video chat session
 */
exports.startVideoChat = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is team member with video chat permissions
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' },
      include: [{
        model: Team,
        as: 'team'
      }]
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You must be a team member to start video chats'
      });
    }

    if (!membership.permissions?.can_start_video_chat) {
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You do not have permission to start video chats'
      });
    }

    // Generate video chat session with 30-minute duration limit
    const sessionId = `${membership.team.video_room_id}-${Date.now()}`;
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes from now
    
    res.json({
      message: 'Video chat session created',
      session: {
        id: sessionId,
        room_id: membership.team.video_room_id,
        started_by: req.user.username,
        started_at: startTime.toISOString(),
        expires_at: endTime.toISOString(),
        duration_limit_minutes: 30,
        join_url: `${process.env.FRONTEND_URL}/team/${teamId}/video/${sessionId}`,
        unlimited_participants: true
      }
    });
  } catch (error) {
    console.error('Start video chat error:', error);
    res.status(500).json({ error: 'Failed to start video chat' });
  }
};

/**
 * End video chat session
 */
exports.endVideoChat = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is team member with video permissions
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership || !membership.permissions.can_start_video_chat) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to end video chats'
      });
    }

    res.json({
      message: 'Video chat session ended',
      teamId
    });
  } catch (error) {
    console.error('End video chat error:', error);
    res.status(500).json({ error: 'Failed to end video chat' });
  }
};

/**
 * Get team details
 */
exports.getTeamDetails = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this team'
      });
    }

    const team = await Team.findByPk(teamId, {
      include: [{
        model: TeamMember,
        as: 'all_members',
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email']
        }],
        where: { status: 'active' }
      }]
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({
      team: {
        ...team.toJSON(),
        member_count: team.all_members.length,
        user_role: membership.role,
        user_permissions: membership.permissions
      }
    });
  } catch (error) {
    console.error('Get team details error:', error);
    res.status(500).json({ error: 'Failed to get team details' });
  }
};

/**
 * Update team settings
 */
exports.updateTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;
    const { name, description, settings } = req.body;

    // Check if user is team owner or admin
    const membership = await TeamMember.findOne({
      where: { 
        team_id: teamId, 
        user_id: userId, 
        status: 'active',
        role: ['owner', 'admin']
      }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only team owners and admins can update team settings'
      });
    }

    const team = await Team.findByPk(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    if (settings) updateData.settings = { ...team.settings, ...settings };

    await team.update(updateData);

    res.json({
      message: 'Team updated successfully',
      team: team.toJSON()
    });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
};

/**
 * Delete team (owner only)
 */
exports.deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is team owner
    const team = await Team.findOne({
      where: { id: teamId, owner_id: userId }
    });

    if (!team) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only team owners can delete teams'
      });
    }

    // Delete team (cascade will handle members and shared errors)
    await team.destroy();

    res.json({
      message: 'Team deleted successfully',
      teamId
    });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
};

/**
 * Get team members
 */
exports.getTeamMembers = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this team'
      });
    }

    const members = await TeamMember.findAll({
      where: { team_id: teamId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email', 'createdAt']
      }],
      order: [['joined_at', 'DESC']]
    });

    res.json({
      members: members.map(member => ({
        id: member.id,
        user: member.user,
        role: member.role,
        status: member.status,
        permissions: member.permissions,
        invited_at: member.invited_at,
        joined_at: member.joined_at
      }))
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to get team members' });
  }
};

/**
 * Update member role
 */
exports.updateMemberRole = async (req, res) => {
  try {
    const { teamId, userId: targetUserId } = req.params;
    const userId = req.user.id;
    const { role, permissions } = req.body;

    // Check if current user is team owner or admin
    const currentMembership = await TeamMember.findOne({
      where: { 
        team_id: teamId, 
        user_id: userId, 
        status: 'active',
        role: ['owner', 'admin']
      }
    });

    if (!currentMembership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only team owners and admins can update member roles'
      });
    }

    // Find target member
    const targetMembership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: targetUserId }
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Don't allow changing owner role
    if (targetMembership.role === 'owner' || role === 'owner') {
      return res.status(403).json({
        error: 'Cannot change owner role'
      });
    }

    const updateData = {};
    if (role) updateData.role = role;
    if (permissions) updateData.permissions = { ...targetMembership.permissions, ...permissions };

    await targetMembership.update(updateData);

    res.json({
      message: 'Member role updated successfully',
      member: targetMembership.toJSON()
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
};

/**
 * Remove team member
 */
exports.removeTeamMember = async (req, res) => {
  try {
    const { teamId, userId: targetUserId } = req.params;
    const userId = req.user.id;

    // Check if current user is team owner or admin, or removing themselves
    const currentMembership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    const canRemove = currentMembership && (
      ['owner', 'admin'].includes(currentMembership.role) || 
      userId === targetUserId
    );

    if (!canRemove) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only remove yourself or be an admin/owner'
      });
    }

    // Find target member
    const targetMembership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: targetUserId }
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Don't allow removing team owner
    if (targetMembership.role === 'owner') {
      return res.status(403).json({
        error: 'Cannot remove team owner'
      });
    }

    await targetMembership.destroy();

    res.json({
      message: userId === targetUserId ? 'Left team successfully' : 'Member removed successfully',
      userId: targetUserId
    });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
};

/**
 * Update shared error
 */
exports.updateSharedError = async (req, res) => {
  try {
    const { teamId, errorId } = req.params;
    const userId = req.user.id;
    const { title, description, category, priority, status } = req.body;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership || !membership.permissions.can_manage_errors) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to update shared errors'
      });
    }

    const sharedError = await SharedError.findOne({
      where: { id: errorId, team_id: teamId }
    });

    if (!sharedError) {
      return res.status(404).json({ error: 'Shared error not found' });
    }

    const updateData = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (priority) updateData.priority = priority;
    if (status) updateData.status = status;

    await sharedError.update(updateData);

    res.json({
      message: 'Shared error updated successfully',
      shared_error: sharedError.toJSON()
    });
  } catch (error) {
    console.error('Update shared error error:', error);
    res.status(500).json({ error: 'Failed to update shared error' });
  }
};

/**
 * Delete shared error
 */
exports.deleteSharedError = async (req, res) => {
  try {
    const { teamId, errorId } = req.params;
    const userId = req.user.id;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership || !membership.permissions.can_manage_errors) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to delete shared errors'
      });
    }

    const sharedError = await SharedError.findOne({
      where: { id: errorId, team_id: teamId }
    });

    if (!sharedError) {
      return res.status(404).json({ error: 'Shared error not found' });
    }

    // Only allow deletion by the person who shared it or admin/owner
    const canDelete = sharedError.shared_by === userId || ['owner', 'admin'].includes(membership.role);

    if (!canDelete) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete errors you shared'
      });
    }

    await sharedError.destroy();

    res.json({
      message: 'Shared error deleted successfully',
      errorId
    });
  } catch (error) {
    console.error('Delete shared error error:', error);
    res.status(500).json({ error: 'Failed to delete shared error' });
  }
};

/**
 * Get team dashboard data
 */
exports.getTeamDashboard = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is team member
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this team'
      });
    }

    // Get team stats
    const [memberCount, sharedErrorCount, recentErrors] = await Promise.all([
      TeamMember.count({ where: { team_id: teamId, status: 'active' } }),
      SharedError.count({ where: { team_id: teamId } }),
      SharedError.findAll({
        where: { team_id: teamId },
        include: [{
          model: User,
          as: 'sharedBy',
          attributes: ['id', 'username']
        }],
        order: [['created_at', 'DESC']],
        limit: 10
      })
    ]);

    res.json({
      dashboard: {
        team_id: teamId,
        member_count: memberCount,
        shared_errors_count: sharedErrorCount,
        recent_errors: recentErrors,
        user_role: membership.role,
        user_permissions: membership.permissions
      }
    });
  } catch (error) {
    console.error('Get team dashboard error:', error);
    res.status(500).json({ error: 'Failed to get team dashboard' });
  }
};

/**
 * Get team analytics
 */
exports.getTeamAnalytics = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user has analytics permission
    const membership = await TeamMember.findOne({
      where: { team_id: teamId, user_id: userId, status: 'active' }
    });

    if (!membership || !membership.permissions.can_view_analytics) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to view team analytics'
      });
    }

    // Get analytics data (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [errorsByCategory, errorsByPriority, dailyActivity] = await Promise.all([
      SharedError.findAll({
        where: { 
          team_id: teamId,
          created_at: { [Op.gte]: thirtyDaysAgo }
        },
        attributes: [
          'category',
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['category']
      }),
      SharedError.findAll({
        where: { 
          team_id: teamId,
          created_at: { [Op.gte]: thirtyDaysAgo }
        },
        attributes: [
          'priority',
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['priority']
      }),
      SharedError.findAll({
        where: { 
          team_id: teamId,
          created_at: { [Op.gte]: thirtyDaysAgo }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']]
      })
    ]);

    res.json({
      analytics: {
        team_id: teamId,
        period: '30_days',
        errors_by_category: errorsByCategory,
        errors_by_priority: errorsByPriority,
        daily_activity: dailyActivity
      }
    });
  } catch (error) {
    console.error('Get team analytics error:', error);
    res.status(500).json({ error: 'Failed to get team analytics' });
  }
};

module.exports = exports;