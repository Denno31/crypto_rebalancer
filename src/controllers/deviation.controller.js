const db = require('../models');
const CoinDeviation = db.coinDeviation;
const { Op } = require('sequelize');

/**
 * Get coin deviations for a specific bot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getBotDeviations = async (req, res) => {
  const botId = req.params.botId;
  
  
  try {
    // Get query parameters
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default to 7 days ago
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const baseCoin = req.query.baseCoin; // Optional filter
    const targetCoin = req.query.targetCoin; // Optional filter
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    
    // Build query condition
    const whereCondition = {
      bot_id: botId, // Note: using snake_case column name for database queries
      timestamp: {
        [Op.between]: [from, to]
      }
    };
    
    // Add optional filters if provided
    if (baseCoin) whereCondition.base_coin = baseCoin;
    if (targetCoin) whereCondition.target_coin = targetCoin;
    
    // Query the database
    const deviations = await CoinDeviation.findAll({
      where: whereCondition,
      order: [['timestamp', 'ASC']],
      offset: (page - 1) * limit,
      limit: limit
    });
    

    // Process the data for charting
    // Group by base_coin and target_coin pairs
    const groupedData = {};
    const allCoins = new Set();
    
    deviations.forEach(dev => {
      // Track all unique coins
      allCoins.add(dev.baseCoin);
      allCoins.add(dev.targetCoin);
      
      // Create pair key
      const pairKey = `${dev.baseCoin}_${dev.targetCoin}`;
      
      if (!groupedData[pairKey]) {
        groupedData[pairKey] = [];
      }
      
      groupedData[pairKey].push({
        timestamp: dev.timestamp,
        baseCoin: dev.baseCoin,
        targetCoin: dev.targetCoin,
        basePrice: dev.basePrice,
        targetPrice: dev.targetPrice,
        deviationPercent: dev.deviationPercent
      });
    });
    
    // Get the latest deviation for each pair (for heatmap view)
    const latestDeviations = {};
    const coinsList = Array.from(allCoins);
    
    // Initialize the matrix with null values
    coinsList.forEach(baseCoin => {
      latestDeviations[baseCoin] = {};
      coinsList.forEach(targetCoin => {
        latestDeviations[baseCoin][targetCoin] = baseCoin === targetCoin ? 0 : null;
      });
    });
    
    // Fill in the latest values
    Object.entries(groupedData).forEach(([pairKey, deviations]) => {
      if (deviations.length > 0) {
        const latest = deviations[deviations.length - 1];
        
        // Store deviation percent directly for backward compatibility
        latestDeviations[latest.baseCoin][latest.targetCoin] = latest.deviationPercent;
        
        // Create a prices object if it doesn't exist
        if (!latestDeviations[latest.baseCoin].prices) {
          latestDeviations[latest.baseCoin].prices = {};
        }
        
        // Store price information
        latestDeviations[latest.baseCoin].prices[latest.targetCoin] = {
          basePrice: latest.basePrice,
          targetPrice: latest.targetPrice,
          timestamp: latest.timestamp
        };
      }
    });
    
    res.json({
      success: true,
      timeSeriesData: groupedData,
      latestDeviations,
      coins: coinsList
    });
  } catch (error) {
    console.error('Error retrieving coin deviations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving coin deviations', 
      error: error.message 
    });
  }
};
