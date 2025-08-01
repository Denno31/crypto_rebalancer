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
const TradeStep = db.tradeStep;
const BotSwapDecision = db.botSwapDecision;

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
        
        //  create a new trade here (parent trade)
        const parentTrade = await db.trade.create({
          botId:bot.id,
          tradeId:'parent-'+new Date().toString(),
          fromCoin:bot.currentCoin,
          toCoin:targetCoin,
          fromAmount:0,
          toAmount:0,
          fromPrice:0,
          toPrice:0,
          commissionRate:0,
          commissionAmount:0,
          status:'in_progress',
          executedAt:new Date(),
        })

        if(!parentTrade){
          logMessage('ERROR', `Failed to create parent trade`, bot.name);
          await LogEntry.log(db, 'ERROR', `Failed to create parent trade`, botId);
          return { 
            success: false, 
            message: 'Failed to create parent trade',
            trade: null,
            evaluation: swapEvaluation
          };
        }

        // Execute the trade and pass parent trade ID to enable step recording
        const tradeResult = await this.executeTrade(
          bot,
          threeCommasClient,
          bot.currentCoin,
          targetCoin,
          swapEvaluation.bestCandidate,
          parentTrade.id, // Pass the parent trade ID
          db, // Pass database connection
          this // Pass this service to access insertTradeStep
        );
        
        if (tradeResult.success) {
          logMessage('INFO', `Trade executed successfully: ${bot.currentCoin} → ${targetCoin}`, bot.name);
          await LogEntry.log(db, 'TRADE', `Trade executed successfully: ${bot.currentCoin} → ${targetCoin}`, botId);
          
          // Update the most recent swap decision to link it to this trade
          try {
            const recentSwapDecision = await BotSwapDecision.findOne({
              where: {
                botId: bot.id,
                fromCoin: bot.currentCoin,
                toCoin: targetCoin,
                swapPerformed: true
              },
              order: [['createdAt', 'DESC']]
            });
            
            if (recentSwapDecision) {
              await recentSwapDecision.update({
                tradeId: parentTrade.id
              });
              logMessage('INFO', `Linked swap decision ${recentSwapDecision.id} to trade ${parentTrade.id}`, bot.name);
            }
          } catch (error) {
            logMessage('WARNING', `Could not link swap decision to trade: ${error.message}`, bot.name);
          }
          
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
   * Insert a trade step record linked to a parent trade
   * @param {Object} db Database connection
   * @param {number|string} parentId Parent trade ID
   * @param {number} step Step number (1, 2, etc.)
   * @param {Object} tradeDetails Trade execution details
   * @returns {Promise<Object>} The created trade step record
   */
  async insertTradeStep(db, parentId, step, tradeDetails) {
    try {
      // Create the data object with proper snake_case field names to match the database schema
      const tradeStepData = {
        parentTradeId: parentId,
        stepNumber: step,
        tradeId: tradeDetails.tradeId || `step-${step}-${Date.now()}`,
        fromCoin: tradeDetails.fromCoin,
        toCoin: tradeDetails.toCoin,
        fromAmount: tradeDetails.fromAmount || 0,
        toAmount: tradeDetails.toAmount || tradeDetails.amount || 0,
        fromPrice: tradeDetails.fromPrice || 0,
        toPrice: tradeDetails.toPrice || 0,
        commissionAmount: tradeDetails.commissionAmount || 0,
        commissionRate: tradeDetails.commissionRate || 0,
        status: tradeDetails.status || 'completed',
        executedAt: tradeDetails.executedAt || new Date(),
        completedAt: tradeDetails.completedAt || new Date(),
        rawData: tradeDetails.rawData || null
      };
      
      // Add exchangeId and botId if provided
      if (tradeDetails.exchangeId) {
        tradeStepData.exchangeId = tradeDetails.exchangeId;
      }
      
      if (tradeDetails.botId) {
        tradeStepData.botId = tradeDetails.botId;
      }
      
      let tradeStep;

        // If the model is available, use it
        console.log('Using TradeStep model to create record');
        tradeStep = await TradeStep.create(tradeStepData);
     
      
      return tradeStep;
    } catch (error) {
      console.error(`Error inserting trade step ${step} for parent ${parentId}:`, error);
      // Don't throw error so trade execution can continue
      return null;
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

        // we need to initialize the global peak value in usdt here. if we have a manual budget, use it if not, lets use the 
        const currentBot = await Bot.findByPk(bot.id);
        const globalPeakValue = currentBot.manualBudgetAmount || (initializedAsset.amount * initializedAsset.entryPrice);
        currentBot.globalPeakValue = globalPeakValue;
        await currentBot.save();
        
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
      
      // First check if the coin already exists in the account
      logMessage('INFO', `Getting available coins to check if ${coin} already exists`, bot.name);
      const [balancesError, availableCoins] = await threeCommasClient.getAvailableCoins(bot.accountId);
      
      if (balancesError) {
        logMessage('ERROR', `Failed to get available coins: ${balancesError.message || 'Unknown error'}`, bot.name);
        await LogEntry.log(db, 'ERROR', `Failed to get available coins: ${balancesError.message || 'Unknown error'}`, bot.id);
        // Continue with default amount since this is initialization
      }
      
      // Default amount to use
      let amount = bot.manualBudgetAmount || systemConfig.defaultInitialAmount || 0.01;
      
      // If we successfully got balances and the coin exists, use the existing amount
      if (!balancesError && availableCoins) {
        const existingCoin = availableCoins.find(c => c.coin === coin);
        if (existingCoin && existingCoin.amount > 0) {
          // If manual budget is specified and less than the available amount in USD, use it as a cap
          if (bot.manualBudgetAmount && existingCoin.amountInUsd > bot.manualBudgetAmount) {
            // Convert USD budget to coin units
            amount = bot.manualBudgetAmount / (existingCoin.amountInUsd / existingCoin.amount);
            logMessage('INFO', `Using manual budget cap for existing ${coin}: ${amount.toFixed(8)} units (${bot.manualBudgetAmount} USD)`, bot.name);
          } else {
            // Otherwise use the entire available amount
            amount = existingCoin.amount;
            logMessage('INFO', `Using existing ${coin} balance: ${amount} units (${existingCoin.amountInUsd} USD)`, bot.name);
          }
        } else {
          logMessage('INFO', `${coin} not found in account or zero balance, using default amount: ${amount}`, bot.name);
        }
      }
      
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
   * @param {Number|String} [parentTradeId] - Parent trade ID for multi-step trades
   * @param {Object} [db] - Database connection
   * @param {Object} [enhancedSwapService] - Reference to EnhancedSwapService
   * @returns {Promise<Object>} - Trade result
   */
  async executeTrade(bot, threeCommasClient, fromCoin, toCoin, swapCandidate, parentTradeId = null, db = null, enhancedSwapService = null) {
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

       // Determine if this is a direct trade (stablecoin is part of the pair)
       const isDirectTrade = fromCoin === bot.preferredStablecoin || toCoin === bot.preferredStablecoin;
      
      let tradeResult;
      let tradeId;
      
      if (useSimulation) {
        // Simulation mode - calculate amounts locally without calling 3Commas API
        logMessage('INFO', `SIMULATION MODE: Simulating trade without calling 3Commas API`, bot.name);
        await LogEntry.log(db, 'TRADE', `SIMULATION MODE: Simulating trade without calling 3Commas API`, bot.id);
        
        // const netValueUSDT = fromValueUSDT - commissionAmount;
        const netValueUSDT = fromValueUSDT;
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
        
        // Get real-time balances to avoid insufficient funds errors
        logMessage('INFO', `Getting real-time balances for ${fromCoin}`, bot.name);
        const [balancesError, availableCoins] = await threeCommasClient.getAvailableCoins(bot.accountId);

        if (balancesError) {
          const errorMsg = `Failed to get available coins: ${balancesError.message || 'Unknown error'}`;
          logMessage('ERROR', errorMsg, bot.name);
          await LogEntry.log(db, 'ERROR', errorMsg, bot.id);
          return { success: false, error: balancesError };
        }

        // Find the actual available amount for the fromCoin
        const fromCoinData = availableCoins.find(c => c.coin === fromCoin);
        if (!fromCoinData || fromCoinData.amount <= 0) {
          const errorMsg = `Insufficient balance of ${fromCoin} for trade`;
          logMessage('ERROR', errorMsg, bot.name);
          await LogEntry.log(db, 'ERROR', errorMsg, bot.id);
          return { success: false, error: { message: errorMsg } };
        }

        // Calculate how much to use based on real-time balance
        let tradeAmount = fromCoinData.amount;
        logMessage('INFO', `Available balance: ${tradeAmount} ${fromCoin} (${fromCoinData.amountInUsd} USD)`, bot.name);
        
        // If stored amount is less than available, use stored amount as a cap
        if (fromAsset.amount < tradeAmount) {
          tradeAmount = fromAsset.amount;
          logMessage('INFO', `Using stored amount cap: ${tradeAmount} ${fromCoin}`, bot.name);
        }

        // Apply manual budget limit if configured
        if (bot.manualBudgetAmount && fromCoinData.amountInUsd > bot.manualBudgetAmount) {
          // Convert the budget amount in USD back to coin units
          const budgetLimitedAmount = bot.manualBudgetAmount / (fromCoinData.amountInUsd / fromCoinData.amount);
          if (budgetLimitedAmount < tradeAmount) {
            tradeAmount = budgetLimitedAmount;
            logMessage('INFO', `Limiting trade to manual budget: ${tradeAmount.toFixed(8)} ${fromCoin} (${bot.manualBudgetAmount} USD)`, bot.name);
            await LogEntry.log(db, 'INFO', `Limited trade to manual budget: ${tradeAmount.toFixed(8)} ${fromCoin}`, bot.id);
          }
        }

        // Call 3Commas API to execute the trade with real-time calculated amount
        logMessage('INFO', `Executing trade with amount: ${tradeAmount} ${fromCoin}`, bot.name);

        // Prepare common parameters for trade execution
        const tradeParams = {
          accountId: bot.accountId,
          fromCoin,
          toCoin,
          amount: tradeAmount,
          useTakeProfit,
          takeProfitPercentage,
          mode: undefined, // default to 'live'
          forcedPositionType: null,
          parentTradeId,  // For step tracking
          db,             // Database connection
          enhancedSwapService, // Service reference
          preferredStablecoin: bot.preferredStablecoin
        };
        
       
        
        // Execute appropriate trade method based on direct vs. indirect
        const [error, response] = await (isDirectTrade ? 
          threeCommasClient.executeDirectTrade(
            tradeParams.accountId,
            tradeParams.fromCoin,
            tradeParams.toCoin,
            tradeParams.amount,
            tradeParams.useTakeProfit,
            tradeParams.takeProfitPercentage,
            tradeParams.mode,
            false, // isIndirectTrade (direct trade)
            tradeParams.forcedPositionType,
            tradeParams.parentTradeId,
            tradeParams.db,
            tradeParams.enhancedSwapService,
            tradeParams.preferredStablecoin
          ) : 
          threeCommasClient.executeTrade(
            tradeParams.accountId,
            tradeParams.fromCoin,
            tradeParams.toCoin,
            tradeParams.amount,
            tradeParams.useTakeProfit,
            tradeParams.takeProfitPercentage,
            tradeParams.mode,
            false, // isIndirectTrade (this isn't a multi-step trade step)
            tradeParams.forcedPositionType,
            tradeParams.parentTradeId,
            tradeParams.db,
            tradeParams.enhancedSwapService,
            tradeParams.preferredStablecoin
          )
        );

        
        
        
        if (error || !response) {
          const errorMsg = error?.message || 'Unknown error executing trade with 3Commas API';
          logMessage('ERROR', `3Commas trade execution failed: ${errorMsg}`, bot.name);
          await LogEntry.log(db, 'ERROR', `3Commas trade execution failed: ${errorMsg}`, bot.id);
          throw new Error(errorMsg);
        }
        
        // Store the trade result and ID
        tradeResult = response;
        tradeId = response.tradeId;
        
        // Log successful trade initiation
        logMessage('SUCCESS', `Successfully initiated trade ${tradeId} from ${fromCoin} to ${toCoin}`, bot.name);
        await LogEntry.log(db, 'SUCCESS', `Trade ${tradeId} initiated with amount ${tradeAmount} ${fromCoin}`, bot.id);
        
        // Wait for trade to complete if we have a tradeId
        // if (tradeId) {
        //   logMessage('INFO', `Waiting for trade ${tradeId} to complete...`, bot.name);
        //   const [waitError, completedTradeStatus] = await threeCommasClient.waitForTradeCompletion(tradeId);
          
        //   if (waitError) {
        //     logMessage('WARNING', `Trade completion monitoring issue: ${waitError.message}`, bot.name);
        //     await LogEntry.log(db, 'WARNING', `Trade completion monitoring issue: ${waitError.message}`, bot.id);
        //     // Continue since the trade might still be processing
        //   } else {
        //     logMessage('INFO', `Trade ${tradeId} completed with status: ${completedTradeStatus.status}`, bot.name);
        //     await LogEntry.log(db, 'INFO', `Trade ${tradeId} completed with status: ${completedTradeStatus.status}`, bot.id);
        //   }
        // }
      }
      
      // Calculate or use the amount received from completed trade data if available
      const netValueUSDT = fromValueUSDT - commissionAmount;
      
      // Try to extract the actual executed amount from trade result
      // This is more accurate than estimation since it accounts for slippage and fees
      let toAmount = tradeResult.amount; // First try the direct amount field
      
      // If no direct amount, check if we have data from trade completion monitoring
      if (tradeResult.success) {
        // Try to extract from various possible response formats
        const rawData = tradeResult.raw;
        
        if (rawData) {
          // Check different possible fields where the amount might be stored
          toAmount = rawData.data.entered_amount || // Standard field
                    rawData.data.to_amount || // Alternative field
                    (rawData.data.position && rawData.data.position.units) || // Position units
                    (rawData.data.position && rawData.data.position.quantity); // Position quantity

              toAmount = Number(toAmount)
        }
      }
      
      // If we still don't have a valid amount, fallback to calculation based on price
      if (!toAmount || toAmount <= 0) {
        toAmount = netValueUSDT / toPrice;
        logMessage('INFO', `Using calculated amount ${toAmount.toFixed(8)} ${toCoin} (no executed amount data available)`, bot.name);
      } else {
        logMessage('INFO', `Using executed amount ${toAmount.toFixed(8)} ${toCoin} from trade data`, bot.name);
      }
      
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

      const newGlobalPeak = Math.max(bot.globalPeakValue, netValueUSDT)
      
      await bot.update({ globalPeakValue: newGlobalPeak });
      
      // Calculate ETH equivalent value of the new position and update global peak if necessary
      try {
        const botService = require('./bot.service');
        const valueInETH = await botService.convertToETH(bot, netValueUSDT);
        
        // Update global peak value in ETH if this is a new peak
        if (!bot.globalPeakValueInETH || valueInETH > bot.globalPeakValueInETH) {
          await bot.update({ globalPeakValueInETH: valueInETH });
          logMessage('INFO', `Updated global peak ETH value to ${valueInETH.toFixed(8)}`, bot.name);
          await LogEntry.log(db, 'INFO', `Updated global peak ETH value to ${valueInETH.toFixed(8)}`, bot.id);
        }
      } catch (ethError) {
        // Non-critical error, just log it
        logMessage('WARNING', `Failed to update ETH equivalent values: ${ethError.message}`, bot.name);
        await LogEntry.log(db, 'WARNING', `Failed to update ETH equivalent values: ${ethError.message}`, bot.id);
      }
      
      // Update parent trade with actual trade results if parentTradeId is provided
      if (parentTradeId && db) {
        try {
          const parentTrade = await db.trade.findByPk(parentTradeId);
          if (parentTrade) {
            // Get trade step IDs to concatenate for the parent trade ID
            let combinedTradeId = parentTrade.tradeId; // Default to the original ID
            
            try {
              // Find all trade steps for this parent trade
              const tradeSteps = await TradeStep.findAll({
                where: { parentTradeId: parentTradeId },
                order: [['stepNumber', 'ASC']]
              });
              
              // If we have trade steps, create a combined ID
              if (tradeSteps && tradeSteps.length > 0) {
                const stepIds = tradeSteps.map(step => step.tradeId).filter(id => id);
                if (stepIds.length > 0) {
                  combinedTradeId = stepIds.join('-');
                  logMessage('INFO', `Created combined trade ID from ${stepIds.length} steps: ${combinedTradeId}`, bot.name);
                }
              }
            } catch (stepsError) {
              logMessage('WARNING', `Could not retrieve trade steps for combined ID: ${stepsError.message}`, bot.name);
            }
            
            await parentTrade.update({
              fromAmount: fromAsset.amount,
              toAmount: toAmount,
              fromPrice: fromPrice,
              toPrice: toPrice,
              commissionRate: commissionRate,
              commissionAmount: commissionAmount,
              priceChange: priceChange,
              status: typeof tradeResult.status === 'string' ? tradeResult.status : 'completed',
              completedAt: new Date(),
              tradeId: !isDirectTrade ? combinedTradeId : tradeResult.tradeId// Update with the combined trade ID
            });
            logMessage('INFO', `Updated parent trade record #${parentTradeId} with final amounts and status`, bot.name);
          } else {
            logMessage('WARNING', `Could not find parent trade with ID ${parentTradeId} to update`, bot.name);
          }
        } catch (updateError) {
          logMessage('ERROR', `Failed to update parent trade: ${updateError.message}`, bot.name);
          // Continue execution even if parent trade update fails
        }
      }
      
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
        status: typeof tradeResult.status === 'string' ? tradeResult.status : 'completed'
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
