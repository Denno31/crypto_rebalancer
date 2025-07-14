/**
 * Enhanced Swap Service
 * Integrates the new swap logic components into the main bot workflow
 */
const db = require('../models');
const ThreeCommasService = require('./threeCommas.service');
const priceService = require('./price.service');
const assetManager = require('./assetManager.service');
const snapshotManager = require('./snapshotManager.service');
const deviationCalculator = require('./deviationCalculator.service');
const swapDecision = require('./swapDecision.service');
const chalk = require('chalk');
const LogEntry = db.logEntry;
const Bot = db.bot;
const BotAsset = db.botAsset;
const Trade = db.trade;
const CoinSnapshot = db.coinSnapshot;

/**
 * Format and print a log message with timestamp, level, and bot info
 * @param {String} level - Log level (INFO, WARNING, ERROR)
 * @param {String} message - Log message
 * @param {String} botName - Bot name or ID
 */
function logMessage(level, message, botName = '') {
  const timestamp = new Date().toISOString();
  const botInfo = botName ? ` [${botName}]` : '';
  
  let coloredLevel;
  switch(level.toUpperCase()) {
    case 'ERROR':
      coloredLevel = chalk.red(`[${level.toUpperCase()}]`);
      break;
    case 'WARNING':
      coloredLevel = chalk.yellow(`[${level.toUpperCase()}]`);
      break;
    case 'INFO':
    default:
      coloredLevel = chalk.blue(`[${level.toUpperCase()}]`);
      break;
  }
  
  console.log(`${chalk.gray(timestamp)} ${coloredLevel}${chalk.cyan(botInfo)} ${message}`);
}

class EnhancedSwapService {
  /**
   * Run the enhanced bot checking process
   * This is the main entry point that integrates all the new components
   * 
   * @param {Number} botId - Bot ID to check
   * @param {Object} systemConfig - System configuration
   * @param {Object} apiConfig - API configuration
   * @returns {Promise<Object>} - Result of the check
   */
  async checkBot(botId, systemConfig, apiConfig) {
    try {
      // Get fresh bot data
      const bot = await Bot.findByPk(botId);
      
      if (!bot || !bot.enabled) {
        return { success: false, message: 'Bot not found or disabled' };
      }
      
      // Update last check time - ensure this is always called
      try {
        await bot.update({ lastCheckTime: new Date() });
      } catch (updateError) {
        // Log but continue with execution
        logMessage('WARNING', `Could not update lastCheckTime: ${updateError.message}`, bot.name);
      }
      
      // Get list of coins to check
      const coins = bot.getCoinsArray();
      
      if (coins.length === 0) {
        await LogEntry.log(db, 'WARNING', 'No coins configured for monitoring', botId);
        return { success: false, message: 'No coins configured' };
      }
      
      // Initialize 3Commas client
      const threeCommasClient = new ThreeCommasService(
        apiConfig.apiKey,
        apiConfig.apiSecret
      );
      
      // Ensure referenceCoin is not null
      if (!bot.referenceCoin) {
        // Set default reference coin if not configured
        const defaultReferenceCoin = 'USDT';
        logMessage('WARNING', `Bot has no reference coin configured, using default: ${defaultReferenceCoin}`, bot.name);
        await bot.update({ referenceCoin: defaultReferenceCoin });
      }
      
      // STEP 1: Create initial snapshots if needed (new enhancement)
      await snapshotManager.createInitialSnapshots(bot, systemConfig, apiConfig);
      
      // If we're not holding any coin yet, start with initial coin
      if (!bot.currentCoin && bot.initialCoin) {
        const result = await this.initializeWithInitialCoin(bot, threeCommasClient);
        return result;
      }
      
      // If we don't have a current coin, we can't proceed
      if (!bot.currentCoin) {
        await LogEntry.log(db, 'WARNING', 'No current coin set and no initial coin configured', botId);
        return { success: false, message: 'No current coin set' };
      }
      
      // STEP 2: Fetch all coin prices
      const priceData = {};
      for (const coin of coins) {
        try {
          const { price, source } = await priceService.getPrice(
            systemConfig,
            apiConfig,
            coin,
            bot.referenceCoin,
            botId
          );
          
          priceData[coin] = {
            price,
            source
          };
          
          logMessage('INFO', `${coin}: ${price} ${bot.referenceCoin} (source: ${source})`, bot.name);
          
          // Save price history
          await db.priceHistory.create({
            botId: bot.id,
            coin,
            price,
            timestamp: new Date(),
            source
          });
        } catch (error) {
          logMessage('ERROR', `Failed to get price for ${coin}: ${error.message}`, bot.name);
          await LogEntry.log(db, 'ERROR', `Failed to get price for ${coin}: ${error.message}`, botId);
        }
      }
      
      // Check if we have price for current coin
      if (!priceData[bot.currentCoin]) {
        await LogEntry.log(db, 'WARNING', `No price data for current coin ${bot.currentCoin}`, botId);
        return { success: false, message: 'Missing price data for current coin' };
      }
      
      // STEP 3: Fetch actual commission rates if possible
      await this.fetchCommissionRates(bot, threeCommasClient);
      
      // STEP 4: Evaluate swap candidates using our new swap decision engine
      const swapEvaluation = await swapDecision.evaluateSwapCandidates(
        bot,
        priceData,
        systemConfig,
        apiConfig
      );
      
      // STEP 5: Execute swap if recommended
      if (swapEvaluation.shouldSwap && swapEvaluation.bestCandidate) {
        const targetCoin = swapEvaluation.bestCandidate.coin;
        
        logMessage('INFO', `Swap recommended: ${bot.currentCoin} → ${targetCoin} with score ${swapEvaluation.bestCandidate.scoreDetails.rawScore.toFixed(2)}`, bot.name);
        await LogEntry.log(db, 'TRADE', `Swap recommended: ${bot.currentCoin} → ${targetCoin} with score ${swapEvaluation.bestCandidate.scoreDetails.rawScore.toFixed(2)}`, botId);
        
        // Execute the trade
        const tradeResult = await this.executeTrade(
          bot,
          threeCommasClient,
          bot.currentCoin,
          targetCoin,
          swapEvaluation.bestCandidate
        );
        
        if (tradeResult.success) {
          logMessage('INFO', `Trade executed successfully: ${bot.currentCoin} → ${targetCoin}`, bot.name);
          await LogEntry.log(db, 'TRADE', `Trade executed successfully: ${bot.currentCoin} → ${targetCoin}`, botId);
          
          return { 
            success: true, 
            message: 'Trade executed successfully',
            trade: tradeResult,
            evaluation: swapEvaluation
          };
        } else {
          logMessage('ERROR', `Trade failed: ${tradeResult.error}`, bot.name);
          await LogEntry.log(db, 'ERROR', `Trade failed: ${tradeResult.error}`, botId);
          
          return { 
            success: false, 
            message: `Trade failed: ${tradeResult.error}`,
            trade: tradeResult,
            evaluation: swapEvaluation
          };
        }
      } else {
        // No swap needed
        const reason = swapEvaluation.reason || 'No better coin found';
        logMessage('INFO', `No swap needed: ${reason}`, bot.name);
        await LogEntry.log(db, 'INFO', `No swap needed: ${reason}`, botId);
        
        return {
          success: true,
          message: `No swap needed: ${reason}`,
          evaluation: swapEvaluation
        };
      }
    } catch (error) {
      logMessage('ERROR', `Enhanced bot check error: ${error.message}`, botId);
      await LogEntry.log(db, 'ERROR', `Enhanced bot check error: ${error.message}`, botId);
      
      return {
        success: false,
        message: `Error during bot check: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Initialize the bot with the initial coin
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @returns {Promise<Object>} - Result of initialization
   */
  async initializeWithInitialCoin(bot, threeCommasClient) {
    try {
      const initialCoin = bot.initialCoin;
      
      logMessage('INFO', `Initializing bot with ${initialCoin}`, bot.name);
      await LogEntry.log(db, 'INFO', `Initializing bot with ${initialCoin}`, bot.id);
      
      // Use the existing flexible allocation method
      // This should have been defined in the original bot.service.js
      // We're assuming it exists in this implementation
      const initializedAsset = await this.initializeWithFlexibleAllocation(
        bot, 
        threeCommasClient, 
        initialCoin
      );
      
      if (initializedAsset) {
        bot.currentCoin = initialCoin;
        await bot.save();
        
        // Update coin unit tracker with the initial allocation
        await snapshotManager.updateCoinUnits(
          bot,
          initialCoin,
          initializedAsset.amount,
          initializedAsset.entryPrice
        );
        
        await LogEntry.log(
          db, 
          'INFO', 
          `Bot started with initial coin ${initialCoin} (Amount: ${initializedAsset.amount})`, 
          bot.id
        );
        
        return { 
          success: true, 
          message: `Bot initialized with ${initialCoin}`,
          asset: initializedAsset
        };
      } else {
        await LogEntry.log(
          db, 
          'ERROR', 
          `Failed to initialize with ${initialCoin}`, 
          bot.id
        );
        
        return {
          success: false,
          message: `Failed to initialize with ${initialCoin}`
        };
      }
    } catch (error) {
      logMessage('ERROR', `Initialization error: ${error.message}`, bot.name);
      await LogEntry.log(db, 'ERROR', `Initialization error: ${error.message}`, bot.id);
      
      return {
        success: false,
        message: `Error during initialization: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Initialize with flexible allocation
   * Handles the initial setup of bot with specified coin
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} coin - Coin to initialize with
   * @returns {Promise<Object>} - Asset data
   */
  async initializeWithFlexibleAllocation(bot, threeCommasClient, coin) {
    try {
      // Get system config and API config for price service
      const systemConfig = await db.systemConfig.findOne({
        where: { userId: bot.userId }
      });
      
      const apiConfig = await db.apiConfig.findOne({
        where: { userId: bot.userId }
      });
      
      if (!systemConfig || !apiConfig) {
        throw new Error('Missing required configuration');
      }
      
      // Determine reference coin (usually USDT)
      const referenceCoin = bot.referenceCoin || 'USDT';
      
      // Fetch current price from price service
      const { price } = await priceService.getPrice(
        systemConfig,
        apiConfig,
        coin,
        referenceCoin,
        bot.id
      );
      
      // Use bot's initialAmount setting if available, or a configurable default
      const amount = bot.initialAmount || systemConfig.defaultInitialAmount || 0.01;
      
      logMessage('INFO', `Initializing ${coin} with current price ${price} ${referenceCoin} and amount ${amount}`, bot.name);
      await LogEntry.log(db, 'INFO', `Initializing ${coin} with current price ${price} ${referenceCoin} and amount ${amount}`, bot.id);
      
      // Create a new asset record for this bot with real values
      const asset = await BotAsset.create({
        botId: bot.id,
        coin: coin,
        amount: amount,
        entryPrice: price
      });
      
      return {
        coin: asset.coin,
        amount: asset.amount,
        entryPrice: asset.entryPrice
      };
    } catch (error) {
      logMessage('ERROR', `Error in flexible allocation: ${error.message}`, bot.name);
      await LogEntry.log(db, 'ERROR', `Error in flexible allocation: ${error.message}`, bot.id);
      return null;
    }
  }

  /**
   * Fetch actual commission rates from the exchange
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   */
  async fetchCommissionRates(bot, threeCommasClient) {
    if (bot.accountId && !bot._cachedCommissionRate) {
      try {
        logMessage('INFO', `Fetching actual commission rates from exchange for account ${bot.accountId}`, bot.name);
        const [rateError, rateData] = await threeCommasClient.getExchangeCommissionRates(bot.accountId);
        
        if (!rateError && rateData) {
          // For market orders, we use taker fee
          const actualCommissionRate = rateData.takerRate;
          
          logMessage('INFO', `Actual commission rate from exchange: ${actualCommissionRate * 100}% (${rateData.source})`, bot.name);
          await LogEntry.log(db, 'INFO', `Actual commission rate from exchange: ${actualCommissionRate * 100}% (${rateData.source})`, bot.id);
          
          // Cache the commission rate for this bot instance
          bot._cachedCommissionRate = actualCommissionRate;
        } else if (rateError) {
          logMessage('WARNING', `Failed to get commission rates: ${rateError.message}. Using default: ${bot.commissionRate * 100}%`, bot.name);
          await LogEntry.log(db, 'WARNING', `Failed to get commission rates: ${rateError.message}. Using default: ${bot.commissionRate * 100}%`, bot.id);
        }
      } catch (error) {
        logMessage('WARNING', `Error fetching commission rates: ${error.message}`, bot.name);
        await LogEntry.log(db, 'WARNING', `Error fetching commission rates: ${error.message}`, bot.id);
      }
    }
  }
  
  /**
   * Execute a trade from one coin to another with enhanced tracking
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} fromCoin - Coin to sell
   * @param {String} toCoin - Coin to buy
   * @param {Object} swapCandidate - Swap candidate from evaluateSwapCandidates
   * @returns {Promise<Object>} - Trade result
   */
  async executeTrade(bot, threeCommasClient, fromCoin, toCoin, swapCandidate) {
    // Initialize asset lock variable
    let assetLock = null;
    
    try {
      logMessage('INFO', `Preparing trade: ${chalk.yellow(fromCoin)} → ${chalk.yellow(toCoin)}`, bot.name);
      await LogEntry.log(db, 'TRADE', `Preparing trade: ${fromCoin} → ${toCoin}`, bot.id);
      
      // Find the asset we are selling
      const fromAsset = await BotAsset.findOne({
        where: {
          botId: bot.id,
          coin: fromCoin
        }
      });
      
      if (!fromAsset) {
        throw new Error(`No asset found for ${fromCoin}`);
      }
      
      // Check if the assets can be traded (not locked by other bots)
      const assetCheck = await assetManager.canTradeAsset(bot.id, fromCoin, fromAsset.amount);
      if (!assetCheck.canTrade) {
        logMessage('WARNING', `Cannot trade ${fromCoin}: ${assetCheck.reason}`, bot.name);
        await LogEntry.log(db, 'WARNING', `Trade rejected: ${assetCheck.reason}`, bot.id);
        throw new Error(`Cannot trade ${fromCoin}: ${assetCheck.reason}`);
      }
      
      // Acquire a lock on the assets being traded
      const lockResult = await assetManager.lockAssets(
        bot.id, 
        fromCoin, 
        fromAsset.amount, 
        `trade_to_${toCoin}`, 
        5 // Lock for 5 minutes
      );
      
      if (!lockResult.success) {
        logMessage('WARNING', `Failed to lock ${fromCoin} for trading: ${lockResult.error}`, bot.name);
        await LogEntry.log(db, 'WARNING', `Trade rejected: ${lockResult.error}`, bot.id);
        throw new Error(`Failed to lock ${fromCoin} for trading: ${lockResult.error}`);
      }
      
      // Store lock ID for later release
      assetLock = {
        id: lockResult.lockId,
        botId: bot.id
      };
      
      logMessage('INFO', `Executing trade: ${chalk.yellow(fromCoin)} → ${chalk.yellow(toCoin)}`, bot.name);
      await LogEntry.log(db, 'TRADE', `Executing trade: ${fromCoin} → ${toCoin}`, bot.id);
      
      // Get system configuration for pricing
      const systemConfig = await db.systemConfig.findOne({ where: { userId: bot.userId } });
      const apiConfig = await db.apiConfig.findOne({ where: { userId: bot.userId } });
      
      if (!systemConfig || !apiConfig) {
        throw new Error('Missing required configuration');
      }
      
      // Get current prices for both coins - use the prices from swap candidate for consistency
      const fromPrice = swapCandidate.metrics.currentPrice;
      const toPrice = swapCandidate.price;
      
      // Calculate value and commission
      const fromValueUSDT = fromAsset.amount * fromPrice;
      const commissionRate = bot._cachedCommissionRate || bot.commissionRate || 0.002;
      const commissionAmount = fromValueUSDT * commissionRate;
      
      // Calculate price change percentage
      const priceChange = (fromPrice - (fromAsset.entryPrice || fromPrice)) / (fromAsset.entryPrice || fromPrice) * 100;
      
      // Get the preferred stablecoin from the bot (or default to USDT)
      const stablecoin = bot.preferredStablecoin || 'USDT';
      
      // Log key information before executing trade
      logMessage('INFO', `Trade amount: ${chalk.yellow(fromAsset.amount)} ${fromCoin} (${fromValueUSDT.toFixed(2)} USDT)`, bot.name);
      logMessage('INFO', `Executing trade through 3Commas API...`, bot.name);
      await LogEntry.log(db, 'TRADE', `Trade amount: ${fromAsset.amount} ${fromCoin} (${fromValueUSDT.toFixed(2)} USDT)`, bot.id);
      
      // Check if we're in development/testing mode
      const isDev = process.env.NODE_ENV === 'development' || process.env.USE_MOCK_DATA === 'true';
      const useSimulation = isDev || process.env.SIMULATE_TRADES === 'true';
      
      let tradeResult;
      let tradeId;
      
      if (useSimulation) {
        // Simulation mode - calculate amounts locally without calling 3Commas API
        logMessage('INFO', `SIMULATION MODE: Simulating trade without calling 3Commas API`, bot.name);
        await LogEntry.log(db, 'TRADE', `SIMULATION MODE: Simulating trade without calling 3Commas API`, bot.id);
        
        const netValueUSDT = fromValueUSDT - commissionAmount;
        const toAmount = netValueUSDT / toPrice;
        
        tradeResult = {
          success: true,
          tradeId: `SIMULATED-${Date.now()}`,
          status: 'completed',
          amount: toAmount
        };
      } else {
        // Real trading mode - call 3Commas API
        logMessage('INFO', `Executing real trade via 3Commas API`, bot.name);
        await LogEntry.log(db, 'TRADE', `Executing real trade via 3Commas API`, bot.id);
        
        // Use take profit settings if configured on the bot
        const useTakeProfit = bot.useTakeProfit || false;
        const takeProfitPercentage = bot.takeProfitPercentage || 2; // Default 2%
        
        // Call 3Commas API to execute the trade
        const [error, response] = await threeCommasClient.executeTrade(
          bot.accountId,
          fromCoin,
          toCoin,
          fromAsset.amount,
          useTakeProfit,
          takeProfitPercentage
        );
        
        if (error || !response) {
          const errorMsg = error?.message || 'Unknown error executing trade with 3Commas API';
          logMessage('ERROR', `3Commas trade execution failed: ${errorMsg}`, bot.name);
          await LogEntry.log(db, 'ERROR', `3Commas trade execution failed: ${errorMsg}`, bot.id);
          throw new Error(errorMsg);
        }
        
        tradeResult = response;
        tradeId = response.tradeId;
      }
      
      // Calculate or use the amount received
      const netValueUSDT = fromValueUSDT - commissionAmount;
      const toAmount = tradeResult.amount || netValueUSDT / toPrice;
      
      // Update total commissions paid
      const totalCommissionsPaid = (bot.totalCommissionsPaid || 0) + commissionAmount;
      await bot.update({ totalCommissionsPaid });
      
      // Create a new asset for the coin we're buying
      const toAsset = await BotAsset.create({
        botId: bot.id,
        coin: toCoin,
        amount: toAmount,
        entryPrice: toPrice,
        usdtEquivalent: netValueUSDT,
        lastUpdated: new Date(),
        stablecoin: stablecoin
      });
      
      // Delete the asset we sold
      await fromAsset.destroy();
      
      // ENHANCEMENT: Update the coin units tracker
      await snapshotManager.updateCoinUnits(
        bot,
        toCoin,
        toAmount,
        toPrice
      );
      
      // Update current coin in bot record
      await bot.update({ currentCoin: toCoin });
      
      // Create trade record for history with commission details
      await Trade.create({
        botId: bot.id,
        userId: bot.userId,
        fromCoin,
        toCoin,
        fromAmount: fromAsset.amount,
        toAmount,
        fromPrice,
        toPrice,
        commissionRate,
        commissionAmount,
        priceChange,
        status: tradeResult.status || 'completed',
        executed_at: new Date(),
        tradeId: tradeResult.tradeId || `SIMULATED-${Date.now()}`
      });
      
      logMessage('INFO', `Trade completed: ${chalk.yellow(fromCoin)} → ${chalk.yellow(toCoin)}`, bot.name);
      await LogEntry.log(db, 'TRADE', `Trade completed: ${fromCoin} → ${toCoin}`, bot.id);
      
      // Release the asset lock
      if (assetLock) {
        await assetManager.releaseLock(assetLock.id, assetLock.botId);
        assetLock = null;
      }
      
      return {
        success: true,
        tradeId: tradeResult.tradeId || `SIMULATED-${Date.now()}`,
        fromCoin,
        toCoin,
        amount: toAmount,
        priceChange,
        status: tradeResult.status || 'completed'
      };
    } catch (error) {
      logMessage('ERROR', `Trade execution error: ${error.message}`, bot.name);
      await LogEntry.log(db, 'ERROR', `Trade execution error: ${error.message}`, bot.id);
      
      // Always release lock if we have one, even on failure
      if (assetLock) {
        try {
          await assetManager.releaseLock(assetLock.id, assetLock.botId);
        } catch (lockError) {
          logMessage('ERROR', `Failed to release asset lock: ${lockError.message}`, bot.name);
        }
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get dashboard metrics for bot monitoring
   * 
   * @param {Number} botId - Bot ID
   * @returns {Promise<Object>} - Dashboard metrics
   */
  async getDashboardMetrics(botId) {
    try {
      // Get bot details
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        throw new Error(`Bot with ID ${botId} not found`);
      }
      
      // Get current coin
      const currentCoin = bot.currentCoin;
      if (!currentCoin) {
        return {
          success: false,
          message: 'No current coin set'
        };
      }
      
      // Get all snapshots
      const snapshots = await CoinSnapshot.findAll({
        where: { botId }
      });
      
      // Get initial prices for all coins
      const initialPrices = {};
      snapshots.forEach(snapshot => {
        initialPrices[snapshot.coin] = snapshot.initialPrice;
      });
      
      // Get current coin asset
      const currentAsset = await BotAsset.findOne({
        where: { botId, coin: currentCoin }
      });
      
      if (!currentAsset) {
        return {
          success: false,
          message: `No asset found for current coin ${currentCoin}`
        };
      }
      
      // Get system config for price service
      const systemConfig = await db.systemConfig.findOne({ where: { userId: bot.userId } });
      const apiConfig = await db.apiConfig.findOne({ where: { userId: bot.userId } });
      
      if (!systemConfig || !apiConfig) {
        return {
          success: false,
          message: 'Missing required configuration'
        };
      }
      
      // Get current prices for all coins
      const coins = bot.getCoinsArray();
      const prices = {};
      for (const coin of coins) {
        try {
          const { price } = await priceService.getPrice(
            systemConfig,
            apiConfig,
            coin,
            bot.referenceCoin,
            botId
          );
          prices[coin] = price;
        } catch (error) {
          prices[coin] = null;
        }
      }
      
      // Calculate deviations for each coin vs current coin
      const deviations = {};
      const currentPrice = prices[currentCoin];
      
      if (!currentPrice) {
        return {
          success: false,
          message: `Failed to get price for current coin ${currentCoin}`
        };
      }
      
      const currentSnapshot = snapshots.find(s => s.coin === currentCoin);
      const currentInitialPrice = currentSnapshot ? currentSnapshot.initialPrice : currentPrice;
      const currentDeviationRatio = currentPrice / currentInitialPrice;
      
      for (const coin of coins) {
        if (coin === currentCoin) {
          deviations[coin] = {
            vs_current: 0,
            vs_initial: 0
          };
          continue;
        }
        
        const price = prices[coin];
        if (!price) continue;
        
        const snapshot = snapshots.find(s => s.coin === coin);
        const initialPrice = snapshot ? snapshot.initialPrice : price;
        
        // Calculate deviations
        const deviationRatio = price / initialPrice;
        const vsCurrentDeviation = (deviationRatio / currentDeviationRatio) - 1;
        const vsInitialDeviation = (price / initialPrice) - 1;
        
        deviations[coin] = {
          vs_current: vsCurrentDeviation * 100, // Convert to percentage
          vs_initial: vsInitialDeviation * 100  // Convert to percentage
        };
      }
      
      // Get performance metrics
      const performance = await swapDecision.getPerformanceMetrics(botId);
      
      // Get recent trades
      const trades = await Trade.findAll({
        where: { botId },
        order: [['executed_at', 'DESC']],
        limit: 10
      });
      
      return {
        success: true,
        bot: {
          name: bot.name,
          currentCoin,
          initialCoin: bot.initialCoin,
          thresholdPercentage: bot.thresholdPercentage,
          globalThresholdPercentage: bot.globalThresholdPercentage,
          checkInterval: bot.checkInterval,
          lastCheckTime: bot.lastCheckTime
        },
        currentAsset: {
          coin: currentCoin,
          amount: currentAsset.amount,
          valueUSDT: currentAsset.amount * prices[currentCoin],
          entryPrice: currentAsset.entryPrice,
          currentPrice: prices[currentCoin]
        },
        initialPrices,
        currentPrices: prices,
        deviations,
        performance,
        recentTrades: trades
      };
    } catch (error) {
      console.error(`Failed to get dashboard metrics: ${error.message}`);
      return {
        success: false,
        message: `Error retrieving dashboard metrics: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = new EnhancedSwapService();
