/**
 * Script to view trades in the database
 * 
 * This script connects to the database and queries the trades table
 * to display existing trades or manually insert a test trade.
 */

const db = require('../models');
const chalk = require('chalk');
const { Op } = require('sequelize');
const Trade = db.trade;
const Bot = db.bot;

async function viewTrades() {
  try {
    console.log(chalk.blue('Checking database for existing trades...'));
    
    // Get all bots first
    const bots = await Bot.findAll();
    console.log(chalk.cyan(`Found ${bots.length} bots in database`));
    
    for (const bot of bots) {
      console.log(chalk.green(`Bot ID: ${bot.id}, Name: ${bot.name}, Current Coin: ${bot.currentCoin}`));
    }
    
    // Find any existing trades
    const trades = await Trade.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    console.log(chalk.cyan(`\nFound ${trades.length} trades in database`));
    
    if (trades.length > 0) {
      console.log(chalk.blue('\nMost recent trades:'));
      trades.forEach((trade, i) => {
        console.log(chalk.green(`\nTrade #${i+1}:`));
        console.log(`Bot ID: ${trade.botId || trade.bot_id}`);
        console.log(`Trade ID: ${trade.tradeId || trade.trade_id}`);
        console.log(`From Coin: ${trade.fromCoin || trade.from_coin}`);
        console.log(`To Coin: ${trade.toCoin || trade.to_coin}`);
        console.log(`Status: ${trade.status}`);
        console.log(`Price Change: ${trade.priceChange || trade.price_change}%`);
        console.log(`Created At: ${trade.createdAt}`);
      });
    } else {
      console.log(chalk.yellow('No trades found in the database yet.'));
      
      // If you want to manually insert a test trade, uncomment this code:
      /*
      console.log(chalk.yellow('\nCreating a sample test trade...'));
      
      const botId = bots[0]?.id;
      
      if (!botId) {
        throw new Error('No bots found to attach trade to');
      }
      
      // Create a test trade record using manual query to bypass model issues
      const result = await db.sequelize.query(`
        INSERT INTO trades (
          bot_id, trade_id, from_coin, to_coin, amount, status,
          price_change, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, NOW(), NOW()
        )
      `, {
        replacements: [
          botId,               // bot_id
          `TEST-${Date.now()}`,// trade_id
          'BTC',               // from_coin
          'ETH',               // to_coin
          0.1,                 // amount
          'completed',         // status
          15.2                 // price_change
        ],
        type: db.sequelize.QueryTypes.INSERT
      });
      
      console.log(chalk.green('Test trade created successfully!'));
      */
    }
    
    // Optionally, print table schema info
    console.log(chalk.blue('\nTrades table information:'));
    const tableInfo = await db.sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'trades'
    `, { type: db.sequelize.QueryTypes.SELECT });
    
    console.table(tableInfo);
    
  } catch (error) {
    console.error(chalk.red(`Error viewing trades: ${error.message}`));
    console.error(error);
  } finally {
    // Close database connection
    await db.sequelize.close();
  }
}

// Run the function
viewTrades();
