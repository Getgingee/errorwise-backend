/**
 * Error Library Routes
 * 
 * API endpoints for browsing, searching, and managing error library.
 */

const express = require('express');
const router = express.Router();
const libraryController = require('../controllers/libraryController');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// ============================================================================
// PUBLIC ROUTES (no auth required)
// ============================================================================

// Browse/search library
router.get('/', libraryController.browseLibrary);

// Get popular entries
router.get('/popular', libraryController.getPopular);

// Get all categories with counts
router.get('/categories', libraryController.getCategories);

// Find matching solution for error message
router.get('/match', libraryController.findMatch);

// Get single entry (public)
router.get('/:id', libraryController.getEntry);

// Feedback (can be anonymous)
router.post('/:id/feedback', libraryController.submitFeedback);
router.post('/:id/use', libraryController.markUsed);

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Save template from solved error
router.post('/save', authMiddleware, libraryController.saveTemplate);

// Get user's saved templates
router.get('/user/my-templates', authMiddleware, libraryController.getMyTemplates);

// Delete user template
router.delete('/:id', authMiddleware, libraryController.deleteTemplate);

module.exports = router;
