/**
 * Test file specifically for debugging the second step of a two-step trade
 * This isolates just the USDT → destination coin part of the trade
 * to help diagnose 422 errors or other issues
 */
/**
 * Second Step Trade Test - Isolated test for USDT → destination coin
 * 
 * This script verifies that the second step of a two-step trade can be executed
 * through the 3Commas API with different USDT amounts to debug 422 errors.
 */

const dotenv = require('dotenv');
dotenv.config();

// Import database models to get API credentials from database
const db = require('../models');
const chalk = require('chalk');
const ThreeCommasService = require('../services/threeCommas.service');
const ApiConfig = db.apiConfig;

// Configuration
const config = {
  // Account ID from 3Commas (same as in the main test)
  accountId: process.env.THREECOMMAS_ACCOUNT_ID || '33238860',
  
  // Source and destination coins
  fromCoin: 'USDT',  // Always USDT for the second step
  toCoin: 'ADA',     // The final destination coin
  
  // Amount to trade (in USDT)
  // Testing different trade amounts to find the minimum that works
  tradeAmount: 15,   // 3Commas/Binance might have a higher minimum than we expect
  
  // Whether to use demo mode (paper trading)
  demo: true,        // Set to false for real trading
  
  // Trade parameters
  useTakeProfit: false,
  takeProfitPercentage: 0,
  
  // Try different parameter orders to see which one works
  // In 3Commas, the way coins are provided to executeTrade matters
  tryReversedParams: true,  // If true, will try both normal and reversed parameter orders
  
  // Try with higher trade amounts - exchanges often have minimum trade requirements
  tradeAmounts: [15, 20, 25, 30]  // Will try multiple trade amounts if initial one fails
};

/**
 * Run the second step test
 */
async function testSecondStep() {
  console.log(chalk.yellow('===================================='));
  console.log(chalk.yellow('  SECOND STEP TRADE TEST (ISOLATED)'));
  console.log(chalk.yellow('===================================='));
  
  console.log(chalk.blue(`Testing trade from ${config.fromCoin} to ${config.toCoin}`));
  console.log(chalk.blue(`Using amount: ${config.tradeAmount} ${config.fromCoin}`));
  console.log(chalk.blue(`Demo mode: ${config.demo}`));
  
  // Get the API credentials from the database
  console.log('Retrieving API credentials from database...');
  const apiConfig = await ApiConfig.findOne();
  
  if (!apiConfig) {
    console.error(chalk.red('❌ 3Commas API configuration not found in database'));
    return;
  }
  
  console.log(chalk.green('✅ API Config found in database:'));
  console.log(`  • ID: ${apiConfig.id}`);
  console.log(`  • Provider: ${apiConfig.provider || 'Not specified'}`);
  console.log(`  • Updated at: ${apiConfig.updated_at || apiConfig.updatedAt}`);
  console.log(`  • API Key Prefix: ${apiConfig.apiKey.substring(0, 4)}...`);
  
  const apiKey = apiConfig.apiKey;
  const apiSecret = apiConfig.apiSecret;
  
  if (!apiKey || !apiSecret) {
    console.error(chalk.red('❌ 3Commas API key and/or secret not found in database'));
    return;
  }
  
  // Create the service with the API credentials from database
  console.log(chalk.green('✅ Initializing ThreeCommasService with database API credentials'));
  
  // Pass API keys as separate arguments, not as an object
  const threeCommasService = new ThreeCommasService(
    apiKey,
    apiSecret,
    { 
      requestTimeout: 10000,
      demo: config.demo 
    }
  );
  
  console.log(`Demo mode: ${config.demo ? 'ON (paper trading)' : 'OFF (REAL trading)'}`);
  
  try {
    // Check if the trading pair exists first
    console.log(`Checking if pair ${config.fromCoin}_${config.toCoin} exists...`);
    
    // Direct test - skip checking pair existence to simplify the test
    console.log(chalk.green(`✅ Assuming pair exists for testing`));
    
    // If trying both parameter orders, attempt both ways
    if (config.tryReversedParams) {
      console.log(chalk.yellow('Trying different parameter orders and amounts to determine what works:'));
      
      // First try normal parameter order (from=USDT, to=ADA)
      console.log(`\n🔄 Testing normal parameter order: FROM=${config.fromCoin}, TO=${config.toCoin}`);
      let success = false;
      
      // Try with progressively higher amounts
      for (const amount of config.tradeAmounts) {
        console.log(`\nAttempting with amount: ${amount} ${config.fromCoin}`);
        success = await executeTradeWithParams(config.fromCoin, config.toCoin, amount);
        if (success) {
          console.log(chalk.green('✅ Found working configuration!'));
          console.log(`From=${config.fromCoin}, To=${config.toCoin}, Amount=${amount}`);
          return;
        }
      }
      
      // If we get here, try reversed parameter order as fallback
      console.log(`\n🔄 Testing reversed parameter order: FROM=${config.toCoin}, TO=${config.fromCoin}`);
      
      for (const amount of config.tradeAmounts) {
        console.log(`\nAttempting with amount: ${amount} ${config.toCoin}`);
        success = await executeTradeWithParams(config.toCoin, config.fromCoin, amount);
        if (success) {
          console.log(chalk.green('✅ Found working configuration!'));
          console.log(`From=${config.toCoin}, To=${config.fromCoin}, Amount=${amount}`);
          return;
        }
      }
      
      console.log('\n❌ All parameter orders and amounts resulted in errors. Possible issues:');
      console.log('1. Trading pair not supported on this exchange');
      console.log('2. Insufficient balance in the account');
      console.log('3. Minimum trade requirements still not met');
      console.log('4. API permissions issue for trading');
      return;
    } else {
      // Just execute with the standard parameters
      console.log(chalk.blue(`Executing trade: ${config.fromCoin} → ${config.toCoin} (${config.tradeAmount} ${config.fromCoin})`));
      await executeTradeWithParams(config.fromCoin, config.toCoin, config.tradeAmount);
    }
    
    // Helper function to execute the trade with specific fromCoin, toCoin, and amount
    async function executeTradeWithParams(fromCoin, toCoin, tradeAmount) {
      try {
        console.log(chalk.blue(`Executing trade: ${fromCoin} → ${toCoin} (${tradeAmount} ${fromCoin})`));
        
        const [error, trade] = await threeCommasService.executeTrade(
          config.accountId,
          fromCoin,
          toCoin,
          tradeAmount,
          config.useTakeProfit,
          config.takeProfitPercentage,
          config.demo ? 'paper' : 'real',
          false
        );
        
        if (error) {
          console.error(chalk.red(`Error with FROM=${fromCoin}, TO=${toCoin}, AMOUNT=${tradeAmount}:`), error);
          if (error.message && error.message.includes('422')) {
            console.log(chalk.yellow('422 Error Details:'));
            try {
              // Try to extract more details from the error response
              const errorDetails = JSON.stringify(error);
              console.log('Error details:', errorDetails);
            } catch (e) {
              console.log('Could not extract detailed error info');
            }
          }
          return false;
        }
        
        console.log(chalk.green('\u2705 Trade executed successfully!'));
        console.log(chalk.gray('Trade details:'), JSON.stringify(trade, null, 2));
        return true;
      } catch (error) {
        console.error(chalk.red(`Error trying pair format ${pair}:`), error);
        return false;
      }
    }
    
    console.log(chalk.green('✅ Trade executed successfully!'));
    console.log(chalk.gray('Trade details:'), JSON.stringify(trade, null, 2));
    
    // Wait for trade completion
    console.log(chalk.blue('Waiting for trade to complete...'));
    
    // We'll wait for trade completion inside the executeTrade function
    
  } catch (error) {
    console.error(chalk.red('Error during test:'), error);
  }
}

// Run the test
testSecondStep().catch(error => {
  console.error(chalk.red('Unhandled error:'), error);
});
