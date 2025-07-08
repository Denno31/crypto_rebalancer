const express = require('express');
const router = express.Router();
const deviationController = require('../controllers/deviation.controller');

/**
 * @route GET /api/deviations/bots/:botId
 * @desc Get coin deviation data for a specific bot
 * @access Private
 * @params {botId} - Bot ID
 * @query {from} - Start date (optional)
 * @query {to} - End date (optional)
 * @query {baseCoin} - Filter by base coin (optional)
 * @query {targetCoin} - Filter by target coin (optional)
 * @returns {Object} - Deviation data for charting
 */
router.get('/bots/:botId', deviationController.getBotDeviations);

module.exports = router;
