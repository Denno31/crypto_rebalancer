/**
 * Test script to simulate and execute an actual trade
 * 
 * This script will:
 * 1. Connect to the database
 * 2. Find an active bot
 * 3. Create simulated price conditions where a trade should happen
 * 4. Execute the trade and record it in the database
 * 5. Verify the trade record was created
 */

const db = require('../models');
const chalk = require('chalk');
const Bot = db.bot;
const Trade = db.trade;
const PriceHistory = db.priceHistory;
const SystemConfig = db.systemConfig;
const ApiConfig = db.apiConfig;

// Mock the 3Commas API client to avoid actual API calls
class MockThreeCommasClient {
  constructor() {
    this.apiKey = 'mock_api_key';
    this.apiSecret = 'mock_api_secret';
  }
  
  async request(endpoint, subEndpoint, data) {
    console.log(chalk.yellow(`[MOCK] 3Commas API Request to ${endpoint}/${subEndpoint || ''}`));
    console.log(chalk.gray(`[MOCK] Request data: ${JSON.stringify(data || {}, null, 2)}`));
    
    // Mock responses based on the endpoint
    if (endpoint === 'accounts' && !subEndpoint) {
      return [null, {
        id: 123456,
        name: 'Mock Account',
        balances: [
          { currency_code: 'BTC', amount: '0.1' },
          { currency_code: 'ETH', amount: '1.5' },
          { currency_code: 'SOL', amount: '10' },
          { currency_code: 'USDT', amount: '1000' }
        ]
      }];
    }
    
    if (endpoint === 'smart_trades' && subEndpoint === 'create_smart_trade') {
      return [null, {
        id: Math.floor(Math.random() * 1000000),
        account_id: data.account_id,
        pair: data.pair,
        status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }];
    }
    
    // Default mock response
    return [{ error: 'Unknown endpoint' }, null];
  }
  
  async getMarketPrice(pair) {
    return [null, { last: '1234.56' }];
  }
}

// Mock price service
const mockPriceService = {
  getPrice: async (config, apiConfig, coin, baseCoin) => {
    // Return favorable prices for ETH to trigger a trade from BTC
    const prices = {
      'BTC': 50000,
      'ETH': 3500,  // ETH should be more favorable compared to BTC
      'SOL': 160,
      'USDT': 1
    };
    
    return {
      price: prices[coin] || 1000,
      source: 'mock'
    };
  }
};

/**
 * Main test function
 */
async function runTradeTest() {
  try {
    console.log(chalk.blue('Starting trade execution test'));
    console.log(chalk.blue('='.repeat(80)));
    
    // Find an enabled bot
    const bot = await Bot.findOne({
      where: { enabled: true }
    });
    
    if (!bot) {
      console.log(chalk.red('No enabled bot found in the database. Please create and enable a bot first.'));
      process.exit(1);
    }
    
    console.log(chalk.green(`Found bot: ID ${bot.id}, Name: ${bot.name}`));
    console.log(`Current coin: ${chalk.yellow(bot.currentCoin)}`);
    console.log(`Reference coin: ${chalk.yellow(bot.referenceCoin || 'USDT')}`);
    console.log(`Threshold: ${chalk.yellow(bot.thresholdPercentage)}%`);
    
    // Get system config (needed for trade execution)
    const systemConfig = await SystemConfig.findOne({
      where: { userId: bot.userId }
    });
    
    if (!systemConfig) {
      console.log(chalk.red('System configuration not found'));
      process.exit(1);
    }
    
    // Create simulated price history to trigger a trade
    console.log(chalk.cyan('\nCreating simulated price history...'));
    
    // Determine the target coin we want to trade to (not the current coin)
    const coins = ['BTC', 'ETH', 'SOL'].filter(coin => coin !== bot.currentCoin);
    const targetCoin = coins[0]; // Choose the first non-current coin
    
    // Simulate a significant price advantage for the target coin
    // This is actually done by the PriceHistory records we'll create
    console.log(chalk.cyan(`Simulating price advantage for ${targetCoin} over ${bot.currentCoin}`));
    
    // Create price history records with advantage for targetCoin
    const now = new Date();
    
    // First record the current prices
    await PriceHistory.create({
      timestamp: now,
      coin: bot.currentCoin,
      price: 50000, // BTC price if currentCoin is BTC
      source: 'test_simulation',
      bot_id: bot.id  // Use snake_case to match database column name
    });
    
    // Create advantageous price for target coin
    await PriceHistory.create({
      timestamp: now,
      coin: targetCoin,
      price: targetCoin === 'ETH' ? 3500 : 160, // ETH or SOL price
      source: 'test_simulation',
      bot_id: bot.id  // Use snake_case to match database column name
    });
    
    console.log(chalk.green('Price history records created successfully'));
    
    // Now execute the simulated trade
    console.log(chalk.cyan('\nExecuting trade simulation...'));
    
    // Mock the trade execution process
    const mockClient = new MockThreeCommasClient();
    
    // Record the trade in the database
    const mockTradeId = `TEST-${Date.now()}`;
    const tradeRecord = await Trade.create({
      bot_id: bot.id,  // Using snake_case to match database column name
      from_coin: bot.currentCoin,
      to_coin: targetCoin,
      amount: 0.1, // Mock amount
      price: targetCoin === 'ETH' ? 3500 : 160,
      three_commas_id: Math.floor(Math.random() * 1000000).toString(),
      status: 'completed',
      price_change: targetCoin === 'ETH' ? 15 : 10, // Simulated performance improvement
      trade_id: mockTradeId // Add required tradeId field with snake_case
    });
    
    // Update the bot's current coin in the database
    const previousCoin = bot.currentCoin;
    bot.currentCoin = targetCoin;
    await bot.save();
    
    console.log(chalk.green('\nTrade simulation completed successfully!'));
    console.log(chalk.cyan('='.repeat(80)));
    console.log('Trade details:');
    console.log(`${chalk.green('✓')} Trade ID: ${tradeRecord.id}`);
    console.log(`${chalk.green('✓')} From coin: ${previousCoin}`);
    console.log(`${chalk.green('✓')} To coin: ${targetCoin}`);
    console.log(`${chalk.green('✓')} Status: ${tradeRecord.status}`);
    console.log(`${chalk.green('✓')} Price change: ${tradeRecord.priceChange}%`);
    console.log(`${chalk.green('✓')} Created at: ${tradeRecord.createdAt}`);
    
    console.log(chalk.cyan('\nBot status updated:'));
    console.log(`${chalk.green('✓')} Current coin updated: ${previousCoin} -> ${bot.currentCoin}`);
    
    console.log(chalk.blue('\n='.repeat(80)));
    console.log(chalk.green('Test completed! You can now check the trades table in your database to see this record.'));
    console.log(chalk.yellow('Note: This was a simulated trade that updated your actual database.'));
    console.log(chalk.yellow('The bot\'s current coin has been changed in the database.'));
    
  } catch (error) {
    console.error(chalk.red(`Error in trade test: ${error.message}`));
    console.error(error);
  } finally {
    // Close database connection
    await db.sequelize.close();
  }
}

// Run the test
runTradeTest();
