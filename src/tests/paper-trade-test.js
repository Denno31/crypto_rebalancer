/**
 * Script to test 3Commas paper trading
 * This script will attempt to execute a small test trade in paper trading mode
 */

const db = require('../models');
const ApiConfig = db.apiConfig;
const Bot = db.bot;
const ThreeCommasService = require('../services/threeCommas.service');
const { Op } = require('sequelize');

// Main test function
async function testPaperTrade() {
  console.log('================================================================================');
  console.log('3Commas Paper Trade Test');
  console.log('================================================================================');
  console.log('ℹ️ Using PAPER TRADING mode - no real funds will be used');
  console.log();

  try {
    console.log('Retrieving system configuration and API credentials...');
    
    // Get API config with mode
    const apiConfig = await ApiConfig.findOne({
      where: {
        name: '3commas'
      }
    });

    if (!apiConfig) {
      throw new Error('3Commas API configuration not found');
    }

    // Get any active bot for testing
    console.log('Looking for an active bot...');
    const bot = await Bot.findOne({
      where: {
        // Using the correct field name from the Bot model
        enabled: true
      }
    });

    if (!bot) {
      throw new Error('No active bot found');
    }

    console.log(`✅ Found bot: ${bot.name} (ID: ${bot.id})`);
    
    // Get API credentials from config
    const apiKey = apiConfig.apiKey;
    const apiSecret = apiConfig.apiSecret;
    const tradingMode = apiConfig.mode || 'paper'; // Default to paper mode if not set
    
    if (!apiKey || !apiSecret) {
      throw new Error('API credentials not found');
    }
    
    console.log('✅ API credentials retrieved from database');
    console.log(`✅ Trading mode: ${tradingMode}`);

    // Create 3Commas service
    const threeCommasService = new ThreeCommasService(apiKey, apiSecret);
    
    console.log('\nStep 1: Using bot configuration for test trade...');
    
    // Get account ID from bot or use a default
    const accountId = bot.accountId || '33213084'; // Use bot's account ID or default
    console.log(`✅ Using bot's account ID: ${accountId}`);
    
    // Log bot configuration
    console.log('Bot configuration:');
    console.log(`  • Name: ${bot.name}`);
    console.log(`  • Current coin: ${bot.currentCoin || 'None'}`);
    console.log(`  • Allocation: ${bot.allocation !== null ? bot.allocation + '%' : 'null%'}`);
    console.log(`  • Manual budget: ${bot.manualBudget || 0.0001} USDT`);
    console.log(`  • Threshold: ${bot.thresholdPercentage || 5}%`);
    console.log(`  • Commission rate: ${(bot.commissionRate || 0.002) * 100}%`);

    // Verify account exists
    console.log('\nVerifying account in 3Commas...');
    const [accountsError, accounts] = await threeCommasService.getAccounts();
    
    if (accountsError || !accounts || accounts.length === 0) {
      throw new Error(`Failed to retrieve accounts: ${accountsError ? JSON.stringify(accountsError) : 'No accounts found'}`);
    }
    
    const account = accounts.find(a => String(a.id) === String(accountId));
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found in 3Commas`);
    }
    
    console.log(`✅ Verified account exists in 3Commas: ${accountId}`);

    console.log('\nStep 2: Fetching account balances...');
    const [balanceError, balances] = await threeCommasService.getAvailableCoins(accountId);
    
    if (balanceError) {
      throw new Error(`Failed to fetch account balances: ${JSON.stringify(balanceError)}`);
    }
    
    console.log(`✅ Found ${balances.length} coins with balances`);
    console.log(balances);
    
    // Find a coin with sufficient balance for testing
    // For this test we'll use ADA if available, otherwise pick the first non-USDT coin
    const adaCoin = balances.find(b => b.coin === 'ADA');
    const testCoin = adaCoin || balances.find(b => b.coin !== 'USDT') || balances[0];
    
    if (!testCoin) {
      throw new Error('No coins with balance found');
    }
    
    console.log(`✅ Found ${testCoin.coin} balance: ${testCoin.amount} (worth $${testCoin.amountInUsd})`);
    
    // Use a very small amount for testing - 1% of available or a fixed minimal amount
    const allocation = 1; // 1%
    const manualBudget = 0.0001; // Absolute minimum for testing
    
    console.log(`Using allocation: ${allocation}%`);
    console.log(`Using manual budget: ${manualBudget} ${testCoin.coin}`);
    
    // Determine actual trade amount
    const usingPercentage = true;
    const actualAmount = usingPercentage 
      ? testCoin.amount * (allocation / 100)
      : Math.min(manualBudget, testCoin.amount * 0.01); // Never use more than 1% of balance
    
    console.log(`Using actual balance percentage: ${allocation}%`);
    console.log(`Will trade ${actualAmount} ${testCoin.coin} to USDT`);
    
    console.log('\nStep 3: Fetching actual commission rates from exchange...');
    const [rateError, commissionRates] = await threeCommasService.getExchangeCommissionRates(accountId);
    
    if (rateError) {
      console.warn(`Warning: Failed to get commission rates: ${JSON.stringify(rateError)}`);
    }
    
    if (commissionRates) {
      console.log(`✅ Got commission rates from exchange: ${commissionRates.exchange}`);
      console.log(`  • Maker fee: ${commissionRates.makerRate * 100}%`);
      console.log(`  • Taker fee: ${commissionRates.takerRate * 100}%`);
      console.log(`  • Source: ${commissionRates.source}`);
      
      // For market orders we use taker fee
      console.log(`Using taker fee for market order: ${commissionRates.takerRate * 100}%`);
      console.log(`Estimated fee on $${testCoin.amountInUsd} would be $${(testCoin.amountInUsd * commissionRates.takerRate).toFixed(4)}`);
    }
    
    console.log('\nStep 4: Executing trade in PAPER TRADING mode...');
    console.log(`Trade amount: ${actualAmount} ${testCoin.coin}`);
    console.log('PAPER TRADING - No real funds will be used!');
    
    // Execute the trade with paper trading mode
    const [tradeError, tradeResult] = await threeCommasService.executeTrade(
      accountId,
      testCoin.coin, // from_coin
      'USDT',        // to_coin
      actualAmount,  // amount
      false,         // useTakeProfit
      2,             // takeProfitPercentage
      tradingMode    // mode - use the mode from API config (paper)
    );
    
    if (tradeError) {
      console.error(`Error executing trade: ${JSON.stringify(tradeError)}`);
      throw new Error(`Failed to execute trade: ${JSON.stringify(tradeError)}`);
    }
    
    console.log('✅ Paper trade executed successfully!');
    console.log(`✅ Trade ID: ${tradeResult.tradeId}`);
    console.log(`✅ Status: ${tradeResult.status}`);
    console.log(`✅ Pair: ${tradeResult.pair}`);
    console.log('\nFull trade response:');
    console.log(JSON.stringify(tradeResult.raw, null, 2));

    console.log('\nStep 5: Verifying trade status...');
    // Get trade status
    const [statusError, tradeStatus] = await threeCommasService.getTradeStatus(tradeResult.tradeId);
    
    if (statusError) {
      console.error(`Error getting trade status: ${JSON.stringify(statusError)}`);
    } else {
      console.log(`✅ Current trade status: ${tradeStatus.status}`);
      console.log(`✅ Profit: ${tradeStatus.profit || 'N/A'}`);
      console.log(`✅ Created: ${new Date(tradeStatus.createdAt).toLocaleString()}`);
      console.log(`✅ Updated: ${new Date(tradeStatus.updatedAt).toLocaleString()}`);
    }
    
    console.log('\nPaper trade test completed successfully! 🎉');
  } catch (error) {
    console.error(`Error during test: ${error.message}`);
    throw error;
  }
}

// Run the test
testPaperTrade()
  .then(() => {
    console.log('\nTest complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
