/**
 * Asset Manager Service
 * 
 * Handles asset ownership, locking and conflict resolution
 * between multiple bots operating on the same exchange account
 */
const db = require('../models');
const { Op } = require('sequelize');
const AssetLock = db.assetLock;
const BotAsset = db.botAsset;
const Bot = db.bot;
const LogEntry = db.logEntry;
const chalk = require('chalk');

// Format and log messages
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

class AssetManagerService {
  /**
   * Initialize the asset manager service
   */
  constructor() {
    // Cleanup interval - check for expired locks every minute
    this.cleanupInterval = setInterval(() => this.cleanupExpiredLocks(), 60000);
  }
  
  /**
   * Lock assets for a specific bot operation
   * @param {Number} botId - Bot ID requesting the lock
   * @param {String} coin - Coin to lock
   * @param {Number} amount - Amount to lock
   * @param {String} reason - Reason for locking (e.g., "trade", "allocation")
   * @param {Number} timeoutMinutes - Lock timeout in minutes (default: 10)
   * @returns {Promise<Object>} - Lock result with success flag and lock ID if successful
   */
  async lockAssets(botId, coin, amount, reason = "trade", timeoutMinutes = 10) {
    try {
      // Get bot details for better logging
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        throw new Error(`Bot with ID ${botId} not found`);
      }

      // Check if the bot has enough of this asset to lock
      const botAsset = await BotAsset.findOne({
        where: {
          botId,
          coin
        }
      });
      
      if (!botAsset || botAsset.amount < amount) {
        return {
          success: false,
          error: `Bot doesn't have enough ${coin} to lock (requested: ${amount}, available: ${botAsset ? botAsset.amount : 0})`,
          code: 'INSUFFICIENT_ASSETS'
        };
      }
      
      // Check for existing locks on this coin by other bots
      const existingLocks = await AssetLock.findAll({
        where: {
          coin,
          status: 'locked',
          expiresAt: { [Op.gt]: new Date() }, // Not expired
          botId: { [Op.ne]: botId } // Not from this bot
        }
      });
      
      // Check if existing locks conflict with this request
      let conflictingLock = null;
      for (const lock of existingLocks) {
        const otherBot = await Bot.findByPk(lock.botId);
        const otherBotName = otherBot ? otherBot.name : `Bot #${lock.botId}`;
        
        // If there's a lock by another bot, log a warning
        logMessage('WARNING', `Found existing lock on ${coin} by ${otherBotName} (${lock.amount} units)`, bot.name);
        
        // For now we consider any lock by another bot as conflicting
        // In the future, we could implement more sophisticated rules
        // e.g., allow partial locks if the total isn't exceeded
        conflictingLock = lock;
        break;
      }
      
      if (conflictingLock) {
        return {
          success: false,
          error: `Asset ${coin} is locked by another bot until ${conflictingLock.expiresAt.toISOString()}`,
          code: 'ASSET_LOCKED',
          expiresAt: conflictingLock.expiresAt
        };
      }
      
      // Calculate lock expiration time
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + timeoutMinutes);
      
      // Create the lock
      const lock = await AssetLock.create({
        botId,
        coin,
        amount,
        reason,
        status: 'locked',
        expiresAt
      });
      
      logMessage('INFO', `Locked ${amount} ${coin} for ${reason} until ${expiresAt.toISOString()}`, bot.name);
      await LogEntry.log(db, 'INFO', `Locked ${amount} ${coin} for ${reason}`, botId);
      
      return {
        success: true,
        lockId: lock.id,
        expiresAt
      };
    } catch (error) {
      logMessage('ERROR', `Failed to lock assets: ${error.message}`);
      await LogEntry.log(db, 'ERROR', `Asset lock failed: ${error.message}`, botId);
      return {
        success: false,
        error: error.message,
        code: 'LOCK_ERROR'
      };
    }
  }
  
  /**
   * Release a previously acquired lock
   * @param {Number} lockId - ID of the lock to release
   * @param {Number} botId - Bot ID that owns the lock (for verification)
   * @returns {Promise<Object>} - Release result
   */
  async releaseLock(lockId, botId) {
    try {
      const lock = await AssetLock.findByPk(lockId);
      
      if (!lock) {
        return {
          success: false,
          error: `Lock with ID ${lockId} not found`,
          code: 'LOCK_NOT_FOUND'
        };
      }
      
      // Verify the lock belongs to the bot
      if (lock.botId !== botId) {
        return {
          success: false,
          error: `Lock belongs to bot ${lock.botId}, not ${botId}`,
          code: 'UNAUTHORIZED'
        };
      }
      
      // Update the lock status
      await lock.update({
        status: 'released'
      });
      
      const bot = await Bot.findByPk(botId);
      const botName = bot ? bot.name : `Bot #${botId}`;
      
      logMessage('INFO', `Released lock on ${lock.amount} ${lock.coin}`, botName);
      
      return {
        success: true,
        message: `Lock on ${lock.amount} ${lock.coin} released`
      };
    } catch (error) {
      logMessage('ERROR', `Failed to release lock: ${error.message}`);
      return {
        success: false,
        error: error.message,
        code: 'RELEASE_ERROR'
      };
    }
  }
  
  /**
   * Extend an existing lock's expiration time
   * @param {Number} lockId - ID of the lock to extend
   * @param {Number} botId - Bot ID that owns the lock
   * @param {Number} additionalMinutes - Additional minutes to extend
   * @returns {Promise<Object>} - Extension result
   */
  async extendLock(lockId, botId, additionalMinutes = 10) {
    try {
      const lock = await AssetLock.findByPk(lockId);
      
      if (!lock) {
        return {
          success: false,
          error: `Lock with ID ${lockId} not found`,
          code: 'LOCK_NOT_FOUND'
        };
      }
      
      // Verify the lock belongs to the bot
      if (lock.botId !== botId) {
        return {
          success: false,
          error: `Lock belongs to bot ${lock.botId}, not ${botId}`,
          code: 'UNAUTHORIZED'
        };
      }
      
      // Calculate new expiration
      const newExpiration = new Date(lock.expiresAt);
      newExpiration.setMinutes(newExpiration.getMinutes() + additionalMinutes);
      
      // Update the lock
      await lock.update({
        expiresAt: newExpiration
      });
      
      return {
        success: true,
        message: `Lock extended until ${newExpiration.toISOString()}`,
        expiresAt: newExpiration
      };
    } catch (error) {
      logMessage('ERROR', `Failed to extend lock: ${error.message}`);
      return {
        success: false,
        error: error.message,
        code: 'EXTENSION_ERROR'
      };
    }
  }
  
  /**
   * Clean up expired locks
   * @returns {Promise<Number>} - Number of locks cleaned up
   * @private
   */
  async cleanupExpiredLocks() {
    try {
      const now = new Date();
      
      // Find expired locks
      const expiredLocks = await AssetLock.findAll({
        where: {
          status: 'locked',
          expiresAt: { [Op.lt]: now }
        }
      });
      
      if (expiredLocks.length === 0) {
        return 0;
      }
      
      // Update all expired locks to 'released'
      await AssetLock.update(
        { status: 'released' },
        {
          where: {
            id: { [Op.in]: expiredLocks.map(lock => lock.id) }
          }
        }
      );
      
      logMessage('INFO', `Released ${expiredLocks.length} expired asset locks`);
      return expiredLocks.length;
    } catch (error) {
      logMessage('ERROR', `Lock cleanup failed: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Check if a bot can safely trade a specific coin amount
   * @param {Number} botId - Bot ID
   * @param {String} coin - Coin to check
   * @param {Number} amount - Amount to check
   * @returns {Promise<Object>} - Check result
   */
  async canTradeAsset(botId, coin, amount) {
    try {
      // Get bot details for better logging
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        throw new Error(`Bot with ID ${botId} not found`);
      }
      
      // Check if the bot has enough of this asset
      const botAsset = await BotAsset.findOne({
        where: {
          botId,
          coin
        }
      });
      
      if (!botAsset || botAsset.amount < amount) {
        return {
          canTrade: false,
          reason: `Insufficient assets (available: ${botAsset ? botAsset.amount : 0}, required: ${amount})`
        };
      }
      
      // Check for existing locks on this coin by other bots
      const existingLocks = await AssetLock.findAll({
        where: {
          coin,
          status: 'locked',
          expiresAt: { [Op.gt]: new Date() }, // Not expired
          botId: { [Op.ne]: botId } // Not from this bot
        }
      });
      
      if (existingLocks.length > 0) {
        const otherBot = await Bot.findByPk(existingLocks[0].botId);
        return {
          canTrade: false,
          reason: `Asset is locked by ${otherBot ? otherBot.name : 'another bot'} until ${existingLocks[0].expiresAt.toISOString()}`
        };
      }
      
      return {
        canTrade: true
      };
    } catch (error) {
      logMessage('ERROR', `Asset availability check failed: ${error.message}`);
      return {
        canTrade: false,
        reason: `Error: ${error.message}`
      };
    }
  }
}

module.exports = new AssetManagerService();
