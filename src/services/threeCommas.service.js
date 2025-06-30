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
}

module.exports = ThreeCommasService;
