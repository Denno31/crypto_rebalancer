const db = require('../models');
const Bot = db.bot;
const BotAsset = db.botAsset;
const PriceHistory = db.priceHistory;
const Trade = db.trade;
const LogEntry = db.logEntry;
const ApiConfig = db.apiConfig;
const BotSwapDecision = db.botSwapDecision;
const { Op } = require('sequelize');
const ThreeCommasService = require('../services/threeCommas.service');
const priceService = require('../services/price.service');
const botResetService = require('../services/botReset.service');

const threeCommasClientService = async (req) =>{
  const apiConfig = await ApiConfig.findOne({ where: { userId: req.userId,name:'3commas' } });
  if(!apiConfig){
    throw new Error('No API config found for user');
  }
  const threeCommasService = new ThreeCommasService(apiConfig.apiKey,apiConfig.apiSecret);
  return threeCommasService;
}

// Helper functions
const botToResponse = (bot, currentAsset = null) => {
  const coinsArray = bot.getCoinsArray();
  
  // Calculate trade stats if trades are available
  let totalTrades = 0;
  let successfulTrades = 0;
  let successRate = 0;
  
  if (bot.trades && Array.isArray(bot.trades)) {
    totalTrades = bot.trades.length;
    successfulTrades = bot.trades.filter(trade => 
      trade.status === 'completed' || trade.status === 'success'
    ).length;
    successRate = totalTrades > 0 ? Math.round((successfulTrades / totalTrades) * 100) : 0;
  }
  
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
    lastTradeTime: bot.lastTradeTime,
    userId: bot.userId,
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    tradingStrategy: bot.tradingStrategy || 'default',
    exchangeName: bot.exchangeName,
    pricingSource: bot.pricingSource || '3commas',
    fallbackPricingSource: bot.fallbackPricingSource || 'coingecko',
    preferredStablecoin: bot.preferredStablecoin || 'USDT',
    protectionEnabled: bot.protectionEnabled || false,
    protectionThreshold: bot.protectionThreshold || 10,
    protectionCooldownMinutes: bot.protectionCooldownMinutes || 1440,
    protectionTriggered: bot.protectionTriggered || false,
    protectionCooldownUntil: bot.protectionCooldownUntil,
    globalPeakValue: bot.globalPeakValue,
    minAcceptableValue: bot.minAcceptableValue,
    isLocked: bot.isLocked || false,
    errorState: bot.errorState,
    errorCount: bot.errorCount || 0,
    takeProfitPercentage: bot.takeProfitPercentage,
    manualBudgetAmount: bot.manualBudgetAmount,
    // Add trade stats
    tradeStats: {
      totalTrades,
      successfulTrades,
      successRate
    },
    useTakeProfit: bot.useTakeProfit || false,
    // Add current asset info if available
    currentAsset: currentAsset ? {
      coin: currentAsset.coin,
      amount: currentAsset.amount,
      usdtEquivalent: currentAsset.usdtEquivalent,
      entryPrice: currentAsset.entryPrice,
      realTimeUsdtEquivalent: currentAsset.realTimeUsdtEquivalent,
      profit: currentAsset.profit,
      profitPercentage: currentAsset.profitPercentage
    } : null
  };
};

// Get all bots for user
const getAllBots = async (req, res) => {
  try {
    const bots = await Bot.findAll({
      where: { userId: req.userId },
      include: [
        {
          model: BotAsset,
          required: false,
          attributes: ['coin', 'amount', 'entryPrice', 'usdtEquivalent', 'lastUpdated', 'stablecoin']
        },
        {
          model: Trade,
          as: 'trades',
          attributes: ['id', 'status', 'fromCoin', 'toCoin', 'amount', 'executedAt'],
          limit: 10,
          order: [['executedAt', 'DESC']]
        }
      ]
    });

    // Collect all unique coins across bots (excluding stablecoins)
    const coins = [...new Set(
      bots
        .map(bot => bot.currentCoin)
        .filter(coin => coin && !['USDT', 'USDC', 'BUSD', 'DAI'].includes(coin))
    )];
    const systemConfig = await db.systemConfig.findOne();
    const apiConfig = await ApiConfig.findOne({ 
      where: { userId: req.userId, name: '3commas' } 
    });

    // Fetch prices in parallel using existing getPrice
    const priceEntries = await Promise.all(
      coins.map(async coin => {
        try {
          const { price, source } = await priceService.getPrice(
            systemConfig, 
            apiConfig, 
            coin, 
            'USDT'
          );
          return [coin, { price, source }];
        } catch (err) {
          console.error(`Error fetching price for ${coin}:`, err.message);
          return [coin, null];
        }
      })
    );
    const priceData = Object.fromEntries(priceEntries); // { BTC: {price, source}, ETH: {...} }

    // Try to get exchange info from 3Commas
    let accounts = [];
    try {
      const client = await threeCommasClientService(req);
      const [error, accountsData] = await client.getAccounts();
      if (!error) accounts = accountsData;
    } catch (apiError) {
      console.error('Error getting 3Commas accounts:', apiError);
    }

    // Map bots to response format
    const botsResponse = bots.map(bot => {
      let currentAsset = null;
      if (bot.botAssets && bot.botAssets.length > 0) {
        currentAsset = bot.botAssets.find(asset => asset.coin === bot.currentCoin);
      }

      const botResponse = botToResponse(bot, currentAsset);

      // Add real-time price if available
      if (bot.currentCoin) {
        if (['USDT', 'USDC', 'BUSD', 'DAI'].includes(bot.currentCoin)) {
          botResponse.realTimePrice = 1; // stablecoins
        } else {
          botResponse.realTimePrice = priceData[bot.currentCoin]?.price || null;
          botResponse.priceSource = priceData[bot.currentCoin]?.source || null;
          // add profit/loss depending on the current price * units being held. Also add the units value
          if (currentAsset) {
            botResponse.realTimeUsdtEquivalent = currentAsset.amount * botResponse.realTimePrice;
            botResponse.profit = botResponse.realTimeUsdtEquivalent - currentAsset.usdtEquivalent;
            botResponse.profitPercentage = (botResponse.profit / currentAsset.usdtEquivalent) * 100;
          }
        }
      }

      // Add exchange info
      const account = accounts.find(account => account.id == bot.accountId);
      if (account) {
        botResponse.exchangeName = account.exchange_name;
        botResponse.exchangeIcon = account.market_icon;
      }

      // Include trades + botAssets
      botResponse.trades = bot.trades || [];
      botResponse.botAssets = bot.botAssets || [];

      return botResponse;
    });

    return res.json(botsResponse);
  } catch (error) {
    console.error('Error getting bots:', error);
    return res.status(500).json({
      message: "Error getting bots",
      error: error.message
    });
  }
};



// Get single bot by ID
const getBotById = async (req, res) => {
  try {
    const botId = req.params.botId;
    let botAccountData = null;
    // Find bot and ensure it belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      },
      include: [
        {
          model: Trade,
          as: 'trades',
          attributes: ['id', 'status', 'fromCoin', 'toCoin', 'amount', 'executedAt'],
          limit: 10,
          order: [['executedAt', 'DESC']]
        },{
          model: BotAsset,
          as: 'botAssets',
          attributes: ['coin', 'amount', 'entryPrice', 'usdtEquivalent', 'lastUpdated', 'stablecoin']
        }
      ]
    });
    

    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    // Get current asset info if available
    let currentAsset = null;
    
    if (bot.currentCoin) {
      // Get API config
      const apiConfig = await ApiConfig.findOne({
        where: {
          name: '3commas',
          userId: req.userId
        }
      });
      
      if (apiConfig) {
        // Initialize 3commas client
        const threeCommasClient = new ThreeCommasService(
          apiConfig.apiKey,
          apiConfig.apiSecret
        );
        
        try {
          // Get account info from 3Commas
          const [error, accountData] = await threeCommasClient.request('accounts', bot.accountId);
          botAccountData = accountData;
          if (!error && accountData) {
            // Check if balances property exists in the account data
            if (accountData.balances) {
              // Get current coin balance
              const coinBalance = accountData.balances.find(b => b.currency_code === bot.currentCoin);
              
              if (coinBalance) {
                currentAsset = {
                  coin: bot.currentCoin,
                  amount: parseFloat(coinBalance.amount),
                  usdtEquivalent: parseFloat(coinBalance.usd_value),
                  entryPrice: 0 // We don't have this from 3Commas
                };
              }
            } else {
              console.log('Account data does not contain balances property:', Object.keys(accountData));
              // Fallback to default asset info or try alternative API
              // get realtime price
              const { price } = await priceService.getPrice(
                { pricingSource: '3commas', fallbackSource: 'coingecko' },
                { apiKey: threeCommasClient.apiKey, apiSecret: threeCommasClient.apiSecret },
                bot.currentCoin,
                'USDT',
                bot.id
              );
              
              const botUnits = bot.botAssets.find(asset => asset.coin === bot.currentCoin)?.amount
              currentAsset = {
                coin: bot.currentCoin,
                amount: botUnits,
                usdtEquivalent: bot.botAssets.find(asset => asset.coin === bot.currentCoin)?.usdtEquivalent,
                entryPrice: bot.botAssets.find(asset => asset.coin === bot.currentCoin)?.entryPrice,
                realTimeUsdtEquivalent: botUnits * price,
                profit: botUnits * price - bot.botAssets.find(asset => asset.coin === bot.currentCoin).usdtEquivalent,
                profitPercentage: ((botUnits * price - bot.botAssets.find(asset => asset.coin === bot.currentCoin).usdtEquivalent) / bot.botAssets.find(asset => asset.coin === bot.currentCoin).usdtEquivalent) * 100
              };
            }
          }
        } catch (error) {
          console.error('Error getting account info:', error);
          // Continue without asset info
        }
      }
    }
  
    const botResponse = botToResponse(bot, currentAsset);
    botResponse.exchangeName = botAccountData?.exchange_name;
    botResponse.exchangeIcon = botAccountData?.market_icon;
    // Return bot with current asset info
    return res.json(botResponse);
  } catch (error) {
    console.error('Error getting bot:', error);
    return res.status(500).json({
      message: "Error getting bot",
      error: error.message
    });
  }
};

// Create new bot
const createBot = async (req, res) => {
  try {
    // Extract bot data from request
    console.log(req.body);
    const { 
      name, 
      enabled, 
      coins, 
      thresholdPercentage, 
      checkInterval, 
      initialCoin, 
      accountId,
      priceSource,
      allocationPercentage,
      manualBudgetAmount,
      preferredStablecoin,
      takeProfitPercentage,
      useTakeProfit
    } = req.body;
    
   
    
    // Validate required fields
    
    if (!name || !coins || !thresholdPercentage || !checkInterval || !initialCoin || !accountId) {
      return res.status(400).json({
        message: "Missing required fields"
      });
    }
    
    // Validate take profit settings
    if (useTakeProfit === true && (!takeProfitPercentage || isNaN(parseFloat(takeProfitPercentage)) || parseFloat(takeProfitPercentage) <= 0)) {
      return res.status(400).json({
        message: "When take profit is enabled, a valid take profit percentage greater than 0 must be provided"
      });
    }
    
    // Create bot
    const newBot = await Bot.create({
      name,
      enabled: enabled !== false, // Default to true if not specified
      coins: Array.isArray(coins) ? coins.join(',') : coins, // Handle both array and comma-separated string
      thresholdPercentage: parseFloat(thresholdPercentage) || 0,
      checkInterval: parseInt(checkInterval) || 0,
      initialCoin: initialCoin,
      accountId: accountId,
      priceSource: priceSource,
      // Handle empty strings for numeric fields by converting to null
      allocationPercentage: allocationPercentage === '' ? null : parseFloat(allocationPercentage),
      manualBudgetAmount: manualBudgetAmount === '' ? null : parseFloat(manualBudgetAmount),
      takeProfitPercentage: takeProfitPercentage === '' || isNaN(parseFloat(takeProfitPercentage)) ? null : parseFloat(takeProfitPercentage),
      useTakeProfit: useTakeProfit === true, // Convert to boolean
      preferredStablecoin: preferredStablecoin || 'USDT',
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
const updateBot = async (req, res) => {
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
    
    // Validate take profit settings
    if (updateData.useTakeProfit === true && 
        (!updateData.takeProfitPercentage || 
         isNaN(parseFloat(updateData.takeProfitPercentage)) || 
         parseFloat(updateData.takeProfitPercentage) <= 0)) {
      return res.status(400).json({
        message: "When take profit is enabled, a valid take profit percentage greater than 0 must be provided"
      });
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
    
    if (updateData.take_profit_percentage !== undefined) {
      updateData.takeProfitPercentage = updateData.take_profit_percentage === '' || isNaN(parseFloat(updateData.take_profit_percentage)) ? null : parseFloat(updateData.take_profit_percentage);
      delete updateData.take_profit_percentage;
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
const deleteBot = async (req, res) => {
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
    
    // Delete bot
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
const toggleBot = async (req, res) => {
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
    await bot.update({
      enabled: !bot.enabled
    });
    
    // Get updated bot
    const updatedBot = await Bot.findByPk(botId);
    
    return res.json(botToResponse(updatedBot));
  } catch (error) {
    console.error('Error toggling bot:', error);
    return res.status(500).json({
      message: "Error toggling bot",
      error: error.message
    });
  }
};

// Get bot state (including price source info)
const getBotState = async (req, res) => {
  try {
    const botId = req.params.botId;
    console.log({botId})
    // Find bot and ensure it belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      }
    });

    console.log(bot.takeProfitPercentage)
    
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
    
    // Get current coin price
    const currentCoin = bot.currentCoin;
    const stablecoin = bot.preferredStablecoin || 'USDT';
    
    if (!currentCoin) {
      return res.json({
        ...botToResponse(bot),
        currentPrice: null,
        priceSource: null,
        takeProfitPercentage: bot.takeProfitPercentage
      });
    }
    
    try {
      // Get price using configured sources
      const { price, source } = await priceService.getPrice(
        { 
          pricingSource: bot.pricingSource || '3commas', 
          fallbackSource: bot.fallbackPricingSource || 'coingecko' 
        },
        { apiKey: apiConfig.apiKey, apiSecret: apiConfig.apiSecret },
        currentCoin,
        stablecoin,
        botId
      );
      
      return res.json({
        ...botToResponse(bot),
        currentPrice: price,
        priceSource: source
      });
    } catch (priceError) {
      console.error('Error getting price:', priceError);
      return res.json({
        ...botToResponse(bot),
        currentPrice: null,
        priceSource: null,
        priceError: priceError.message
      });
    }
  } catch (error) {
    console.error('Error getting bot state:', error);
    return res.status(500).json({
      message: "Error getting bot state",
      error: error.message
    });
  }
};

// Get price history for a bot
const getBotPrices = async (req, res) => {
  try {
    const botId = req.params.botId;
    const fromTime = req.query.fromTime ? new Date(req.query.fromTime) : null;
    const toTime = req.query.toTime ? new Date(req.query.toTime) : null;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    
    // Build query
    const query = { botId };
    
    if (fromTime) {
      query.timestamp = { ...query.timestamp, [Op.gte]: fromTime };
    }
    
    if (toTime) {
      query.timestamp = { ...query.timestamp, [Op.lte]: toTime };
    }
    
    // Create a separate query for price history to include reset count
    const priceQuery = { ...query };
    
    // Get bot's current reset count if we have a botId
    if (botId) {
      const bot = await Bot.findByPk(botId);
      if (bot) {
        // Add reset_count to query to filter pre-reset data
        priceQuery.resetCount = bot.resetCount || 0;
      }
    }
    
    // Get prices
    const prices = await PriceHistory.findAll({
      where: priceQuery,
      order: [['timestamp', 'DESC']],
      limit,
      offset: (page - 1) * limit
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
const getBotTrades = async (req, res) => {
  try {
    const botId = req.params.botId;
    const status = req.query.status;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    
    // Build query
    const query = { botId };
    
    if (status) {
      query.status = status;
    }
    
    // Get bot's current reset count if we have a botId
    if (botId) {
      const bot = await Bot.findByPk(botId);
      if (bot) {
        // Add reset_count to query to filter pre-reset data
        query.resetCount = bot.resetCount || 0;
      }
    }
    
    // Get trades
    const trades = await Trade.findAll({
      where: query,
      order: [['executedAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
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
const getBotLogs = async (req, res) => {
  try {
    const botId = req.params.botId;
    const level = req.query.level;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    
    // Build query - use snake_case 'bot_id' instead of camelCase 'botId'
    // This matches the actual column name in the database
    const query = { bot_id: botId };
    
    if (level) {
      query.level = level.toUpperCase();
    }
    
    // Make a separate query for logs to include reset count
    const logQuery = { ...query };
    
    // Get bot's current reset count if we have a botId
    if (botId) {
      const bot = await Bot.findByPk(botId);
      if (bot) {
        // Add reset_count to query to filter pre-reset data
        logQuery.resetCount = bot.resetCount || 0;
      }
    }
    
    // Get logs
    const logs = await LogEntry.findAll({
      where: logQuery,
      order: [['timestamp', 'DESC']],
      limit,
      offset: (page - 1) * limit
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

// Get trade decision logs for a bot - filtered on the server side for security
const getTradeDecisionLogs = async (req, res) => {
  
  try {
    const botId = req.params.botId;
    const limit = parseInt(req.query.limit) || 100;
    
    // Build query - use snake_case 'bot_id' instead of camelCase 'botId'
    // After our updates, we now have a dedicated 'TRADE' level for trade decisions
    const query = { 
      bot_id: botId,
      level: 'TRADE' // Filter by the new TRADE level
    };
    
    // Get trade logs for this bot
    const logs = await LogEntry.findAll({
      where: query,
      order: [['timestamp', 'DESC']],
      limit: limit * 3 // Get more logs than we need to ensure we have enough for grouping
    });
    
  
    
    // With the TRADE level filter, all logs should be trade decisions
    // For backward compatibility, we'll keep the message filter for older logs
    const tradeDecisionLogs = logs.filter(log => 
      log.level === 'TRADE' || // New way - explicit TRADE level
      log.message.includes('Found') || 
      log.message.includes('didn\'t qualify') || 
      log.message.includes('deviation') ||
      log.message.includes('threshold') ||
      log.message.includes('TRADE PREVENTED') ||
      log.message.includes('Portfolio value check')
    );
    
    // Group logs by check sessions (using timestamps with a 5-second window)
    const logGroups = [];
    let currentGroup = [];
    let lastTimestamp = null;

    tradeDecisionLogs.forEach(log => {
      const logTime = new Date(log.timestamp).getTime();
      
      // If this is a new log group (more than 5 seconds from the previous log)
      if (!lastTimestamp || (logTime - lastTimestamp > 5000)) {
        if (currentGroup.length > 0) {
          logGroups.push([...currentGroup]);
        }
        currentGroup = [log];
      } else {
        currentGroup.push(log);
      }
      
      lastTimestamp = logTime;
    });
    
    // Add the last group if it exists
    if (currentGroup.length > 0) {
      logGroups.push(currentGroup);
    }
    
    // Limit to requested number of groups
    const limitedGroups = logGroups.slice(0, limit);
    
    return res.json(limitedGroups);
  } catch (error) {
    console.error('Error getting trade decision logs:', error);
    return res.status(500).json({
      message: "Error getting trade decision logs",
      error: error.message
    });
  }
};

// Get swap decisions for a bot
const getBotSwapDecisions = async (req, res) => {
  const botId = req.params.botId;
  
  if (!botId) {
    return res.status(400).send({ message: 'Bot ID is required' });
  }
  
  const limit = parseInt(req.query.limit) || 10;
  // const page = parseInt(req.query.offset) || 1;
  const offset = parseInt(req.query.offset) || 0;
  const swapPerformed = req.query.swapPerformed === 'true' ? true : 
                       (req.query.swapPerformed === 'false' ? false : null);
  
  try {
    // Find bot to verify ownership
    const bot = await Bot.findOne({
      where: { id: botId, userId: req.userId }
    });

    
    if (!bot) {
      return res.status(404).send({ message: 'Bot not found' });
    }
    
    // Build query conditions
    const whereCondition = { botId, resetCount: bot.resetCount };
    if (swapPerformed !== null) {
      whereCondition.swapPerformed = swapPerformed;
    }
    ``
    // Get swap decisions with pagination
    const swapDecisions = await BotSwapDecision.findAndCountAll({
      where: whereCondition,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      // Explicitly include the currentGlobalPeakValue field
      attributes: {
        include: ['currentGlobalPeakValue']
      }
    });
    
    // console.log(swapDecisions.rows.slice(0, 1))

    res.status(200).send({
      total: swapDecisions.count,
      offset,
      limit,
      items: swapDecisions.rows
    });
  } catch (err) {
    console.error('Error getting bot swap decisions:', err);
    res.status(500).send({ message: err.message || 'Error retrieving bot swap decisions' });
  }
};

const getBotAssets = async (req, res) => {
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
    
    // Get bot if not already retrieved
    let botDetails = await Bot.findByPk(botId);
    if (!botDetails) {
      return res.status(404).json({ message: "Bot not found" });
    }
    const currentResetCount = botDetails.resetCount || 0;
    
    // Get bot assets from database with current reset count
    const botAssets = await BotAsset.findAll({
      where: { 
        botId,
        resetCount: currentResetCount 
      },
      order: [['updatedAt', 'DESC']]
    });
    
    // If we have a current coin, ensure we get up-to-date USDT value
    let updatedAssets = [...botAssets];
    
    if (botDetails.currentCoin) {
      try {
        // Get preferred stablecoin or default to USDT
        const stablecoin = botDetails.preferredStablecoin || 'USDT';
        
        // Get latest price in the preferred stablecoin
        const { price } = await priceService.getPrice(
          { pricingSource: '3commas', fallbackSource: 'coingecko' },
          { apiKey: apiConfig.apiKey, apiSecret: apiConfig.apiSecret },
          botDetails.currentCoin,
          stablecoin,
          botId
        );
        
        // Find or create asset record for current coin
        let currentAsset = botAssets.find(asset => asset.coin === botDetails.currentCoin);
        
        // If bot has a current coin but no asset record, create one with estimated data
        if (!currentAsset) {
          // Attempt to get balance from 3Commas
          const [error, accountData] = await threeCommasClient.request('accounts', botDetails.accountId);
          
          if (!error && accountData && accountData.balances) {
            const coinBalance = accountData.balances.find(b => b.currency_code === botDetails.currentCoin);
            
            if (coinBalance && parseFloat(coinBalance.amount) > 0) {
              // Create asset record
              const amount = parseFloat(coinBalance.amount);
              const stablecoinEquivalent = amount * price;
              
              currentAsset = await BotAsset.create({
                botId,
                coin: botDetails.currentCoin,
                amount,
                resetCount: currentResetCount,
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

// Reset a bot to its initial state
const resetBot = async (req, res) => {
  try {
    const { botId } = req.params;
    const { resetType, sellToStablecoin } = req.body;
    
    // Check if bot exists and belongs to user
    const bot = await Bot.findOne({ 
      where: { 
        id: botId,
        userId: req.userId 
      }
    });
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Call the reset service
    const updatedBot = await botResetService.resetBot(botId, { resetType, sellToStablecoin });
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Bot reset successfully',
      bot: botToResponse(updatedBot)
    });
  } catch (error) {
    console.error('Error resetting bot:', error);
    return res.status(500).json({ error: 'Failed to reset bot: ' + error.message });
  }
};

// Get real-time price for a coin
async function getRealTimePrice(req, res) {
  try {
    const { coin } = req.params;
    const baseCoin = req.query.baseCoin || 'USDT';
    
    if (!coin) {
      return res.status(400).json({ error: 'Coin parameter is required' });
    }
    
    // Get system config (for price source preference)
    const systemConfig = await db.systemConfig.findOne();
    if (!systemConfig) {
      return res.status(500).json({ error: 'System configuration not found' });
    }
    
    // Get API config for user (3Commas credentials)
    const apiConfig = await ApiConfig.findOne({ 
      where: { userId: req.userId, name: '3commas' } 
    });
    
    // Get real-time price using the price service
    const priceData = await priceService.getPrice(
      systemConfig, 
      apiConfig, 
      coin, 
      baseCoin
    );
    
    // Return price and source information
    return res.json({
      coin,
      baseCoin,
      price: priceData.price,
      source: priceData.source,
      timestamp: new Date()
    });
  } catch (error) {
    console.error(`Error fetching real-time price: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch real-time price' });
  }
}

module.exports = {
  getAllBots,
  getBotById,
  createBot,
  updateBot,
  deleteBot,
  toggleBot,
  getBotState,
  getBotPrices,
  getBotTrades,
  getBotLogs,
  getTradeDecisionLogs,
  getBotSwapDecisions,
  getBotAssets,
  resetBot,
  getRealTimePrice
};
