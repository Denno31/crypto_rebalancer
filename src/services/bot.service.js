const db = require('../models');
const ThreeCommasService = require('./threeCommas.service');
const priceService = require('./price.service');
const assetManager = require('./assetManager.service');
const enhancedSwapService = require('./enhancedSwap.service');
const chalk = require('chalk');
const Bot = db.bot;
const ApiConfig = db.apiConfig;
const SystemConfig = db.systemConfig;
const PriceHistory = db.priceHistory;
const Trade = db.trade;
const LogEntry = db.logEntry;
const CoinUnitTracker = db.coinUnitTracker;
const BotAsset = db.botAsset;
const AssetLock = db.assetLock;

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

class BotService {
  /**
   * Initialize the bot checker service
   */
  constructor() {
    this.activeBots = {}; // Track active bot checking intervals
    this.runningBots = {};
  }

  /**
   * Start the bot checking process
   * @param {Number} botId - Bot ID to start
   */
  async startBot(botId) {
    try {
      // Check if bot exists and is enabled
      const bot = await Bot.findByPk(botId);
      
      if (!bot) {
        throw new Error(`Bot with ID ${botId} not found`);
      }
      
      if (!bot.enabled) {
        throw new Error(`Bot with ID ${botId} is disabled`);
      }
      
      // Check if bot is already running
      if (this.activeBots[botId]) {
        clearInterval(this.activeBots[botId]);
        await LogEntry.log(db, 'INFO', `Restarting bot ${bot.name}`, botId);
      } else {
        await LogEntry.log(db, 'INFO', `Starting bot ${bot.name}`, botId);
      }
      
      // Get system config
      const systemConfig = await SystemConfig.findOne({
        where: { userId: bot.userId }
      });
      
      if (!systemConfig) {
        throw new Error('System config not found');
      }
      
      // Get API config
      const apiConfig = await ApiConfig.findOne({
        where: {
          name: '3commas',
          userId: bot.userId
        }
      });
      
      if (!apiConfig) {
        throw new Error('3Commas API config not found');
      }
      
      // Set up checking interval
      const interval = bot.checkInterval * 60 * 1000; // Convert minutes to ms
      
      this.activeBots[botId] = setInterval(async () => {
        if (this.runningBots?.[botId]) return;  // block only this bot
        this.runningBots[botId] = true;
        try {
          await this.checkBot(bot.id, systemConfig, apiConfig);
        } catch (error) {
          logMessage('ERROR', `Bot check failed: ${error.message}`, bot.name);
          await LogEntry.log(db, 'ERROR', `Bot check failed: ${error.message}`, botId);
        }finally{
          this.runningBots[botId] = false
        }
      }, interval);
      
      // Run an initial check immediately
      await this.checkBot(bot.id, systemConfig, apiConfig);
      
      logMessage('INFO', `Bot ${bot.name} is running, checking every ${bot.checkInterval} minutes`);
      return true;
    } catch (error) {
      logMessage('ERROR', `Failed to start bot: ${error.message}`, botId);
      await LogEntry.log(db, 'ERROR', `Failed to start bot: ${error.message}`, botId);
      throw error;
    }
  }

  /**
   * Stop the bot checking process
   * @param {Number} botId - Bot ID to stop
   */
  async stopBot(botId) {
    if (this.activeBots[botId]) {
      // Get bot name for better logging
      let botName = botId;
      try {
        const bot = await Bot.findByPk(botId);
        if (bot) botName = bot.name;
      } catch (e) { /* Continue with botId if error */ }
      
      clearInterval(this.activeBots[botId]);
      delete this.activeBots[botId];
      
      logMessage('INFO', `Bot stopped`, botName);
      await LogEntry.log(db, 'INFO', `Stopped bot ${botId}`, botId);
      return true;
    }
    
    return false;
  }

  /**
   * Check and potentially execute trades for a bot
   * @param {Number} botId - Bot ID to check
   * @param {Object} systemConfig - System configuration
   * @param {Object} apiConfig - API configuration
   */
  async checkBot(botId, systemConfig, apiConfig) {
    try {
      logMessage('INFO', `Starting bot check with enhanced swap logic for bot ${botId}`);
      
      // Use the new enhanced swap service instead of the old implementation
      const result = await enhancedSwapService.checkBot(botId, systemConfig, apiConfig);
      
      // Log the result
      if (result.success) {
        logMessage('INFO', `Enhanced swap check successful: ${result.message}`, botId);
      } else {
        logMessage('WARNING', `Enhanced swap check unsuccessful: ${result.message}`, botId);
      }
      
      return result.success;
    } catch (error) {
      logMessage('ERROR', `Enhanced swap check failed: ${error.message}`, botId);
      await LogEntry.log(db, 'ERROR', `Enhanced swap check failed: ${error.message}`, botId);
      return false;
    }
  }

  /**
   * Calculate the current portfolio value in reference coin or preferred stablecoin
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} targetCurrency - Optional, specify the currency to return value in (defaults to bot.preferredStablecoin)
   * @returns {Promise<Number>} - Portfolio value in the target currency
   */
  async calculatePortfolioValue(bot, threeCommasClient, targetCurrency = null) {
    try {
      // Determine which currency to use for valuation
      const valuationCurrency = targetCurrency || bot.preferredStablecoin || bot.referenceCoin || 'USDT';
      
      // Log which currency we're using for valuation
      const botId = bot.id;
      await LogEntry.log(db, 'INFO', `Calculating portfolio value in ${valuationCurrency}`, botId);
      
      // Get account balance
      const [error, accountData] = await threeCommasClient.request('accounts', bot.accountId);
      
      if (error) {
        throw new Error(`Failed to get account data: ${JSON.stringify(error)}`);
      }
      
      // Check if account data is properly formatted
      if (!accountData || !accountData.balances || !Array.isArray(accountData.balances)) {
        // Log the actual response for debugging
        console.log('Invalid account data format:', JSON.stringify(accountData));
        throw new Error(`Invalid account data format from 3Commas API: balances array not found`);
      }
      
      // Find coin balance
      const coinBalance = accountData.balances.find(b => b.currency_code === bot.currentCoin);
      
      if (!coinBalance) {
        throw new Error(`No balance found for ${bot.currentCoin}`);
      }
      
      // If current coin is the valuation currency, just return the balance
      if (bot.currentCoin === valuationCurrency) {
        return parseFloat(coinBalance.amount);
      }
      
      // Get price of current coin in valuation currency
      const { price } = await priceService.getPrice(
        { pricingSource: '3commas', fallbackSource: 'coingecko' },
        { apiKey: threeCommasClient.apiKey, apiSecret: threeCommasClient.apiSecret },
        bot.currentCoin,
        valuationCurrency,
        bot.id
      );
      
      // Calculate value
      return parseFloat(coinBalance.amount) * price;
    } catch (error) {
      const botId = bot.id;
      await LogEntry.log(db, 'ERROR', `Failed to calculate portfolio value: ${error.message}`, botId);
      throw error;
    }
  }

  /**
   * Calculate price change percentage between two coins
   * @param {String} fromCoin - Source coin
   * @param {String} toCoin - Target coin
   * @returns {Promise<Number>} - Price change percentage
   */
  async calculatePriceChange(fromCoin, toCoin) {
    try {
      // Get prices in USDT for consistency
      const { price: fromPrice } = await priceService.getPrice(
        { pricingSource: 'coingecko', fallbackSource: '3commas' },
        null, // No API config needed for CoinGecko
        fromCoin,
        'USDT'
      );
      
      const { price: toPrice } = await priceService.getPrice(
        { pricingSource: 'coingecko', fallbackSource: '3commas' },
        null, // No API config needed for CoinGecko
        toCoin,
        'USDT'
      );
      
      // Calculate percent change
      const priceChange = ((toPrice - fromPrice) / fromPrice) * 100;
      logMessage('INFO', `Price change ${fromCoin} -> ${toCoin}: ${priceChange.toFixed(2)}%`, '');
      return priceChange;
    } catch (error) {
      logMessage('ERROR', `Error calculating price change: ${error.message}`, '');
      return 0; // Default to 0 if we can't calculate
    }
  }

  // NOTE: initializeWithFlexibleAllocation method has been removed - now using the enhanced implementation in EnhancedSwapService
  
  /**
   * Convert a value in USDT to ETH equivalent
   * @param {Object} bot - Bot instance
   * @param {Number} usdtValue - Value in USDT
   * @returns {Promise<Number>} - Value in ETH
   */
  async convertToETH(bot, usdtValue) {
    try {
      // Get the price service from the system
      const priceService = require('./price.service');
      
      // Get the system and API configurations
    // Query by userId instead of 'active' since that field doesn't exist
    const systemConfig = await db.systemConfig.findOne({ where: { userId: bot.userId } });
      const apiConfig = await db.apiConfig.findOne({ where: { userId: bot.userId } });
      
      if (!systemConfig || !apiConfig) {
        throw new Error('Missing required configuration');
      }
      
      // Get the current ETH price in USDT
      const { price: ethPrice } = await priceService.getPrice(
        systemConfig,
        apiConfig,
        'ETH',
        'USDT',
        bot.id
      );
      
      // Convert USDT value to ETH
      const ethValue = usdtValue / ethPrice;
      return ethValue;
    } catch (error) {
      console.error(`Error converting to ETH: ${error.message}`);
      // Return a safe default in case of error
      return usdtValue / 3000; // Assume ETH is $3000 as fallback
    }
  }
  
  /**
   * Update a coin's snapshot after acquiring or trading
   * @param {Object} bot - Bot instance
   * @param {String} coin - Coin symbol
   * @param {Number} amount - Amount of coin held
   * @param {Number} price - Current price in USDT
   * @param {Number} valueInETH - ETH equivalent value
   * @returns {Promise<Object>} - Updated or created snapshot
   */
  async updateCoinSnapshot(bot, coin, amount, price, valueInETH) {
    try {
      const CoinSnapshot = db.coinSnapshot;
      
      // Find or create the snapshot for this coin
      const [snapshot, created] = await CoinSnapshot.findOrCreate({
        where: { botId: bot.id, coin: coin },
        defaults: {
          initialPrice: price,
          snapshotTimestamp: new Date(),
          unitsHeld: amount,
          ethEquivalentValue: valueInETH,
          wasEverHeld: true,
          maxUnitsReached: amount
        }
      });
      
      // If we're updating an existing snapshot, reset the price point
      if (!created) {
        await snapshot.update({
          initialPrice: price,
          snapshotTimestamp: new Date(),
          unitsHeld: amount,
          ethEquivalentValue: valueInETH,
          wasEverHeld: true
        });
        
        // Update maxUnitsReached if the new amount is higher
        if (amount > snapshot.maxUnitsReached) {
          await snapshot.update({
            maxUnitsReached: amount
          });
        }
      }
      
      logMessage('INFO', `Updated snapshot for ${coin}: price=${price}, units=${amount}`, bot.name);
      return snapshot;
    } catch (error) {
      logMessage('ERROR', `Failed to update coin snapshot: ${error.message}`, bot.name);
      throw error;
    }
  }
  
  /**
   * Process the allocation once we have a valid coin balance
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} initialCoin - Initial coin being allocated
   * @param {Object} coinBalance - Coin balance object
   * @returns {Promise<Object>} - Created bot asset
   * @private
   */
  async processAllocation(bot, threeCommasClient, initialCoin, coinBalance) {
    try {
      // Calculate allocation based on percentage or manual budget
      let allocatedAmount;
      
      if (bot.manualBudgetAmount && bot.manualBudgetAmount > 0) {
        // Use manual budget amount if specified
        allocatedAmount = bot.manualBudgetAmount;
        
        // Make sure we don't exceed available balance
        if (allocatedAmount > parseFloat(coinBalance.amount)) {
          allocatedAmount = parseFloat(coinBalance.amount);
          logMessage('WARNING', `Manual budget exceeds available balance, using maximum: ${allocatedAmount} ${initialCoin}`, bot.name);
        }
      } else {
        // Calculate based on percentage (default to 100% if not specified)
        const percentage = bot.allocationPercentage || 100;
        allocatedAmount = (parseFloat(coinBalance.amount) * percentage) / 100;
      }
      
      // Use preferred stablecoin or default to USDT
      const stablecoin = bot.preferredStablecoin || 'USDT';
      
      // Get price in preferred stablecoin for tracking
      const { price } = await priceService.getPrice(
        { pricingSource: '3commas', fallbackSource: 'coingecko' },
        { apiKey: threeCommasClient.apiKey, apiSecret: threeCommasClient.apiSecret },
        initialCoin,
        stablecoin,
        bot.id
      );
      
      // Create or update bot asset record
      let botAsset = await BotAsset.findOne({
        where: {
          botId: bot.id,
          coin: initialCoin
        }
      });
      
      if (botAsset) {
        await botAsset.update({
          amount: allocatedAmount,
          entryPrice: price,
          usdtEquivalent: allocatedAmount * price, // Keep field name for DB compatibility
          lastUpdated: new Date(),
          stablecoin: stablecoin // Add stablecoin information
        });
      } else {
        botAsset = await BotAsset.create({
          botId: bot.id,
          coin: initialCoin,
          amount: allocatedAmount,
          entryPrice: price,
          usdtEquivalent: allocatedAmount * price, // Keep field name for DB compatibility
          lastUpdated: new Date(),
          stablecoin: stablecoin // Add stablecoin information
        });
      }

      // Calculate ETH equivalent value for snapshot tracking
      // This is important for re-entry protection and global value tracking
      const valueInETH = await this.convertToETH(bot, allocatedAmount * price);
      
      // Create or update the coin snapshot for the initial coin
      // This sets the baseline for future deviation calculations
      await this.updateCoinSnapshot(
        bot,
        initialCoin,
        allocatedAmount,
        price,
        valueInETH
      );
      
      // Also update the global peak value in ETH if necessary
      if (!bot.globalPeakValueInETH || valueInETH > bot.globalPeakValueInETH) {
        await bot.update({ globalPeakValueInETH: valueInETH });
        logMessage('INFO', `Updated global peak ETH value to ${valueInETH}`, bot.name);
      }
      
      // Update the bot's current coin to reflect the initialization
      await bot.update({ currentCoin: initialCoin });
      
      logMessage('INFO', `Allocated ${allocatedAmount} ${initialCoin} (${allocatedAmount * price} ${stablecoin}) to bot`, bot.name);
      return botAsset;
    } catch (error) {
      logMessage('ERROR', `Allocation failed: ${error.message}`, bot.name);
      await LogEntry.log(db, 'ERROR', `Allocation failed: ${error.message}`, bot.id);
      return null;
    }
  }
  
  /**
   * Update asset tracking for a bot
   * @param {Number} botId - Bot ID
   * @param {String} coin - Coin to update
   * @param {Number} amount - Amount of coin
   * @param {Number} price - Current price in USDT
   */
  async updateBotAsset(botId, coin, amount, price) {
    try {
      // Find or create bot asset record
      let botAsset = await BotAsset.findOne({
        where: {
          botId,
          coin
        }
      });
      
      const usdtEquivalent = amount * price;
      
      if (botAsset) {
        await botAsset.update({
          amount,
          usdtEquivalent,
          lastUpdated: new Date()
        });
      } else {
        botAsset = await BotAsset.create({
          botId,
          coin,
          amount,
          entryPrice: price,
          usdtEquivalent,
          lastUpdated: new Date()
        });
      }
      
      return botAsset;
    } catch (error) {
      logMessage('ERROR', `Failed to update bot asset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store coin deviation data for historical tracking and charting
   * @param {Number} botId - Bot ID
   * @param {String} baseCoin - Base coin (current holding)
   * @param {String} targetCoin - Target coin to compare against
   * @param {Number} basePrice - Current price of base coin
   * @param {Number} targetPrice - Current price of target coin
   * @param {Number} deviationPercent - Percentage deviation between the coins
   */
  async storeCoinDeviation(botId, baseCoin, targetCoin, basePrice, targetPrice, deviationPercent) {
    try {
      const CoinDeviation = db.coinDeviation;
      
      // Store the deviation record
      await CoinDeviation.create({
        botId,
        baseCoin,
        targetCoin,
        basePrice,
        targetPrice,
        deviationPercent,
        timestamp: new Date()
      });
      
      // For large datasets, we might want to implement a cleanup strategy
      // to prevent the table from growing too large over time
      // This could be a separate scheduled task
      
    } catch (error) {
      // Log error but don't throw - this is a non-critical feature
      logMessage('ERROR', `Failed to store coin deviation data: ${error.message}`);
    }
  }
  
  /**
   * Reconcile bot-tracked balances with actual exchange balances
   * @param {Number} botId - Bot ID
   * @param {Object} threeCommasClient - 3Commas client instance
   * @returns {Promise<Object>} - Reconciliation results with discrepancies
   */
  async reconcileBalances(botId, threeCommasClient) {
    try {
      // Get bot information
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        throw new Error(`Bot with ID ${botId} not found`);
      }
      
      // Get bot's tracked assets
      const botAssets = await BotAsset.findAll({
        where: { botId }
      });
      
      if (botAssets.length === 0) {
        logMessage('WARNING', `Bot ${bot.name} has no tracked assets`, bot.name);
        return { success: true, discrepancies: [], message: 'No tracked assets found' };
      }
      
      // Get actual account balances from exchange
      const accountBalances = await threeCommasClient.getAccountTableData(bot.accountId);
      if (!accountBalances || !accountBalances.length) {
        throw new Error('Failed to retrieve account balances from exchange');
      }
      
      // Convert exchange balances to a map for easier lookup
      const exchangeBalanceMap = {};
      accountBalances.forEach(balance => {
        exchangeBalanceMap[balance.coin] = {
          amount: parseFloat(balance.amount),
          usdtValue: parseFloat(balance.amountInUsd)
        };
      });
      
      // Compare bot-tracked assets with exchange balances
      const discrepancies = [];
      botAssets.forEach(asset => {
        const exchangeBalance = exchangeBalanceMap[asset.coin];
        
        if (!exchangeBalance) {
          // Coin tracked by bot not found in exchange
          discrepancies.push({
            coin: asset.coin,
            botTracked: asset.amount,
            exchange: 0,
            difference: -asset.amount,
            severity: 'HIGH',
            message: `Bot tracks ${asset.amount} ${asset.coin}, but none found in exchange`
          });
        } else if (Math.abs(asset.amount - exchangeBalance.amount) > 0.00001) { // Small epsilon for floating point comparison
          // Balance discrepancy found
          const difference = exchangeBalance.amount - asset.amount;
          const percentDiff = (difference / asset.amount) * 100;
          
          // Determine severity based on percentage difference
          let severity = 'LOW';
          if (Math.abs(percentDiff) > 10) {
            severity = 'HIGH';
          } else if (Math.abs(percentDiff) > 2) {
            severity = 'MEDIUM';
          }
          
          discrepancies.push({
            coin: asset.coin,
            botTracked: asset.amount,
            exchange: exchangeBalance.amount,
            difference: difference.toFixed(8),
            percentDifference: percentDiff.toFixed(2) + '%',
            severity,
            message: `Balance mismatch for ${asset.coin}: Bot tracks ${asset.amount}, exchange has ${exchangeBalance.amount}`
          });
        }
      });
      
      // Check for coins in exchange that bot should be tracking (based on its coin list)
      const botCoinList = bot.getCoinsArray();
      const botTrackedCoinSet = new Set(botAssets.map(asset => asset.coin));
      
      botCoinList.forEach(coin => {
        if (!botTrackedCoinSet.has(coin) && exchangeBalanceMap[coin] && exchangeBalanceMap[coin].amount > 0) {
          discrepancies.push({
            coin: coin,
            botTracked: 0,
            exchange: exchangeBalanceMap[coin].amount,
            difference: exchangeBalanceMap[coin].amount,
            severity: 'MEDIUM',
            message: `Exchange has ${exchangeBalanceMap[coin].amount} ${coin} not tracked by bot, but in bot's coin list`
          });
        }
      });
      
      // Log reconciliation results
      if (discrepancies.length > 0) {
        logMessage('WARNING', `Found ${discrepancies.length} balance discrepancies for bot ${bot.name}`, bot.name);
        await LogEntry.log(db, 'WARNING', `Found ${discrepancies.length} balance discrepancies`, botId);
      } else {
        logMessage('INFO', `Bot ${bot.name} balances reconciled successfully with exchange`, bot.name);
      }
      
      return { success: true, discrepancies, message: discrepancies.length > 0 ? 'Discrepancies found' : 'All balances match' };
      
    } catch (error) {
      logMessage('ERROR', `Balance reconciliation failed: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Balance reconciliation failed: ${error.message}`, botId);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new BotService();
