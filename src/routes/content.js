/**
 * Content Routes
 * Routes for Privacy Policy, Terms, About, Community, etc.
 */

const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');

/**
 * Public content routes
 */
router.get('/privacy', contentController.getPrivacyPolicy);
router.get('/terms', contentController.getTermsOfService);
router.get('/about', contentController.getAboutContent);
router.get('/community', contentController.getCommunityInfo);

module.exports = router;
