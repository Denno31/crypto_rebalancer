/**
 * Multi-Step Trade Service
 * Handles execution of trades that require going through an intermediary coin
 */

const ThreeCommasService = require('./threeCommas.service');
const LogEntry = require('./logEntry.service');
const { logMessage } = require('../utils/logger');
const chalk = require('chalk');

/**
 * Service for executing multi-step trades through an intermediary coin
 */
class MultiStepTradeService {
  /**
   * Execute a two-step trade through an intermediary coin (typically a stablecoin)
   * 
   * @param {Object} bot - Bot instance
   * @param {Object} threeCommasClient - Initialized 3Commas client
   * @param {String} fromCoin - Starting coin
   * @param {String} toCoin - Target coin
   * @param {String} intermediaryCoin - Intermediary coin (typically USDT or USDC)
   * @param {Number} fromAmount - Amount of starting coin to trade
   * @param {Boolean} useTakeProfit - Whether to use take profit settings
   * @param {Number} takeProfitPercentage - Take profit percentage if enabled
   * @returns {Promise<Object>} Trade result object
   */
  async executeMultiStepTrade(
    bot,
    threeCommasClient,
    fromCoin,
    toCoin,
    intermediaryCoin,
    fromAmount,
    useTakeProfit = false,
    takeProfitPercentage = 2
  ) {
    try {
      logMessage('INFO', `Starting two-step trade: ${chalk.yellow(fromCoin)} → ${chalk.yellow(intermediaryCoin)} → ${chalk.yellow(toCoin)}`, bot.name);
      await LogEntry.log(null, 'TRADE', `Starting two-step trade: ${fromCoin} → ${intermediaryCoin} → ${toCoin}`, bot.id);
      
      // Step 1: Trade from original coin to intermediary coin
      logMessage('INFO', `Step 1: Trading ${chalk.yellow(fromAmount)} ${fromCoin} → ${intermediaryCoin}`, bot.name);
      const [step1Error, step1Result] = await threeCommasClient.executeTrade(
        bot.accountId,
        fromCoin,
        intermediaryCoin,
        fromAmount,
        false, // Don't use take profit for intermediate step
        0,
        'live',
        false
      );
      
      if (step1Error || !step1Result || !step1Result.success) {
        const errorMsg = step1Error?.message || 'Unknown error in step 1 of multi-step trade';
        logMessage('ERROR', `Step 1 failed: ${errorMsg}`, bot.name);
        await LogEntry.log(null, 'ERROR', `Step 1 failed: ${errorMsg}`, bot.id);
        
        return { 
          success: false, 
          error: step1Error || { message: 'Step 1 failed' },
          step: 1
        };
      }
      
      // Get the step 1 trade ID for tracking
      const step1TradeId = step1Result.tradeId;
      logMessage('INFO', `Step 1 trade initiated with ID: ${step1TradeId}`, bot.name);
      
      // Wait for step 1 to complete
      logMessage('INFO', `Waiting for step 1 to complete...`, bot.name);
      const [waitStep1Error, step1Status] = await threeCommasClient.waitForTradeCompletion(step1TradeId);
      
      if (waitStep1Error) {
        logMessage('WARNING', `Issue monitoring step 1 completion: ${waitStep1Error.message}`, bot.name);
        await LogEntry.log(null, 'WARNING', `Issue monitoring step 1 completion: ${waitStep1Error.message}`, bot.id);
        // Continue since the trade might have completed anyway
      }
      
      // Extract the amount received in the intermediary coin
      let intermediaryAmount = step1Result.amount;
      if (step1Status && step1Status.raw) {
        // Try to extract from various possible response fields
        intermediaryAmount = step1Status.raw.to_quantity || 
                          step1Status.raw.to_amount ||
                          (step1Status.raw.position && step1Status.raw.position.quantity) ||
                          intermediaryAmount;
      }
      
      // Extract commission amount from step 1 if available
      let step1Commission = 0;
      if (step1Status && step1Status.raw && step1Status.raw.commission) {
        step1Commission = parseFloat(step1Status.raw.commission.amount) || 0;
      }
      
      logMessage('INFO', `Step 1 complete. Received ${intermediaryAmount} ${intermediaryCoin}`, bot.name);
      await LogEntry.log(null, 'TRADE', `Step 1 complete. Received ${intermediaryAmount} ${intermediaryCoin}`, bot.id);
      
      // Step 2: Trade from intermediary coin to target coin
      // Subtract a small buffer (0.5%) to account for any precision or rounding issues
      const step2Amount = intermediaryAmount * 0.995;
      
      logMessage('INFO', `Step 2: Trading ${chalk.yellow(step2Amount)} ${intermediaryCoin} → ${toCoin}`, bot.name);
      const [step2Error, step2Result] = await threeCommasClient.executeTrade(
        bot.accountId,
        intermediaryCoin,
        toCoin,
        step2Amount,
        useTakeProfit, // Use take profit settings for final step if enabled
        takeProfitPercentage,
        'live',
        false
      );
      
      if (step2Error || !step2Result || !step2Result.success) {
        const errorMsg = step2Error?.message || 'Unknown error in step 2 of multi-step trade';
        logMessage('ERROR', `Step 2 failed: ${errorMsg}`, bot.name);
        await LogEntry.log(null, 'ERROR', `Step 2 failed: ${errorMsg}`, bot.id);
        
        return { 
          success: false, 
          error: step2Error || { message: 'Step 2 failed' },
          step: 2,
          step1Result,
          step1Status
        };
      }
      
      // Get the step 2 trade ID for tracking
      const step2TradeId = step2Result.tradeId;
      logMessage('INFO', `Step 2 trade initiated with ID: ${step2TradeId}`, bot.name);
      
      // Wait for step 2 to complete
      logMessage('INFO', `Waiting for step 2 to complete...`, bot.name);
      const [waitStep2Error, step2Status] = await threeCommasClient.waitForTradeCompletion(step2TradeId);
      
      if (waitStep2Error) {
        logMessage('WARNING', `Issue monitoring step 2 completion: ${waitStep2Error.message}`, bot.name);
        await LogEntry.log(null, 'WARNING', `Issue monitoring step 2 completion: ${waitStep2Error.message}`, bot.id);
        // Continue since the trade might have completed anyway
      }
      
      // Extract the final amount received in the target coin
      let finalAmount = step2Result.amount;
      if (step2Status && step2Status.raw) {
        // Try to extract from various possible response fields
        finalAmount = step2Status.raw.to_quantity || 
                    step2Status.raw.to_amount ||
                    (step2Status.raw.position && step2Status.raw.position.quantity) ||
                    finalAmount;
      }
      
      // Extract commission amount from step 2 if available
      let step2Commission = 0;
      if (step2Status && step2Status.raw && step2Status.raw.commission) {
        step2Commission = parseFloat(step2Status.raw.commission.amount) || 0;
      }
      
      logMessage('SUCCESS', `Two-step trade complete. Received ${finalAmount} ${toCoin}`, bot.name);
      await LogEntry.log(null, 'TRADE', `Two-step trade complete. Received ${finalAmount} ${toCoin}`, bot.id);
      
      // Return comprehensive trade result with data from both steps
      return {
        success: true,
        tradeId: step2TradeId, // Use the final trade ID as the main one
        firstStepTradeId: step1TradeId,
        fromCoin,
        toCoin,
        intermediaryCoin,
        amount: finalAmount,
        firstStepAmount: intermediaryAmount,
        status: 'completed',
        firstStepCommission: step1Commission,
        secondStepCommission: step2Commission,
        firstStepData: step1Status,
        secondStepData: step2Status,
        intermediaryPrice: step1Status?.price || 1.0
      };
      
    } catch (error) {
      logMessage('ERROR', `Multi-step trade execution error: ${error.message}`, bot.name);
      await LogEntry.log(null, 'ERROR', `Multi-step trade execution error: ${error.message}`, bot.id);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new MultiStepTradeService();
