const db = require('../models');
const ThreeCommasService = require('./threeCommas.service');
const priceService = require('./price.service');
const chalk = require('chalk');
const Bot = db.bot;
const ApiConfig = db.apiConfig;
const SystemConfig = db.systemConfig;
const PriceHistory = db.priceHistory;
const Trade = db.trade;
const LogEntry = db.logEntry;
const CoinUnitTracker = db.coinUnitTracker;

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
        try {
          await this.checkBot(bot.id, systemConfig, apiConfig);
        } catch (error) {
          logMessage('ERROR', `Bot check failed: ${error.message}`, bot.name);
          await LogEntry.log(db, 'ERROR', `Bot check failed: ${error.message}`, botId);
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
      // Get fresh bot data
      const bot = await Bot.findByPk(botId);
      
      if (!bot || !bot.enabled) {
        return false;
      }
      
      // Update last check time
      await bot.update({ lastCheckTime: new Date() });
      
      // Get list of coins to check
      const coins = bot.getCoinsArray();
      
      if (coins.length === 0) {
        await LogEntry.log(db, 'WARNING', 'No coins configured for monitoring', botId);
        return false;
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
      
      // Get price data for all coins
      logMessage('INFO', `Fetching prices for ${coins.join(', ')} in ${bot.referenceCoin}`, bot.name);
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
          await PriceHistory.create({
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
      
      // If we're not holding any coin yet, start with initial coin
      if (!bot.currentCoin && bot.initialCoin) {
        bot.currentCoin = bot.initialCoin;
        await bot.save();
        await LogEntry.log(db, 'INFO', `Bot started with initial coin ${bot.initialCoin}`, botId);
        return true;
      }
      
      // If we don't have a current coin, we can't proceed
      if (!bot.currentCoin) {
        await LogEntry.log(db, 'WARNING', 'No current coin set and no initial coin configured', botId);
        return false;
      }
      
      // Check if we can find price data for current coin
      if (!priceData[bot.currentCoin]) {
        await LogEntry.log(db, 'WARNING', `No price data for current coin ${bot.currentCoin}`, botId);
        return false;
      }
      
      // Check for better performing coins
      const currentPrice = priceData[bot.currentCoin].price;
      let bestCoin = bot.currentCoin;
      let bestPrice = currentPrice;
      
      for (const coin of coins) {
        if (coin === bot.currentCoin) continue;
        
        if (!priceData[coin]) {
          await LogEntry.log(db, 'WARNING', `Missing price data for ${coin}`, botId);
          continue;
        }
        
        const price = priceData[coin].price;
        const priceDiffPercent = ((price - currentPrice) / currentPrice) * 100;
        
        if (priceDiffPercent > bot.thresholdPercentage) {
          if (price > bestPrice) {
            bestCoin = coin;
            bestPrice = price;
          }
        }
      }
      
      // Check global profit protection if reference coin is set
      if (bestCoin !== bot.currentCoin && bot.referenceCoin) {
        // Get current portfolio value in reference coin
        const currentValue = await this.calculatePortfolioValue(bot, threeCommasClient);
        
        // Update global peak value if needed
        if (currentValue > bot.globalPeakValue) {
          await bot.update({ globalPeakValue: currentValue });
          await LogEntry.log(db, 'INFO', `Updated global peak value to ${currentValue}`, botId);
          
          // Update min acceptable value based on threshold
          const minAcceptableValue = currentValue * (1 - (bot.globalThresholdPercentage / 100));
          await bot.update({ minAcceptableValue });
          logMessage('INFO', `Updated min acceptable value to ${minAcceptableValue}`, bot.name);
        }
        
        // Check if trade would violate global profit protection
        if (currentValue < bot.minAcceptableValue) {
          logMessage('WARNING', `Trade prevented by global profit protection (Current: ${currentValue}, Min: ${bot.minAcceptableValue})`, bot.name);
          await LogEntry.log(db, 'WARNING', 
            `Trade prevented by global profit protection. ` +
            `Current value: ${currentValue}, ` +
            `Min acceptable: ${bot.minAcceptableValue}, ` +
            `Peak: ${bot.globalPeakValue}`, 
            botId
          );
          
          // Force trade to reference coin to preserve value
          if (bot.currentCoin !== bot.referenceCoin) {
            bestCoin = bot.referenceCoin;
            logMessage('INFO', `Forcing trade to reference coin ${chalk.yellow(bot.referenceCoin)} to preserve value`, bot.name);
            await LogEntry.log(db, 'INFO', 
              `Forcing trade to reference coin ${bot.referenceCoin} to preserve value`, 
              botId
            );
          } else {
            return false; // Already in reference coin
          }
        }
      }
      
      // Execute trade if needed
      if (bestCoin !== bot.currentCoin) {
        logMessage('INFO', `Found better coin: ${chalk.yellow(bestCoin)} vs ${chalk.yellow(bot.currentCoin)}`, bot.name);
        await LogEntry.log(db, 'INFO', `Found better coin: ${bestCoin} vs ${bot.currentCoin}`, botId);
        
        // Execute trade
        const tradeResult = await this.executeTrade(bot, threeCommasClient, bot.currentCoin, bestCoin);
        
        if (tradeResult.success) {
          // Update current coin
          await bot.update({ currentCoin: bestCoin });
          logMessage('INFO', `Trade executed: ${chalk.yellow(bot.currentCoin)} to ${chalk.yellow(bestCoin)}`, bot.name);
          await LogEntry.log(db, 'INFO', `Trade executed: ${bot.currentCoin} to ${bestCoin}`, botId);
          
          // Save trade in database
          await Trade.create({
            botId: bot.id,
            tradeId: tradeResult.tradeId,
            fromCoin: bot.currentCoin,
            toCoin: bestCoin,
            amount: tradeResult.amount || 0,
            priceChange: tradeResult.priceChange || 0,
            status: 'completed',
            executedAt: new Date()
          });
          
          return true;
        } else {
          logMessage('ERROR', `Trade failed: ${tradeResult.error}`, bot.name);
          await LogEntry.log(db, 'ERROR', `Trade failed: ${tradeResult.error}`, botId);
          
          // Save failed trade in database
          await Trade.create({
            botId: bot.id,
            tradeId: tradeResult.tradeId || 'unknown',
            fromCoin: bot.currentCoin,
            toCoin: bestCoin,
            amount: 0,
            priceChange: 0,
            status: 'failed',
            executedAt: new Date()
          });
          
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logMessage('ERROR', `Bot check error: ${error.message}`, botId);
      await LogEntry.log(db, 'ERROR', `Bot check error: ${error.message}`, botId);
      return false;
    }
  }

  /**
   * Calculate the current portfolio value in reference coin
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @returns {Promise<Number>} - Portfolio value in reference coin
   */
  async calculatePortfolioValue(bot, threeCommasClient) {
    try {
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
      
      // If current coin is reference coin, just return the balance
      if (bot.currentCoin === bot.referenceCoin) {
        return parseFloat(coinBalance.amount);
      }
      
      // Get price of current coin in reference coin
      const { price } = await priceService.getPrice(
        { pricingSource: '3commas', fallbackSource: 'coingecko' },
        { apiKey: threeCommasClient.apiKey, apiSecret: threeCommasClient.apiSecret },
        bot.currentCoin,
        bot.referenceCoin,
        bot.id
      );
      
      // Calculate value
      return parseFloat(coinBalance.amount) * price;
    } catch (error) {
      await LogEntry.log(db, 'ERROR', `Failed to calculate portfolio value: ${error.message}`, bot.id);
      throw error;
    }
  }

  /**
   * Execute a trade on 3Commas
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} fromCoin - Source coin
   * @param {String} toCoin - Target coin
   * @returns {Promise<Object>} - Trade result
   */
  async executeTrade(bot, threeCommasClient, fromCoin, toCoin) {
    try {
      // Get account info
      const [accountError, accountData] = await threeCommasClient.request('accounts', bot.accountId);
      
      if (accountError) {
        throw new Error(`Failed to get account data: ${JSON.stringify(accountError)}`);
      }
      
      // Find from coin balance
      const fromCoinBalance = accountData.balances.find(b => b.currency_code === fromCoin);
      
      if (!fromCoinBalance || parseFloat(fromCoinBalance.amount) <= 0) {
        throw new Error(`No balance found for ${fromCoin}`);
      }
      
      // Create smart trade
      const [tradeError, tradeData] = await threeCommasClient.request(
        'smart_trades',
        'create_smart_trade',
        {
          account_id: bot.accountId,
          pair: `${toCoin}_${fromCoin}`,
          position_type: 'buy',
          units: {
            [fromCoin]: fromCoinBalance.amount
          },
          take_profit: {
            enabled: false
          },
          stop_loss: {
            enabled: false
          }
        }
      );
      
      if (tradeError) {
        throw new Error(`Failed to create trade: ${JSON.stringify(tradeError)}`);
      }
      
      // Get price data for tracking the change
      const priceChange = await this.calculatePriceChange(fromCoin, toCoin);
      
      // Return successful trade data
      return {
        success: true,
        tradeId: tradeData.id.toString(),
        amount: parseFloat(fromCoinBalance.amount),
        priceChange
      };
    } catch (error) {
      await LogEntry.log(db, 'ERROR', `Trade execution failed: ${error.message}`, bot.id);
      
      return {
        success: false,
        error: error.message
      };
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
}

module.exports = new BotService();
