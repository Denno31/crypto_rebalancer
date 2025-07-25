const axios = require('axios');
const crypto = require('crypto');

class ThreeCommasClient {
  constructor(apiKey, apiSecret, options = {}) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = options.baseUrl || 'https://api.3commas.io';
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
  }
  
  /**
   * Generate Python-style signature to match the py3cw library
   * @param {String} path - API path
   * @param {String} data - JSON stringified data or empty string
   * @returns {String} - HMAC signature
   */
  __generateSignaturePython(path, data = '') {
    // This matches exactly how py3cw generates signatures
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
   * Make a request to the 3commas API
   * @param {String} entity - API entity (accounts, deals, bots, etc.)
   * @param {String} action - API action
   * @param {Object} params - Request parameters
   * @param {String} method - HTTP method (default: get)
   * @returns {Promise<Array>} - [error, data]
   */
  async request(entity, action = '', params = {}, method = 'get') {
    // Log partial API key for debugging
    if (this.apiKey && this.apiKey.length > 8) {
      const visiblePrefix = this.apiKey.substring(0, 4);
      const visibleSuffix = this.apiKey.substring(this.apiKey.length - 4);
      const maskedPortion = '*'.repeat(Math.max(0, this.apiKey.length - 8));
      console.log(`Using API key: ${visiblePrefix}${maskedPortion}${visibleSuffix}`);
    }

    // Standardize method to uppercase
    method = method.toUpperCase();

    // Set up API path based on entity
    let apiVersion = '/public/api/ver1/';
    if (entity === 'smart_trades_v2') {
      apiVersion = '/public/api/v2/';
      entity = 'smart_trades';
    }

    // Build API path
    let apiPath = apiVersion + entity;
    if (action) {
      // If action is a number, it's an ID
      if (!isNaN(action)) {
        apiPath += '/' + action;
      } else {
        apiPath += '/' + action;
      }
    }

    const url = this.baseUrl + apiPath;
    
    let retries = 0;
    let lastError = null;
    
    while (retries <= this.maxRetries) {
      try {
        console.log(`Making ${method} request to ${url} with params:`, params);
        
        let headers = {
          'APIKEY': this.apiKey,
          'Accept': 'application/json, text/plain, */*'
        };
        
        let requestConfig = {
          method,
          url,
          timeout: this.timeout,
          headers
        };
        
        // Add parameters based on method
        if (method === 'GET') {
          requestConfig.params = params;
          // Python-style signature with empty data for GET
          const signature = this.__generateSignaturePython(apiPath, '');
          headers['Signature'] = signature;
        } else {
          requestConfig.data = params;
          headers['Content-Type'] = 'application/json';
          // Python-style signature with JSON data for POST/PUT/etc
          const data = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
          const signature = this.__generateSignaturePython(apiPath, data);
          headers['Signature'] = signature;
        }
        
        const response = await axios(requestConfig);
        
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
   * Get trade status by ID from 3Commas
   * @param {String|Number} tradeId - The 3Commas smart trade ID
   * @returns {Promise<Array>} - [error, response]
   */
  async getTradeStatus(tradeId) {
    try {
      // Use smart_trades_v2 API to get the trade details
      const [error, response] = await this.request('smart_trades_v2', tradeId);
      
      console.log({error, response});
      
      if (error) {
        return [error, null];
      }
      
      return [null, {
        tradeId: response.id,
        status: response.status,
        pair: response.pair,
        profit: response.profit,
        createdAt: response.created_at || response.data?.created_at,
        updatedAt: response.updated_at || response.data?.updated_at,
        raw: response
      }];
    } catch (error) {
      console.error('Error parsing trade status response:', error);
      return [{ message: error.message }, null];
    }
  }
}

// Initialize with your API keys
const client = new ThreeCommasClient(
  '03b3ea94fedc4c66bb0617cab34fcd5cc43a80f46b6d4163acc17ed0d6e4f199', 
  '81abd79dcfc04f77ba40946013269afbf1ef85e4007e5f146e2a3dccb3afe08191e64ae39120fe4c4b8ad6361d6c399d11817cb3f90e642043c455754c5fe8e0bb0e2269aed0ab20ce4b8d466033b6c3d036e14185e9eaf67c7ba8159f70cbbf843efe05'
);

// Function to get trade by ID
async function getTradeById(tradeId) {
  console.log(`Fetching trade with ID: ${tradeId}`);
  const [error, trade] = await client.getTradeStatus(tradeId);
  
  if (error) {
    console.error('Error getting trade:', error);
    return;
  }
  
  console.log('Trade details:');
  console.log(JSON.stringify(trade, null, 2));
  return trade;
}

// Get trade ID from command line arguments or use a default value
const tradeId = process.argv[2] || '35152568'; // Replace with your trade ID if not provided

const getMarketPairs = async ()=>{
  const [error, marketPairs] = await client.request('accounts', 'market_pairs', { market_code: 'binance_us' });

  if (error) {
    console.error('Error getting market pairs:', error);
    return;
  }

  console.log('Market pairs details:');
  console.log(JSON.stringify(marketPairs, null, 2));
  return marketPairs;
}

getMarketPairs();

// Execute the function
getTradeById(tradeId)
  .catch(error => console.error('Unhandled error:', error));
