/**
 * Utilities for generating trade decision explanations
 */

/**
 * Generates an explanation for why a trade is being executed
 * 
 * @param {String} fromCoin - The coin being sold
 * @param {String} toCoin - The coin being purchased
 * @param {Number} deviation - The percentage deviation that triggered the trade
 * @param {Object} additionalData - Optional additional context data
 * @returns {String} - Explanation message
 */
const generateTradeExplanation = (fromCoin, toCoin, deviation, additionalData = {}) => {
  // Format the deviation to 2 decimal places
  const deviationFormatted = parseFloat(Math.abs(deviation).toFixed(2));
  
  // Basic explanation
  let explanation = `Trading ${fromCoin} for ${toCoin} due to ${deviationFormatted}% deviation from target allocation`;
  
  // Add context about target allocations if available
  if (additionalData.fromTarget && additionalData.toTarget) {
    explanation += ` (${fromCoin} target: ${additionalData.fromTarget}%, current: ${(additionalData.fromTarget - deviation).toFixed(2)}%, ${toCoin} target: ${additionalData.toTarget}%)`;
  }
  
  // Add price information if available
  if (additionalData.fromPrice && additionalData.toPrice) {
    explanation += `. Price of ${fromCoin}: ${additionalData.fromPrice}, ${toCoin}: ${additionalData.toPrice}`;
  }
  
  return explanation;
};

/**
 * Generates an explanation for why a trade opportunity was missed
 * 
 * @param {String} reason - The main reason code for the missed opportunity
 * @param {Object} context - Additional context about the missed opportunity
 * @returns {String} - Explanation message
 */
const generateMissedOpportunityReason = (reason, context = {}) => {
  const reasons = {
    'insufficient_funds': `Insufficient funds to execute trade (${context.available || 0} ${context.currency || ''} available, ${context.required || 0} ${context.currency || ''} required)`,
    'min_trade_amount': `Trade amount below exchange minimum (${context.amount || 0} ${context.currency || ''})`,
    'market_closed': `Trading pair ${context.pair || ''} is not available on the exchange`,
    'price_slippage': `Price slippage exceeded tolerance (${context.slippage || 0}%)`,
    'exchange_error': `Exchange API error: ${context.message || 'Unknown error'}`,
    'below_threshold': `Deviation (${context.deviation || 0}%) below threshold (${context.threshold || 0}%)`,
    'asset_locked': `Asset ${context.asset || ''} is locked until ${context.unlockTime || 'unknown time'}`,
    'other': context.message || 'Unknown reason'
  };
  
  return reasons[reason] || reasons['other'];
};

module.exports = {
  generateTradeExplanation,
  generateMissedOpportunityReason
};
