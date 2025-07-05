const axios = require('axios');
const crypto = require('crypto');

class ThreeCommasService {
  constructor(apiKey, apiSecret, options = {}) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.3commas.io';
    this.requestTimeout = options.requestTimeout || 10000;
    this.maxRetries = options.maxRetries || 1;
  }

  /**
   * Generate signature for 3commas API
   * @param {String} path - API path
   * @param {Object} params - Request parameters
   * @returns {String} - HMAC signature
   */
  generateSignature(path, params = {}) {
    const encodedParams = new URLSearchParams(params).toString();
    const requestString = encodedParams ? `${path}?${encodedParams}` : path;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(requestString)
      .digest('hex');
  }

  /**
   * Make a request to the 3commas API
   * @param {String} entity - API entity (accounts, deals, bots, etc.)
   * @param {String} action - API action
   * @param {Object} params - Request parameters
   * @param {String} method - HTTP method (default: get)
   * @returns {Promise<Array>} - [error, data]
   */
  async request(entity, action = '', params = {}, method = 'get') {
    // Format the path properly
    let path;
    if (action) {
      path = `/public/api/ver1/${entity}/${action}`.replace(/\/+$/, '');
    } else {
      path = `/public/api/ver1/${entity}`.replace(/\/+$/, '');
    }
    
    const url = `${this.baseUrl}${path}`;
    
    const signature = this.generateSignature(path, params);
    
    const headers = {
      'APIKEY': this.apiKey,
      'Signature': signature,
      'Content-Type': 'application/json'
    };

    let retries = 0;
    let lastError = null;

    while (retries <= this.maxRetries) {
      try {
        console.log(`Making request to ${url} with params:`, params);
        
        const response = await axios({
          method,
          url,
          params,
          headers,
          timeout: this.requestTimeout
        });
        
        return [null, response.data];
      } catch (error) {
        console.error(`Error in 3Commas request to ${url}:`, error.response?.data || error.message);
        lastError = {
          code: error.response?.status || 500,
          message: error.response?.data?.error || error.message
        };
        retries++;
        
        if (retries <= this.maxRetries) {
          // Wait exponentially longer between retries
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    return [lastError, null];
  }
  
  /**
   * Get user accounts
   * @returns {Promise<Array>} - [error, accounts]
   */
  async getAccounts() {
    return this.request('accounts', '');
  }
  
  /**
   * Get account information
   * @param {String} accountId - Account ID
   * @returns {Promise<Array>} - [error, accountInfo]
   */
  async getAccountInfo(accountId) {
    return this.request('accounts', accountId);
  }
  
  /**
   * Get available coins from a 3Commas account
   * @param {String} accountId - 3Commas account ID
   * @returns {Promise<Array>} - [error, availableCoins]
   */
  async getAvailableCoins(accountId) {
    try {
      // Get account table data which contains detailed balance information
      const [err, rows] = await this.request('accounts', `${accountId}/account_table_data`, {}, 'post');
      
      if (err) {
        console.error('Error fetching account data:', err);
        return [err, null];
      }
      
      // Check if we have any rows data
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return [{ error: 'No balances found in account data' }, null];
      }
      
      // Format the rows into the expected format
      // Filter for coins with non-zero balances
      const availableCoins = rows
        .filter(row => parseFloat(row.position) > 0)
        .map(row => ({
          coin: row.currency_code,
          name: row.currency_name || row.currency_code,
          amount: parseFloat(row.position),
          amountInUsd: parseFloat(row.usd_value)
        }));
      
      // Sort coins by USD value (highest first)
      availableCoins.sort((a, b) => b.amountInUsd - a.amountInUsd);
      
      // If we found no coins with balances
      if (availableCoins.length === 0) {
        return [{ error: 'No coins with balances found' }, null];
      }
      
      return [null, availableCoins];
    } catch (error) {
      console.error('Error in getAvailableCoins:', error);
      return [{ error: error.message }, null];
    }
  }
  
  /**
   * Get market price for a trading pair
   * @param {String} pair - Trading pair (e.g. BTC_USDT) - Note: Internally we use TARGET_BASE format
   * @returns {Promise<Array>} - [error, priceData]
   */
  async getMarketPrice(pair) {
    try {
      // Current 3Commas API expects different format - try multiple approaches
      // First, try the unauthenticated market data endpoint
      const [baseCoin, quoteCoin] = pair.split('_');
      console.log(`Fetching market price for ${baseCoin}_${quoteCoin}`);
      
      // 1. Try using the verified working endpoint format
      try {
        // Use the known working endpoint as demonstrated by the user
        // https://api.3commas.io/public/api/ver1/accounts/currency_rates?market_code=binance&pair=USDT_ADA
        const pairFormatted = `${quoteCoin}_${baseCoin}`;
        const response = await axios.get(`${this.baseUrl}/public/api/ver1/accounts/currency_rates`, {
          params: {
            pair: pairFormatted,
            market_code: 'binance'
          },
          timeout: this.requestTimeout
        });
        
        // If we get a valid response with price data
        if (response.data && response.data.last) {
          console.log(`Found price via accounts/currency_rates: ${JSON.stringify(response.data)}`);
          return [null, response.data];
        }
      } catch (err) {
        console.log('Currency rates endpoint failed:', err.message);
        // Continue to next attempt
      }
      
      // 2. Try fallback to API v2 endpoint (if the first one fails)
      try {
        // Note: For this endpoint, the pair should be in format BASE_TARGET (e.g. USDT_BTC)
        // This is different from our internal format of TARGET_BASE (e.g. BTC_USDT)
        const pairFormatted = `${quoteCoin}_${baseCoin}`;
        
        const response = await axios.get(`${this.baseUrl}/public/api/ver1/accounts/market_pairs`, {
          params: {
            pair: pairFormatted,
            market_code: 'binance' // Use binance as default market
          },
          timeout: this.requestTimeout
        });
        
        if (response.data && response.data.last) {
          console.log(`Found price via pair conversion: ${JSON.stringify(response.data)}`);
          return [null, response.data];
        }
      } catch (err) {
        console.log('Pair conversion endpoint failed:', err.message);
        // Continue to next attempt
      }
      
      // 3. Try the signed account endpoint (needs authentication)
      try {
        // This endpoint needs authentication and will be signed by request() method
        // Use the correct pair format and add market_code
        const pairFormatted = `${quoteCoin}_${baseCoin}`;
        const [error, data] = await this.request('accounts', 'currency_rates', { 
          pair: pairFormatted,
          market_code: 'binance'
        });
        
        if (!error && data && data.last) {
          console.log(`Found price via authenticated endpoint: ${JSON.stringify(data)}`);
          return [null, data];
        }
        
        if (error) {
          console.log('Authenticated endpoint failed:', error);
        }
      } catch (err) {
        console.log('Authenticated endpoint threw exception:', err.message);
        // Continue to fallback
      }
      
      // If we've reached this point, all attempts failed
      return [{code: 404, message: 'Price data not found on 3Commas'}, null];
    } catch (error) {
      console.error(`Error fetching market price: ${error.message}`);
      return [
        {
          code: error.response?.status || 500,
          message: error.response?.data?.error || error.message
        },
        null
      ];
    }
  }

  /**
   * Execute a trade (swap) between two coins using 3Commas Smart Trade API
   * @param {String} accountId - 3Commas account ID
   * @param {String} fromCoin - Coin to sell (e.g. BTC)
   * @param {String} toCoin - Coin to buy (e.g. ETH)
   * @param {Number} amount - Amount to sell (in fromCoin units)
   * @param {Boolean} useTakeProfit - Whether to use take profit (default: false)
   * @param {Number} takeProfitPercentage - Take profit percentage if useTakeProfit is true
   * @returns {Promise<Array>} - [error, tradeData]
   */
  async executeTrade(accountId, fromCoin, toCoin, amount, useTakeProfit = false, takeProfitPercentage = 2) {
    try {
      console.log(`Executing trade: ${fromCoin} → ${toCoin} (${amount} ${fromCoin})`);
      
      // Format the trading pair for 3Commas (BASE_TARGET format)
      // For example, BTC_USDT means trading BTC for USDT
      const pair = `${fromCoin}_${toCoin}`;
      
      // Prepare parameters for the smart trade
      const params = {
        account_id: accountId,
        pair: pair,
        position: {
          type: 'buy',
          units: {
            value: amount.toString()
          },
          order_type: 'market' // Use market order for immediate execution
        },
        note: `Crypto Rebalancer Bot - Swap ${fromCoin} to ${toCoin}`
      };
      
      // Add take profit settings if enabled
      if (useTakeProfit && takeProfitPercentage > 0) {
        params.take_profit = {
          enabled: true,
          steps: [
            {
              order_type: 'market',
              price: {
                type: 'percent',
                value: takeProfitPercentage.toString()
              },
              volume: 100
            }
          ]
        };
      }
      
      // Execute the trade through 3Commas Smart Trade API
      // https://github.com/3commas-io/3commas-official-api-docs/blob/master/smart_trades_api.md
      const [error, response] = await this.request('smart_trades', 'create_smart_trade', params, 'post');
      
      if (error) {
        console.error('Error executing trade:', error);
        return [error, null];
      }
      
      // The response contains details about the created smart trade
      return [null, {
        success: true,
        tradeId: response.id,
        status: response.status,
        pair: response.pair,
        createdAt: response.created_at,
        raw: response
      }];
    } catch (error) {
      console.error(`Error in executeTrade: ${error.message}`);
      return [
        {
          code: 500,
          message: `Failed to execute trade: ${error.message}`
        },
        null
      ];
    }
  }
  
  /**
   * Get trade status by ID from 3Commas
   * @param {String|Number} tradeId - The 3Commas smart trade ID
   * @returns {Promise<Array>} - [error, response]
   */
  async getTradeStatus(tradeId) {
    try {
      const [error, response] = await this.request('smart_trades', tradeId);
      
      if (error) {
        return [error, null];
      }
      
      return [null, {
        tradeId: response.id,
        status: response.status,
        pair: response.pair,
        profit: response.profit,
        createdAt: response.created_at,
        updatedAt: response.updated_at,
        raw: response
      }];
    } catch (error) {
      console.error(`Error in getTradeStatus: ${error.message}`);
      return [{ message: error.message }, null];
    }
  }
  
  /**
   * Get actual commission rates from the exchange via 3Commas
   * @param {String|Number} accountId - The 3Commas account ID
   * @returns {Promise<Array>} - [error, {makerRate, takerRate}]
   */
  async getExchangeCommissionRates(accountId) {
    try {
      // First get the account details to determine the exchange
      const [accountError, account] = await this.request('accounts', accountId);
      
      if (accountError) {
        return [accountError, null];
      }
      
      // Default rates if we can't get the actual ones
      const defaultRates = {
        makerRate: 0.001, // 0.1%
        takerRate: 0.002, // 0.2%
        exchange: account.exchange_name || 'unknown'
      };
      
      // Different exchanges expose commission rates differently or may not expose them via API
      // We'll try to get them based on the exchange type
      
      // For market orders, we typically use taker fee
      // For limit orders, we typically use maker fee
      // We'll return both and let the caller decide which to use

      // Different exchanges may require different API endpoints and parsing
      // Here we'll add support for the most common exchanges
      
      try {
        // For Binance (most common)
        if (account.exchange_name === 'Binance' || account.exchange_name === 'BinanceUs') {
          // Try to get fee info using account trades endpoint
          // This endpoint is available in 3Commas but requires additional permissions
          const [feeError, feeInfo] = await this.request('accounts', `${accountId}/fee_rates`);
          
          if (!feeError && feeInfo) {
            return [null, {
              makerRate: parseFloat(feeInfo.maker_fee) || defaultRates.makerRate,
              takerRate: parseFloat(feeInfo.taker_fee) || defaultRates.takerRate,
              exchange: account.exchange_name,
              source: 'api'
            }];
          }
        }
        
        // For other exchanges or if the above fails, try a general approach
        // Some exchanges provide fee info in the account details
        if (account.maker_fee && account.taker_fee) {
          return [null, {
            makerRate: parseFloat(account.maker_fee) || defaultRates.makerRate,
            takerRate: parseFloat(account.taker_fee) || defaultRates.takerRate,
            exchange: account.exchange_name,
            source: 'account_info'
          }];
        }
      } catch (innerError) {
        console.log(`Warning: Error getting fee rates: ${innerError.message}`);
        // Continue with defaults if this fails
      }
      
      // Return default rates if we couldn't get actual rates
      return [null, {
        ...defaultRates,
        source: 'default'
      }];
    } catch (error) {
      return [{ message: `Failed to get commission rates: ${error.message}` }, null];
    }
  }
}

module.exports = ThreeCommasService;
