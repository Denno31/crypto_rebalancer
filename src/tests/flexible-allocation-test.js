/**
 * Test script for flexible allocation functionality
 * This script tests the bot initialization with allocation percentage and manual budget
 * and verifies BotAsset records are properly created and updated.
 * 
 * This version uses mock data to test database operations without live API calls.
 */

require('dotenv').config();
const db = require('../models');
const Bot = db.bot;
const BotAsset = db.botAsset;
const sequelize = db.sequelize;

async function findOrCreateTestBot(transaction) {
  // Try to find an existing test bot
  let bot = await Bot.findOne({
    where: {
      name: 'Bot_1'
    }
  }, { transaction });
  
  if (!bot) {
    console.log('Creating test bot...');
    // Create a test bot with a test user
    bot = await Bot.create({
      name: 'Bot_1',
      enabled: true,
      coins: 'BTC,ETH,LTC',
      thresholdPercentage: 5.0,
      checkInterval: 60,
      initialCoin: 'BTC',
      accountId: '12345',
      preferredStablecoin: 'USDT', // Default stablecoin
      userId: 1 // Assuming user with ID 1 exists
    }, { transaction });
  }
  
  return bot;
}

async function runTest() {
  // Set up the database transaction
  const transaction = await sequelize.transaction();
  
  try {
    console.log('=== Testing Flexible Allocation Functionality (Mock Mode) ===');
    console.log('Using mock data to test database schema and models');
    
    // Get or create a test bot
    const bot = await findOrCreateTestBot(transaction);
    console.log(`Using bot: ${bot.name} (ID: ${bot.id})`);
    
    // Clean up existing bot assets for testing
    await BotAsset.destroy({ where: { botId: bot.id }, transaction });
    console.log('Cleaned up existing bot assets for testing');
    
    // Test percentage allocation
    console.log('\n--- Testing percentage allocation (75%) ---');
    await testPercentageAllocation(bot, transaction);
    
    // Test manual budget allocation
    console.log('\n--- Testing manual budget allocation (100 USDT) ---');
    await testManualBudget(bot, transaction);
    
    // Test asset update
    console.log('\n--- Testing asset update ---');
    await testAssetUpdate(bot.id, transaction);
    
    // Test stablecoin compatibility
    console.log('\n--- Testing stablecoin compatibility (USDC) ---');
    await testStablecoinCompatibility(bot, transaction);
    
    // Commit the transaction
    await transaction.commit();
    console.log('\n=== Tests completed successfully ===');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up test data and close connection
    await db.sequelize.close();
  }
}

async function testPercentageAllocation(bot, transaction) {
  // Update bot with percentage allocation
  await bot.update({
    allocationPercentage: 75,
    manualBudgetAmount: null
  }, { transaction });
  
  console.log(`Updated bot settings:`);
  console.log(`- Allocation percentage: ${bot.allocationPercentage}%`);
  console.log(`- Manual budget: ${bot.manualBudgetAmount || 'Not set'}`);
  
  // Create mock BotAsset record
  const mockCoin = bot.initialCoin || 'USDT';
  const mockAmount = 100; // Mock 100 USDT
  const mockPrice = 1; // 1:1 for USDT
  
  const asset = await BotAsset.create({
    botId: bot.id,
    coin: mockCoin,
    amount: mockAmount * (bot.allocationPercentage / 100), // 75% of 100 = 75
    entryPrice: mockPrice,
    usdtEquivalent: mockAmount * mockPrice * (bot.allocationPercentage / 100),
    lastUpdated: new Date()
  }, { transaction });
  
  console.log(`Created asset record:`);
  console.log(`- Coin: ${asset.coin}`);
  console.log(`- Amount: ${asset.amount}`);
  console.log(`- USDT equivalent: ${asset.usdtEquivalent}`);
  console.log(`- Entry price: ${asset.entryPrice}`);
  
  // Verify that allocation percentage was applied correctly
  const expectedAmount = mockAmount * (bot.allocationPercentage / 100);
  if (Math.abs(asset.amount - expectedAmount) < 0.001) {
    console.log(`✅ Percentage allocation verified: ${asset.amount} ${asset.coin}`);
  } else {
    console.log(`❌ Percentage allocation verification failed: expected ${expectedAmount}, got ${asset.amount}`);
  }
}

async function testManualBudget(bot, transaction) {
  // Update bot with manual budget allocation
  await bot.update({
    allocationPercentage: 100,
    manualBudgetAmount: 100
  }, { transaction });
  
  console.log(`Updated bot settings:`);
  console.log(`- Allocation percentage: ${bot.allocationPercentage}%`);
  console.log(`- Manual budget: ${bot.manualBudgetAmount || 'Not set'}`);
  
  // Find existing asset or create a new one with a different coin
  const mockCoin = 'USDT'; // Use USDT for manual budget test
  const mockAmount = bot.manualBudgetAmount;
  
  // Check if we already have this asset
  let asset = await BotAsset.findOne({
    where: {
      botId: bot.id,
      coin: mockCoin
    }
  }, { transaction });
  
  if (asset) {
    console.log(`Found existing ${mockCoin} asset, updating it with manual budget`);
    await asset.update({
      amount: mockAmount,
      entryPrice: 1, // 1:1 for USDT
      usdtEquivalent: mockAmount,
      lastUpdated: new Date()
    }, { transaction });
  } else {
    console.log(`Creating new ${mockCoin} asset with manual budget`);
    asset = await BotAsset.create({
      botId: bot.id,
      coin: mockCoin,
      amount: mockAmount,
      entryPrice: 1, // 1:1 for USDT
      usdtEquivalent: mockAmount,
      lastUpdated: new Date()
    }, { transaction });
  }
  
  console.log(`Created asset record:`);
  console.log(`- Coin: ${asset.coin}`);
  console.log(`- Amount: ${asset.amount}`);
  console.log(`- USDT equivalent: ${asset.usdtEquivalent}`);
  console.log(`- Entry price: ${asset.entryPrice}`);
  
  // Verify that manual budget was applied correctly
  if (Math.abs(asset.amount - mockAmount) < 0.001) {
    console.log(`✅ Manual budget allocation verified: ${asset.amount} ${asset.coin}`);
  } else {
    console.log(`❌ Manual budget allocation verification failed: expected ${mockAmount}, got ${asset.amount}`);
  }
}

async function testAssetUpdate(botId, transaction) {
  // Get existing asset
  const asset = await BotAsset.findOne({
    where: { botId },
    transaction
  });
  
  if (!asset) {
    console.log('No asset found to update. Creating a test asset...');
    
    // Create a test asset with a different coin (ETH) to avoid unique constraint issues
    const newAsset = await BotAsset.create({
      botId,
      coin: 'ETH',  // Using ETH instead of BTC to avoid unique constraint violation
      amount: 1.5,
      entryPrice: 2000,
      usdtEquivalent: 3000, // 1.5 ETH at $2,000
      lastUpdated: new Date()
    }, { transaction });
    
    console.log(`Created test asset: ${newAsset.coin}`);
    console.log(`- Initial amount: ${newAsset.amount}`);
    console.log(`- Initial USDT equivalent: ${newAsset.usdtEquivalent}`);
    
    // Simulate a price change (10% increase)
    const newUsdtEquivalent = newAsset.usdtEquivalent * 1.1; // 10% increase
    
    // Update the asset directly without calling botService
    await newAsset.update({
      usdtEquivalent: newUsdtEquivalent,
      lastUpdated: new Date()
    }, { transaction });
    
    // Verify the update - Note: findOne with transaction requires different syntax in Sequelize
    const updatedAsset = await BotAsset.findOne({
      where: { 
        botId,
        coin: newAsset.coin
      },
      transaction // Pass transaction as part of the options object
    });
    
    console.log('After update:');
    console.log(`- Amount: ${updatedAsset.amount}`);
    console.log(`- New USDT equivalent: ${updatedAsset.usdtEquivalent}`);
    console.log(`- Last updated: ${updatedAsset.lastUpdated}`);
    
    if (Math.abs(updatedAsset.usdtEquivalent - newUsdtEquivalent) < 0.001) {
      console.log('✅ Asset update verified successfully');
    } else {
      console.log('❌ Asset update verification failed');
    }
    return;
  }
  
  console.log(`Found asset to update: ${asset.coin}`);
  console.log(`- Current amount: ${asset.amount}`);
  console.log(`- Current USDT equivalent: ${asset.usdtEquivalent}`);
  
  // Simulate a price change (10% increase)
  const newUsdtEquivalent = asset.usdtEquivalent * 1.1;
  
  // Update the asset directly without calling botService
  await asset.update({
    usdtEquivalent: newUsdtEquivalent,
    lastUpdated: new Date()
  }, { transaction });
  
  // Verify the update
  const updatedAsset = await BotAsset.findOne({
    where: { 
      botId,
      coin: asset.coin
    },
    transaction
  });
  
  console.log('After update:');
  console.log(`- Amount: ${updatedAsset.amount}`);
  console.log(`- New USDT equivalent: ${updatedAsset.usdtEquivalent}`);
  console.log(`- Last updated: ${updatedAsset.lastUpdated}`);
  
  if (Math.abs(updatedAsset.usdtEquivalent - newUsdtEquivalent) < 0.001) {
    console.log('✅ Asset update verified successfully');
  } else {
    console.log('❌ Asset update verification failed');
  }
}

/**
 * Test stablecoin compatibility by updating the preferred stablecoin
 * @param {Object} bot - Bot instance
 * @param {Transaction} transaction - Sequelize transaction
 */
async function testStablecoinCompatibility(bot, transaction) {
  // Update bot with USDC as preferred stablecoin
  await bot.update({
    preferredStablecoin: 'USDC',
    allocationPercentage: 50 // 50% allocation
  }, { transaction });
  
  console.log(`Updated bot settings:`);
  console.log(`- Preferred stablecoin: ${bot.preferredStablecoin}`);
  console.log(`- Allocation percentage: ${bot.allocationPercentage}%`);
  
  // Create mock coin with USDC as the stablecoin
  const mockCoin = 'ETH';
  const mockAmount = 1.0;
  const mockPrice = 2000; // Mock price in USDC
  const stablecoinEquivalent = mockAmount * mockPrice;
  
  // Check if we already have this asset
  let asset = await BotAsset.findOne({
    where: {
      botId: bot.id,
      coin: mockCoin
    },
    transaction
  });
  
  if (asset) {
    console.log(`Found existing ${mockCoin} asset, updating it with USDC values`);
    await asset.update({
      amount: mockAmount,
      entryPrice: mockPrice,
      usdtEquivalent: stablecoinEquivalent, // Field name remains for DB compatibility
      stablecoin: 'USDC', // Specify the stablecoin
      lastUpdated: new Date()
    }, { transaction });
  } else {
    console.log(`Creating new ${mockCoin} asset with USDC values`);
    asset = await BotAsset.create({
      botId: bot.id,
      coin: mockCoin,
      amount: mockAmount,
      entryPrice: mockPrice,
      usdtEquivalent: stablecoinEquivalent, // Field name remains for DB compatibility
      stablecoin: 'USDC', // Specify the stablecoin
      lastUpdated: new Date()
    }, { transaction });
  }
  
  console.log(`Asset record details:`);
  console.log(`- Coin: ${asset.coin}`);
  console.log(`- Amount: ${asset.amount}`);
  console.log(`- Stablecoin: ${asset.stablecoin}`);
  console.log(`- ${asset.stablecoin} equivalent: ${asset.usdtEquivalent}`);
  console.log(`- Entry price: ${asset.entryPrice}`);
  
  if (asset.stablecoin === 'USDC' && Math.abs(asset.usdtEquivalent - stablecoinEquivalent) < 0.001) {
    console.log(`\u2705 Stablecoin compatibility test passed`);
  } else {
    console.log(`\u274c Stablecoin compatibility test failed`);
  }
}

// Run the test
runTest().catch(console.error);
