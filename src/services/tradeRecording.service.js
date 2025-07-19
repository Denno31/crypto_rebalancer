/**
 * Trade Recording Service
 * Responsible for recording trades and multi-step trades to the database
 */

const db = require('../models');
const { v4: uuidv4 } = require('uuid');
const { formatDateISO } = require('../utils/dateUtils');
const LogEntry = require('./logEntry.service');

const Trade = db.trade;
const TradeStep = db.tradeStep;

/**
 * Service for recording trades to the database
 */
class TradeRecordingService {
  /**
   * Record a single-step trade to the database
   * 
   * @param {Object} tradeData - Trade data to record
   * @param {Number} tradeData.botId - Bot ID
   * @param {Number} tradeData.userId - User ID
   * @param {String} tradeData.fromCoin - From coin
   * @param {String} tradeData.toCoin - To coin
   * @param {Number} tradeData.fromAmount - From amount
   * @param {Number} tradeData.toAmount - To amount
   * @param {Number} tradeData.fromPrice - From price
   * @param {Number} tradeData.toPrice - To price
   * @param {Number} tradeData.commissionRate - Commission rate
   * @param {Number} tradeData.commissionAmount - Commission amount
   * @param {Number} tradeData.priceChange - Price change percentage
   * @param {String} tradeData.status - Trade status
   * @param {String} tradeData.tradeId - 3Commas trade ID
   * @returns {Promise<Object>} - Created trade record
   */
  async recordSingleStepTrade(tradeData) {
    try {
      // Create trade record
      const trade = await Trade.create({
        botId: tradeData.botId,
        userId: tradeData.userId,
        fromCoin: tradeData.fromCoin,
        toCoin: tradeData.toCoin,
        fromAmount: tradeData.fromAmount,
        toAmount: tradeData.toAmount,
        fromPrice: tradeData.fromPrice,
        toPrice: tradeData.toPrice,
        commissionRate: tradeData.commissionRate,
        commissionAmount: tradeData.commissionAmount,
        priceChange: tradeData.priceChange,
        status: tradeData.status || 'completed',
        executedAt: new Date(),
        completedAt: new Date(), // For single-step trades, completion time is the same
        tradeId: tradeData.tradeId,
        isMultiStep: false
      });

      return trade;
    } catch (error) {
      console.error(`Failed to record trade: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record a two-step trade to the database with parent-child relationship
   * 
   * @param {Object} parentTradeData - Parent trade data
   * @param {Number} parentTradeData.botId - Bot ID
   * @param {Number} parentTradeData.userId - User ID
   * @param {String} parentTradeData.fromCoin - Original coin
   * @param {String} parentTradeData.toCoin - Final coin
   * @param {String} parentTradeData.intermediaryCoin - Intermediary coin (e.g., USDT)
   * @param {Number} parentTradeData.fromAmount - Original amount
   * @param {Number} parentTradeData.toAmount - Final amount
   * @param {Number} parentTradeData.fromPrice - Original price
   * @param {Number} parentTradeData.toPrice - Final price
   * @param {Number} parentTradeData.commissionRate - Commission rate
   * @param {Number} parentTradeData.totalCommissionAmount - Total commission amount
   * @param {Number} parentTradeData.priceChange - Price change percentage
   * @param {String} parentTradeData.status - Overall trade status
   * @param {Object[]} steps - Individual trade steps data
   * @returns {Promise<Object>} - Created parent trade record with steps
   */
  async recordMultiStepTrade(parentTradeData, steps) {
    const transaction = await db.sequelize.transaction();

    try {
      // Generate a composite trade ID to link steps together
      const compositeTradeId = `MULTI-${uuidv4()}`;

      // Create parent trade record
      const parentTrade = await Trade.create({
        botId: parentTradeData.botId,
        userId: parentTradeData.userId,
        compositeTradeId,
        fromCoin: parentTradeData.fromCoin,
        toCoin: parentTradeData.toCoin,
        intermediaryCoin: parentTradeData.intermediaryCoin,
        fromAmount: parentTradeData.fromAmount,
        toAmount: parentTradeData.toAmount,
        fromPrice: parentTradeData.fromPrice,
        toPrice: parentTradeData.toPrice,
        commissionRate: parentTradeData.commissionRate,
        commissionAmount: parentTradeData.totalCommissionAmount,
        priceChange: parentTradeData.priceChange,
        status: parentTradeData.status || 'completed',
        executedAt: new Date(),
        completedAt: new Date(), // Will be updated after steps complete
        isMultiStep: true
      }, { transaction });

      // Create trade step records
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        await TradeStep.create({
          parentTradeId: parentTrade.id,
          stepNumber: i + 1,
          tradeId: step.tradeId,
          fromCoin: step.fromCoin,
          toCoin: step.toCoin,
          fromAmount: step.fromAmount,
          toAmount: step.toAmount,
          fromPrice: step.fromPrice,
          toPrice: step.toPrice,
          commissionAmount: step.commissionAmount,
          status: step.status || 'completed',
          executedAt: step.executedAt || new Date(),
          completedAt: step.completedAt || new Date(),
          rawTradeData: step.rawTradeData || null
        }, { transaction });
      }

      // Commit transaction
      await transaction.commit();

      // Return parent trade with steps
      return await Trade.findByPk(parentTrade.id, {
        include: [{
          model: TradeStep,
          as: 'steps'
        }]
      });
    } catch (error) {
      // Rollback transaction on error
      await transaction.rollback();
      console.error(`Failed to record multi-step trade: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update the status of a trade
   * 
   * @param {Number} tradeId - Trade ID
   * @param {String} status - New status
   * @param {Date} completedAt - Completion time
   * @returns {Promise<Object>} - Updated trade
   */
  async updateTradeStatus(tradeId, status, completedAt = null) {
    try {
      const trade = await Trade.findByPk(tradeId);
      if (!trade) {
        throw new Error(`Trade with ID ${tradeId} not found`);
      }

      const updateData = { status };
      if (completedAt) {
        updateData.completedAt = completedAt;
      }

      await trade.update(updateData);
      return trade;
    } catch (error) {
      console.error(`Failed to update trade status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update the status of a trade step
   * 
   * @param {Number} stepId - Step ID
   * @param {String} status - New status
   * @param {Date} completedAt - Completion time
   * @param {Object} rawTradeData - Raw trade data from API
   * @returns {Promise<Object>} - Updated trade step
   */
  async updateTradeStepStatus(stepId, status, completedAt = null, rawTradeData = null) {
    try {
      const step = await TradeStep.findByPk(stepId);
      if (!step) {
        throw new Error(`Trade step with ID ${stepId} not found`);
      }

      const updateData = { status };
      if (completedAt) {
        updateData.completedAt = completedAt;
      }
      if (rawTradeData) {
        updateData.rawTradeData = rawTradeData;
      }

      await step.update(updateData);
      return step;
    } catch (error) {
      console.error(`Failed to update trade step status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a trade with its steps
   * 
   * @param {Number} tradeId - Trade ID
   * @returns {Promise<Object>} - Trade with steps
   */
  async getTradeWithSteps(tradeId) {
    try {
      return await Trade.findByPk(tradeId, {
        include: [{
          model: TradeStep,
          as: 'steps',
          order: [['stepNumber', 'ASC']]
        }]
      });
    } catch (error) {
      console.error(`Failed to get trade with steps: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new TradeRecordingService();
