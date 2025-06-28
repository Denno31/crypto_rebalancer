const db = require('../models');
const Bot = db.bot;
const PriceHistory = db.priceHistory;
const Trade = db.trade;
const LogEntry = db.logEntry;
const { Op } = require('sequelize');

// Helper functions
const botToResponse = (bot) => {
  const coinsArray = bot.getCoinsArray();
  return {
    id: bot.id,
    name: bot.name,
    enabled: bot.enabled,
    coins: coinsArray,
    thresholdPercentage: bot.thresholdPercentage,
    checkInterval: bot.checkInterval,
    initialCoin: bot.initialCoin,
    currentCoin: bot.currentCoin,
    accountId: bot.accountId,
    lastCheckTime: bot.lastCheckTime,
    activeTradeId: bot.activeTradeId,
    userId: bot.userId,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    referenceCoin: bot.referenceCoin,
    globalPeakValue: bot.globalPeakValue,
    minAcceptableValue: bot.minAcceptableValue
  };
};

// Get all bots for user
exports.getAllBots = async (req, res) => {
  try {
    const bots = await Bot.findAll({
      where: { userId: req.userId }
    });
    
    return res.json(bots.map(bot => botToResponse(bot)));
  } catch (error) {
    console.error('Error getting bots:', error);
    return res.status(500).json({
      message: "Error getting bots",
      error: error.message
    });
  }
};

// Get single bot by ID
exports.getBotById = async (req, res) => {
  try {
    const botId = req.params.botId;
    
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    return res.json(botToResponse(bot));
  } catch (error) {
    console.error('Error getting bot:', error);
    return res.status(500).json({
      message: "Error getting bot",
      error: error.message
    });
  }
};

// Create new bot
exports.createBot = async (req, res) => {
  try {
    console.log(req.body)
    const { 
      name, 
      enabled, 
      coins, 
      threshold_percentage, 
      check_interval, 
      initial_coin, 
      account_id,
      price_source
    } = req.body;
    
    // Validate required fields
    if (!name || !coins || !threshold_percentage || !check_interval || !account_id) {
      return res.status(400).json({
        message: "Missing required fields"
      });
    }
    
    // Create new bot
    const newBot = await Bot.create({
      name,
      enabled: enabled !== false, // Default to true if not specified
      coins: Array.isArray(coins) ? coins.join(',') : coins, // Handle both array and comma-separated string
      thresholdPercentage: threshold_percentage,
      checkInterval: check_interval,
      initialCoin: initial_coin,
      accountId: account_id,
      priceSource: price_source,
      userId: req.userId
    });
    
    return res.status(201).json(botToResponse(newBot));
  } catch (error) {
    console.error('Error creating bot:', error);
    return res.status(500).json({
      message: "Error creating bot",
      error: error.message
    });
  }
};

// Update bot by ID
exports.updateBot = async (req, res) => {
  try {

    const botId = req.params.botId;
    
    // Find bot and ensure it belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId 
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    // Update fields from request body
    const updateData = { ...req.body };
    
    // Handle coins field specially if it's an array
    if (updateData.coins && Array.isArray(updateData.coins)) {
      updateData.coins = updateData.coins.join(',');
    }
    
    // Update the bot
    await bot.update(updateData);
    
    return res.json(botToResponse(bot));
  } catch (error) {
    console.error('Error updating bot:', error);
    return res.status(500).json({
      message: "Error updating bot",
      error: error.message
    });
  }
};

// Delete bot by ID
exports.deleteBot = async (req, res) => {
  try {
    const botId = req.params.botId;
    
    // Find bot and ensure it belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    // Delete the bot
    await bot.destroy();
    
    return res.json({
      message: "Bot deleted successfully"
    });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return res.status(500).json({
      message: "Error deleting bot",
      error: error.message
    });
  }
};

// Toggle bot enabled status
exports.toggleBot = async (req, res) => {
  try {
    const botId = req.params.botId;
    
    // Find bot and ensure it belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    // Toggle enabled status
    await bot.update({ enabled: !bot.enabled });
    
    return res.json({
      enabled: bot.enabled
    });
  } catch (error) {
    console.error('Error toggling bot:', error);
    return res.status(500).json({
      message: "Error toggling bot",
      error: error.message
    });
  }
};

// Get bot state (including price source info)
exports.getBotState = async (req, res) => {
  try {
    const botId = req.params.botId;
    
    // Find bot and ensure it belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    // Create response object
    const botState = botToResponse(bot);
    
    // Add price source information
    botState.priceSource = bot.priceSource || "three_commas";
    botState.priceSourceStatus = true;
    
    // Get latest price update
    const latestPrice = await PriceHistory.findOne({
      where: { botId },
      order: [['timestamp', 'DESC']]
    });
    
    if (latestPrice) {
      botState.lastPriceUpdate = latestPrice.timestamp;
      botState.lastPriceSource = latestPrice.source || botState.priceSource;
    } else {
      botState.lastPriceUpdate = null;
      botState.lastPriceSource = null;
    }
    
    return res.json(botState);
  } catch (error) {
    console.error('Error getting bot state:', error);
    return res.status(500).json({
      message: "Error getting bot state",
      error: error.message
    });
  }
};

// Get price history for a bot
exports.getBotPrices = async (req, res) => {
  try {
    const botId = req.params.botId;
    const fromTime = req.query.fromTime ? new Date(req.query.fromTime) : null;
    const toTime = req.query.toTime ? new Date(req.query.toTime) : null;
    
    // Build query
    const query = { botId };
    
    if (fromTime) {
      query.timestamp = { ...query.timestamp, [Op.gte]: fromTime };
    }
    
    if (toTime) {
      query.timestamp = { ...query.timestamp, [Op.lte]: toTime };
    }
    
    // Get prices
    const prices = await PriceHistory.findAll({
      where: query,
      order: [['timestamp', 'DESC']],
      limit: 1000
    });
    
    return res.json(prices);
  } catch (error) {
    console.error('Error getting bot prices:', error);
    return res.status(500).json({
      message: "Error getting bot prices",
      error: error.message
    });
  }
};

// Get trades for a bot
exports.getBotTrades = async (req, res) => {
  try {
    const botId = req.params.botId;
    const status = req.query.status;
    const limit = parseInt(req.query.limit) || 100;
    
    // Build query
    const query = { botId };
    
    if (status) {
      query.status = status;
    }
    
    // Get trades
    const trades = await Trade.findAll({
      where: query,
      order: [['executedAt', 'DESC']],
      limit
    });
    
    return res.json(trades);
  } catch (error) {
    console.error('Error getting bot trades:', error);
    return res.status(500).json({
      message: "Error getting bot trades",
      error: error.message
    });
  }
};

// Get logs for a bot
exports.getBotLogs = async (req, res) => {
  try {
    const botId = req.params.botId;
    const level = req.query.level;
    const limit = parseInt(req.query.limit) || 100;
    
    // Build query
    const query = { botId };
    
    if (level) {
      query.level = level.toUpperCase();
    }
    
    // Get logs
    const logs = await LogEntry.findAll({
      where: query,
      order: [['timestamp', 'DESC']],
      limit
    });
    
    return res.json(logs);
  } catch (error) {
    console.error('Error getting bot logs:', error);
    return res.status(500).json({
      message: "Error getting bot logs",
      error: error.message
    });
  }
};
