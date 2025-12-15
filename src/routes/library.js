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

// ============================================================================
// USER SOLUTIONS ROUTES - User-specific saved solutions
// ============================================================================

// Save user's own solution (separate from system library)
router.post('/user/solutions', authMiddleware, libraryController.saveUserSolution);

// Get user's saved solutions with filters
router.get('/user/solutions', authMiddleware, libraryController.getUserSolutions);

// Get combined library (user + system) for search
router.get('/user/combined-search', authMiddleware, libraryController.getCombinedLibrary);

// Delete user's solution
router.delete('/user/solutions/:id', authMiddleware, libraryController.deleteUserSolution);

// ============================================================================
// ADMIN ROUTES - Bulk add entries
// ============================================================================

// Bulk add system entries (admin only)
router.post('/admin/seed', authMiddleware, libraryController.seedLibrary);

// Bulk add entries from JSON
router.post('/admin/bulk-add', authMiddleware, libraryController.bulkAddEntries);

// ============================================================================
// LEARNING ROUTES - Self-learning library management
// ============================================================================

// Get learning statistics
router.get('/admin/learning/stats', authMiddleware, libraryController.getLearningStats);

// Process verification queue manually
router.post('/admin/learning/process-queue', authMiddleware, libraryController.processLearningQueue);

// ============================================================================
// USER-SPECIFIC LEARNING LIBRARY ROUTES
// Personal knowledge base - separate from system library
// ============================================================================

// Get user's personal learning library
router.get('/user/learning-library', authMiddleware, libraryController.getUserLearningLibrary);

// Get categories in user's learning library
router.get('/user/learning-library/categories', authMiddleware, libraryController.getUserLearningCategories);

// Get statistics for user's learning library
router.get('/user/learning-library/stats', authMiddleware, libraryController.getUserLearningStats);

// Get single entry from learning library
router.get('/user/learning-library/:id', authMiddleware, libraryController.getUserLearningEntry);

// Add to user's learning library
router.post('/user/learning-library', authMiddleware, libraryController.addToUserLearningLibrary);

// Update learning library entry
router.put('/user/learning-library/:id', authMiddleware, libraryController.updateUserLearningEntry);

// Delete from learning library
router.delete('/user/learning-library/:id', authMiddleware, libraryController.deleteFromUserLearningLibrary);

module.exports = router;
