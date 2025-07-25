/**
 * Service for tracking and managing missed trade opportunities
 */
const db = require('../models');
const MissedTrade = db.missedTrade;
const LogEntry = db.logEntry;
const { generateMissedOpportunityReason } = require('../utils/trade-explanations');

class MissedTradeService {
  /**
   * Record a missed trade opportunity
   * 
   * @param {Number} botId - Bot ID
   * @param {String} fromCoin - The coin that would have been sold
   * @param {String} toCoin - The coin that would have been bought
   * @param {Number} deviation - The deviation percentage that was detected
   * @param {String} reasonCode - Code indicating why the trade was missed
   * @param {Object} context - Additional context data for the reason
   * @returns {Promise<Object>} - The created missed trade record
   */
  async recordMissedOpportunity(botId, fromCoin, toCoin, deviation, reasonCode, context = {}) {
    try {
      // Generate detailed explanation
      const reason = generateMissedOpportunityReason(reasonCode, context);
      
      // Log the missed opportunity
      await LogEntry.log(db, 'INFO', `Missed trade opportunity: ${fromCoin} → ${toCoin} (${reason})`, botId);
      
      // Create missed trade record
      const missedTrade = await MissedTrade.create({
        bot_id: botId,
        from_coin: fromCoin,
        to_coin: toCoin,
        deviation_percentage: Math.abs(deviation),
        reason: reason,
        timestamp: new Date()
      });
      
      return missedTrade;
    } catch (error) {
      console.error(`Failed to record missed opportunity: ${error.message}`);
      // Still return something so the main flow isn't disrupted
      return {
        error: true,
        message: error.message
      };
    }
  }
  
  /**
   * Get recent missed opportunities for a bot
   * 
   * @param {Number} botId - Bot ID
   * @param {Number} limit - Max number of records to return
   * @returns {Promise<Array>} - Array of missed trade records
   */
  async getRecentMissedOpportunities(botId, limit = 10) {
    try {
      const missedTrades = await MissedTrade.findAll({
        where: { bot_id: botId },
        order: [['timestamp', 'DESC']],
        limit: limit
      });
      
      return missedTrades;
    } catch (error) {
      console.error(`Failed to fetch missed opportunities: ${error.message}`);
      return [];
    }
  }
}

module.exports = new MissedTradeService();
