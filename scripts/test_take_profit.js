/**
 * Test script for the Take Profit functionality
 * This script simulates a bot holding a coin that has reached its take profit threshold
 */
require('dotenv').config();
const db = require('../src/models');
const Bot = db.bot;
const BotAsset = db.botAsset;
const enhancedSwapService = require('../src/services/enhancedSwap.service');

// Set this to true to simulate trades without executing them on the exchange
process.env.SIMULATE_TRADES = 'true';

async function testTakeProfit() {
  console.log('Starting Take Profit Test');

  try {
    // 1. Get test bot (update ID as needed)
    const botId = 1; // Update this to your bot ID
    const bot = await Bot.findByPk(botId);
    
    if (!bot) {
      console.error(`No bot found with ID ${botId}`);
      return;
    }

    console.log(`Found bot: ${bot.name} (${bot.id})`);
    console.log(`Current coin: ${bot.currentCoin}`);

    // 2. Enable take profit and set threshold
    const takeProfitPercentage = 5.0; // 5% take profit threshold
    await bot.update({
      useTakeProfit: true,
      takeProfitPercentage: takeProfitPercentage
    });
    console.log(`Enabled take profit with threshold: ${takeProfitPercentage}%`);

    // 3. Get current asset
    const currentAsset = await BotAsset.findOne({
      where: {
        botId: bot.id,
        coin: bot.currentCoin
      }
    });

    if (!currentAsset) {
      console.error(`No asset found for bot's current coin: ${bot.currentCoin}`);
      return;
    }

    console.log(`Current asset: ${currentAsset.amount} ${currentAsset.coin} (Entry price: ${currentAsset.entryPrice})`);

    // 4. Simulate profit by temporarily reducing the entry price
    const originalEntryPrice = currentAsset.entryPrice;
    const simulatedEntryPrice = originalEntryPrice * 0.94; // This will create ~6% profit
    
    console.log(`Simulating profit by temporarily changing entry price from ${originalEntryPrice} to ${simulatedEntryPrice}`);
    await currentAsset.update({ entryPrice: simulatedEntryPrice });

    // 5. Get system and API config for the bot
    const systemConfig = await db.systemConfig.findOne({ where: { userId: bot.userId } });
    const apiConfig = await db.apiConfig.findOne({ where: { userId: bot.userId } });

    if (!systemConfig || !apiConfig) {
      console.error('Could not find system or API config for the bot');
      return;
    }

    // 6. Run the bot check (this should trigger the take profit sell)
    console.log('Running bot check (this should trigger take profit sell)...');
    const result = await enhancedSwapService.checkBot(botId, systemConfig, apiConfig);
    
    console.log('\nBot check result:');
    console.log(JSON.stringify(result, null, 2));

    // 7. Clean up: restore original entry price
    await currentAsset.update({ entryPrice: originalEntryPrice });
    console.log(`\nTest complete. Restored original entry price: ${originalEntryPrice}`);
    
  } catch (error) {
    console.error('Error in take profit test:', error);
  } finally {
    // Close database connection
    await db.sequelize.close();
  }
}

testTakeProfit().catch(console.error);
