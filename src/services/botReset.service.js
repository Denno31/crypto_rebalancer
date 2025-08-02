'use strict';

const db = require('../models');
const Bot = db.bot;
const BotResetEvent = db.botResetEvent;
const ThreeCommasService = require('./threeCommas.service');
const chalk = require('chalk');

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

/**
 * Service for handling bot reset operations
 */
class BotResetService {
  /**
   * Reset a bot to its initial state
   * @param {number} botId - ID of the bot to reset
   * @param {Object} options - Reset options
   * @param {string} options.resetType - Type of reset ('soft' or 'hard')
   * @param {boolean} options.sellToStablecoin - Whether to sell to stablecoin before reset
   * @returns {Promise<Object>} - The updated bot
   */
  async resetBot(botId, options = {}) {
    const { resetType = 'soft', sellToStablecoin = false } = options;
    console.log('resetting bot', resetType)
    try {
      // Find the bot
      const bot = await Bot.findByPk(botId);
      if (!bot) {
        throw new Error('Bot not found');
      }
      
      logMessage('INFO', `Resetting bot ${botId} (${bot.name}), type: ${resetType}, sellToStablecoin: ${sellToStablecoin}`, bot.name);
      
      // Optional: Sell to stablecoin if requested
      if (sellToStablecoin) {
        await this.sellAllToStablecoin(bot);
      }
      
      // Create reset event record
      await BotResetEvent.create({
        botId,
        resetType,
        previousCoin: bot.currentCoin,
        previousGlobalPeak: bot.globalPeakValue,
        timestamp: new Date()
      });
      
      // Determine which coin to reset to
      let targetCoin = bot.currentCoin; // Default for soft reset
      
      if (resetType === 'hard') {
        // Hard reset goes back to initial coin
        targetCoin = bot.initialCoin || bot.preferredStablecoin || 'USDT';
      }
      
      // Reset bot state
      const updates = {
        currentCoin: targetCoin,
        globalPeakValue: null, // Will be set on next evaluation
        lastEvaluationTime: null,
        lastTradeTime: null,
        protectionTriggered: false,
        protectionCooldownUntil: null,
        isLocked: false,
        errorState: null,
        errorCount: 0
      };
      
      await bot.update(updates);
      
      // Return the updated bot
      return Bot.findByPk(botId);
    } catch (error) {
      logMessage('ERROR', `Error resetting bot ${botId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Sell all assets to stablecoin
   * @param {Object} bot - The bot object
   * @returns {Promise<void>}
   */
  async sellAllToStablecoin(bot) {
    try {
      const currentCoin = bot.currentCoin;
      const targetStablecoin = bot.preferredStablecoin || 'USDT';
      
      // Skip if already in stablecoin
      if (currentCoin === targetStablecoin) {
        logMessage('INFO', `Bot ${bot.id} already in stablecoin ${targetStablecoin}, skipping sell`);
        return;
      }
      
      logMessage('INFO', `Selling all assets to ${bot.preferredStablecoin} for bot ${bot.id} (${bot.name})`, bot.name);
      
      // Get 3Commas account info
      const apiConfig = await db.apiConfig.findOne({ where: { userId: bot.userId } });
      if (!apiConfig) {
        throw new Error('API configuration not found');
      }
      
      // Initialize 3Commas service
      const threeCommasService = new ThreeCommasService(apiConfig.apiKey, apiConfig.apiSecret);
      
      // Execute sell to stablecoin (using max amount)
      // This would use the existing sellToStablecoin method if available
      // or fall back to a direct trade execution
      await threeCommasService.sellToStablecoin(
        bot.accountId,
        currentCoin,
        targetStablecoin,
        'all' // Sell all available amount
      );
      
      // Update bot's current coin
      await bot.update({ currentCoin: targetStablecoin });
      
      logMessage('INFO', `Successfully sold assets to ${bot.preferredStablecoin}`, bot.name);
    } catch (error) {
      logMessage('ERROR', `Error selling to stablecoin for bot ${bot.id}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new BotResetService();
