const db = require('../models');
const Bot = db.bot;
const PriceHistory = db.priceHistory;
const CoinSnapshot = db.coinSnapshot;
const { Op } = require('sequelize');
const priceService = require('../services/price.service');
const ApiConfig = db.apiConfig;

/**
 * Get price comparison data between initial snapshots and current prices
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
exports.getPriceComparison = async (req, res) => {
  try {
    const botId = req.params.botId;
    
    // Verify bot belongs to the user
    const bot = await Bot.findOne({
      where: {
        id: botId,
        userId: req.userId
      },
      
    });
    
    if (!bot) {
      return res.status(404).json({
        message: "Bot not found"
      });
    }
    
    // Get all coin snapshots for this bot
    const snapshots = await CoinSnapshot.findAll({
      where: { botId }
    });
    
    if (!snapshots || snapshots.length === 0) {
      return res.status(404).json({
        message: "No coin snapshots found for this bot"
      });
    }
    
    // Get API config for price service
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
    
    // Get preferred stablecoin or default to USDT
    const stablecoin = bot.preferredStablecoin || 'USDT';
    
    // Process each snapshot and get current prices
    const priceComparisonData = await Promise.all(snapshots.map(async (snapshot) => {
      try {
        // Get latest price from price service
        const { price: currentPrice } = await priceService.getPrice(
          { pricingSource: '3commas', fallbackSource: 'coingecko' },
          { apiKey: apiConfig.apiKey, apiSecret: apiConfig.apiSecret },
          snapshot.coin,
          stablecoin,
          botId
        );
        
        // Get the latest price history record
        const latestPriceRecord = await PriceHistory.findOne({
          where: { 
            botId, 
            coin: snapshot.coin 
          },
          order: [['timestamp', 'DESC']]
        });
        
        // Calculate percentage change
        const initialPrice = snapshot.initialPrice;
        const percentChange = ((currentPrice - initialPrice) / initialPrice) * 100;
        
        // Return combined data
        return {
          coin: snapshot.coin,
          initialPrice,
          currentPrice,
          percentChange,
          snapshotTimestamp: snapshot.snapshotTimestamp,
          lastUpdated: latestPriceRecord ? latestPriceRecord.timestamp : new Date(),
          wasEverHeld: snapshot.wasEverHeld,
          unitsHeld: snapshot.unitsHeld
        };
      } catch (error) {
        console.error(`Error getting current price for ${snapshot.coin}: ${error.message}`);
        // Return partial data if we can't get current price
        return {
          coin: snapshot.coin,
          initialPrice: snapshot.initialPrice,
          currentPrice: null,
          percentChange: null,
          snapshotTimestamp: snapshot.snapshotTimestamp,
          lastUpdated: null,
          wasEverHeld: snapshot.wasEverHeld,
          unitsHeld: snapshot.unitsHeld,
          error: error.message
        };
      }
    }));
    
    return res.json({
      botId,
      botName: bot.name,
      priceComparisons: priceComparisonData,
      preferredStablecoin: stablecoin
    });
    
  } catch (error) {
    console.error('Error getting price comparison data:', error);
    return res.status(500).json({
      message: "Error getting price comparison data",
      error: error.message
    });
  }
};

/**
 * Get historical price data with snapshot reference points
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
exports.getHistoricalComparison = async (req, res) => {
  try {
    const botId = req.params.botId;
    const testMode = true;
    // return an empty array for now
    return res.json({
      botId,
      botName: "",
      fromTime: null,
      toTime: null,
      data: []
    });

    // Parse query parameters
    const fromTime = req.query.from_time ? new Date(req.query.from_time) : null;
    const toTime = req.query.to_time ? new Date(req.query.to_time) : new Date();
    const coin = req.query.coin || null;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    
    // Verify bot belongs to the user
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
    
    // Build query for price history
    const query = {
      where: { botId },
      order: [['timestamp', 'ASC']]
    };
    
    // Add optional filters
    if (coin) {
      query.where.coin = coin;
    }
    
    if (fromTime) {
      query.where.timestamp = {
        ...query.where.timestamp,
        [Op.gte]: fromTime
      };
    }
    
    if (toTime) {
      query.where.timestamp = {
        ...query.where.timestamp,
        [Op.lte]: toTime
      };
    }
    
    // Get price history data
    const priceHistory = await PriceHistory.findAll(query);
    
    // Get snapshots for reference points
    const snapshotsQuery = {
      where: { botId }
    };
    
    if (coin) {
      snapshotsQuery.where.coin = coin;
    }
    
    const snapshots = await CoinSnapshot.findAll(snapshotsQuery);
    
    // Group price history by coin
    const groupedPriceHistory = {};
    priceHistory.forEach(record => {
      if (!groupedPriceHistory[record.coin]) {
        groupedPriceHistory[record.coin] = [];
      }
      groupedPriceHistory[record.coin].push({
        timestamp: record.timestamp,
        price: record.price,
        source: record.source
      });
    });
    
    // Create a map of snapshots by coin
    const snapshotsByCoin = {};
    snapshots.forEach(snapshot => {
      snapshotsByCoin[snapshot.coin] = {
        initialPrice: snapshot.initialPrice,
        snapshotTimestamp: snapshot.snapshotTimestamp,
        wasEverHeld: snapshot.wasEverHeld,
        unitsHeld: snapshot.unitsHeld
      };
    });
    
    // Combine data for response
    const coinsWithData = [...new Set([
      ...Object.keys(groupedPriceHistory),
      ...Object.keys(snapshotsByCoin)
    ])];
    
    const responseData = coinsWithData.map(coin => {
      const prices = groupedPriceHistory[coin] || [];
      const snapshot = snapshotsByCoin[coin] || null;
      
      // Calculate percentage change from initial price if we have data
      let pricesWithChanges = [];
      if (snapshot && prices.length > 0) {
        pricesWithChanges = prices.map(pricePoint => ({
          ...pricePoint,
          percentChange: ((pricePoint.price - snapshot.initialPrice) / snapshot.initialPrice) * 100
        }));
      } else {
        pricesWithChanges = prices;
      }
      
      return {
        coin,
        snapshot,
        prices: pricesWithChanges
      };
    });
    
    return res.json({
      botId,
      botName: bot.name,
      fromTime: fromTime ? fromTime.toISOString() : null,
      toTime: toTime.toISOString(),
      data: responseData
    });
    
  } catch (error) {
    console.error('Error getting historical price comparison:', error);
    return res.status(500).json({
      message: "Error getting historical price comparison",
      error: error.message
    });
  }
};
