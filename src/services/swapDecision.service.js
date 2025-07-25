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
      
      // Decision: should we swap or not?
      if (bestCandidate && bestCandidate.scoreDetails.rawScore > 0 && bestScore >= bot.thresholdPercentage) {
        // Generate trade explanation
        const tradeDeviation = bestCandidate.metrics.relativeDeviation || bestScore;
        const decisionReason = `Trading ${currentCoin} for ${bestCandidate.coin} due to ${tradeDeviation.toFixed(2)}% deviation from target allocation`;
        
        // Additional context data for the decision
        const additionalData = {
          score: bestScore.toFixed(2),
          threshold: bot.thresholdPercentage,
          fromPrice: priceData[currentCoin]?.price,
          toPrice: priceData[bestCandidate.coin]?.price,
          relativeDifference: bestCandidate.metrics?.relativePriceDiffPercent
        };
        
        console.log(`INFO [${bot.name}] Swap recommended: ${currentCoin} → ${bestCandidate.coin} (score: ${bestScore.toFixed(2)})`);
        await LogEntry.log(db, 'INFO', 
          `Swap recommended: ${currentCoin} → ${bestCandidate.coin} (score: ${bestScore.toFixed(2)}) - ${decisionReason}`, 
          botId
        );
        
        return { 
          shouldSwap: true, 
          fromCoin: currentCoin,
          toCoin: bestCandidate.coin,
          score: bestScore,
          bestCandidate,
          decisionReason,
          deviationPercentage: tradeDeviation,
          additionalData
        };
      } else {
        const reason = !bestCandidate ? 'No viable candidates found' : 
                      bestScore < bot.thresholdPercentage ? `Best score (${bestScore.toFixed(2)}) below threshold (${bot.thresholdPercentage})` : 
                      'No candidate with positive score';
        
        // For missed opportunities tracking
        if (bestCandidate && bestScore > 0) {
          // This is a potential trade that didn't meet the threshold
          const missedTradeService = require('./missedTrade.service');
          await missedTradeService.recordMissedOpportunity(
            botId,
            currentCoin,
            bestCandidate.coin,
            bestCandidate.metrics?.deviation || bestScore,
            'below_threshold',
            { 
              deviation: bestScore.toFixed(2), 
              threshold: bot.thresholdPercentage 
            }
          );
        }
        
        console.log(`INFO [${bot.name}] No swap recommended: ${reason}`);
        await LogEntry.log(db, 'INFO', `No swap recommended: ${reason}`, botId);
        
        return { 
          shouldSwap: false, 
          reason,
          bestCandidate
        };
      }
      
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
      const currentCoin = bot.currentCoin;
      const commissionRate = bot.commissionRate || 0.002; // 0.2% default
      const threshold = bot.globalThresholdPercentage || 10; // Default: 10% buffer
  
      // 1. Get current asset info
      const currentAsset = await db.botAsset.findOne({
        where: { botId, coin: currentCoin }
      });
  
      if (!currentAsset) {
        return {
          allowed: false,
          reason: `Missing asset data for current coin ${currentCoin}`
        };
      }
  
      // 2. Calculate net value in USDT after commission
      const currentPrice = candidate.metrics.currentPrice;
      const currentValue = currentAsset.amount * currentPrice;
      const netValue = currentValue * (1 - commissionRate);
  
      // 3. Compare with global peak (in USDT)
      if (bot.globalPeakValue && bot.globalPeakValue > 0) {
        const minAcceptableValue = bot.globalPeakValue * (1 - threshold / 100);
        if (netValue < minAcceptableValue) {
          return {
            allowed: false,
            reason: `Swap would reduce value below ${100 - threshold}% of peak.`,
            netValue: netValue.toFixed(2),
            minAcceptable: minAcceptableValue.toFixed(2),
            peakValue: bot.globalPeakValue.toFixed(2)
          };
        }
      }
  await LogEntry.log(db, 'INFO', `Global protection passed for ${bot.name}`, bot.id);
      // ✅ Global protection passed
      return {
        allowed: true,
        netValue: netValue.toFixed(2)
      };
    } catch (error) {
      console.error(`Global protection error: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Global protection error: ${error.message}`, bot.id);
  
      return {
        allowed: false,
        reason: `Error during global protection check: ${error.message}`
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
