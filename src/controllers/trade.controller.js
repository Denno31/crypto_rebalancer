/**
 * Trade Controller
 * Handles trade-related operations like selling to stablecoin
 */
const db = require('../models');
const ThreeCommasService = require('../services/threeCommas.service');
const ApiConfig = require('../models').apiConfig;
const Bot = db.bot;

/**
 * Sell a coin to a stablecoin (USDC/USDT)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.sellToStablecoin = async (req, res) => {
  try {
    const { botId, fromCoin, amount, targetStablecoin } = req.body;
    
    // Validate required parameters
    if (!botId) {
      return res.status(400).json({ success: false, message: 'Bot ID is required' });
    }
    
    if (!fromCoin) {
      return res.status(400).json({ success: false, message: 'Source coin is required' });
    }
    
    if (!targetStablecoin) {
      return res.status(400).json({ success: false, message: 'Target stablecoin is required' });
    }
    
    // Validate stablecoin is either USDC or USDT
    if (targetStablecoin !== 'USDC' && targetStablecoin !== 'USDT') {
      return res.status(400).json({ 
        success: false, 
        message: 'Target stablecoin must be either USDC or USDT' 
      });
    }
    
    // Get bot details
    const bot = await Bot.findByPk(botId);
    if (!bot) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }
    
    // Get API configuration for 3Commas
    const apiConfig = await ApiConfig.findOne({
      where: { userId: req.userId, exchange: 'threecommas' }
    });
    
    if (!apiConfig) {
      return res.status(404).json({ 
        success: false, 
        message: '3Commas API configuration not found' 
      });
    }
    
    // Initialize 3Commas client
    const threeCommasClient = new ThreeCommasService(
      apiConfig.apiKey,
      apiConfig.apiSecret
    );
    
    // Execute sell to stablecoin
    const [error, result] = await threeCommasClient.sellToStablecoin(
      bot.accountId,
      fromCoin,
      targetStablecoin,
      amount === 'max' ? null : parseFloat(amount),
      'live', // mode
      botId,  // botId for updating bot state
      db      // database connection
    );
    
    if (error) {
      console.error('Error selling to stablecoin:', error);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to sell ${fromCoin} to ${targetStablecoin}`, 
        error: error.message || error 
      });
    }
    
    return res.json({ 
      success: true, 
      message: `Successfully sold ${fromCoin} to ${targetStablecoin}`, 
      data: result 
    });
    
  } catch (error) {
    console.error('Error in sellToStablecoin controller:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
};
