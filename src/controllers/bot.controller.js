const db = require('../models');
const Bot = db.bot;
const BotAsset = db.botAsset;
const PriceHistory = db.priceHistory;
const Trade = db.trade;
const LogEntry = db.logEntry;
const ApiConfig = db.apiConfig;
const { Op } = require('sequelize');
const ThreeCommasService = require('../services/threeCommas.service');
const priceService = require('../services/price.service');

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
    minAcceptableValue: bot.minAcceptableValue,
    allocationPercentage: bot.allocationPercentage,
    manualBudgetAmount: bot.manualBudgetAmount,
    preferredStablecoin: bot.preferredStablecoin || 'USDT'
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
      price_source,
      allocation_percentage,
      manual_budget_amount,
      preferred_stablecoin
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
      thresholdPercentage: parseFloat(threshold_percentage) || 0,
      checkInterval: parseInt(check_interval) || 0,
      initialCoin: initial_coin,
      accountId: account_id,
      priceSource: price_source,
      // Handle empty strings for numeric fields by converting to null
      allocationPercentage: allocation_percentage === '' ? null : parseFloat(allocation_percentage),
      manualBudgetAmount: manual_budget_amount === '' ? null : parseFloat(manual_budget_amount),
      preferredStablecoin: preferred_stablecoin || 'USDT',
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
    
    // Handle numeric fields to prevent PostgreSQL type errors
    if (updateData.threshold_percentage !== undefined) {
      updateData.thresholdPercentage = updateData.threshold_percentage === '' ? null : parseFloat(updateData.threshold_percentage);
      delete updateData.threshold_percentage;
    }
    
    if (updateData.check_interval !== undefined) {
      updateData.checkInterval = updateData.check_interval === '' ? null : parseInt(updateData.check_interval);
      delete updateData.check_interval;
    }
    
    if (updateData.allocation_percentage !== undefined) {
      updateData.allocationPercentage = updateData.allocation_percentage === '' ? null : parseFloat(updateData.allocation_percentage);
      delete updateData.allocation_percentage;
    }
    
    if (updateData.manual_budget_amount !== undefined) {
      updateData.manualBudgetAmount = updateData.manual_budget_amount === '' ? null : parseFloat(updateData.manual_budget_amount);
      delete updateData.manual_budget_amount;
    }
    
    // Ensure stablecoin has a default
    if (updateData.preferred_stablecoin !== undefined) {
      updateData.preferredStablecoin = updateData.preferred_stablecoin || 'USDT';
      delete updateData.preferred_stablecoin;
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
    
    // Build query - use snake_case 'bot_id' instead of camelCase 'botId'
    // This matches the actual column name in the database
    const query = { bot_id: botId };
    
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

// Get real-time asset data for a bot
exports.getBotAssets = async (req, res) => {
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
    
    // Get API config
    const apiConfig = await ApiConfig.findOne({
      where: {
        name: '3commas',
        userId: req.userId
      }
    });
    
    if (!apiConfig) {
      return res.status(404).json({
        message: "3Commas API configuration not found"
      });
    }
    
    // Initialize 3commas client
    const threeCommasClient = new ThreeCommasService(
      apiConfig.apiKey,
      apiConfig.apiSecret
    );
    
    // Get bot assets from database
    const botAssets = await BotAsset.findAll({
      where: { botId },
      order: [['updatedAt', 'DESC']]
    });
    
    // If we have a current coin, ensure we get up-to-date USDT value
    let updatedAssets = [...botAssets];
    
    if (bot.currentCoin) {
      try {
        // Get preferred stablecoin or default to USDT
        const stablecoin = bot.preferredStablecoin || 'USDT';
        
        // Get latest price in the preferred stablecoin
        const { price } = await priceService.getPrice(
          { pricingSource: '3commas', fallbackSource: 'coingecko' },
          { apiKey: apiConfig.apiKey, apiSecret: apiConfig.apiSecret },
          bot.currentCoin,
          stablecoin,
          botId
        );
        
        // Find or create asset record for current coin
        let currentAsset = botAssets.find(asset => asset.coin === bot.currentCoin);
        
        // If bot has a current coin but no asset record, create one with estimated data
        if (!currentAsset) {
          // Attempt to get balance from 3Commas
          const [error, accountData] = await threeCommasClient.request('accounts', bot.accountId);
          
          if (!error && accountData && accountData.balances) {
            const coinBalance = accountData.balances.find(b => b.currency_code === bot.currentCoin);
            
            if (coinBalance && parseFloat(coinBalance.amount) > 0) {
              // Create asset record
              const amount = parseFloat(coinBalance.amount);
              const stablecoinEquivalent = amount * price;
              
              currentAsset = await BotAsset.create({
                botId,
                coin: bot.currentCoin,
                amount,
                entryPrice: price,
                usdtEquivalent: stablecoinEquivalent, // Keep field name for DB compatibility
                stablecoin: stablecoin,
                lastUpdated: new Date()
              });
              
              updatedAssets.push(currentAsset);
            }
          }
        } else {
          // Update existing asset with current stablecoin value
          const stablecoinEquivalent = currentAsset.amount * price;
          await currentAsset.update({
            usdtEquivalent: stablecoinEquivalent, // Keep field name for DB compatibility
            stablecoin: stablecoin, // Update stablecoin info
            lastUpdated: new Date()
          });
          
          // Update in our response array
          const assetIndex = updatedAssets.findIndex(a => a.id === currentAsset.id);
          if (assetIndex >= 0) {
            updatedAssets[assetIndex] = {
              ...updatedAssets[assetIndex].dataValues,
              usdtEquivalent: stablecoinEquivalent,
              stablecoin: stablecoin,
              lastUpdated: new Date()
            };
          }
        }
      } catch (priceError) {
        console.error(`Error updating asset price: ${priceError.message}`);
        // Continue with existing data
      }
    }
    
    return res.json({
      botId: bot.id,
      currentCoin: bot.currentCoin,
      assets: updatedAssets.map(asset => ({
        id: asset.id,
        coin: asset.coin,
        amount: asset.amount,
        usdtEquivalent: asset.usdtEquivalent,
        entryPrice: asset.entryPrice,
        lastUpdated: asset.lastUpdated
      }))
    });
  } catch (error) {
    console.error('Error getting bot assets:', error);
    return res.status(500).json({
      message: "Error getting bot assets",
      error: error.message
    });
  }
};
