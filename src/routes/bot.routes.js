const express = require('express');
const botController = require('../controllers/bot.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all bot routes
router.use(authMiddleware.verifyToken);

// Bot routes
router.get('/', botController.getAllBots);
router.post('/', botController.createBot);
router.get('/price/:coin', botController.getRealTimePrice); // Endpoint for real-time price fetching (must be before /:botId routes)
router.get('/:botId', botController.getBotById);
router.put('/:botId', botController.updateBot);
router.delete('/:botId', botController.deleteBot);
router.post('/:botId/toggle', botController.toggleBot);
router.get('/:botId/state', botController.getBotState);
router.get('/:botId/prices', botController.getBotPrices);
router.get('/:botId/trades', botController.getBotTrades);
router.get('/:botId/logs', botController.getBotLogs);
router.get('/:botId/trade-decision-logs', botController.getTradeDecisionLogs); // New endpoint for filtered trade decision logs
router.get('/:botId/assets', botController.getBotAssets);
router.get('/:botId/swap-decisions', botController.getBotSwapDecisions); // Endpoint for swap decisions tracking
router.post('/:botId/reset', botController.resetBot); // Endpoint for resetting a bot

module.exports = router;
