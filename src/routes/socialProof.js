/**
 * Social Proof Routes (E3)
 * 
 * Public endpoints for landing page social proof.
 * 
 * @ticket E3 – Social Proof Section on Landing
 * @epic EPIC E — Conversion Optimisation
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const socialProofController = require('../controllers/socialProofController');

/**
 * GET /api/social-proof
 * Get social proof data for landing page (public)
 */
router.get('/', socialProofController.getSocialProof);

/**
 * GET /api/social-proof/live
 * Get live activity feed (public)
 * Query: limit (optional) - number of activities
 */
router.get('/live', socialProofController.getLiveActivity);

/**
 * POST /api/social-proof/testimonial
 * Submit a testimonial (authenticated users only)
 * Body: { text, rating, allowPublic }
 */
router.post('/testimonial', authenticateToken, socialProofController.submitTestimonial);

module.exports = router;
