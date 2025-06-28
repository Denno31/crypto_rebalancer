/**
 * Direct Trade Test Script
 * 
 * This script uses direct SQL queries to create a simulated trade
 * in your database and verify it was recorded correctly.
 */

const db = require('../models');
const chalk = require('chalk');
const Bot = db.bot;

async function executeMockTrade() {
  try {
    console.log(chalk.blue('Starting direct trade test...'));
    console.log(chalk.blue('='.repeat(80)));
    
    // First, find an active bot
    const bot = await Bot.findOne({
      where: { enabled: true }
    });
    
    if (!bot) {
      console.log(chalk.red('No enabled bot found. Please enable a bot first.'));
      process.exit(1);
    }
    
    console.log(chalk.green(`Found bot: ID ${bot.id}, Name: ${bot.name}`));
    console.log(`Current coin: ${chalk.yellow(bot.currentCoin)}`);
    
    // Determine which coin to simulate trading to
    const currentCoin = bot.currentCoin;
    const testCoins = ['BTC', 'ETH', 'SOL'];
    const targetCoin = testCoins.find(coin => coin !== currentCoin) || 'ETH';
    
    console.log(chalk.cyan(`\nSimulating a trade from ${currentCoin} to ${targetCoin}...`));
    
    // Create price history records for both coins (using direct SQL query)
    const now = new Date();
    
    // Insert price history records with direct SQL
    await db.sequelize.query(`
      INSERT INTO price_history 
      (bot_id, coin, price, source, timestamp)
      VALUES 
      (?, ?, ?, ?, ?)
    `, {
      replacements: [
        bot.id, 
        currentCoin,
        currentCoin === 'BTC' ? 50000 : (currentCoin === 'ETH' ? 3000 : 150),
        'test_simulation',
        now
      ],
      type: db.sequelize.QueryTypes.INSERT
    });
    
    // Insert advantageous price for target coin
    await db.sequelize.query(`
      INSERT INTO price_history 
      (bot_id, coin, price, source, timestamp)
      VALUES 
      (?, ?, ?, ?, ?)
    `, {
      replacements: [
        bot.id, 
        targetCoin,
        targetCoin === 'BTC' ? 55000 : (targetCoin === 'ETH' ? 3500 : 180),
        'test_simulation',
        now
      ],
      type: db.sequelize.QueryTypes.INSERT
    });
    
    console.log(chalk.green('Price history records created successfully'));
    
    // Create the mock trade record
    const mockTradeId = `TEST-${Date.now()}`;
    const priceChange = 15.5; // Simulated percentage improvement
    
    await db.sequelize.query(`
      INSERT INTO trades
      (bot_id, trade_id, from_coin, to_coin, amount, price_change, status, executed_at)
      VALUES
      (?, ?, ?, ?, ?, ?, ?, NOW())
    `, {
      replacements: [
        bot.id,
        mockTradeId,
        currentCoin,
        targetCoin,
        0.1, // Mock amount
        priceChange,
        'completed'
      ],
      type: db.sequelize.QueryTypes.INSERT
    });
    
    console.log(chalk.green('Trade record inserted successfully'));
    
    // Now update the bot's current coin to complete the simulation
    const previousCoin = bot.currentCoin;
    
    await db.sequelize.query(`
      UPDATE bots
      SET current_coin = ?
      WHERE id = ?
    `, {
      replacements: [targetCoin, bot.id],
      type: db.sequelize.QueryTypes.UPDATE
    });
    
    console.log(chalk.green('\nBot updated successfully!'));
    
    // Now query and display the trade to verify it worked
    const [trades] = await db.sequelize.query(`
      SELECT * FROM trades
      WHERE trade_id = ?
      ORDER BY executed_at DESC
      LIMIT 1
    `, {
      replacements: [mockTradeId],
      type: db.sequelize.QueryTypes.SELECT
    });
    
    console.log(chalk.cyan('\nVerifying trade record:'));
    console.log(chalk.green('Trade details:'));
    console.log(`ID: ${trades.id}`);
    console.log(`Bot ID: ${trades.bot_id}`);
    console.log(`Trade ID: ${trades.trade_id}`);
    console.log(`From: ${trades.from_coin} → To: ${trades.to_coin}`);
    console.log(`Amount: ${trades.amount}`);
    console.log(`Price Change: ${trades.price_change}%`);
    console.log(`Status: ${trades.status}`);
    console.log(`Executed At: ${trades.executed_at}`);
    
    // Show the bot's updated coin
    const [updatedBot] = await db.sequelize.query(`
      SELECT * FROM bots
      WHERE id = ?
    `, {
      replacements: [bot.id],
      type: db.sequelize.QueryTypes.SELECT
    });
    
    console.log(chalk.cyan('\nBot status:'));
    console.log(`Previous coin: ${previousCoin}`);
    console.log(`Current coin: ${updatedBot.current_coin}`);
    
    console.log(chalk.blue('\n='.repeat(80)));
    console.log(chalk.green('Trade test completed successfully!'));
    console.log(chalk.yellow('You can now check your trades table to see the inserted record.'));
    console.log(chalk.yellow('Note: This was a simulated trade, and the bot\'s current coin has been updated.'));
    
  } catch (error) {
    console.error(chalk.red(`Error in trade test: ${error.message}`));
    console.error(error);
  } finally {
    // Close database connection
    await db.sequelize.close();
  }
}

// Run the test
executeMockTrade();
