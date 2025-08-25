const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');

/**
 * @route GET /api/dashboard/stats
 * @desc Get dashboard statistics and recent trades
 * @access Private
 */
router.get('/stats', authMiddleware.verifyToken, dashboardController.getDashboardStats);

module.exports = router;
