/**
 * Video Meeting Routes
 * Zoom-like video meeting features for Team tier
 */

const express = require('express');
const router = express.Router();
const videoMeetingController = require('../controllers/videoMeetingController');
const { authMiddleware } = require('../middleware/auth');
const { requireTier } = require('../middleware/tierAccess');

// All routes require authentication
router.use(authMiddleware);

// All video meeting routes require Team tier
router.use(requireTier('team'));

/**
 * @route   POST /api/teams/:teamId/meetings
 * @desc    Schedule a new meeting
 * @access  Team members only
 */
router.post('/:teamId/meetings', videoMeetingController.scheduleMeeting);

/**
 * @route   POST /api/teams/:teamId/meetings/instant
 * @desc    Start an instant meeting
 * @access  Team members only
 */
router.post('/:teamId/meetings/instant', videoMeetingController.startInstantMeeting);

/**
 * @route   GET /api/teams/:teamId/meetings
 * @desc    Get team's meetings (upcoming and past)
 * @access  Team members only
 */
router.get('/:teamId/meetings', videoMeetingController.getTeamMeetings);

/**
 * @route   GET /api/teams/:teamId/meetings/:meetingId
 * @desc    Get meeting details
 * @access  Team members only
 */
router.get('/:teamId/meetings/:meetingId', videoMeetingController.getMeetingDetails);

/**
 * @route   POST /api/teams/:teamId/meetings/:meetingId/join
 * @desc    Join a meeting
 * @access  Team members only
 */
router.post('/:teamId/meetings/:meetingId/join', videoMeetingController.joinMeeting);

/**
 * @route   POST /api/teams/:teamId/meetings/:meetingId/leave
 * @desc    Leave a meeting
 * @access  Team members only
 */
router.post('/:teamId/meetings/:meetingId/leave', videoMeetingController.leaveMeeting);

/**
 * @route   POST /api/teams/:teamId/meetings/:meetingId/end
 * @desc    End a meeting (host only)
 * @access  Team members only (host)
 */
router.post('/:teamId/meetings/:meetingId/end', videoMeetingController.endMeeting);

/**
 * @route   PATCH /api/teams/:teamId/meetings/:meetingId/notes
 * @desc    Update meeting notes (collaborative)
 * @access  Team members only
 */
router.patch('/:teamId/meetings/:meetingId/notes', videoMeetingController.updateNotes);

/**
 * @route   POST /api/teams/:teamId/meetings/:meetingId/chat
 * @desc    Add chat message
 * @access  Team members only
 */
router.post('/:teamId/meetings/:meetingId/chat', videoMeetingController.addChatMessage);

/**
 * @route   POST /api/teams/:teamId/meetings/:meetingId/share-error
 * @desc    Share error context in meeting
 * @access  Team members only
 */
router.post('/:teamId/meetings/:meetingId/share-error', videoMeetingController.shareErrorContext);

module.exports = router;
