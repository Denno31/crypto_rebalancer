const express = require('express');
const coinsController = require('../controllers/coins.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @route   GET /api/coins/available
 * @desc    Get list of available coins
 * @access  Private
 */
router.get('/available', authMiddleware.verifyToken, coinsController.getAvailableCoins);

module.exports = router;
