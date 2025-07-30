const express = require('express');
const snapshotController = require('../controllers/snapshot.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @route   GET /api/snapshots/bots/:botId/price-comparison
 * @desc    Get price comparison between initial snapshots and current prices
 * @access  Private
 */
router.get('/bots/:botId/price-comparison', authMiddleware.verifyToken, snapshotController.getPriceComparison);

/**
 * @route   GET /api/snapshots/bots/:botId/historical-comparison
 * @desc    Get historical price data with snapshot reference points
 * @access  Private
 */
router.get('/bots/:botId/historical-comparison', authMiddleware.verifyToken, snapshotController.getHistoricalComparison);

module.exports = router;
