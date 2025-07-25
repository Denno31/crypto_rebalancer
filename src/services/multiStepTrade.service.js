/**
 * Multi-Step Trade Service
 * Handles complex trades that require multiple steps to complete
 */
const db = require('../models');
const LogEntry = db.logEntry;
const Trade = db.trade;
const TradeStep = db.tradeStep;
const chalk = require('chalk');

class MultiStepTradeService {
  /**
   * Create a parent trade record and prepare for multiple steps
   * 
   * @param {Object} bot - Bot instance
   * @param {String} fromCoin - Starting coin
   * @param {String} toCoin - Final destination coin
   * @param {Number} fromAmount - Amount of starting coin
   * @param {Number} fromPrice - Price of starting coin
   * @param {Number} toPrice - Price of destination coin
   * @param {Number} commissionRate - Commission rate for trades
   * @returns {Promise<Object>} - Created trade record
   */
  async createParentTrade(bot, fromCoin, toCoin, fromAmount, fromPrice, toPrice, commissionRate) {
    try {
      // Create parent trade record
      const parentTrade = await Trade.create({
        botId: bot.id,
        userId: bot.userId,
        fromCoin,
        toCoin,
        fromAmount,
        // toAmount will be updated after all steps complete
        toAmount: 0, 
        fromPrice,
        toPrice,
        commissionRate,
        commissionAmount: 0, // Will accumulate from steps
        status: 'in_progress',
        executedAt: new Date(),
        tradeId: `MULTI-${Date.now()}`
      });
      
      console.log(`[MultiStepTrade] Created parent trade #${parentTrade.id} from ${fromCoin} to ${toCoin}`);
      await LogEntry.log(db, 'TRADE', `Created multi-step trade #${parentTrade.id} from ${fromCoin} to ${toCoin}`, bot.id);
      
      return parentTrade;
    } catch (error) {
      console.error(`[MultiStepTrade] Error creating parent trade: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Record a single step in a multi-step trade
   * 
   * @param {Number} parentTradeId - ID of the parent trade
   * @param {Number} stepNumber - Step number in sequence
   * @param {String} tradeId - Exchange trade ID
   * @param {String} fromCoin - From coin for this step
   * @param {String} toCoin - To coin for this step
   * @param {Number} fromAmount - Amount of from coin
   * @param {Number} toAmount - Amount of to coin received
   * @param {Number} fromPrice - Price of from coin
   * @param {Number} toPrice - Price of to coin
   * @param {Number} commissionAmount - Commission paid for this step
   * @param {String} status - Status of this step
   * @param {Object} rawTradeData - Raw trade data from exchange
   * @returns {Promise<Object>} - Created trade step
   */
  async recordTradeStep(parentTradeId, stepNumber, tradeId, fromCoin, toCoin, 
                      fromAmount, toAmount, fromPrice, toPrice, commissionAmount, 
                      status, rawTradeData = null) {
    try {
      const step = await TradeStep.create({
        parentTradeId,
        stepNumber,
        tradeId,
        fromCoin,
        toCoin,
        fromAmount,
        toAmount,
        fromPrice,
        toPrice,
        commissionAmount,
        status,
        executedAt: new Date(),
        rawTradeData
      });
      
      console.log(`[MultiStepTrade] Recorded step #${stepNumber} for trade #${parentTradeId}: ${fromCoin} → ${toCoin}`);
      
      return step;
    } catch (error) {
      console.error(`[MultiStepTrade] Error recording trade step: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Complete a multi-step trade by updating the parent trade with final results
   * 
   * @param {Number} parentTradeId - ID of the parent trade
   * @param {Number} finalToAmount - Final amount received
   * @param {Number} totalCommission - Total commission paid across all steps
   * @returns {Promise<Object>} - Updated trade
   */
  async completeMultiStepTrade(parentTradeId, finalToAmount, totalCommission) {
    try {
      const parentTrade = await Trade.findByPk(parentTradeId);
      
      if (!parentTrade) {
        throw new Error(`Parent trade #${parentTradeId} not found`);
      }
      
      // Update the parent trade with the final results
      await parentTrade.update({
        toAmount: finalToAmount,
        commissionAmount: totalCommission,
        status: 'completed',
      });
      
      console.log(`[MultiStepTrade] Completed multi-step trade #${parentTradeId} with final amount: ${finalToAmount}`);
      
      return parentTrade;
    } catch (error) {
      console.error(`[MultiStepTrade] Error completing multi-step trade: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get all steps for a parent trade
   * 
   * @param {Number} parentTradeId - ID of the parent trade
   * @returns {Promise<Array>} - List of trade steps
   */
  async getTradeSteps(parentTradeId) {
    try {
      const steps = await TradeStep.findAll({
        where: { parentTradeId },
        order: [['step_number', 'ASC']]
      });
      
      return steps;
    } catch (error) {
      console.error(`[MultiStepTrade] Error getting trade steps: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new MultiStepTradeService();
