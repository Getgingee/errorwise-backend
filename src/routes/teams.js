const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { authMiddleware } = require('../middleware/auth');
const { requireTier } = require('../middleware/subscriptionMiddleware');
// const { validateTeamCreation, validateInvitation, validateErrorSharing } = require('../middleware/validation');

// Apply authentication middleware to all team routes
router.use(authMiddleware);

// Team features require Team subscription tier
router.use(requireTier('team'));

// Team management routes
router.post('/', teamController.createTeam);
router.get('/', teamController.getUserTeams);
router.get('/:teamId', teamController.getTeamDetails);
router.put('/:teamId', teamController.updateTeam);
router.delete('/:teamId', teamController.deleteTeam);

// Team membership routes
router.post('/:teamId/invite', teamController.inviteToTeam);
router.post('/:teamId/join', teamController.acceptInvitation);
router.get('/:teamId/members', teamController.getTeamMembers);
router.put('/:teamId/members/:userId', teamController.updateMemberRole);
router.delete('/:teamId/members/:userId', teamController.removeTeamMember);

// Error sharing routes
router.post('/:teamId/errors', teamController.shareError);
router.get('/:teamId/errors', teamController.getTeamErrors);
router.put('/:teamId/errors/:errorId', teamController.updateSharedError);
router.delete('/:teamId/errors/:errorId', teamController.deleteSharedError);

// Team dashboard and analytics
router.get('/:teamId/dashboard', teamController.getTeamDashboard);
router.get('/:teamId/analytics', teamController.getTeamAnalytics);

// Video chat routes
router.post('/:teamId/video/start', teamController.startVideoChat);
router.post('/:teamId/video/end', teamController.endVideoChat);

module.exports = router;