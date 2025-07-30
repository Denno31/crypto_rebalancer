const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const router = express.Router();

// Apply auth middleware to all trade routes
router.use(authMiddleware.verifyToken);

// Import controllers
const tradeController = require('../controllers/trade.controller');

// Trade routes
router.post('/sell-to-stablecoin', tradeController.sellToStablecoin);

module.exports = router;
