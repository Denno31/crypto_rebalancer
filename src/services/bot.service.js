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
const BotAsset = db.botAsset;

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
        // Initialize with flexible capital allocation
        const initializedAsset = await this.initializeWithFlexibleAllocation(
          bot, 
          threeCommasClient, 
          bot.initialCoin
        );
        
        if (initializedAsset) {
          bot.currentCoin = bot.initialCoin;
          await bot.save();
          await LogEntry.log(
            db, 
            'INFO', 
            `Bot started with initial coin ${bot.initialCoin} (Amount: ${initializedAsset.amount})`, 
            botId
          );
          return true;
        } else {
          await LogEntry.log(
            db, 
            'ERROR', 
            `Failed to initialize with ${bot.initialCoin}`, 
            botId
          );
          return false;
        }
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
      
      // Evaluate coins based on snapshot comparison (relative performance)
      let bestCoin = bot.currentCoin;
      
      // Get current coin's snapshot
      const CoinSnapshot = db.coinSnapshot;
      const currentCoinSnapshot = await CoinSnapshot.findOne({
        where: { botId: bot.id, coin: bot.currentCoin }
      });
      
      if (!currentCoinSnapshot) {
        logMessage('WARNING', `No snapshot found for ${bot.currentCoin}, creating one now`, bot.name);
        
        // Create a snapshot for current coin if it doesn't exist
        await CoinSnapshot.create({
          botId: bot.id,
          coin: bot.currentCoin,
          initialPrice: priceData[bot.currentCoin].price,
          snapshotTimestamp: new Date(),
          wasEverHeld: true,
          unitsHeld: 0, // Will be updated later
          ethEquivalentValue: 0 // Will be updated later
        });
        
        // Return early since we just created the snapshot
        return true;
      }
      
      // Get current price of the coin we're holding
      const currentPrice = priceData[bot.currentCoin].price;
      const currentPriceThen = currentCoinSnapshot.initialPrice;
      
      // Calculate deviation ratio for current coin (how much it moved since snapshot)
      const currentDeviationRatio = currentPrice / currentPriceThen;
      
      // Fetch asset to get current holding amount
      const BotAsset = db.botAsset;
      const currentAsset = await BotAsset.findOne({
        where: { botId: bot.id, coin: bot.currentCoin }
      });
      
      if (!currentAsset) {
        logMessage('WARNING', `No asset found for ${bot.currentCoin}, unexpected state`, bot.name);
        await LogEntry.log(db, 'WARNING', `No asset found for ${bot.currentCoin}, unexpected state`, botId);
        return false;
      }
      
      const currentValueUSDT = currentAsset.amount * currentPrice;
      const currentValueInETH = await this.convertToETH(bot, currentValueUSDT);
      
      // Log current state
      logMessage('INFO', `Current coin: ${bot.currentCoin}, Current value: ${currentValueUSDT} USDT / ${currentValueInETH} ETH`, bot.name);
      logMessage('INFO', `Price movement: ${bot.currentCoin} moved from ${currentPriceThen} to ${currentPrice} (${(currentDeviationRatio - 1) * 100}%)`, bot.name);
      await LogEntry.log(db, 'INFO', `Current coin: ${bot.currentCoin}, Current value: ${currentValueUSDT} USDT / ${currentValueInETH} ETH`, botId);
      await LogEntry.log(db, 'TRADE', `Price movement: ${bot.currentCoin} moved from ${currentPriceThen} to ${currentPrice} (${(currentDeviationRatio - 1) * 100}%)`, botId);
      
      let bestDeviation = -Infinity;
      let eligibleCoins = [];
      
      // Evaluate each coin's performance relative to the current coin
      for (const coin of coins) {
        if (coin === bot.currentCoin) continue;
        
        if (!priceData[coin]) {
          await LogEntry.log(db, 'WARNING', `Missing price data for ${coin}`, botId);
          continue;
        }
        
        // Get the snapshot for this coin
        const coinSnapshot = await CoinSnapshot.findOne({
          where: { botId: bot.id, coin: coin }
        });
        
        // If no snapshot exists, create one
        if (!coinSnapshot) {
          await CoinSnapshot.create({
            botId: bot.id,
            coin: coin,
            initialPrice: priceData[coin].price,
            snapshotTimestamp: new Date(),
            wasEverHeld: false,
            unitsHeld: 0,
            ethEquivalentValue: 0
          });
          
          // Skip this coin for now since we just created its snapshot
          continue;
        }
        
        const priceNow = priceData[coin].price;
        const priceThen = coinSnapshot.initialPrice;
        
        // Calculate the relative deviation between this coin and current coin
        // Get the commission rate (default to 0.2% if not set)
        const commissionRate = bot.commissionRate || 0.002;
        
        // This is where we decide which coin to buy based on our deviation calculation
        // If we find a coin that exceeds our threshold PLUS commission costs, switch to it
        // We multiply commission by 2 to account for both buy and eventual sell commission
        const effectiveThreshold = (bot.thresholdPercentage / 100) + (commissionRate * 2);
        
        const deviation = (priceNow / priceThen) / currentDeviationRatio - 1;
        
        logMessage('INFO', `${coin}: Price ${priceThen} → ${priceNow}, Deviation: ${deviation * 100}%`, bot.name);
        await LogEntry.log(db, 'TRADE', `${coin}: Price ${priceThen} → ${priceNow}, Deviation: ${deviation * 100}%`, botId);
        
        // Store coin deviation data for charting
        await this.storeCoinDeviation(bot.id, bot.currentCoin, coin, currentPrice, priceNow, deviation * 100);
        
        // Estimate how many units we would get if we switched
        const newUnits = currentValueUSDT / priceNow;
        
        // Check if this coin's performance exceeds our threshold PLUS commission
        if (deviation > effectiveThreshold) {
          logMessage('INFO', `${coin} deviation (${deviation.toFixed(4)}) exceeds threshold+commission (${effectiveThreshold.toFixed(4)})`, bot.name);
          await LogEntry.log(db, 'TRADE', `${coin} deviation (${deviation.toFixed(4)}) exceeds threshold+commission (${effectiveThreshold.toFixed(4)})`, botId);
          
          // Check re-entry rule - don't switch to a coin if we would get fewer units than max
          if (coinSnapshot.wasEverHeld && newUnits <= coinSnapshot.maxUnitsReached) {
            logMessage('INFO', `Skipping ${coin}: Re-entry rule violated (${newUnits} < ${coinSnapshot.maxUnitsReached})`, bot.name);
            await LogEntry.log(db, 'TRADE', `Skipping ${coin}: Re-entry rule violated (${newUnits} < ${coinSnapshot.maxUnitsReached})`, botId);
            continue; // Skip to the next coin
          }
          
          // This coin is our best option so far
          if (bestCoin === null || deviation > bestDeviation) {
            bestCoin = coin;
            bestDeviation = deviation;
          }
          
          // Add to eligible coins list for further processing
          eligibleCoins.push({
            coin,
            price: priceNow,
            deviation,
            newUnits
          });
        } else if (deviation > bot.thresholdPercentage / 100) {
          // This coin exceeds raw threshold but not after commission costs
          logMessage('INFO', `${coin} deviation (${deviation.toFixed(4)}) exceeds raw threshold (${(bot.thresholdPercentage / 100).toFixed(4)}) but not after commission (${effectiveThreshold.toFixed(4)})`, bot.name);
          await LogEntry.log(db, 'TRADE', `${coin} deviation (${deviation.toFixed(4)}) exceeds raw threshold (${(bot.thresholdPercentage / 100).toFixed(4)}) but not after commission (${effectiveThreshold.toFixed(4)})`, botId);
        }
      }
      
      // Log eligible coins
      if (eligibleCoins.length > 0) {
        logMessage('INFO', `Found ${eligibleCoins.length} eligible coins for swap`, bot.name);
        await LogEntry.log(db, 'TRADE', `Found ${eligibleCoins.length} eligible coins for swap`, botId);
        eligibleCoins.forEach(async (ec) => {
          logMessage('INFO', `  ${ec.coin}: Deviation ${ec.deviation * 100}%, Units: ${ec.newUnits}`, bot.name);
          await LogEntry.log(db, 'TRADE', `  ${ec.coin}: Deviation ${ec.deviation * 100}%, Units: ${ec.newUnits}`, botId);
        });
      } else {
        logMessage('INFO', `No eligible coins found for swap`, bot.name);
        await LogEntry.log(db, 'TRADE', `No eligible coins found for swap`, botId);
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
          await LogEntry.log(db, 'TRADE', `Portfolio value check: Updated min acceptable value to ${minAcceptableValue}`, botId);
        }
        
        // Check if trade would violate global profit protection
        if (currentValue < bot.minAcceptableValue) {
          logMessage('WARNING', `Trade prevented by global profit protection (Current: ${currentValue}, Min: ${bot.minAcceptableValue})`, bot.name);
          await LogEntry.log(db, 'TRADE', 
            `TRADE PREVENTED by global profit protection. ` +
            `Current value: ${currentValue}, ` +
            `Min acceptable: ${bot.minAcceptableValue}, ` +
            `Peak: ${bot.globalPeakValue}`, 
            botId
          );
          
          // Force trade to reference coin to preserve value
          if (bot.currentCoin !== bot.referenceCoin) {
            bestCoin = bot.referenceCoin;
            logMessage('INFO', `Forcing trade to reference coin ${chalk.yellow(bot.referenceCoin)} to preserve value`, bot.name);
            await LogEntry.log(db, 'TRADE', 
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
        await LogEntry.log(db, 'TRADE', `Found better coin: ${bestCoin} vs ${bot.currentCoin}`, botId);
        
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

  /**
   * Execute a trade from one coin to another with snapshot tracking
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} fromCoin - Coin to sell
   * @param {String} toCoin - Coin to buy
   * @returns {Promise<Object>} - Trade result
   */
  async executeTrade(bot, threeCommasClient, fromCoin, toCoin) {
    try {
      logMessage('INFO', `Executing trade: ${chalk.yellow(fromCoin)} → ${chalk.yellow(toCoin)}`, bot.name);
      
      // Simulated trade execution (in a real scenario, this would interact with the exchange)
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
      
      // Simulate getting the current price of both coins
      const systemConfig = await SystemConfig.findOne({ where: { active: true } });
      const apiConfig = await ApiConfig.findOne({ where: { userId: bot.userId } });
      
      if (!systemConfig || !apiConfig) {
        throw new Error('Missing required configuration');
      }
      
      // Get current prices for both coins
      const { price: fromPrice } = await priceService.getPrice(
        systemConfig, 
        apiConfig, 
        fromCoin, 
        'USDT', 
        bot.id
      );
      
      const { price: toPrice } = await priceService.getPrice(
        systemConfig, 
        apiConfig, 
        toCoin, 
        'USDT', 
        bot.id
      );
      
      // Calculate how much of the target coin we'll get (accounting for commission)
      const fromValueUSDT = fromAsset.amount * fromPrice;
      
      // Apply commission rate from bot config (or use default)
      const commissionRate = bot.commissionRate || 0.002; // Default 0.2% if not configured
      const commissionAmount = fromValueUSDT * commissionRate;
      
      // Calculate actual amount after commission is deducted
      const netValueUSDT = fromValueUSDT - commissionAmount;
      const toAmount = netValueUSDT / toPrice;
      
      // Track the commission paid
      const totalCommissionsPaid = (bot.totalCommissionsPaid || 0) + commissionAmount;
      
      // Log the commission details
      logMessage('INFO', `Commission: ${chalk.yellow(commissionAmount.toFixed(4))} USDT (${commissionRate * 100}%)`, bot.name);
      logMessage('INFO', `Total commissions paid: ${chalk.yellow(totalCommissionsPaid.toFixed(4))} USDT`, bot.name);
      await LogEntry.log(db, 'INFO', `Commission: ${commissionAmount.toFixed(4)} USDT (${commissionRate * 100}%)`, bot.id);
      await LogEntry.log(db, 'INFO', `Total commissions paid: ${totalCommissionsPaid.toFixed(4)} USDT`, bot.id);
      
      const priceChange = (fromPrice - (fromAsset.entryPrice || fromPrice)) / (fromAsset.entryPrice || fromPrice) * 100;
      
      // Get the preferred stablecoin from the bot (or default to USDT)
      const stablecoin = bot.preferredStablecoin || 'USDT';
      
      // Calculate ETH equivalent value for global tracking
      const valueInETH = await this.convertToETH(bot, fromValueUSDT);
      
      // Create a new asset for the coin we're buying
      const toAsset = await BotAsset.create({
        botId: bot.id,
        coin: toCoin,
        amount: toAmount,
        entryPrice: toPrice,
        usdtEquivalent: fromValueUSDT,
        lastUpdated: new Date(),
        stablecoin: stablecoin
      });
      
      // Delete the asset we sold
      await fromAsset.destroy();
      
      // Update the snapshots using our dedicated helper method
      
      // Update the snapshot for the coin we're selling (fromCoin)
      // Even though we're selling it, we still want to keep track of its max units
      // for re-entry protection purposes
      await this.updateCoinSnapshot(
        bot, 
        fromCoin, 
        fromAsset.amount, // We track the amount we just sold
        fromPrice, 
        valueInETH
      );
      
      // Update the snapshot for the coin we're buying (toCoin)
      // This sets the new price point for future deviation calculations
      await this.updateCoinSnapshot(
        bot, 
        toCoin, 
        toAmount, 
        toPrice, 
        valueInETH
      );
      
      // Track global peak value in ETH
      if (!bot.globalPeakValueInETH || valueInETH > bot.globalPeakValueInETH) {
        await bot.update({ globalPeakValueInETH: valueInETH });
        await LogEntry.log(db, 'INFO', `Updated global peak ETH value to ${valueInETH}`, bot.id);
      }

      // Update current coin and accumulated commissions in the bot record
      await bot.update({ 
        currentCoin: toCoin,
        totalCommissionsPaid: totalCommissionsPaid
      });
      
      // Log the commission update
      await LogEntry.log(db, 'INFO', `Added commission: ${commissionAmount.toFixed(8)} USDT, total: ${totalCommissionsPaid.toFixed(8)} USDT`, bot.id);
      
      // Create trade record for history with commission details
      await Trade.create({
        botId: bot.id,
        fromCoin,
        toCoin,
        fromAmount: fromAsset.amount,
        toAmount,
        fromPrice,
        toPrice,
        commissionRate: commissionRate,
        commissionAmount: commissionAmount,
        priceChange: deviation,
        status: 'completed',
        executed_at: new Date(),
        tradeId: `SIMULATED-${Date.now()}`
      });
      
      return {
        success: true,
        tradeId: `SIMULATED-${Date.now()}`,
        amount: toAmount,
        priceChange
      };
    } catch (error) {
      logMessage('ERROR', `Trade execution error: ${error.message}`, bot.name);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize a bot with flexible capital allocation from initial coin
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - 3Commas client
   * @param {String} initialCoin - Initial coin to allocate from
   * @returns {Promise<Object>} - Created bot asset
   */
  async initializeWithFlexibleAllocation(bot, threeCommasClient, initialCoin) {
    try {
      let coinBalance = null;
      
      // Check if we're in development/testing mode to use mock data
      const isDev = process.env.NODE_ENV === 'development' || process.env.USE_MOCK_DATA === 'true';
      
      if (isDev) {
        // Use mock data for testing/development
        logMessage('INFO', `Using mock balance data for ${initialCoin} in development mode`, bot.name);
        await LogEntry.log(db, 'INFO', `Using mock balance data for ${initialCoin} in development mode`, bot.id);
        
        // Create mock balance
        coinBalance = {
          currency_code: initialCoin,
          amount: '100.0',
          currency_name: initialCoin,
          usd_value: '100.0'
        };
      } else {
        // Production mode - try to get real balances
        try {
          // Get account info to check available balance
          const [accountError, accountData] = await threeCommasClient.request('accounts', bot.accountId);
          
          if (accountError) {
            throw new Error(`Failed to get account data: ${JSON.stringify(accountError)}`);
          }
          
          // Validate account data structure
          if (!accountData || !accountData.balances || !Array.isArray(accountData.balances)) {
            // Try to get balances directly using the load_balances endpoint
            const [balancesError, balancesData] = await threeCommasClient.request('accounts', `${bot.accountId}/load_balances`);
            
            if (balancesError || !balancesData || !Array.isArray(balancesData)) {
              // If we still can't get balances, fall back to mock data
              logMessage('WARNING', `Failed to get balance data, using mock data instead`, bot.name);
              await LogEntry.log(db, 'WARNING', `Failed to get balance data: ${JSON.stringify(balancesError || 'Invalid response')}, using mock data`, bot.id);
              
              coinBalance = {
                currency_code: initialCoin,
                amount: '100.0',
                currency_name: initialCoin,
                usd_value: '100.0'
              };
            } else {
              // We got balances from the second endpoint
              coinBalance = balancesData.find(b => b.currency_code === initialCoin);
            }
          } else {
            // We got balances from the first endpoint
            coinBalance = accountData.balances.find(b => b.currency_code === initialCoin);
          }
        } catch (apiError) {
          // Fall back to mock data if any error occurs
          logMessage('WARNING', `API error: ${apiError.message}, using mock data`, bot.name);
          await LogEntry.log(db, 'WARNING', `API error: ${apiError.message}, using mock data`, bot.id);
          
          coinBalance = {
            currency_code: initialCoin,
            amount: '100.0',
            currency_name: initialCoin,
            usd_value: '100.0'
          };
        }
      }
      
      // Ensure we have a valid coin balance
      if (!coinBalance || parseFloat(coinBalance.amount) <= 0) {
        throw new Error(`No balance found for ${initialCoin}`);
      }
      
      // Continue with allocation using the coin balance (real or mock)
      return this.processAllocation(bot, threeCommasClient, initialCoin, coinBalance);
    } catch (error) {
      logMessage('ERROR', `Allocation failed: ${error.message}`, bot.name);
      await LogEntry.log(db, 'ERROR', `Allocation failed: ${error.message}`, bot.id);
      return null;
    }
  }
  
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
}

module.exports = new BotService();
