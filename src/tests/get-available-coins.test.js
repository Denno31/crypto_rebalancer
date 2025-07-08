/**
 * Test script for getAvailableCoins method of ThreeCommasService
 */
const chalk = require('chalk');
const db = require('../models');
const ThreeCommasService = require('../services/threeCommas.service');
const ApiConfig = db.apiConfig;
const SystemConfig = db.systemConfig;
const Bot = db.bot;

const getAvailableCoins = async () => {
    try {
        console.log(chalk.blue('='.repeat(80)));
        console.log(chalk.blue('Testing getAvailableCoins Method'));
        console.log(chalk.blue('='.repeat(80)));

        // First try to find API config
        console.log('Finding API configuration...');
        const apiConfig = await ApiConfig.findOne({ where: { id: 1 } });
        if (!apiConfig) {
            console.error(chalk.red('❌ API configuration not found! Trying to find any API config...'));
            const anyApiConfig = await ApiConfig.findOne();
            if (!anyApiConfig) {
                throw new Error('No API configuration found in database');
            }
            console.log(chalk.yellow(`Using API config with ID: ${anyApiConfig.id}`));
            apiConfig = anyApiConfig;
        }

        // Get system config
        console.log('Finding system configuration...');
        let systemConfig = await SystemConfig.findOne({ where: { id: 1 } });
        if (!systemConfig) {
            console.error(chalk.red('❌ System configuration not found! Using default timeout value.'));
            systemConfig = { requestTimeout: 10000 };
        }

        // Initialize the 3Commas service
        console.log('Creating ThreeCommasService instance...');
        const threeCommasService = new ThreeCommasService(
            apiConfig.apiKey, 
            apiConfig.apiSecret, 
            { requestTimeout: systemConfig.requestTimeout || 10000 }
        );

        // Find a valid account ID - we should only get this from a bot
        console.log('Finding account ID from bot...');
        let accountId = null;
        
        // Look for an active bot to get the account ID
        console.log('Looking in active bots for account ID...');
        // Looking at bot.model.js, the field is 'enabled' not 'is_active'
        const activeBot = await Bot.findOne({ where: { enabled: true } });
        if (activeBot && activeBot.accountId) {
            accountId = activeBot.accountId;
            console.log(chalk.green(`✅ Found account ID from active bot: ${accountId}`));
        } else {
            console.log(chalk.yellow('No active bot with account ID found. Looking for any bot...'));
            // Looking at bot.model.js, we can use accountId directly as the model maps it correctly
            const anyBot = await Bot.findOne({ where: { accountId: { [db.Sequelize.Op.not]: null } } });
            if (anyBot && anyBot.accountId) {
                accountId = anyBot.accountId;
                console.log(chalk.green(`✅ Found account ID from bot (ID: ${anyBot.id}): ${accountId}`));
            }
        }

        // Check if we have an account ID
        if (!accountId) {
            console.error(chalk.red('❌ Could not find a valid account ID. Cannot continue.'));
            return;
        }
        
        // Now fetch available coins
        console.log(chalk.cyan(`\nFetching available coins for account ${accountId}...`));
        const [error, availableCoins] = await threeCommasService.getAvailableCoins(accountId);
        
        if (error) {
            console.error(chalk.red(`❌ Error fetching available coins: ${JSON.stringify(error)}`));
            console.log(chalk.yellow('\nTesting with simulated values instead...'));
            
            // Create mock data for testing
            const simulatedCoins = [
                { currency_code: 'BTC', amount: '0.1', usd_value: '4000' },
                { currency_code: 'ETH', amount: '2.5', usd_value: '5000' },
                { currency_code: 'USDT', amount: '1000', usd_value: '1000' }
            ];
            
            console.log(chalk.green('\nSimulated available coins:'));
            simulatedCoins.forEach(coin => {
                console.log(chalk.green(`  • ${coin.currency_code}: ${coin.amount} (${coin.usd_value} USD)`));
            });
            
            // Test commission rate feature
            console.log(chalk.cyan('\nTesting getExchangeCommissionRates method...'));
            const [rateError, rateData] = await threeCommasService.getExchangeCommissionRates(accountId);
            
            if (!rateError && rateData) {
                console.log(chalk.green(`✅ Commission rates for ${rateData.exchange}:`));
                console.log(chalk.green(`  • Maker fee: ${rateData.makerRate * 100}%`));
                console.log(chalk.green(`  • Taker fee: ${rateData.takerRate * 100}%`));
                console.log(chalk.green(`  • Source: ${rateData.source}`));
            } else {
                console.log(chalk.yellow(`⚠️ Could not get commission rates: ${rateError?.message || 'Unknown error'}`));
                console.log(chalk.yellow(`Using default rates: Maker 0.1%, Taker 0.2%`));
            }
            
            return;
        }
        
        // Log the results
        console.log(chalk.green(`\n✅ Found ${availableCoins.length} available coins:`));
        availableCoins.forEach(coin => {
            console.log(chalk.green(`  • ${coin.currency_code}: ${coin.amount} (${coin.usd_value} USD)`));
        });
        
        // Test commission rate feature
        console.log(chalk.cyan('\nTesting getExchangeCommissionRates method...'));
        const [rateError, rateData] = await threeCommasService.getExchangeCommissionRates(accountId);
        
        if (!rateError && rateData) {
            console.log(chalk.green(`✅ Commission rates for ${rateData.exchange}:`));
            console.log(chalk.green(`  • Maker fee: ${rateData.makerRate * 100}%`));
            console.log(chalk.green(`  • Taker fee: ${rateData.takerRate * 100}%`));
            console.log(chalk.green(`  • Source: ${rateData.source}`));
        } else {
            console.log(chalk.yellow(`⚠️ Could not get commission rates: ${rateError?.message || 'Unknown error'}`));
            console.log(chalk.yellow(`Using default rates: Maker 0.1%, Taker 0.2%`));
        }
        
    } catch (error) {
        console.error(chalk.red(`❌ Test failed with error: ${error.message}`));
        console.error(error.stack);
    }
};

getAvailableCoins();
