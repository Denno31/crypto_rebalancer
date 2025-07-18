/**
 * Swap Decision Service
 * Implements the enhanced decision-making algorithm for coin swaps
 * Core functionality:
 * 1. "Swap Worthiness" scoring system
 * 2. Advanced re-entry protection
 * 3. Global progress protection
 * 4. Historical tracking of performance
 */
const db = require('../models');
const Bot = db.bot;
const CoinSnapshot = db.coinSnapshot;
const CoinUnitTracker = db.coinUnitTracker;
const LogEntry = db.logEntry;
const deviationCalculator = require('./deviationCalculator.service');
const snapshotManager = require('./snapshotManager.service');

class SwapDecisionService {
  /**
   * Evaluate all potential swaps and find the best candidate
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} priceData - Map of coin symbols to their current prices
   * @param {Object} systemConfig - System configuration
   * @param {Object} apiConfig - API configuration
   * @returns {Promise<Object>} - Best swap candidate and decision metrics
   */
  async evaluateSwapCandidates(bot, priceData, systemConfig, apiConfig) {
    try {
      const botId = bot.id;
      const currentCoin = bot.currentCoin;
      const coins = bot.getCoinsArray();
      
      // If current coin isn't set, we can't evaluate swaps
      if (!currentCoin) {
        await LogEntry.log(db, 'WARNING', 'No current coin set, cannot evaluate swaps', botId);
        return { 
          shouldSwap: false, 
          reason: 'No current coin set',
          bestCandidate: null
        };
      }
      
      // Check if we have price data for current coin
      if (!priceData[currentCoin]) {
        await LogEntry.log(db, 'WARNING', `No price data for current coin ${currentCoin}`, botId);
        return { 
          shouldSwap: false, 
          reason: 'Missing price data for current coin',
          bestCandidate: null
        };
      }
      
      // Get initial prices for all coins - important for pump detection
      const initialPrices = await snapshotManager.getInitialPrices(botId);
      
      // Get current price of the coin we're holding
      const currentPrice = priceData[currentCoin].price;
      
      // Get commission rate - either from API cache, or fallback to bot config
      let commissionRate = bot.commissionRate || 0.002; // Default 0.2% as fallback
      if (bot._cachedCommissionRate) {
        commissionRate = bot._cachedCommissionRate;
      }
      
      console.log(`Evaluating swap candidates for bot ${bot.name}, current coin: ${currentCoin}, commission: ${commissionRate * 100}%`);
      await LogEntry.log(db, 'INFO', 
        `Evaluating swap candidates, current coin: ${currentCoin}, commission: ${commissionRate * 100}%`, 
        botId
      );
      
      // Track candidates with their scores
      let candidates = [];
      let bestCandidate = null;
      let bestScore = -Infinity;
      
      // Evaluate each coin as a potential swap candidate
      for (const coin of coins) {
        if (coin === currentCoin) continue;
        
        if (!priceData[coin]) {
          await LogEntry.log(db, 'WARNING', `Missing price data for ${coin}`, botId);
          continue;
        }
        
        const targetPrice = priceData[coin].price;
        
        // Calculate comprehensive swap metrics
        const metrics = await deviationCalculator.calculateSwapMetrics(
          bot, 
          currentCoin, 
          coin, 
          currentPrice, 
          targetPrice,
          initialPrices
        );
        
        // Calculate swap worthiness score
        const scoreDetails = deviationCalculator.calculateSwapWorthinessScore(
          metrics,
          bot.thresholdPercentage
        );
        
        // Log detailed evaluation for each coin
        const absoluteDiff = scoreDetails.breakdown.absolutePriceDiffPercent ? 
          scoreDetails.breakdown.absolutePriceDiffPercent.toFixed(2) + '%' : 'N/A';
        
        console.log(`${coin}: Abs price diff ${absoluteDiff}, ` +
                  `Relative deviation ${metrics.relativeDeviation.toFixed(2)}%, ` +
                  `Initial deviation ${metrics.initialDeviation.toFixed(2)}%, ` +
                  `Score ${scoreDetails.rawScore.toFixed(2)}, ` +
                  `Meets threshold: ${scoreDetails.meetsThreshold}`);
        
        await LogEntry.log(db, 'TRADE', 
          `${coin}: Abs price diff ${absoluteDiff}, ` +
          `Rel dev ${metrics.relativeDeviation.toFixed(2)}%, ` +
          `Init dev ${metrics.initialDeviation.toFixed(2)}%, ` +
          `Score ${scoreDetails.rawScore.toFixed(2)}, ` +
          `Effective score ${scoreDetails.effectiveScore.toFixed(2)}, ` +
          `Threshold ${scoreDetails.breakdown.effectiveThreshold.toFixed(2)}, ` +
          `Meets threshold: ${scoreDetails.meetsThreshold}`,
          botId
        );
        
        // Track this candidate
        candidates.push({
          coin,
          metrics,
          scoreDetails,
          price: targetPrice,
        });
        
        console.log("scoreDetails", scoreDetails)
        // Update best candidate if this one has a higher score and meets threshold
        if (scoreDetails.meetsThreshold && scoreDetails.rawScore > bestScore) {
          bestCandidate = {
            coin,
            metrics,
            scoreDetails,
            price: targetPrice
          };
          bestScore = scoreDetails.rawScore;
        }
      }
      
      // Sort candidates by score (descending)
      candidates = candidates.sort((a, b) => b.scoreDetails.rawScore - a.scoreDetails.rawScore);
      
      // No viable candidates found
      if (!bestCandidate) {
        await LogEntry.log(db, 'INFO', 'No swap candidates meet the criteria', botId);
        return {
          shouldSwap: false,
          reason: 'No candidates meet threshold criteria',
          bestCandidate: null,
          candidates
        };
      }
      
      // Check global progress protection
      const passesProgressProtection = await this.checkGlobalProgressProtection(bot, bestCandidate);
      
      if (!passesProgressProtection.allowed) {
        await LogEntry.log(db, 'WARNING', 
          `Swap to ${bestCandidate.coin} prevented by progress protection: ${passesProgressProtection.reason}`,
          botId
        );
        
        return {
          shouldSwap: false,
          reason: passesProgressProtection.reason,
          bestCandidate,
          candidates,
          progressProtection: passesProgressProtection
        };
      }
      
      // All checks passed, recommend swap
      await LogEntry.log(db, 'INFO', 
        `Recommending swap to ${bestCandidate.coin} with score ${bestScore.toFixed(2)}`,
        botId
      );
      
      return {
        shouldSwap: true,
        bestCandidate,
        candidates,
        progressProtection: passesProgressProtection
      };
      
    } catch (error) {
      console.error(`Swap evaluation error: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Swap evaluation error: ${error.message}`, bot.id);
      
      return {
        shouldSwap: false,
        reason: `Error during swap evaluation: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Check if the proposed swap would violate global progress protection rules
   * This prevents swaps that would result in a significant loss of accumulated value
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} candidate - Swap candidate from evaluateSwapCandidates
   * @returns {Promise<Object>} - Result with allowed flag and reason
   */
  async checkGlobalProgressProtection(bot, candidate) {
    try {
      const botId = bot.id;
      
      // 1. Calculate what the result would be if we made this swap
      const currentCoin = bot.currentCoin;
      const targetCoin = candidate.coin;
      
      // Get current asset information
      const BotAsset = db.botAsset;
      const currentAsset = await BotAsset.findOne({
        where: { botId, coin: currentCoin }
      });
      
      if (!currentAsset) {
        return {
          allowed: false,
          reason: `Missing asset data for current coin ${currentCoin}`
        };
      }
      
      // Calculate value after swap including commission
      const commissionRate = bot.commissionRate || 0.002;
      const currentValue = currentAsset.amount * candidate.metrics.currentPrice;
      const netValue = currentValue * (1 - commissionRate);
      const estimatedNewUnits = netValue / candidate.price;
      
      // 2. Compare against global peak value
      // If we have a global peak value in ETH, we can use that for comparison
      if (bot.globalPeakValueInETH && bot.globalPeakValueInETH > 0) {
        // We'll need to convert our estimated value to ETH for comparison
        // This would typically be done with a price service call
        // For this example, we'll assume the conversion happens here
        
        // Set the minimum acceptable value (e.g., 90% of peak)
        const minAcceptableValue = bot.globalPeakValueInETH * (1 - (bot.globalThresholdPercentage / 100));
        
        // Get the current coin snapshot to check its ETH value
        const currentSnapshot = await CoinSnapshot.findOne({
          where: { botId, coin: currentCoin }
        });
        
        if (currentSnapshot && currentSnapshot.ethEquivalentValue < minAcceptableValue) {
          return {
            allowed: false,
            reason: `Value would drop below ${(100 - bot.globalThresholdPercentage)}% of peak value`,
            currentValue: currentSnapshot.ethEquivalentValue,
            minAcceptable: minAcceptableValue,
            peakValue: bot.globalPeakValueInETH
          };
        }
      }
      
      // 3. For the target coin, check if we would get more units than before
      const targetSnapshot = await CoinSnapshot.findOne({
        where: { botId, coin: targetCoin }
      });
      
      // If we've held this coin before and would get fewer units, block the swap
      if (targetSnapshot && targetSnapshot.wasEverHeld && 
          estimatedNewUnits < targetSnapshot.maxUnitsReached) {
        // Calculate the percentage difference
        const unitDiff = ((estimatedNewUnits / targetSnapshot.maxUnitsReached) - 1) * 100;
        
        return {
          allowed: false,
          reason: `Would get ${-unitDiff.toFixed(2)}% fewer units than previous max (${estimatedNewUnits.toFixed(6)} vs ${targetSnapshot.maxUnitsReached.toFixed(6)})`,
          estimatedUnits: estimatedNewUnits,
          previousMax: targetSnapshot.maxUnitsReached,
          percentDifference: unitDiff
        };
      }
      
      // All checks pass
      return {
        allowed: true,
        estimatedUnits: estimatedNewUnits
      };
      
    } catch (error) {
      console.error(`Progress protection check error: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Progress protection check error: ${error.message}`, bot.id);
      
      // Default to blocking the swap if there's an error in the check
      return {
        allowed: false,
        reason: `Error during progress protection check: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Track overall performance metrics of the bot
   * 
   * @param {Number} botId - Bot ID
   * @returns {Promise<Object>} - Performance metrics
   */
  async getPerformanceMetrics(botId) {
    try {
      // Get bot details
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        throw new Error(`Bot with ID ${botId} not found`);
      }
      
      // Get initial coin
      const initialCoin = bot.initialCoin;
      if (!initialCoin) {
        throw new Error('No initial coin configured');
      }
      
      // Get current coin
      const currentCoin = bot.currentCoin;
      if (!currentCoin) {
        throw new Error('No current coin set');
      }
      
      // Get initial snapshot
      const initialSnapshot = await CoinSnapshot.findOne({
        where: { botId, coin: initialCoin }
      });
      
      if (!initialSnapshot) {
        throw new Error(`No snapshot found for initial coin ${initialCoin}`);
      }
      
      // Get current snapshot
      const currentSnapshot = await CoinSnapshot.findOne({
        where: { botId, coin: currentCoin }
      });
      
      if (!currentSnapshot) {
        throw new Error(`No snapshot found for current coin ${currentCoin}`);
      }
      
      // Calculate unit growth (comparing initial units to current units)
      const initialUnits = initialSnapshot.unitsHeld;
      const currentUnits = currentSnapshot.unitsHeld;
      
      // Get all trade history
      const Trade = db.trade;
      const trades = await Trade.findAll({
        where: { botId },
        order: [['executed_at', 'ASC']]
      });
      
      // Calculate metrics
      const unitGrowthPercentage = initialUnits > 0 ? ((currentUnits / initialUnits) - 1) * 100 : 0;
      const totalTrades = trades.length;
      const totalCommissions = bot.totalCommissionsPaid || 0;
      
      // Return comprehensive metrics
      return {
        initialCoin,
        currentCoin,
        initialUnits,
        currentUnits,
        unitGrowthPercentage,
        totalTrades,
        totalCommissions,
        commissionImpact: unitGrowthPercentage > 0 ? (totalCommissions / initialUnits) * 100 : 0,
        botStartDate: bot.createdAt,
        runningDays: Math.floor((new Date() - new Date(bot.createdAt)) / (1000 * 60 * 60 * 24)),
        globalPeakValueInETH: bot.globalPeakValueInETH || 0,
        currentValueInETH: currentSnapshot.ethEquivalentValue || 0,
        valueChangePercentage: bot.globalPeakValueInETH > 0 ? 
          ((currentSnapshot.ethEquivalentValue / bot.globalPeakValueInETH) - 1) * 100 : 0
      };
    } catch (error) {
      console.error(`Failed to get performance metrics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new SwapDecisionService();
