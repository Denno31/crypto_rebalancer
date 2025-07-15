/**
 * Real 3Commas Trade Test
 * 
 * This script verifies that real trades can be executed through the 3Commas API
 * by making a small test trade with minimal amount.
 * 
 * IMPORTANT: This will execute a REAL trade on 3Commas using actual funds.
 * Use with caution and only with minimal amounts.
 * 
 * Usage: 
 *   NODE_ENV=production node src/tests/real-trade-test.js
 *   
 * To run in simulation mode (no real trades):
 *   SIMULATE_TRADES=true node src/tests/real-trade-test.js
 */

require('dotenv').config();
const db = require('../models');
const chalk = require('chalk');
const ThreeCommasService = require('../services/threeCommas.service');
const BotService = require('../services/bot.service');
const Bot = db.bot;
const ApiConfig = db.apiConfig;
const SystemConfig = db.systemConfig;

// Parse command line arguments
const args = process.argv.slice(2);
const simulate = args.includes('--simulate');

// Configuration
const config = {
  // Minimal trade amount (in base coin)
  minimalTradeAmount: 1, // Very small amount, adjust based on exchange minimums
  
  // Time to wait before checking trade status (ms)
  statusCheckDelay: 5000,
  
  // Currency pairs to use for testing (adjust based on your account)
  fromCoin: 'ADA',
  toCoin: 'SHIB',
  
  // Whether to use take profit for the test trade
  useTakeProfit: false,
  takeProfitPercentage: 2,
};

/**
 * Sleep utility function
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main test function
 */
async function testRealTrade() {
  try {
    console.log(chalk.blue('='.repeat(80)));
    console.log(chalk.blue('3Commas Real Trade Test'));
    console.log(chalk.blue('='.repeat(80)));
    
    const isSimulation = process.env.SIMULATE_TRADES === 'true' || 
                          process.env.NODE_ENV !== 'production' ||
                          process.argv.includes('--simulate');
    
    // Store simulation flag in config for later use                      
    config.simulateMode = isSimulation;
                          
    if (isSimulation) {
      console.log(chalk.yellow('⚠️ Running in SIMULATION MODE - No real trades will be executed'));
      console.log(chalk.yellow('⚠️ Set NODE_ENV=production and SIMULATE_TRADES=false for real trades'));
    } else {
      console.log(chalk.red('⚠️ CAUTION: Running in PRODUCTION MODE - REAL trades will be executed!'));
      console.log(chalk.red('⚠️ Using minimal amount but REAL funds will be used!'));
      console.log(chalk.yellow('\nPress Ctrl+C now to cancel if this is not intended\n'));
      // Give user 5 seconds to cancel
      await sleep(5000);
    }
    
    // Get the system configuration and API credentials from database
    console.log('Retrieving system configuration and API credentials...');
  
    // First look for an active bot with Binance demo account
    console.log('Looking for an active bot...');
    const activeBot = await Bot.findOne({ 
      where: { 
        enabled: true
        // Optionally filter for bots on Binance if you want to be specific
      }, 
      order: [['updated_at', 'DESC']] 
    });
  
    if (!activeBot) {
      throw new Error('No enabled bot found in database');
    }
  
    console.log(chalk.green(`✅ Found bot: ${activeBot.name} (ID: ${activeBot.id})`));
  
    // Get API config for this bot's account
    console.log('Retrieving API config from database...');
    const apiConfig = await ApiConfig.findOne();
    if (!apiConfig) {
      throw new Error('3Commas API configuration not found in database');
    }
    
    console.log('API Config found in database:');
    console.log(`  • ID: ${apiConfig.id}`);
    console.log(`  • Provider: ${apiConfig.provider || 'Not specified'}`);
    console.log(`  • Updated at: ${apiConfig.updated_at || apiConfig.updatedAt}`);
    console.log(`  • API Key Prefix: ${apiConfig.apiKey.substring(0, 4)}...`);
    
    const apiKey = apiConfig.apiKey;
    const apiSecret = apiConfig.apiSecret;
    
    if (!apiKey || !apiSecret) {
      throw new Error('3Commas API key and/or secret not found in database');
    }
    
    console.log(chalk.green('✅ API credentials retrieved from database'));
    
    // Create ThreeCommasService instance with the API credentials
    console.log('Creating ThreeCommasService with the retrieved API credentials...');
    const threeCommasService = new ThreeCommasService(
      apiConfig.apiKey,
      apiConfig.apiSecret,
      { requestTimeout: 10000 }
    );
    
    console.log(`Service created with API Key prefix: ${apiConfig.apiKey.substring(0, 4)}...`);

    console.log(chalk.cyan('\nStep 1: Using bot configuration for test trade...'));
    // Use the active bot's account ID
    const accountId = activeBot.accountId;
    console.log(chalk.green(`✅ Using bot's account ID: ${accountId}`));
  
    // Log the bot's configuration for transparency
    console.log(chalk.yellow(`Bot configuration:`));
    console.log(`  • Name: ${activeBot.name}`);
    console.log(`  • Current coin: ${activeBot.currentCoin}`);
    console.log(`  • Allocation: ${activeBot.allocationPercentage}%`);
    console.log(`  • Manual budget: ${activeBot.manualBudgetAmount || 'Not set'} USDT`);
    console.log(`  • Threshold: ${activeBot.thresholdPercentage}%`);
    console.log(`  • Commission rate: ${(activeBot.commissionRate * 100).toFixed(2)}%`);
  
    // Verify account exists in 3Commas
    console.log(chalk.cyan('\nVerifying account in 3Commas...'));
    const [accountsError, accounts] = await threeCommasService.getAccounts();
  
    if (accountsError) {
      console.error(chalk.red(`❌ Error fetching accounts: ${JSON.stringify(accountsError)}`));
      console.log(chalk.yellow('Continuing with test using configured account ID...'));
    } else {
      const accountExists = accounts && accounts.find(acc => acc.id.toString() === accountId.toString());
      if (accountExists) {
        console.log(chalk.green(`✅ Verified account exists in 3Commas: ${accountId}`));
      } else {
        console.log(chalk.yellow(`⚠️ Warning: Account ID ${accountId} not found in 3Commas accounts list`));
        console.log(chalk.yellow('Continuing with test using configured account ID...'));
      }
    }

    // Step 2: Get the account balances to verify we have the coins
    console.log(chalk.cyan('\nStep 2: Fetching account balances...'));
    const [balancesError, balances] = await threeCommasService.getAvailableCoins(accountId);
    
    // Check if we got balances back
    let simulatedBalances = null;
    if (balancesError || !balances || balances.length === 0) {
      console.log(chalk.yellow(`⚠️ No balances found or access denied. Using simulation values for test`));
      
      // In simulation mode, we can continue with test values
      if (config.simulateMode) {
        console.log(chalk.yellow(`Using simulated balances for test coins ${config.fromCoin} and ${config.toCoin}`));
        
        // Create mock balances for testing
        simulatedBalances = [
          {
            coin: config.fromCoin,
            name: config.fromCoin,
            amount: 1.0,
            amountInUsd: 100
          },
          {
            coin: config.toCoin,
            name: config.toCoin,
            amount: 10.0,
            amountInUsd: 50
          }
        ];
      } else {
        // In real mode, we can't proceed without actual balances
        throw new Error(`Failed to get balances: ${JSON.stringify(balancesError || { error: 'No balances found' })}`);
      }
    } else {
      console.log(chalk.green(`✅ Found ${balances.length} coins with balances`));
    }
    
    // Find the balance for the coin we want to trade from
    let fromCoinBalance;
    
    if (simulatedBalances) {
      // Using our simulated balances
      fromCoinBalance = simulatedBalances.find(b => b.coin === config.fromCoin);
      if (fromCoinBalance) {
        // Convert to expected format
        fromCoinBalance.currency_code = fromCoinBalance.coin;
        fromCoinBalance.usd_value = fromCoinBalance.amountInUsd;
      }
    } else {
      // Using real balances from API
      console.log({balances})
      fromCoinBalance = balances.find(b => b.coin === config.fromCoin);
    }
    
    if (!fromCoinBalance) {
      throw new Error(`No balance found for ${config.fromCoin}`);
    }
    
    console.log(chalk.green(`✅ Found ${config.fromCoin} balance: ${fromCoinBalance.amount} (worth $${fromCoinBalance.usd_value || fromCoinBalance.amountInUsd})`));
    
    // Calculate trade amount using bot's allocation settings if available
    const availableAmount = parseFloat(fromCoinBalance.amount || 0);
    // Make sure we have a valid balance
    if (availableAmount <= 0) {
      throw new Error(`Insufficient ${config.fromCoin} balance (${availableAmount}). Cannot proceed with test trade.`);
    }
    
    // Calculate trade amount based on bot allocation settings
    let tradeAmount;
    
    // Make sure we have valid allocation percentage and budget values
    const allocationPercentage = activeBot.allocationPercentage || 1; // Default to 1% if null
    const manualBudgetAmount = activeBot.manualBudgetAmount || 0;
    
    console.log(chalk.blue(`Using allocation: ${allocationPercentage}%`));
    console.log(chalk.blue(`Using manual budget: ${manualBudgetAmount} USDT`));
    
    // For testing, we'll use a minimal amount regardless of budget settings
    // This is to ensure trades are small and safe during testing
    tradeAmount = config.minimalTradeAmount || 0.0001;
    console.log({tradeAmount})
    // If in production and not simulating, we would use the bot's actual budget settings:
    if (!simulate && process.env.NODE_ENV === 'production') {
      
      if (manualBudgetAmount > 0.1 && config.fromCoin !== 'USDT') {
        // Convert manual budget from USDT to fromCoin units
        console.log(fromCoinBalance)
        const fromCoinPriceInUSDT = fromCoinBalance.amountInUsd / availableAmount;
        const allocatedBudget = manualBudgetAmount * (allocationPercentage / 100);
        tradeAmount = Math.min(allocatedBudget / fromCoinPriceInUSDT, availableAmount * 0.1);
        console.log(chalk.blue(`Using actual budget allocation: ${allocatedBudget} USDT`));
      } else {
        // Use a percentage of available balance
        tradeAmount = availableAmount * (allocationPercentage / 100);
        console.log(chalk.blue(`Using actual balance percentage: ${allocationPercentage}%`));
      }
    }
    
    // For safety in testing, cap at a small amount
  
    tradeAmount = Math.min(tradeAmount, config.minimalTradeAmount || 0.0001);
  
    
    if (tradeAmount <= 0 || isNaN(tradeAmount)) {
      throw new Error(`Invalid trade amount calculated: ${tradeAmount}`);
    }
    
    console.log(chalk.yellow(`Will trade ${tradeAmount} ${config.fromCoin} to ${config.toCoin}`));
    
    // Step 3: Check actual commission rates (new feature)
    console.log(chalk.cyan(`\nStep 3: Fetching actual commission rates from exchange...`));
    try {
      const [rateError, rateData] = await threeCommasService.getExchangeCommissionRates(accountId);
      
      if (!rateError && rateData) {
        console.log(chalk.green(`✅ Got commission rates from exchange: ${rateData.exchange}`));
        console.log(chalk.green(`  • Maker fee: ${rateData.makerRate * 100}%`));
        console.log(chalk.green(`  • Taker fee: ${rateData.takerRate * 100}%`));
        console.log(chalk.green(`  • Source: ${rateData.source}`));
        
        // Market orders use taker fee
        console.log(chalk.yellow(`Using taker fee for market order: ${rateData.takerRate * 100}%`));
        console.log(chalk.yellow(`Estimated fee on $${fromCoinBalance.usd_value || fromCoinBalance.amountInUsd} would be $${((fromCoinBalance.usd_value || fromCoinBalance.amountInUsd) * rateData.takerRate).toFixed(4)}`));
      } else {
        console.log(chalk.yellow(`⚠️ Could not get actual commission rates: ${rateError?.message || 'Unknown error'}`));
        console.log(chalk.yellow(`Using default commission rate: 0.2%`));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Error fetching commission rates: ${error.message}`));
      console.log(chalk.yellow(`Using default commission rate: 0.2%`));
    }
    
    // Step 4: Execute the trade
    console.log(chalk.cyan(`\nStep 4: Executing trade ${config.fromCoin} → ${config.toCoin}...`));
    console.log(chalk.yellow(`Trade amount: ${tradeAmount} ${config.fromCoin}`));
    
    // Log what will happen based on mode
    if (isSimulation) {
      console.log(chalk.yellow('Simulation mode: No real trade will be executed'));
    } else {
      console.log(chalk.red('EXECUTING REAL TRADE - Real funds will be used!'));
    }
    
    const startTime = new Date();
    const [tradeError, tradeResult] = await threeCommasService.executeTrade(
      accountId,
      config.fromCoin,
      config.toCoin,
      tradeAmount,
      config.useTakeProfit,
      config.takeProfitPercentage
    );
    
    if (tradeError) {
      throw new Error(`Failed to execute trade: ${JSON.stringify(tradeError)}`);
    }
    
    if (!tradeResult || !tradeResult.success) {
      throw new Error('Trade execution failed or returned invalid result');
    }
    
    console.log(chalk.green(`✅ Trade executed successfully!`));
    console.log(chalk.green(`Trade ID: ${tradeResult.tradeId}`));
    console.log(chalk.green(`Status: ${tradeResult.status}`));
    console.log(chalk.green(`Amount: ${tradeResult.amount} ${config.fromCoin}`));
    console.log(chalk.green(`Target: ${config.toCoin}`));
    console.log(chalk.green(`Average price: ${tradeResult.averagePrice || 'N/A'}`));
    
    // Step 4: Check trade status
    console.log(chalk.cyan(`\nStep 4: Waiting for trade status update...`));
    console.log(`Waiting ${config.statusCheckDelay/1000} seconds before checking status...`);
    await sleep(config.statusCheckDelay);
    
    // Use the new getTradeStatus method to check the trade status
    const [statusError, statusResult] = await threeCommasService.getTradeStatus(tradeResult.tradeId);
    
    if (statusError) {
      console.log(chalk.yellow(`Warning: Failed to get trade status: ${JSON.stringify(statusError)}`));
      console.log(chalk.yellow('Trade may still be processing. Check 3Commas dashboard manually.'));
    } else {
      console.log(chalk.green(`✅ Trade status fetched successfully!`));
      console.log(chalk.yellow(`Current status: ${statusResult.status}`));
      console.log(chalk.yellow(`Created at: ${statusResult.created_at || 'N/A'}`));
      console.log(chalk.yellow(`Updated at: ${statusResult.updated_at || 'N/A'}`));
      
      if (statusResult.status === 'completed' || statusResult.status === 'done') {
        console.log(chalk.green(`✅ Trade completed successfully!`));
      } else if (statusResult.status === 'failed' || statusResult.status === 'cancelled') {
        console.log(chalk.red(`❌ Trade failed or was cancelled`));
      } else {
        console.log(chalk.yellow(`Trade is still in progress (${statusResult.status})`));
        console.log(chalk.yellow(`Check the 3Commas dashboard for more details`));
      }
    }
    
    // Step 5: Record test results and execution time
    const endTime = new Date();
    const executionTime = (endTime - startTime) / 1000;
    
    console.log(chalk.blue('\n='.repeat(80)));
    console.log(chalk.green(`Test completed in ${executionTime} seconds`));
    
    if (isSimulation) {
      console.log(chalk.yellow('This test ran in SIMULATION mode. No real trades were executed.'));
      console.log(chalk.yellow('To execute real trades, set NODE_ENV=production and SIMULATE_TRADES=false'));
    } else {
      console.log(chalk.green('REAL TRADE was executed successfully!'));
      console.log(chalk.green(`Check your 3Commas dashboard to see the trade details.`));
    }
    
    console.log(chalk.blue('='.repeat(80)));
    
  } catch (error) {
    console.error(chalk.red(`Error during test: ${error.message}`));
    console.error(error);
  } finally {
    // Close database connection
    await db.sequelize.close();
    process.exit(0);
  }
}

// Run the test
testRealTrade();
