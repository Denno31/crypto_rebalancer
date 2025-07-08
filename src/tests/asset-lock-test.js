/**
 * Asset Lock Test Script
 * 
 * This script tests the new asset locking mechanism to ensure it prevents
 * multiple bots from trading the same assets simultaneously.
 */
const db = require('../models');
const ThreeCommasService = require('../services/threeCommas.service');
const botService = require('../services/bot.service');
const assetManager = require('../services/assetManager.service');
const { Op } = require('sequelize');

// Models
const Bot = db.bot;
const ApiConfig = db.apiConfig;
const BotAsset = db.botAsset;
const AssetLock = db.assetLock;

const chalk = require('chalk');

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log(chalk.blue('\n=== Asset Locking Test ===\n'));
    
    // Get API configuration
    const apiConfig = await ApiConfig.findOne({
      where: {
        name: '3commas'
      }
    });
    
    if (!apiConfig) {
      console.error(chalk.red('3Commas API config not found. Please set up your API credentials.'));
      return;
    }
    
    console.log(chalk.green('API Config found. Mode:', apiConfig.mode));
    
    // Check for enabled bots
    const bots = await Bot.findAll({
      where: { enabled: true },
      limit: 2
    });
    
    if (bots.length < 2) {
      console.error(chalk.red('Need at least 2 enabled bots to test asset locking. Please enable at least 2 bots.'));
      return;
    }
    
    const bot1 = bots[0];
    const bot2 = bots[1];
    
    console.log(chalk.green(`Found bots for testing:`));
    console.log(`- Bot 1: ${bot1.name} (ID: ${bot1.id})`);
    console.log(`- Bot 2: ${bot2.name} (ID: ${bot2.id})`);
    
    // Create 3Commas client
    const threeCommasClient = new ThreeCommasService(
      apiConfig.key,
      apiConfig.secret,
      apiConfig.mode || 'paper'
    );
    
    // First, reconcile balances to ensure accurate asset tracking
    console.log(chalk.blue('\nReconciling bot balances with exchange...'));
    
    const reconcileResult1 = await botService.reconcileBalances(bot1.id, threeCommasClient);
    console.log(chalk.green(`Bot 1 balance reconciliation: ${reconcileResult1.success ? 'Success' : 'Failed'}`));
    if (reconcileResult1.discrepancies && reconcileResult1.discrepancies.length > 0) {
      console.log(chalk.yellow(`Found ${reconcileResult1.discrepancies.length} discrepancies for Bot 1`));
    }
    
    const reconcileResult2 = await botService.reconcileBalances(bot2.id, threeCommasClient);
    console.log(chalk.green(`Bot 2 balance reconciliation: ${reconcileResult2.success ? 'Success' : 'Failed'}`));
    if (reconcileResult2.discrepancies && reconcileResult2.discrepancies.length > 0) {
      console.log(chalk.yellow(`Found ${reconcileResult2.discrepancies.length} discrepancies for Bot 2`));
    }
    
    // Get a common asset that both bots have
    const bot1Assets = await BotAsset.findAll({ where: { botId: bot1.id } });
    const bot2Assets = await BotAsset.findAll({ where: { botId: bot2.id } });
    
    if (!bot1Assets.length || !bot2Assets.length) {
      console.error(chalk.red('One or both bots have no tracked assets. Please initialize the bots with assets first.'));
      return;
    }
    
    // Find a common asset
    let commonAsset = null;
    for (const asset1 of bot1Assets) {
      const matchingAsset = bot2Assets.find(a => a.coin === asset1.coin);
      if (matchingAsset) {
        commonAsset = {
          coin: asset1.coin,
          bot1Amount: asset1.amount,
          bot2Amount: matchingAsset.amount
        };
        break;
      }
    }
    
    if (!commonAsset) {
      console.log(chalk.yellow('No common asset found between the bots. Creating test assets...'));
      
      // Use BTC as a test coin if no common assets
      const testCoin = 'BTC';
      
      // Check if the bots already have BTC assets
      let bot1BTC = await BotAsset.findOne({ where: { botId: bot1.id, coin: testCoin } });
      let bot2BTC = await BotAsset.findOne({ where: { botId: bot2.id, coin: testCoin } });
      
      // Create test assets if they don't exist
      if (!bot1BTC) {
        bot1BTC = await BotAsset.create({
          botId: bot1.id,
          coin: testCoin,
          amount: 0.1,
          entryPrice: 50000,
          usdtEquivalent: 5000,
          lastUpdated: new Date()
        });
      }
      
      if (!bot2BTC) {
        bot2BTC = await BotAsset.create({
          botId: bot2.id,
          coin: testCoin,
          amount: 0.05,
          entryPrice: 50000,
          usdtEquivalent: 2500,
          lastUpdated: new Date()
        });
      }
      
      commonAsset = {
        coin: testCoin,
        bot1Amount: bot1BTC.amount,
        bot2Amount: bot2BTC.amount
      };
    }
    
    console.log(chalk.green(`\nFound common asset: ${commonAsset.coin}`));
    console.log(`- Bot 1 has ${commonAsset.bot1Amount} ${commonAsset.coin}`);
    console.log(`- Bot 2 has ${commonAsset.bot2Amount} ${commonAsset.coin}`);
    
    // Test 1: Lock the asset with Bot 1
    console.log(chalk.blue('\nTest 1: Locking asset with Bot 1...'));
    const lockResult1 = await assetManager.lockAssets(
      bot1.id,
      commonAsset.coin,
      commonAsset.bot1Amount,
      'asset_lock_test',
      2 // Lock for 2 minutes
    );
    
    if (lockResult1.success) {
      console.log(chalk.green(`Successfully locked ${commonAsset.bot1Amount} ${commonAsset.coin} for Bot 1`));
      console.log(`Lock ID: ${lockResult1.lockId}, Expires: ${lockResult1.expiresAt}`);
      
      // Test 2: Try to lock the same asset with Bot 2 (should fail)
      console.log(chalk.blue('\nTest 2: Attempting to lock the same asset with Bot 2...'));
      
      const canTrade = await assetManager.canTradeAsset(bot2.id, commonAsset.coin, commonAsset.bot2Amount);
      console.log(`Can Bot 2 trade ${commonAsset.coin}? ${canTrade.canTrade ? 'Yes' : 'No'}`);
      
      if (!canTrade.canTrade) {
        console.log(chalk.yellow(`Reason: ${canTrade.reason}`));
      }
      
      const lockResult2 = await assetManager.lockAssets(
        bot2.id,
        commonAsset.coin,
        commonAsset.bot2Amount,
        'asset_lock_test',
        2 // Lock for 2 minutes
      );
      
      if (!lockResult2.success) {
        console.log(chalk.green(`Expected result: Bot 2 cannot lock ${commonAsset.coin} while Bot 1 has a lock.`));
        console.log(`Error: ${lockResult2.error}`);
        
        // Test 3: Release the lock from Bot 1
        console.log(chalk.blue('\nTest 3: Releasing lock from Bot 1...'));
        
        const releaseResult = await assetManager.releaseLock(lockResult1.lockId, bot1.id);
        
        if (releaseResult.success) {
          console.log(chalk.green(`Successfully released lock on ${commonAsset.coin} for Bot 1`));
          
          // Test 4: Now Bot 2 should be able to lock the asset
          console.log(chalk.blue('\nTest 4: Attempting to lock with Bot 2 after release...'));
          
          // Short delay to ensure lock release is processed
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const lockResult3 = await assetManager.lockAssets(
            bot2.id,
            commonAsset.coin,
            commonAsset.bot2Amount,
            'asset_lock_test',
            2 // Lock for 2 minutes
          );
          
          if (lockResult3.success) {
            console.log(chalk.green(`Successfully locked ${commonAsset.bot2Amount} ${commonAsset.coin} for Bot 2`));
            console.log(`Lock ID: ${lockResult3.lockId}, Expires: ${lockResult3.expiresAt}`);
            
            // Clean up by releasing Bot 2's lock
            await assetManager.releaseLock(lockResult3.lockId, bot2.id);
          } else {
            console.log(chalk.red(`Unexpected: Bot 2 still cannot lock ${commonAsset.coin}`));
            console.log(`Error: ${lockResult3.error}`);
          }
        } else {
          console.log(chalk.red(`Failed to release lock: ${releaseResult.error}`));
        }
      } else {
        console.log(chalk.red(`Unexpected: Bot 2 was able to lock ${commonAsset.coin} while Bot 1 had a lock`));
        
        // Clean up by releasing both locks
        await assetManager.releaseLock(lockResult1.lockId, bot1.id);
        await assetManager.releaseLock(lockResult2.lockId, bot2.id);
      }
    } else {
      console.log(chalk.red(`Failed to lock ${commonAsset.coin} for Bot 1: ${lockResult1.error}`));
    }
    
    // Test 5: Test lock expiration
    console.log(chalk.blue('\nTest 5: Testing lock expiration...'));
    
    const shortLock = await assetManager.lockAssets(
      bot1.id,
      commonAsset.coin,
      commonAsset.bot1Amount,
      'expiration_test',
      0.05 // Lock for 3 seconds (0.05 minutes)
    );
    
    if (shortLock.success) {
      console.log(chalk.green(`Created short lock on ${commonAsset.coin} for Bot 1`));
      console.log(`Lock ID: ${shortLock.lockId}, Expires in 3 seconds`);
      
      console.log('Waiting for lock to expire...');
      
      // Wait 4 seconds for the lock to expire
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Check if lock was automatically released
      const lockRecord = await AssetLock.findByPk(shortLock.lockId);
      
      if (lockRecord && lockRecord.status === 'released') {
        console.log(chalk.green('Lock was automatically released after expiration'));
      } else if (lockRecord) {
        console.log(chalk.yellow(`Lock status is ${lockRecord.status}, running cleanup...`));
        
        // Force cleanup of expired locks
        const cleaned = await assetManager.cleanupExpiredLocks();
        console.log(`Cleaned up ${cleaned} expired locks`);
        
        // Re-check the lock
        const updatedLock = await AssetLock.findByPk(shortLock.lockId);
        console.log(`Lock status is now: ${updatedLock ? updatedLock.status : 'not found'}`);
      } else {
        console.log(chalk.red('Lock record not found'));
      }
      
      // Verify Bot 2 can now lock the asset
      const finalLock = await assetManager.lockAssets(
        bot2.id,
        commonAsset.coin,
        commonAsset.bot2Amount,
        'final_test',
        1
      );
      
      if (finalLock.success) {
        console.log(chalk.green(`Bot 2 successfully locked ${commonAsset.coin} after Bot 1's lock expired`));
        
        // Clean up
        await assetManager.releaseLock(finalLock.lockId, bot2.id);
      } else {
        console.log(chalk.red(`Bot 2 still cannot lock ${commonAsset.coin}: ${finalLock.error}`));
      }
    } else {
      console.log(chalk.red(`Failed to create expiration test lock: ${shortLock.error}`));
    }
    
    console.log(chalk.blue('\n=== Asset Locking Test Completed ===\n'));
    
  } catch (error) {
    console.error(chalk.red(`Error running asset lock test: ${error.message}`));
    console.error(error);
  }
}

// Run the test
runTest().catch(err => {
  console.error(chalk.red('Failed to run test:'), err);
});
