/**
 * Deviation Calculator Service
 * Handles advanced deviation calculations between coins
 * Implements three-way comparison strategy:
 * 1. Current vs Currently Held Coin
 * 2. Current vs Initial Snapshot Price
 * 3. Current vs Last Time This Coin Was Held
 */
const db = require('../models');
const CoinSnapshot = db.coinSnapshot;
const CoinDeviation = db.coinDeviation;
const LogEntry = db.logEntry;

class DeviationCalculatorService {
  /**
   * Calculate the full deviation metrics for a potential coin swap
   * 
   * @param {Object} bot - Bot instance
   * @param {String} currentCoin - Currently held coin
   * @param {String} targetCoin - Target coin to potentially swap to
   * @param {Number} currentPrice - Current price of the held coin
   * @param {Number} targetPrice - Current price of the target coin
   * @param {Object} initialPrices - Map of coin symbols to initial prices
   * @returns {Promise<Object>} - Comprehensive deviation metrics
   */
  async calculateSwapMetrics(bot, currentCoin, targetCoin, currentPrice, targetPrice, initialPrices) {
    try {
      const botId = bot.id;
      
      // 1. Get snapshots for both coins
      const currentSnapshot = await CoinSnapshot.findOne({
        where: { botId, coin: currentCoin }
      });
      
      const targetSnapshot = await CoinSnapshot.findOne({
        where: { botId, coin: targetCoin }
      });
      
      if (!currentSnapshot || !targetSnapshot) {
        throw new Error(`Missing snapshot for ${!currentSnapshot ? currentCoin : targetCoin}`);
      }
      
      // 2. Calculate current vs current held deviation
      // This is the basic deviation calculation from the original algorithm
      const currentInitialPrice = currentSnapshot.initialPrice;
      const targetInitialPrice = targetSnapshot.initialPrice;
      
      // Current deviation ratio (how much each coin moved since its own snapshot)
      const currentDeviationRatio = currentPrice / currentInitialPrice;
      const targetDeviationRatio = targetPrice / targetInitialPrice;
      
      // The relative performance between the two coins
      const relativeDeviation = (targetDeviationRatio / currentDeviationRatio) - 1;
      
      // 3. Calculate target coin vs its initial price (detect pumps)
      const initialPrice = initialPrices[targetCoin];
      if (!initialPrice) {
        await LogEntry.log(db, 'WARNING', `No initial price found for ${targetCoin}`, botId);
      }
      
      const initialDeviation = initialPrice ? (targetPrice / initialPrice) - 1 : 0;
      
      // 4. Calculate potential unit gain
      const currentCoinUnits = currentSnapshot.unitsHeld;
      const valueInTarget = currentCoinUnits * (currentPrice / targetPrice);
      
      // Check against previous max units if this coin was ever held
      const unitGainPercentage = targetSnapshot.wasEverHeld && targetSnapshot.maxUnitsReached > 0 
        ? (valueInTarget / targetSnapshot.maxUnitsReached - 1) * 100
        : null; // null means no previous data to compare
      
      // 5. Store the deviation calculation for historical tracking
      await this.storeDeviationRecord(botId, currentCoin, targetCoin, currentPrice, targetPrice, relativeDeviation * 100);
      
      // Prepare comprehensive metrics response
      return {
        // Basic relative deviation between current and target
        relativeDeviation: relativeDeviation * 100, // Convert to percentage
        
        // Is the target coin significantly above its initial price? (pump detection)
        initialDeviation: initialDeviation * 100, // Convert to percentage
        isPumped: initialDeviation > 0.05, // Consider pumped if >5% above initial
        
        // Unit economics
        potentialUnits: valueInTarget,
        previousMaxUnits: targetSnapshot.maxUnitsReached,
        unitGainPercentage: unitGainPercentage,
        
        // Re-entry protection data
        allowReEntry: !targetSnapshot.wasEverHeld || valueInTarget > targetSnapshot.maxUnitsReached,
        
        // Raw data for reference
        currentPrice,
        targetPrice,
        currentSnapshot,
        targetSnapshot
      };
    } catch (error) {
      console.error(`Deviation calculation error: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Deviation calculation error: ${error.message}`, bot.id);
      throw error;
    }
  }
  
  /**
   * Calculate swap worthiness score based on multiple factors
   * 
   * @param {Object} metrics - Deviation metrics from calculateSwapMetrics
   * @param {Number} thresholdPercentage - Bot's threshold percentage 
   * @returns {Object} - Swap worthiness score and breakdown
   */
  calculateSwapWorthinessScore(metrics, thresholdPercentage) {
    // UPDATED: Use absolute price difference of target coin from its initial price
    // instead of comparing against current coin
    const targetPrice = metrics.targetPrice;
    const targetSnapshot = metrics.targetSnapshot;
    const targetInitialPrice = targetSnapshot.initialPrice;
    
    // Calculate how much the target coin has moved from its initial snapshot price
    // Positive value means price went up, negative means price went down
    const absolutePriceDiffPercent = ((targetPrice - targetInitialPrice) / targetInitialPrice) * 100;
    
    // Keep original relative deviation for reference/logging
    const relativeDeviation = metrics.relativeDeviation;
    
    // Use absolute price difference as the primary score factor
    let score = absolutePriceDiffPercent;
    
    // The threshold is now applied to absolute price difference
    const effectiveThreshold = thresholdPercentage;
    
    // Factor 2: Penalize for pumped coins
    // If the coin is above its initial price, reduce the score proportionally
    if (metrics.isPumped) {
      // Penalty increases as the pump increases
      const pumpPenalty = Math.min(metrics.initialDeviation, 20); // Cap at 20%
      score -= pumpPenalty;
    }
    
    // Factor 3: Re-entry protection
    // If this would give us fewer units than we had before, heavily penalize
    if (metrics.unitGainPercentage !== null && metrics.unitGainPercentage < 0) {
      // Strong penalty for getting fewer units
      score = -100; // Effectively make this an impossible swap
    }
    // Enhanced debugging information
    const priceDropMeetsThreshold = absolutePriceDiffPercent <= -effectiveThreshold;
    const hasPositiveUnitGain = metrics.unitGainPercentage === null || metrics.unitGainPercentage >= 0;
    
    console.log("Target coin price change:", absolutePriceDiffPercent.toFixed(2) + "%");
    console.log("Required drop threshold:", effectiveThreshold.toFixed(2) + "%");
    console.log("Meets drop threshold?", priceDropMeetsThreshold);
    console.log("Unit gain percentage:", metrics.unitGainPercentage !== null ? metrics.unitGainPercentage.toFixed(2) + "%" : "N/A (first entry)");
    console.log("Has positive unit gain?", hasPositiveUnitGain);
    
    return {
      rawScore: score,
      effectiveScore: absolutePriceDiffPercent,
      // Fixed: Directly check price drop meets threshold AND we won't lose units
      meetsThreshold: absolutePriceDiffPercent <= -effectiveThreshold && (metrics.unitGainPercentage === null || metrics.unitGainPercentage >= 0),
      breakdown: {
        absolutePriceDiffPercent,
        baseDeviation: relativeDeviation,  // Keep for reference
        pumpPenalty: metrics.isPumped ? Math.min(metrics.initialDeviation, 20) : 0,
        unitEconomics: metrics.unitGainPercentage,
        effectiveThreshold
      }
    };
  }
  
  /**
   * Store a deviation calculation record for historical tracking
   * 
   * @param {Number} botId - Bot ID
   * @param {String} baseCoin - Base coin (current holding)
   * @param {String} targetCoin - Target coin to compare against
   * @param {Number} basePrice - Current price of base coin
   * @param {Number} targetPrice - Current price of target coin
   * @param {Number} deviationPercent - Calculated deviation percentage
   * @returns {Promise<Object>} - Created deviation record
   */
  async storeDeviationRecord(botId, baseCoin, targetCoin, basePrice, targetPrice, deviationPercent) {
    try {
      return await CoinDeviation.create({
        botId,
        baseCoin,
        targetCoin,
        basePrice,
        targetPrice,
        deviationPercent,
        timestamp: new Date()
      });
    } catch (error) {
      console.error(`Failed to store deviation record: ${error.message}`);
      // Don't throw here - this is a non-critical operation
      return null;
    }
  }
  
  /**
   * Get historical deviation data for charting
   * 
   * @param {Number} botId - Bot ID
   * @param {String} baseCoin - Base coin to filter by (optional)
   * @param {String} targetCoin - Target coin to filter by (optional)
   * @param {Date} startDate - Start date for data range
   * @param {Date} endDate - End date for data range
   * @returns {Promise<Array>} - Array of deviation records
   */
  async getHistoricalDeviation(botId, baseCoin = null, targetCoin = null, startDate = null, endDate = null) {
    try {
      const where = { botId };
      
      if (baseCoin) where.baseCoin = baseCoin;
      if (targetCoin) where.targetCoin = targetCoin;
      
      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp[db.Sequelize.Op.gte] = startDate;
        if (endDate) where.timestamp[db.Sequelize.Op.lte] = endDate;
      }
      
      return await CoinDeviation.findAll({
        where,
        order: [['timestamp', 'ASC']]
      });
    } catch (error) {
      console.error(`Failed to get historical deviation data: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new DeviationCalculatorService();
