const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const { authMiddleware } = require('../middleware/auth');

// All history routes require authentication
router.use(authMiddleware);

// Get error query history with pagination and filtering
router.get('/', historyController.getHistory);

// Get user history with advanced filtering
router.get('/user', historyController.getUserHistory);

// Get user statistics
router.get('/stats', historyController.getUserStats);

// Get specific query by ID
router.get('/:queryId', historyController.getQueryById);

// Delete specific query
router.delete('/:queryId', historyController.deleteQuery);

module.exports = router;
