/**
 * Script to run all enabled trading bots
 * 
 * Usage:
 * node src/scripts/runBot.js
 * 
 * This script will automatically load and run all enabled bots from the database
 * and periodically check for newly enabled bots
 */

require('dotenv').config();
const db = require('../models');
const botService = require('../services/bot.service');

async function run() {
  try {
    console.log('Initializing bot service...');
    
    // Get all enabled bots
    const enabledBots = await db.bot.findAll({
      where: { enabled: true }
    });
    
    if (enabledBots.length === 0) {
      console.log('No enabled bots found in the database. Please enable bots through the API first.');
      process.exit(0);
    }
    
    console.log(`Found ${enabledBots.length} enabled bot(s). Starting them...`);
    
    // Start all enabled bots
    for (const bot of enabledBots) {
      try {
        console.log(`Starting bot ${bot.id}: ${bot.name}`);
        await botService.startBot(bot.id);
      } catch (error) {
        console.error(`Failed to start bot ${bot.id}: ${error.message}`);
      }
    }
    
    console.log('All bots started successfully. Press Ctrl+C to stop.');
    
    // Set up periodic check for newly enabled bots
    const checkNewBotsInterval = 2 * 60 * 1000; // Check every 2 minutes
    console.log(`Will check for newly enabled bots every ${checkNewBotsInterval/60000} minutes`);
    
    // Start the periodic check interval
    setInterval(async () => {
      try {
        // Get current list of enabled bots
        const currentEnabledBots = await db.bot.findAll({
          where: { enabled: true }
        });
        
        // Check for bots that are enabled but not active
        for (const bot of currentEnabledBots) {
          if (!botService.activeBots[bot.id]) {
            console.log(`Found newly enabled bot ${bot.id}: ${bot.name}. Starting it...`);
            try {
              await botService.startBot(bot.id);
            } catch (error) {
              console.error(`Failed to start newly enabled bot ${bot.id}: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.error('Error checking for newly enabled bots:', error);
      }
    }, checkNewBotsInterval);
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('Stopping all bots...');
      
      // Get all bot IDs from the activeBots object in botService
      const activeBotIds = Object.keys(botService.activeBots);
      
      if (activeBotIds.length === 0) {
        console.log('No active bots to stop.');
      } else {
        for (const botId of activeBotIds) {
          console.log(`Stopping bot ${botId}...`);
          await botService.stopBot(parseInt(botId));
        }
      }
      
      console.log('All bots stopped.');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error running bot service:', error);
    process.exit(1);
  }
}

// Run all bots
run();
