const db = require('../models');
const Sequelize = require('sequelize');
const { Op } = Sequelize;
const Bot = db.bot;
const Trade = db.trade;
const CoinSnapshot = db.coinSnapshot;
const sequelize = db.sequelize;

/**
 * Get dashboard stats including:
 * - Active bots count
 * - Total bots count
 * - Trade statistics
 * - Recent trades
 * - Portfolio value
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Get all bots with their basic info
    const bots = await Bot.findAll({
      attributes: ['id', 'name', 'enabled', 'currentCoin', 'manualBudgetAmount', 'thresholdPercentage'],
      where: {
        // Filter by user ID from token
        ...(req.userId ? { userId: req.userId } : {})
      },
      order: [['created_at', 'DESC']] // Use created_at since we're using underscored: true
    });
    
    // Calculate active bots
    const totalBots = bots.length;
    const activeBots = bots.filter(bot => bot.enabled).length;
    
    // Get total portfolio value using manualBudgetAmount field
    const portfolioValue = bots.reduce((sum, bot) => sum + (bot.manualBudgetAmount || 0), 0);
    
    // Get portfolio change - for now, using a placeholder
    // In a real implementation, this would compare current value to previous snapshots
    const portfolioChange = 0; // Placeholder
    
    // Get recent trades (limited to 10)
    const recentTrades = await Trade.findAll({
      include: [{
        model: Bot,
        attributes: ['name']
      }],
      order: [['executed_at', 'DESC']], // Using executed_at instead of createdAt
      limit: 10
    });
    
    // Format trades for frontend
    const formattedTrades = recentTrades.map(trade => ({
      id: trade.id,
      botId: trade.botId,
      fromCoin: trade.fromCoin,
      toCoin: trade.toCoin,
      timestamp: trade.executedAt, // Using executedAt from the model
      status: trade.status,
      botName: trade.bot ? trade.bot.name : 'Unknown Bot' // Lowercase bot due to Sequelize associations
    }));
    
    // Get total trades count
    const totalTrades = await Trade.count();
    
    // Get successful trades count
    const successfulTrades = await Trade.count({
      where: {
        status: {
          [Op.or]: ['completed', 'success']
        }
      }
    });
    
    // Calculate success rate
    const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;
    
    // Get asset allocation
    // This would normally come from account balances or snapshots
    // For now, using a simplified approach based on bot current coins
    const assetAllocation = {};
    bots.forEach(bot => {
      if (bot.currentCoin) {
        if (!assetAllocation[bot.currentCoin]) {
          assetAllocation[bot.currentCoin] = 0;
        }
        assetAllocation[bot.currentCoin] += bot.manualBudgetAmount || 0;
      }
    });
    
    // Generate portfolio history data from coin snapshots
    // Group by day and sum values across all coins for each bot
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    // Use sequelize to get snapshot data grouped by day
    // This is a simplified query - in production you would aggregate by day
    const portfolioHistory = await CoinSnapshot.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('snapshot_timestamp')), 'date'],
        [sequelize.fn('SUM', sequelize.col('eth_equivalent_value')), 'total_value']
      ],
      include: [{
        model: Bot,
        attributes: [],
        where: {
          // Filter by user ID if authenticated
          ...(req.userId ? { userId: req.userId } : {})
        }
      }],
      where: {
        snapshotTimestamp: {
          [Op.gte]: twoWeeksAgo
        }
      },
      group: [sequelize.fn('DATE', sequelize.col('snapshot_timestamp'))],
      order: [[sequelize.fn('DATE', sequelize.col('snapshot_timestamp')), 'ASC']]
    });
    
    // Format portfolio history for frontend
    const formattedHistory = portfolioHistory.map(snapshot => ({
      date: snapshot.getDataValue('date'),
      value: parseFloat(snapshot.getDataValue('total_value') || 0)
    }));
    
    // If no history data available, generate mock data
    const portfolioHistoryData = formattedHistory.length > 0 ? formattedHistory : 
      Array.from({ length: 14 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (13 - i));
        // Generate some random variation in the portfolio value
        const baseValue = portfolioValue * 0.9;
        const value = baseValue + (Math.random() * 0.2 * baseValue) + (i * portfolioValue * 0.01);
        return { date: date.toISOString(), value };
      });
    
    return res.status(200).json({
      totalBots,
      activeBots,
      portfolioValue,
      portfolioChange,
      totalTrades,
      successRate,
      recentTrades: formattedTrades,
      assetAllocation,
      portfolioHistory: portfolioHistoryData
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
};
