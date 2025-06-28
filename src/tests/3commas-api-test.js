/**
 * 3Commas API Test Script
 * 
 * This script demonstrates exactly what API calls are made to 3Commas
 * when a trade is triggered, without actually executing real trades.
 */

const chalk = require('chalk');
const crypto = require('crypto');
const axios = require('axios');

// Mock 3Commas API client similar to your production code
class ThreeCommasClient {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.3commas.io/public/api';
  }
  
  // Generates signature for 3Commas API
  generateSignature(requestPath, requestData) {
    const payload = requestPath + requestData;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
  }
  
  // Makes requests to 3Commas API
  async request(endpoint, subEndpoint = null, requestData = {}) {
    try {
      console.log(chalk.cyan('==============================='));
      console.log(chalk.cyan(`Making 3Commas API Request:`));
      
      // Build the request URL and data
      let path = `/v2/${endpoint}`;
      if (subEndpoint) {
        path += `/${subEndpoint}`;
      }
      const url = this.baseUrl + path;
      
      // Convert requestData to query string for GET requests or leave as JSON for POST
      const method = subEndpoint === 'create_smart_trade' ? 'POST' : 'GET';
      
      // For GET requests, encode parameters as querystring
      // For POST requests, encode as JSON body
      let queryString = '';
      let data = {};
      
      if (method === 'GET') {
        // Build query string for GET requests
        const params = new URLSearchParams();
        for (const key in requestData) {
          params.append(key, requestData[key]);
        }
        queryString = params.toString();
        
        if (queryString) {
          path += `?${queryString}`;
        }
      } else {
        // For POST, we'll send JSON data in body
        data = requestData;
      }
      
      // Generate signature for authentication
      const signature = this.generateSignature(path, method === 'POST' ? JSON.stringify(data) : '');
      
      // Prepare headers for the request
      const headers = {
        'APIKEY': this.apiKey,
        'Signature': signature
      };
      
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
      }
      
      // Log the request details
      console.log(chalk.yellow(`API Endpoint: ${url}`));
      console.log(chalk.yellow(`Method: ${method}`));
      console.log(chalk.yellow(`Headers:`));
      console.log(chalk.gray(`  APIKEY: ${this.apiKey.substring(0, 5)}...`));
      console.log(chalk.gray(`  Signature: ${signature.substring(0, 10)}...`));
      
      if (method === 'GET' && queryString) {
        console.log(chalk.yellow(`Query Params:`));
        console.log(chalk.gray(`  ${queryString}`));
      }
      
      if (method === 'POST') {
        console.log(chalk.yellow(`Request Body:`));
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
      
      // In a real scenario, we would now call axios:
      // const response = await axios({
      //   method,
      //   url,
      //   headers,
      //   data: method === 'POST' ? data : undefined,
      // });
      
      // For testing purposes, we'll mock the responses
      
      // Mock response for account endpoint
      if (endpoint === 'accounts') {
        const mockResponse = {
          id: 123456,
          name: 'Binance Account',
          exchange_name: 'Binance',
          balances: [
            { currency_code: 'BTC', amount: '0.1', price_usd: '50000' },
            { currency_code: 'ETH', amount: '1.5', price_usd: '3500' },
            { currency_code: 'SOL', amount: '10', price_usd: '160' },
            { currency_code: 'USDT', amount: '1000', price_usd: '1' }
          ]
        };
        console.log(chalk.green(`Mock Response:`));
        console.log(chalk.gray(JSON.stringify(mockResponse, null, 2)));
        return [null, mockResponse];
      }
      
      // Mock response for smart_trades create endpoint
      if (endpoint === 'smart_trades' && subEndpoint === 'create_smart_trade') {
        const mockTradeResponse = {
          id: Math.floor(Math.random() * 1000000),
          account_id: data.account_id,
          pair: data.pair,
          status: 'new',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          units: data.units,
          take_profit: data.take_profit,
          stop_loss: data.stop_loss,
          note: 'Automated trade by rebalancer bot'
        };
        console.log(chalk.green(`Mock Response:`));
        console.log(chalk.gray(JSON.stringify(mockTradeResponse, null, 2)));
        return [null, mockTradeResponse];
      }
      
      return [{ error: 'Endpoint not mocked' }, null];
      
    } catch (error) {
      console.error(chalk.red(`3Commas API Error: ${error.message}`));
      return [error, null];
    }
  }
}

async function demonstrateTradeExecution() {
  try {
    console.log(chalk.blue('Demonstrating 3Commas API Trade Execution'));
    console.log(chalk.blue('=========================================='));
    
    // Create a 3Commas client with dummy credentials
    const apiKey = 'dummy_api_key';
    const apiSecret = 'dummy_api_secret';
    const threeCommasClient = new ThreeCommasClient(apiKey, apiSecret);
    
    // Step 1: Get account information (to find the balance of the coin we want to trade)
    console.log(chalk.magenta('\nSTEP 1: Fetching account information'));
    const accountId = 123456;
    const [accountError, accountData] = await threeCommasClient.request('accounts', accountId);
    
    if (accountError) {
      throw new Error(`Failed to get account data: ${JSON.stringify(accountError)}`);
    }
    
    // Simulate trade from BTC to ETH
    const fromCoin = 'BTC';
    const toCoin = 'ETH';
    
    console.log(chalk.magenta(`\nSimulating trade from ${fromCoin} to ${toCoin}`));
    
    // Step 2: Find the coin balance we want to sell
    const fromCoinBalance = accountData.balances.find(b => b.currency_code === fromCoin);
    
    if (!fromCoinBalance || parseFloat(fromCoinBalance.amount) <= 0) {
      throw new Error(`No balance found for ${fromCoin}`);
    }
    
    console.log(chalk.yellow(`Found ${fromCoin} balance: ${fromCoinBalance.amount}`));
    
    // Step 3: Create the smart trade
    console.log(chalk.magenta('\nSTEP 2: Creating smart trade'));
    
    const [tradeError, tradeData] = await threeCommasClient.request(
      'smart_trades',
      'create_smart_trade',
      {
        account_id: accountId,
        pair: `${toCoin}_${fromCoin}`, // e.g. "ETH_BTC"
        position_type: 'buy',
        units: {
          [fromCoin]: fromCoinBalance.amount
        },
        take_profit: {
          enabled: false
        },
        stop_loss: {
          enabled: false
        }
      }
    );
    
    if (tradeError) {
      throw new Error(`Failed to create trade: ${JSON.stringify(tradeError)}`);
    }
    
    // Step 4: Record the trade in your database
    console.log(chalk.magenta('\nSTEP 3: Record the trade in your database'));
    console.log(chalk.yellow('SQL that would be executed:'));
    console.log(chalk.gray(`
INSERT INTO trades (bot_id, trade_id, from_coin, to_coin, amount, price_change, status, executed_at)
VALUES (
  1,                              -- bot_id
  ${tradeData.id},                -- trade_id (from 3Commas response)
  '${fromCoin}',                  -- from_coin
  '${toCoin}',                    -- to_coin
  ${fromCoinBalance.amount},      -- amount
  15.5,                           -- price_change (calculated from price history)
  'completed',                    -- status
  NOW()                           -- executed_at
);
    `));
    
    // Step 5: Update the bot's current coin
    console.log(chalk.magenta('\nSTEP 4: Update bot current coin in database'));
    console.log(chalk.yellow('SQL that would be executed:'));
    console.log(chalk.gray(`
UPDATE bots
SET current_coin = '${toCoin}'
WHERE id = 1;
    `));
    
    console.log(chalk.green('\n✅ Trade execution simulation completed'));
    console.log(chalk.green('===================================='));
    console.log(chalk.cyan('\nIn a real execution:'));
    console.log(`1. The bot would check if ${toCoin} is performing better than ${fromCoin} by at least the threshold %`);
    console.log(`2. If yes, it would call the 3Commas API to execute the trade`);
    console.log(`3. The trade would be recorded in your database`);
    console.log(`4. The bot's current coin would be updated in the database`);
    
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

// Run the demonstration
demonstrateTradeExecution();
