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
    
    // Define minimum amounts based on coin type as a class property
    this.minimumAmounts = {
      'BTC': 0.0000001,   // Minimum BTC trade size
      'ETH': 0.000001,    // Minimum ETH trade size
      'ADA': 10,       // Minimum ADA trade size based on our successful test
      'USDT': 10,      // Minimum USDT trade size
      'DOGE': 10,      // DOGE has low value per coin, needs higher minimums
      'SHIB': 100000   // SHIB has very low value per coin, needs much higher minimums
    };
    
    // Dynamic cache for learning which parameter order works for each trading pair
    // Format: { 'USDT_COIN': { order: 'standard'|'reversed', positionType: 'buy'|'sell' } }
    // This is learned at runtime rather than hardcoded
    this.pairPreferenceCache = {};
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
    // Log partial API key for debugging (only first 4 and last 4 characters)
    if (this.apiKey && this.apiKey.length > 8) {
      const visiblePrefix = this.apiKey.substring(0, 4);
      const visibleSuffix = this.apiKey.substring(this.apiKey.length - 4);
      const maskedPortion = '*'.repeat(Math.max(0, this.apiKey.length - 8));
      console.log(`Using API key: ${visiblePrefix}${maskedPortion}${visibleSuffix}`);
    } else if (this.apiKey) {
      console.log(`Using API key: ${this.apiKey.substring(0, 2)}****`);
    } else {
      console.log('API key is not defined!');
    }
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
   * @param {String} mode - Trading mode (live or paper)
   * @param {Boolean} isIndirectTrade - Whether this is part of a multi-step trade via USDT
   * @param {String} [forcedPositionType] - Optional parameter to force a specific position type ('buy' or 'sell')
   * @param {Number|String} [parentTradeId] - Parent trade ID for multi-step trades
   * @param {Object} [db] - Database connection for recording trade steps
   * @param {Object} [enhancedSwapService] - Service for inserting trade steps
   * @returns {Promise<Array>} - [error, response]
   */
  async executeTrade(
    accountId, fromCoin, toCoin, amount, 
    useTakeProfit = false, takeProfitPercentage = 2.0, 
    mode = 'live', isIndirectTrade = false, forcedPositionType = null,
    parentTradeId = null, db = null, enhancedSwapService = null,preferredStablecoin = 'USDT'
  ) {
    
    console.log('Executing trade with API credentials:');
    // Log partial API key for debugging (only first 4 and last 4 characters)
    if (this.apiKey && this.apiKey.length > 8) {
      const visiblePrefix = this.apiKey.substring(0, 4);
      const visibleSuffix = this.apiKey.substring(this.apiKey.length - 4);
      const maskedPortion = '*'.repeat(Math.max(0, this.apiKey.length - 8));
      console.log(`API key: ${visiblePrefix}${maskedPortion}${visibleSuffix}`);
    } else if (this.apiKey) {
      console.log(`API key: ${this.apiKey.substring(0, 2)}****`);
    } else {
      console.log('API key is not defined!');
    }
    try {
      // Ensure account ID is a string
      accountId = String(accountId);
      
      // Determine position type and appropriate pair format
      // For 3Commas, we need to maintain consistency between position type and pair format
      let positionType;
      let pair;
      
      // If a position type is forced, use it to determine the pair format
      if (forcedPositionType && ['buy', 'sell'].includes(forcedPositionType)) {
        positionType = forcedPositionType;
        console.log(`Using forced position type: ${positionType} (overriding automatic determination)`);
        
        // Format pair based on the forced position type
        if (positionType === 'buy') {
          // For buy operations, the pair should be fromCoin_toCoin
          // Example: USDT_ADA for buying ADA with USDT
          pair = `${fromCoin}_${toCoin}`;
        } else {
          // For sell operations, the pair should be toCoin_fromCoin
          // Example: USDT_ADA for selling ADA for USDT
          pair = `${toCoin}_${fromCoin}`;
        }
        console.log(`Using pair format ${pair} for ${positionType} operation`);
      } else {
        // No forced position type - use default pair format and determine position type based on it
        // By default, we use toCoin_fromCoin format (which is typically a sell operation)
        pair = `${toCoin}_${fromCoin}`;
        
        // Now determine position type based on the pair format
        // The first currency in the pair is considered the base currency
        const firstCurrency = pair.split('_')[0]; // e.g., USDT in USDT_ADA
        positionType = fromCoin === firstCurrency ? 'buy' : 'sell';
        console.log(`Automatically determined position type: ${positionType} based on pair format ${pair}`);
      }
      
      console.log(`Executing trade: ${fromCoin} → ${toCoin} (${amount} ${fromCoin})`);
      
      // Use a simpler approach for API v1 - this matches how the Python implementation works
      // Check if we're using paper/demo trading mode
      const isPaperTrading = mode === 'paper';
      
      if (isPaperTrading) {
        console.log('⚠️ Using PAPER TRADING mode - no real funds will be used');
      }
      
      // Always use a two-step trade through USDT as an intermediate currency
      // But only if this isn't already an indirect trade (to prevent infinite recursion)
      // And only if neither fromCoin nor toCoin is already USDT (to avoid unnecessary trades)
      //use prefered stable coin instead to avoid hardcording
      if (!isIndirectTrade && fromCoin !== preferredStablecoin && toCoin !== preferredStablecoin) {
        console.log(`Using USDT as an intermediate currency for ${fromCoin} → ${toCoin} trade`);
        const intermediateCoin = preferredStablecoin; // Default intermediate coin
        
        // Step 1: Sell fromCoin to get USDT
        console.log(`Step 1: Selling ${fromCoin} → ${intermediateCoin}`);
        const [error1, trade1] = await this.executeTrade(
          accountId, fromCoin, intermediateCoin, amount, false, 0, mode, true,null,null,null,preferredStablecoin
        );
        
        // Record step 1 trade in database if parent trade ID is provided
        let step1Record = null;
        
        if (error1) {
          console.error(`Failed in step 1 (${fromCoin} → ${intermediateCoin}):`, error1);
          return [error1, null];
        }
        
        console.log(`✅ Step 1 completed. Trade ID: ${trade1.tradeId}`);
        
        // Wait for trade completion to get accurate data
        console.log(`Waiting for first trade (ID: ${trade1.tradeId}) to complete...`);
        const [statusError, statusData] = await this.waitForTradeCompletion(trade1.tradeId);
        
        if (statusError) {
          console.error('Failed to get status of first trade:', statusError);
          return [statusError, null];
        }
        
        // Record step 1 trade with the completed trade data
        if (parentTradeId && db && enhancedSwapService) {
          try {
            // Validate parentTradeId before using it
            if (typeof parentTradeId !== 'number' && isNaN(parseInt(parentTradeId))) {
              console.error(`Invalid parent trade ID: ${parentTradeId}, cannot record step 1 trade`);
            } else {
              console.log(`Recording step 1 trade with parent ID: ${parentTradeId} (type: ${typeof parentTradeId})`);
            
            // Extract trade amounts and prices from status data if available
            let resultAmount = 0;
            let fromAmount = amount;
            let fromPrice = 0;
            let toPrice = 0;
            let commissionAmount = 0;
            let commissionRate = 0;
            
            // Try to extract more accurate data from the completed trade status
            if (statusData && statusData.raw) {
              const raw = statusData.raw;
              
              // Extract resulting amount (what we received)
              if (raw.data && raw.data.entered_total) {
                resultAmount = parseFloat(raw.data.entered_total);
              } else if (raw.position && raw.position.total && raw.position.total.value) {
                resultAmount = parseFloat(raw.position.total.value);
              }
              
              // Extract prices if available
              if (raw.position) {
                if (raw.position.done_average_price) {
                  toPrice = parseFloat(raw.position.done_average_price);
                }
                if (raw.position.base_price) {
                  fromPrice = parseFloat(raw.position.base_price);
                }
              }
              
              // Extract commission if available
              if (raw.data && raw.data.commission) {
                commissionAmount = parseFloat(raw.data.commission);
                // Calculate rate if we have the original amount
                if (fromAmount > 0) {
                  commissionRate = commissionAmount / (fromAmount * fromPrice);
                }
              }
            }
            
            // Ensure parentTradeId is a number
            const parsedParentId = parseInt(parentTradeId);
            console.log(`Using parent trade ID: ${parsedParentId} for step 1 trade recording`);
            
            step1Record = await enhancedSwapService.insertTradeStep(db, parsedParentId, 1, {
              tradeId: trade1.tradeId,
              fromCoin,
              toCoin: intermediateCoin,
              fromAmount: fromAmount,
              toAmount: resultAmount,
              fromPrice: fromPrice,
              toPrice: toPrice,
              commissionAmount: commissionAmount,
              commissionRate: commissionRate,
              status: 'completed',
              executedAt: new Date(),
              completedAt: new Date(),
              botId: null, // This would be added in enhancedSwap service
              exchangeId: accountId,
              rawData: statusData.raw
            });
            console.log(`Step 1 trade recorded with ID: ${step1Record?.id || 'unknown'}, amount: ${resultAmount} ${intermediateCoin}`);
            }
          } catch (recordError) {
            console.error(`Error recording step 1 trade: ${recordError.message}`);
            console.error(`Error stack: ${recordError.stack}`);
            // Continue with trade even if recording fails
          }
        }
        
        // Get the resulting amount of USDT from the first trade
        // Extract from the statusData we obtained earlier
        let secondStepAmount;
        try {
          // First try to use entered_amount from data (most reliable field)
          // This is the actual amount that was acquired in the trade
          if (statusData.raw?.data?.entered_total) {
            secondStepAmount = parseFloat(statusData.raw.data.entered_total);
            console.log(`Using entered_total field: ${secondStepAmount} ${intermediateCoin}`);
          }
          // Fall back to other methods if the primary ones aren't available
          else if (statusData.raw?.position?.total?.value) {
            secondStepAmount = parseFloat(statusData.raw.position.total.value);
            console.log(`Using position.total.value: ${secondStepAmount} ${intermediateCoin}`);
          } 
          else if (statusData.raw?.completed_safety_orders_data?.length > 0) {
            secondStepAmount = parseFloat(statusData.raw.completed_safety_orders_data[0].done_average_price) * 
                          parseFloat(statusData.raw.completed_safety_orders_data[0].done_quantity);
            console.log(`Using completed_safety_orders calculation: ${secondStepAmount} ${intermediateCoin}`);
          } 
          else if (statusData.raw?.completed_manual_safety_orders?.length > 0) {
            secondStepAmount = parseFloat(statusData.raw.completed_manual_safety_orders[0].done_average_price) * 
                          parseFloat(statusData.raw.completed_manual_safety_orders[0].done_quantity);
            console.log(`Using completed_manual_safety_orders calculation: ${secondStepAmount} ${intermediateCoin}`);
          } 
          else if (statusData.raw?.position?.done_quantity && statusData.raw?.position?.done_average_price) {
            secondStepAmount = parseFloat(statusData.raw.position.done_quantity) * 
                          parseFloat(statusData.raw.position.done_average_price);
            console.log(`Using position calculation: ${secondStepAmount} ${intermediateCoin}`);
          } 
          else {
            // If we can't determine the exact amount, estimate it (less accurate)
            // Use the amount we sent minus an estimated fee
            secondStepAmount = amount * 0.998; // Assuming 0.2% fee
            console.warn(`Could not determine exact resulting amount. Estimating ${secondStepAmount} ${intermediateCoin}`);            
          }
        } catch (error) {
          console.error('Error calculating resulting amount:', error);
          secondStepAmount = amount * 0.998; // Fallback to estimation
          console.warn(`Failed to parse trade result. Estimating ${secondStepAmount} ${intermediateCoin}`);
        }
        
        console.log(`First trade resulted in approximately ${secondStepAmount} ${intermediateCoin}`);
        
        // Step 2: Buy toCoin with the USDT from step 1
        // Ensure we have a valid number for the amount and apply minimum trade amount requirements
        secondStepAmount = parseFloat(secondStepAmount);
        if (isNaN(secondStepAmount) || secondStepAmount <= 0) {
          console.error(`Invalid amount from first trade, using fallback estimation`);
          secondStepAmount = amount * 0.998; // Fallback estimation
        }
        
        // Apply minimum amount rules for USDT (or other intermediate coin)
        // const intermediateMinAmount = this.minimumAmounts[intermediateCoin] || 10;
        // if (secondStepAmount < intermediateMinAmount) {
        //   console.warn(`Warning: Second step amount ${secondStepAmount} ${intermediateCoin} is below minimum ${intermediateMinAmount}. Adjusting to minimum.`);
        //   secondStepAmount = intermediateMinAmount;
        // }
        
        console.log(`Step 2: Preparing to buy ${toCoin} with ${secondStepAmount} ${intermediateCoin}`);
        
        // First, we need to convert the USDT amount to the equivalent amount in the target coin
        // Get available coins to check current prices
        console.log(`Fetching available coins to get current prices for conversion...`);
        const [coinsError, availableCoins] = await this.getAvailableCoins(accountId);
        
        if (coinsError) {
          console.error(`Failed to get available coins for conversion: ${coinsError.message}`);
          return [coinsError, null];
        }
        
        // Find the target coin data to get its price in USDT
        const toCoinData = availableCoins.find(c => c.coin === toCoin);
        if (!toCoinData) {
          console.error(`Could not find price data for ${toCoin} in available coins`);
          return [{ message: `Could not find price data for ${toCoin}` }, null];
        }
        
        // Calculate the price per unit of the target coin
        // Available coins provides amount and amountInUsd, so we calculate price = amountInUsd / amount
        if (!toCoinData.amount || !toCoinData.amountInUsd || toCoinData.amount <= 0) {
          console.error(`Missing required data for ${toCoin}: amount=${toCoinData.amount}, amountInUsd=${toCoinData.amountInUsd}`);
          console.log('Full coin data:', JSON.stringify(toCoinData));
          return [{ message: `Missing price data for ${toCoin}` }, null];
        }
        
        // Calculate price per unit
        const toCoinPriceInUSDT = toCoinData.amountInUsd / toCoinData.amount;
        
        console.log(`${toCoin} price calculation: ${toCoinData.amountInUsd} USD / ${toCoinData.amount} ${toCoin} = ${toCoinPriceInUSDT} USD per ${toCoin}`);
        
        if (!toCoinPriceInUSDT || toCoinPriceInUSDT <= 0) {
          console.error(`Invalid calculated price for ${toCoin}: ${toCoinPriceInUSDT}`);
          return [{ message: `Invalid calculated price for ${toCoin}` }, null];
        }
        
        // Convert USDT amount to target coin units
        // Formula: units = USDT amount / price per unit
        const targetCoinUnits = secondStepAmount / toCoinPriceInUSDT;
        
        // Apply a small safety margin (0.5%) to account for price fluctuations
        const safetyMargin = 0.995;
        const adjustedTargetCoinUnits = targetCoinUnits * safetyMargin;
        
        console.log(`Converting ${secondStepAmount} ${intermediateCoin} to approximately ${adjustedTargetCoinUnits} ${toCoin} units`);
        console.log(`Calculation: ${secondStepAmount} ${intermediateCoin} ÷ ${toCoinPriceInUSDT} ${intermediateCoin}/${toCoin} × ${safetyMargin} (safety margin)`);
        console.log(`Using position type 'buy' for second step (${intermediateCoin} → ${toCoin})`);
        
        let trade2;
        try {
          // Execute second step with the converted amount of target coin units
          // Since we're doing a BUY, we should specify how many target coin units to purchase
          const [error2, tradeResult] = await this.executeTrade(
            accountId, intermediateCoin, toCoin, adjustedTargetCoinUnits, 
            useTakeProfit, takeProfitPercentage, mode, true, 'buy',null,null,null,preferredStablecoin
          );
          
          if (error2) {
            console.error(`Failed in step 2 (${intermediateCoin} → ${toCoin}):`, error2);
            
            // Check if it's a 422 error (validation error)
            if (error2.code === 422 || (error2.message && error2.message.includes('422'))) {
              console.error('This appears to be a validation error. Common causes include:');
              console.error('- Insufficient funds in the account');
              console.error('- Trading amount below exchange minimum');
              console.error('- Invalid pair format');
              
              // Get more details about the account balance
              try {
                const [balanceErr, balanceData] = await this.request('accounts', `${accountId}/balance_chart_data`, { date_from: new Date().toISOString() });
                if (!balanceErr && balanceData) {
                  const usdtBalance = balanceData.currencies.find(c => c.code === intermediateCoin);
                  console.log(`Current ${intermediateCoin} balance:`, usdtBalance);
                }
              } catch (innerErr) {
                console.error('Could not fetch balance data:', innerErr.message);
              }
            }
            
            return [error2, null];
          }
          
          // Store trade2 from the successful result
          trade2 = tradeResult;
          console.log(`✅ Step 2 completed. Trade ID: ${trade2.tradeId}`);
          
          // Wait for trade completion to get accurate data
          console.log(`Waiting for second trade (ID: ${trade2.tradeId}) to complete...`);
          const [step2StatusError, step2StatusData] = await this.waitForTradeCompletion(trade2.tradeId);
          
          // Record step 2 trade in database if parent trade ID is provided
          let step2Record = null;
          if (parentTradeId && db && enhancedSwapService) {
            try {
              // Validate parentTradeId before using it
              if (typeof parentTradeId !== 'number' && isNaN(parseInt(parentTradeId))) {
                console.error(`Invalid parent trade ID: ${parentTradeId}, cannot record step 2 trade`);
              } else {
                console.log(`Recording step 2 trade with parent ID: ${parentTradeId} (type: ${typeof parentTradeId})`);
              
              // Extract trade amounts and prices from status data if available
              let resultAmount = 0;
              let fromAmount = secondStepAmount;
              let fromPrice = 0;
              let toPrice = 0;
              let commissionAmount = 0;
              let commissionRate = 0;
              
              // Try to extract more accurate data from the completed trade status
              if (!step2StatusError && step2StatusData && step2StatusData.raw) {
                const raw = step2StatusData.raw;
                
                // Extract resulting amount (what we received)
                if (raw.data && raw.data.entered_amount) {
                  resultAmount = parseFloat(raw.data.entered_amount);
                } else if (raw.position && raw.position.quantity) {
                  resultAmount = parseFloat(raw.position.quantity);
                } else if (raw.position && raw.position.done_quantity) {
                  resultAmount = parseFloat(raw.position.done_quantity);
                }
                
                // Extract prices if available
                if (raw.position) {
                  if (raw.position.done_average_price) {
                    toPrice = parseFloat(raw.position.done_average_price);
                  }
                  if (raw.position.base_price) {
                    fromPrice = parseFloat(raw.position.base_price);
                  }
                }
                
                // Extract commission if available
                if (raw.data && raw.data.commission) {
                  commissionAmount = parseFloat(raw.data.commission);
                  // Calculate rate if we have the original amount
                  if (fromAmount > 0) {
                    commissionRate = commissionAmount / (fromAmount * fromPrice);
                  }
                }
              } else {
                // Fall back to initial trade data if status check failed
                resultAmount = trade2.amount || 0;
              }
              
              // Ensure parentTradeId is a number
              const parsedParentId = parseInt(parentTradeId);
              console.log(`Using parent trade ID: ${parsedParentId} for step 2 trade recording`);
              
              step2Record = await enhancedSwapService.insertTradeStep(db, parsedParentId, 2, {
                tradeId: trade2.tradeId,
                fromCoin: intermediateCoin,
                toCoin,
                fromAmount: fromAmount,
                toAmount: resultAmount,
                fromPrice: fromPrice,
                toPrice: toPrice,
                commissionAmount: commissionAmount,
                commissionRate: commissionRate,
                status: 'completed',
                executedAt: new Date(),
                completedAt: new Date(),
                botId: null, // This would be added in enhancedSwap service
                exchangeId: accountId,
                rawData: step2StatusError ? trade2.raw : step2StatusData.raw
              });
              console.log(`Step 2 trade recorded with ID: ${step2Record?.id || 'unknown'}, amount: ${resultAmount} ${toCoin}`);
              }
            } catch (recordError) {
              console.error(`Error recording step 2 trade: ${recordError.message}`);
              console.error(`Error stack: ${recordError.stack}`);
              // Continue with trade even if recording fails
            }
          }
          
          if (error2) {
            console.error(`Failed in step 2 (${intermediateCoin} → ${toCoin}):`, error2);
            
            // Check if it's a 422 error (validation error)
            if (error2.code === 422 || (error2.message && error2.message.includes('422'))) {
              console.error('This appears to be a validation error. Common causes include:');
              console.error('- Insufficient funds in the account');
              console.error('- Trading amount below exchange minimum');
              console.error('- Invalid pair format');
              
              // Get more details about the account balance
              try {
                const [balanceErr, balanceData] = await this.request('accounts', `${accountId}/balance_chart_data`, { date_from: new Date().toISOString() });
                if (!balanceErr && balanceData) {
                  const usdtBalance = balanceData.currencies.find(c => c.code === intermediateCoin);
                  console.log(`Current ${intermediateCoin} balance:`, usdtBalance);
                }
              } catch (innerErr) {
                console.error('Could not fetch balance data:', innerErr.message);
              }
            }
            
            return [error2, null];
          }
          
          // Store trade2 from the successful result
          trade2 = tradeResult;
          console.log(`✅ Step 2 completed. Trade ID: ${trade2.tradeId}`);
          
          // Return the final trade details (from step 2)
          return [null, {
            success: true,
            tradeId: trade2.tradeId,
            status: trade2.status,
            pair: trade2.pair,
            createdAt: trade2.createdAt,
            isIndirectTrade: true,
            step1TradeId: trade1.tradeId,
            raw: trade2.raw
          }];
        } catch (error) {
          console.error(`Exception in step 2 execution: ${error.message}`);
          return [{
            code: 500,
            message: `Exception in step 2 execution: ${error.message}`
          }, null];
        }
      }
      
      const path = '/public/api/v2/smart_trades';

      // Position type and pair format have already been determined
      
      // Handle minimum trade requirements based on coin
      // Different coins have different minimum sizes on exchanges
      let tradeAmount = parseFloat(amount);
      
      // Get the minimum for this coin, default to 10 if not specified
      // 10 is our "known working value" from previous successful tests
      // const coinMinimum = this.minimumAmounts[fromCoin] || 10;
      
      // Check if requested amount is below the minimum
      // if (tradeAmount < coinMinimum) {
      //   console.warn(`Warning: Trade amount ${tradeAmount} ${fromCoin} is below minimum ${coinMinimum}. Adjusting to minimum.`);
      //   tradeAmount = coinMinimum;
      // }
      
      console.log(`Using trade amount: ${tradeAmount} ${fromCoin} (${positionType})`);
      
      const payload = {
        account_id: accountId,
        pair,
        position: {
          type: positionType,
          units: { value: tradeAmount },
          total: tradeAmount, // Total should match units for market orders
          order_type: 'market'
        },
        take_profit: {
          enabled: false
        },
        stop_loss: {
          enabled: false
        },
        instant: true,
        // Always include the demo flag with explicit boolean value
        demo: isPaperTrading === true
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
      
      // Generate signature AFTER all payload modifications are complete
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(path + bodyString)
        .digest('hex');
      
      // Use the v1 API with create_smart_trade action - this is what works in Python
      console.log('Sending request with:', {
        path,
        pair,
        account_id: payload.account_id,
        amount: payload.position.units.value,
        demo: payload.demo,
        signature_base: path + bodyString.substring(0, 20) + '...' // Log part of signature base for debugging
      })
      const response = await axios.post(this.baseUrl + path, payload, {
        headers: {
          'APIKEY': this.apiKey,
          'Signature': signature,
          'Content-Type': 'application/json',
          'Accept-Encoding': 'identity' // Add this header to match the Python client
        }
      })
      console.log({response})
      if (response.data.error) {
        console.error('Error executing trade:', response.data.error);
        return [response.data.error, null];
      }
      
      return [null, {
        success: true,
        tradeId: response.data.id,
        status: response.data.status,
        pair: response.data.pair,
        createdAt: response.data.created_at,
        isIndirectTrade: isIndirectTrade,
        raw: response.data
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
   * Wait for a trade to complete and return its final status
   * @param {String|Number} tradeId - The 3Commas smart trade ID to monitor
   * @returns {Promise<Array>} - [error, statusData]
   */
  async waitForTradeCompletion(tradeId) {
    const maxAttempts = 15; // Increased from 10
    const waitTime = 3000; // Check every 3 seconds
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`Checking trade status (attempt ${attempt + 1}/${maxAttempts})...`);
      const [statusError, statusData] = await this.getTradeStatus(tradeId);
      
      if (statusError) {
        console.error('Error checking trade status:', statusError);
        
        // If we're consistently getting errors, wait a bit longer before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      // Log the full status object for debugging
      console.log('Trade status details:', JSON.stringify({
        status: statusData.status,
        id: statusData.tradeId,
        profit: statusData.profit,
        rawStatus: statusData.raw?.status
      }));
      
      // Check for various status values that indicate completion
      // Different API versions may return different status values
      const completedStatuses = ['completed', 'closed', 'cancelled', 'failed', 'done', 'finished'];
      
      // Check both the parsed status and raw status
      const statusCompleted = (
        completedStatuses.includes(statusData.status) || 
        (statusData.raw && completedStatuses.includes(statusData.raw.status))
      );
      
      // Also check if position is filled which indicates trade execution
      const positionFilled = statusData.raw && 
                            statusData.raw.position && 
                            statusData.raw.position.status === 'filled';
      
      if (statusCompleted || positionFilled) {
        console.log(`Trade ${tradeId} completed with status: ${statusData.status}`);
        return [null, statusData];
      }
      
      // If the trade is in process, wait a shorter time
      const processingStatuses = ['in_progress', 'pending', 'processing'];
      const isProcessing = (
        processingStatuses.includes(statusData.status) ||
        (statusData.raw && processingStatuses.includes(statusData.raw.status))
      );
      
      const waitInterval = isProcessing ? Math.min(waitTime, 2000) : waitTime;
      
      console.log(`Trade status: ${statusData.status}. Waiting ${waitInterval/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitInterval));
    }
    
    // Perform one final check before giving up
    const [finalError, finalStatus] = await this.getTradeStatus(tradeId);
    if (!finalError && finalStatus) {
      // Accept any status at this point - we've waited long enough
      return [null, finalStatus];
    }
    
    return [{ message: 'Trade did not complete in the expected timeframe' }, null];
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
      console.error('Error parsing trade status response:', error);
      return [{ message: error.message }, null];
    }
  }
  
  /**
   * Check if a trading pair exists on 3Commas for a specific account
   * @param {String|Number} accountId - The 3Commas account ID
   * @param {String} pair - Trading pair in format BASE_QUOTE (e.g. USDT_ADA)
   * @returns {Promise<Boolean>} - True if the pair exists, false otherwise
   */
  async checkPairExists(accountId, pair) {
    try {
      console.log(`Checking if pair ${pair} exists for account ${accountId}...`);
      
      // Check the cache first if we have it
      if (this._marketPairsCache && this._marketPairsCache[accountId]) {
        const exists = this._marketPairsCache[accountId].includes(pair);
        console.log(`Pair ${pair} ${exists ? 'found' : 'not found'} in cache.`);
        return exists;
      }
      
      // If not in cache, fetch from API
      const [error, response] = await this.request('accounts', `${accountId}/market_pairs`);
      
      if (error) {
        console.error('Error fetching market pairs:', error);
        // If we can't check, assume it exists to allow the trade to try
        // The actual trade will fail with a proper error if the pair doesn't exist
        return true;
      }
      
      // Initialize cache if needed
      if (!this._marketPairsCache) {
        this._marketPairsCache = {};
      }
      
      // Cache the pairs for this account
      this._marketPairsCache[accountId] = response;
      
      const exists = response.includes(pair);
      console.log(`Pair ${pair} ${exists ? 'exists' : 'does not exist'} on 3Commas for account ${accountId}.`);
      return exists;
    } catch (error) {
      console.error(`Error in checkPairExists: ${error.message}`);
      // If we encounter an error during the check, assume the pair exists
      // to allow the trade to try - the actual trade will fail with a proper error if needed
      return true;
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
