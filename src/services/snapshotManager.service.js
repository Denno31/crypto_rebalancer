/**
 * Snapshot Manager Service
 * Handles advanced snapshot management for tracking coin prices and units
 */
const db = require('../models');
const CoinSnapshot = db.coinSnapshot;
const CoinUnitTracker = db.coinUnitTracker;
const PriceHistory = db.priceHistory;
const LogEntry = db.logEntry;
const priceService = require('./price.service');

class SnapshotManagerService {
  /**
   * Create initial snapshots for all coins when the bot starts
   * This establishes our baseline for future comparison
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} systemConfig - System configuration
   * @param {Object} apiConfig - API configuration
   * @returns {Promise<Object>} - Result with success status and snapshots
   */
  async createInitialSnapshots(bot, systemConfig, apiConfig) {
    try {
      // Get list of all coins this bot will monitor
      const coins = bot.getCoinsArray();
      const botId = bot.id;
      const referenceCoin = bot.referenceCoin || 'USDT';
      
      if (coins.length === 0) {
        throw new Error('No coins configured for monitoring');
      }
      
      // Check if initial snapshots already exist for this bot
      const existingSnapshots = await CoinSnapshot.findAll({
        where: { botId }
      });
      
      if (existingSnapshots.length > 0) {
        // We already have snapshots for this bot
        console.log(`Initial snapshots already exist for bot ${bot.name}`);
        await LogEntry.log(db, 'INFO', `Initial snapshots already exist, using existing baseline`, botId);
        return { 
          success: true, 
          message: 'Using existing snapshots', 
          snapshots: existingSnapshots 
        };
      }
      
      // Create new snapshots for each coin
      const snapshots = [];
      const timestamp = new Date();
      
      console.log(`Creating initial snapshots for bot ${bot.name} with ${coins.length} coins`);
      await LogEntry.log(db, 'INFO', `Creating initial price snapshots for ${coins.length} coins`, botId);
      
      for (const coin of coins) {
        try {
          // Get current price from price service
          const { price, source } = await priceService.getPrice(
            systemConfig,
            apiConfig,
            coin,
            referenceCoin,
            botId
          );
          
          // Create snapshot
          const snapshot = await CoinSnapshot.create({
            botId,
            coin,
            initialPrice: price,
            snapshotTimestamp: timestamp,
            wasEverHeld: coin === bot.initialCoin, // Mark initial coin as held
            unitsHeld: 0, // Will be updated when actual allocation happens
            ethEquivalentValue: 0, // Will be updated when actual allocation happens
            maxUnitsReached: 0 // Will be updated when actual allocation happens
          });
          
          snapshots.push(snapshot);
          
          // Save price history entry
          await PriceHistory.create({
            botId,
            coin,
            price,
            timestamp,
            source
          });
          
          console.log(`Created initial snapshot for ${coin}: ${price} ${referenceCoin}`);
          await LogEntry.log(db, 'INFO', `Created initial snapshot for ${coin}: ${price} ${referenceCoin}`, botId);
          
        } catch (error) {
          console.error(`Failed to create snapshot for ${coin}: ${error.message}`);
          await LogEntry.log(db, 'ERROR', `Failed to create snapshot for ${coin}: ${error.message}`, botId);
        }
      }
      
      return {
        success: true,
        message: `Created ${snapshots.length} initial snapshots`,
        snapshots
      };
    } catch (error) {
      console.error(`Failed to create initial snapshots: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Failed to create initial snapshots: ${error.message}`, bot.id);
      return {
        success: false,
        message: `Failed to create initial snapshots: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Update a coin's unit tracking information
   * Enhanced to provide better historical tracking of units
   * 
   * @param {Object} bot - Bot instance
   * @param {String} coin - Coin symbol
   * @param {Number} units - Current units held
   * @param {Number} price - Current price in reference coin
   * @returns {Promise<Object>} - Updated tracker
   */
  async updateCoinUnits(bot, coin, units, price) {
    try {
      const botId = bot.id;
      
      // Get or create unit tracker
      let tracker = await CoinUnitTracker.findOne({
        where: { botId, coin }
      });
      
      const timestamp = new Date();
      
      if (tracker) {
        // Update existing tracker
        tracker.units = units;
        tracker.lastUpdated = timestamp;
        await tracker.save();
      } else {
        // Create new tracker
        tracker = await CoinUnitTracker.create({
          botId,
          coin,
          units,
          lastUpdated: timestamp
        });
      }
      
      // Always update the snapshot when units change
      const snapshot = await CoinSnapshot.findOne({
        where: { botId, coin }
      });
      
      if (snapshot) {
        // Update snapshot with current units
        snapshot.unitsHeld = units;
        snapshot.wasEverHeld = true;
        
        // Update max units if current amount is higher
        if (units > snapshot.maxUnitsReached) {
          snapshot.maxUnitsReached = units;
          await LogEntry.log(db, 'INFO', `New maximum units for ${coin}: ${units}`, botId);
        }
        
        await snapshot.save();
      }
      
      console.log(`Updated unit tracking for ${coin}: ${units} units`);
      await LogEntry.log(db, 'INFO', `Updated unit tracking for ${coin}: ${units} units`, botId);
      
      return tracker;
    } catch (error) {
      console.error(`Failed to update coin units: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Failed to update coin units: ${error.message}`, bot.id);
      throw error;
    }
  }
  
  /**
   * Get initial coin prices for all coins in the bot
   * This is used for comparison to detect pumps from the starting point
   * 
   * @param {Number} botId - Bot ID
   * @returns {Promise<Object>} - Map of coin symbols to their initial prices
   */
  async getInitialPrices(botId) {
    try {
      // Get all snapshots for this bot
      const snapshots = await CoinSnapshot.findAll({
        where: { botId }
      });
      
      // Convert to a map for easy lookup
      const initialPrices = {};
      snapshots.forEach(snapshot => {
        initialPrices[snapshot.coin] = snapshot.initialPrice;
      });
      
      return initialPrices;
    } catch (error) {
      console.error(`Failed to get initial prices: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new SnapshotManagerService();
