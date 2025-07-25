/**
 * Trade Decisions API Routes
 * Endpoints to fetch trade decision explanations and missed opportunities
 */
const express = require('express');
const router = express.Router();
const db = require('../models');
const Trade = db.trade;
const MissedTrade = db.missedTrade;
const authMiddleware = require('../middleware/auth.middleware');
const { Op } = require('sequelize');

// Get recent trade decisions for a bot
router.get('/:botId/executed', authMiddleware.verifyToken, async (req, res) => {
  try {
    const botId = req.params.botId;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    // Validate the botId belongs to the authenticated user
    const bot = await db.bot.findOne({
      where: {
        id: botId,
        userId: req.user.id
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot not found or access denied'
      });
    }
    
    // Get trades with decision reasons
    const trades = await Trade.findAll({
      where: {
        botId,
        // Only get trades that have a decision reason (newer trades)
        decision_reason: {
          [Op.not]: null
        }
      },
      attributes: [
        'id', 'botId', 'fromCoin', 'toCoin', 'fromAmount', 'toAmount',
        'fromPrice', 'toPrice', 'status', 'executed_at', 'decision_reason',
        'deviation_percentage', 'commissionPaid'
      ],
      order: [['executed_at', 'DESC']],
      limit: limit,
      offset: offset
    });
    
    // Get total count for pagination
    const totalCount = await Trade.count({
      where: {
        botId,
        decision_reason: {
          [Op.not]: null
        }
      }
    });
    
    return res.status(200).json({
      success: true,
      data: trades,
      pagination: {
        total: totalCount,
        offset: offset,
        limit: limit
      }
    });
    
  } catch (error) {
    console.error(`Error fetching trade decisions: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch trade decisions: ${error.message}`
    });
  }
});

// Get missed trade opportunities for a bot
router.get('/:botId/missed', authMiddleware.verifyToken, async (req, res) => {
  try {
    const botId = req.params.botId;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    // Validate the botId belongs to the authenticated user
    const bot = await db.bot.findOne({
      where: {
        id: botId,
        userId: req.user.id
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot not found or access denied'
      });
    }
    
    // Get missed opportunities
    const missedTrades = await MissedTrade.findAll({
      where: { bot_id: botId },
      order: [['timestamp', 'DESC']],
      limit: limit,
      offset: offset
    });
    
    // Get total count for pagination
    const totalCount = await MissedTrade.count({
      where: { bot_id: botId }
    });
    
    return res.status(200).json({
      success: true,
      data: missedTrades,
      pagination: {
        total: totalCount,
        offset: offset,
        limit: limit
      }
    });
    
  } catch (error) {
    console.error(`Error fetching missed opportunities: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch missed opportunities: ${error.message}`
    });
  }
});

// Get combined trade decision history (both executed and missed)
router.get('/:botId/history', authMiddleware.verifyToken, async (req, res) => {
  try {
    const botId = req.params.botId;
    const limit = parseInt(req.query.limit) || 20;
    
    // Validate the botId belongs to the authenticated user
    const bot = await db.bot.findOne({
      where: {
        id: botId,
        userId: req.user.id
      }
    });
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        message: 'Bot not found or access denied'
      });
    }
    
    // Get executed trades with decision reasons
    const trades = await Trade.findAll({
      where: {
        botId,
        decision_reason: {
          [Op.not]: null
        }
      },
      attributes: [
        'id', 'botId', 'fromCoin', 'toCoin', 'fromAmount', 'toAmount',
        'fromPrice', 'toPrice', 'status', 'executed_at', 'decision_reason',
        'deviation_percentage'
      ],
      order: [['executed_at', 'DESC']],
      limit: limit
    });
    
    // Format executed trades
    const executedTrades = trades.map(trade => ({
      id: trade.id,
      type: 'executed',
      fromCoin: trade.fromCoin,
      toCoin: trade.toCoin,
      deviation: trade.deviation_percentage,
      reason: trade.decision_reason,
      timestamp: trade.executed_at,
      details: {
        fromAmount: trade.fromAmount,
        toAmount: trade.toAmount,
        fromPrice: trade.fromPrice,
        toPrice: trade.toPrice,
        status: trade.status
      }
    }));
    
    // Get missed opportunities
    const missedTrades = await MissedTrade.findAll({
      where: { bot_id: botId },
      order: [['timestamp', 'DESC']],
      limit: limit
    });
    
    // Format missed opportunities
    const missedOpportunities = missedTrades.map(missed => ({
      id: missed.id,
      type: 'missed',
      fromCoin: missed.from_coin,
      toCoin: missed.to_coin,
      deviation: missed.deviation_percentage,
      reason: missed.reason,
      timestamp: missed.timestamp,
      details: {}
    }));
    
    // Combine and sort by timestamp descending
    const combinedHistory = [...executedTrades, ...missedOpportunities]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
    
    return res.status(200).json({
      success: true,
      data: combinedHistory
    });
    
  } catch (error) {
    console.error(`Error fetching trade history: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch trade history: ${error.message}`
    });
  }
});

module.exports = router;
