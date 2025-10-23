const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');

// Dodo Payments webhook endpoint
router.post('/dodo', subscriptionController.handleWebhook);

module.exports = router;