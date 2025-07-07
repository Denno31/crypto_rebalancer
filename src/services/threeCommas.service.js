const axios = require('axios');
const crypto = require('crypto');

// Define API versions like in Python implementation
const API_VERSION_V1 = '/public/api/ver1/';
const API_VERSION_V2 = '/public/api/v2/';

// Define entities that use V2 API
const API_VERSION_V2_ENTITIES = [
  'smart_trades_v2',
  'grid_bots_v2',
];

// Map API methods to HTTP methods and paths - matching Python implementation
const API_METHODS = {
  // For smart_trades_v2, the endpoints follow different patterns than v1
  // Based on 3commas API docs: https://github.com/3commas-io/3commas-official-api-docs/blob/master/smart_trades_v2_api.md
  smart_trades_v2: {
    'new': ['POST', 'smart_trades'],    // This creates a new trade via the v1 endpoint
    'get_by_id': ['GET', '{id}'],       // Get trade by ID 
    'update': ['PATCH', '{id}'],        // Update trade
    'cancel': ['DELETE', '{id}'],        // Cancel trade
    '': ['GET', '']                      // Get all trades
  }
};

class ThreeCommasService {
  constructor(apiKey, apiSecret, options = {}) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = options.baseUrl || 'https://api.3commas.io';
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Python-style signature generation to match the py3cw library
   * @param {String} path - API path
   * @param {String} data - JSON stringified data or empty string
   * @returns {String} - HMAC signature
   * @private
   */
  __generateSignaturePython(path, data = '') {
    // This matches exactly how py3cw generates signatures
    // Using the path + data string
    if (!path) {
      console.error('Path is undefined in signature generation');
      return '';
    }
    const message = Buffer.from(path + data);
    const key = Buffer.from(this.apiSecret);
    
    const signature = crypto
      .createHmac('sha256', key)
      .update(message)
      .digest('hex');
    
    console.log(`Python-style signature for path: ${path}, data length: ${data.length}`);
    
    return signature;
  }
  
  /**
   * Original signature generation method (keeping for compatibility)
   * @param {String} path - API path
   * @param {Object} params - Request parameters
   * @param {String} method - HTTP method
   * @param {Boolean} isJsonBody - Whether body is JSON format
   * @returns {String} - HMAC signature
   */
  generateSignature(path, params = {}, method = 'get', isJsonBody = true) {
    // According to 3Commas official documentation:
    // 1. For GET requests: Sign the path + query string
    // 2. For POST with form-urlencoded: Sign the path + query string
    // 3. For POST with JSON body: For simple trades, sign the path + JSON stringified body
    
    let requestString = path;
    
    // For GET requests or POST with form data
    if (method.toLowerCase() === 'get' || !isJsonBody) {
      const encodedParams = new URLSearchParams(params).toString();
      if (encodedParams) {
        requestString = `${path}?${encodedParams}`;
      }
    }
    // For POST with JSON body (handle special case for smart trades)
    else if (isJsonBody && path.includes('smart_trades')) {
      // Special handling for smart trades - includes path + JSON data
      requestString = path + JSON.stringify(params);
    }
    // For other POST with JSON, just use path
    
    console.log(`Generating signature for: ${requestString}`);
    
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
    // Check if this entity+action is in our API methods mapping (like Python)
    let httpMethod = method.toUpperCase();
    let apiPath = '';
    let apiVersion;
    let entityPath = entity;
    
    // If we have a mapping for this entity/action, use it
    if (API_METHODS[entity] && API_METHODS[entity][action]) {
      [httpMethod, apiPath] = API_METHODS[entity][action];
    }
    
    // Handle action_id replacements (like Python implementation)
    if (action && !isNaN(action)) {
      // If action is a number, it's an ID
      apiPath = apiPath.replace('{id}', action);
    }
    
    // Determine API version based on entity type (like Python implementation)
    if (API_VERSION_V2_ENTITIES.includes(entity)) {
      apiVersion = API_VERSION_V2;
      entityPath = entity.replace('_v2', ''); // Remove _v2 suffix for path
    } else {
      apiVersion = API_VERSION_V1;
    }
    
    // Format the path properly based on API mapping
    let path;
    if (apiPath && apiPath.startsWith('/')) {
      // If apiPath starts with /, use it as a full path after API version
      path = `${apiVersion}${apiPath}`.replace(/\/+$/, '');
    } else if (apiPath) {
      // Otherwise combine with entity path
      path = `${apiVersion}${entityPath}/${apiPath}`.replace(/\/+$/, '');
    } else if (action && isNaN(action)) {
      path = `${apiVersion}${entityPath}/${action}`.replace(/\/+$/, '');
    } else if (action) {
      // It's an ID
      path = `${apiVersion}${entityPath}/${action}`.replace(/\/+$/, '');
    } else {
      path = `${apiVersion}${entityPath}`.replace(/\/+$/, '');
    }
    
    const url = `${this.baseUrl}${path}`;
    
    // For GET with params, add them to the URL (like Python implementation)
    const isGetWithPayload = httpMethod === 'GET' && params && Object.keys(params).length > 0;
    
    // Determine content type based on request type
    const isJsonBody = httpMethod === 'POST' && Object.keys(params).length > 0;
    const contentType = isJsonBody ? 'application/json' : 'application/x-www-form-urlencoded';
    
    // Generate signature - using same approach as Python implementation
    const dataString = isJsonBody ? JSON.stringify(params) : '';
    const signature = this.__generateSignaturePython(path, dataString);
    
    const headers = {
      'APIKEY': this.apiKey,
      'Signature': signature,
      'Content-Type': contentType
    };

    let retries = 0;
    let lastError = null;

    while (retries <= this.maxRetries) {
      try {
        let axiosConfig = {
          method: httpMethod,  // Use the resolved HTTP method
          url,
          headers,
          timeout: this.timeout
        };

        // For GET requests with params, encode as URL params
        if (isGetWithPayload) {
          // URL encode params for GET requests
          const searchParams = new URLSearchParams();
          Object.entries(params).forEach(([key, value]) => {
            searchParams.append(key, value);
          });
          const queryString = searchParams.toString();
          axiosConfig.url = `${url}?${queryString}`;
        } 
        // For POST requests with JSON body
        else if (isJsonBody) {
          axiosConfig.data = params;
        }
        // For POST requests without JSON body (empty body)
        else if (httpMethod === 'POST') {
          axiosConfig.data = {};
        }

        console.log(`Making ${httpMethod} request to ${axiosConfig.url || url} with ${isGetWithPayload || httpMethod !== 'POST' ? 'params' : 'data'}:`, params);
        const response = await axios(axiosConfig);
        
        return [null, response.data];
      } catch (error) {
        console.error(`Error in 3Commas request to ${url}:`, error.response?.data || error.message);
        lastError = {
          code: error.response?.status || 500,
          message: error.response?.data?.error || error.response?.data?.error_description || error.message
        };

        if (retries >= this.maxRetries) {
          return [lastError, null];
        }

        retries++;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
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
      console.log(`Fetching available coins for account ${accountId}`);
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
   * @param {Number} amount - Amount of fromCoin to sell
   * @param {Boolean} useTakeProfit - Whether to use take profit
   * @param {Number} takeProfitPercentage - Take profit percentage
   * @param {String} mode - Trading mode ('live' or 'paper')
   * @returns {Promise<Array>} - [error, tradeData]
   */
  async executeTrade(accountId, fromCoin, toCoin, amount, useTakeProfit = false, takeProfitPercentage = 2, mode = 'live') {
    try {
      // Ensure account ID is a string
      accountId = String(accountId);
      
      // Format trading pair - 3Commas expects BASE_QUOTE format
      // Example: BTC_USDT means buy/sell BTC with USDT
      const pair = `${fromCoin}_${toCoin}`;
      
      console.log(`Executing trade: ${fromCoin} → ${toCoin} (${amount} ${fromCoin})`);
      
      // Use a simpler approach for API v1 - this matches how the Python implementation works
      // Check if we're using paper/demo trading mode
      const isPaperTrading = mode === 'paper';
      
      if (isPaperTrading) {
        console.log('⚠️ Using PAPER TRADING mode - no real funds will be used');
      }
      
      const payload = {
        account_id: accountId,
        pair,
        position: {
          type: 'buy',
          units: {
            value: String(amount)
          },
          order_type: 'market'
        },
        demo: isPaperTrading // Set demo flag for paper trading
      };
      
      // Add take profit settings if enabled
      if (useTakeProfit && takeProfitPercentage > 0) {
        payload.take_profit = {
          enabled: true,
          steps: [
            {
              order_type: 'market',
              price: {
                type: 'percent',
                value: String(takeProfitPercentage)
              },
              volume: 100
            }
          ]
        };
      }
      
      // Use the v1 API with create_smart_trade action - this is what works in Python
      const [error, response] = await this.request(
        'smart_trades', 
        'create_smart_trade',
        payload, 
        'post'
      );
      
      if (error) {
        console.error('Error executing trade:', error);
        return [error, null];
      }
      
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
      // Use smart_trades_v2 API to match the Python implementation
      const [error, response] = await this.request('smart_trades_v2', tradeId);
      
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
