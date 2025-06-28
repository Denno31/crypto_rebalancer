const axios = require('axios');
const db = require('../models');
const ThreeCommasService = require('./threeCommas.service');
const LogEntry = db.logEntry;

class PriceService {
  constructor() {
    this.coingeckoApiUrl = 'https://api.coingecko.com/api/v3';
  }

  /**
   * Get price from 3commas
   * @param {Object} threeCommasClient - ThreeCommas client instance
   * @param {String} coin - Coin symbol (e.g. BTC)
   * @param {String} baseCoin - Base coin for price (e.g. USDT)
   * @returns {Promise<Number>} - Price
   */
  async getPriceFrom3Commas(threeCommasClient, coin, baseCoin = 'USDT') {
    try {
      const pair = `${coin}_${baseCoin}`;
      // Use the new getMarketPrice method instead of the invalid endpoint
      const [error, data] = await threeCommasClient.getMarketPrice(pair);
      
      if (error) {
        throw new Error(`3Commas API error: ${JSON.stringify(error)}`);
      }
      
      if (!data || !data.last) {
        throw new Error(`No price data for ${pair}`);
      }
      
      return parseFloat(data.last);
    } catch (error) {
      console.error(`Error getting price from 3Commas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get price from CoinGecko
   * @param {String} coin - Coin symbol (e.g. bitcoin)
   * @param {String} vs_currency - Currency to compare against (e.g. usd)
   * @returns {Promise<Number>} - Price
   */
  /**
   * Map common crypto symbols to CoinGecko IDs
   * @param {String} symbol - Coin symbol (e.g. BTC)
   * @returns {String} - CoinGecko coin ID
   */
  getCoinGeckoId(symbol) {
    const symbolToId = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDT': 'tether',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'SOL': 'solana',
      'DOGE': 'dogecoin',
      'DOT': 'polkadot',
      'AVAX': 'avalanche-2',
      'SHIB': 'shiba-inu',
      'MATIC': 'matic-network',
      'TRX': 'tron',
      'LTC': 'litecoin',
      'UNI': 'uniswap',
      'LINK': 'chainlink',
      'XLM': 'stellar',
      'NEAR': 'near',
      'ATOM': 'cosmos',
      'BCH': 'bitcoin-cash'
    };
    
    return symbolToId[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  async getPriceFromCoinGecko(coin, vs_currency = 'usd') {
    try {
      const coinId = this.getCoinGeckoId(coin);
      
      const response = await axios.get(`${this.coingeckoApiUrl}/simple/price`, {
        params: {
          ids: coinId,
          vs_currencies: vs_currency
        }
      });
      
      if (!response.data || !response.data[coinId]) {
        throw new Error(`No price data for ${coin} (ID: ${coinId})`);
      }
      
      return response.data[coinId][vs_currency];
    } catch (error) {
      console.error(`Error getting price from CoinGecko: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get price using specified source or fallback
   * @param {Object} config - System configuration
   * @param {Object} apiConfig - API configuration
   * @param {String} coin - Coin symbol
   * @param {String} baseCoin - Base coin for price
   * @param {Number} botId - Bot ID for logging
   * @returns {Promise<Object>} - Price and source info
   */
  async getPrice(config, apiConfig, coin, baseCoin = 'USDT', botId = null) {
    let price = null;
    let source = null;
    
    // Try primary source first
    try {
      if (config.pricingSource === '3commas') {
        if (!apiConfig || !apiConfig.apiKey || !apiConfig.apiSecret) {
          throw new Error('3Commas API config not available');
        }
        
        const threeCommasClient = new ThreeCommasService(
          apiConfig.apiKey,
          apiConfig.apiSecret
        );
        
        price = await this.getPriceFrom3Commas(threeCommasClient, coin, baseCoin);
        source = '3commas';
      } else if (config.pricingSource === 'coingecko') {
        price = await this.getPriceFromCoinGecko(coin);
        source = 'coingecko';
      } else {
        throw new Error(`Unknown price source: ${config.pricingSource}`);
      }
    } catch (error) {
      // Log the error
      if (botId) {
        await LogEntry.log(db, 'WARNING', `Primary price source failed: ${error.message}`, botId);
      } else {
        console.warn(`Primary price source failed: ${error.message}`);
      }
      
      // Try fallback source
      try {
        if (config.fallbackSource === 'coingecko') {
          price = await this.getPriceFromCoinGecko(coin);
          source = 'coingecko_fallback';
        } else if (config.fallbackSource === '3commas') {
          if (!apiConfig || !apiConfig.apiKey || !apiConfig.apiSecret) {
            throw new Error('3Commas API config not available for fallback');
          }
          
          const threeCommasClient = new ThreeCommasService(
            apiConfig.apiKey,
            apiConfig.apiSecret
          );
          
          price = await this.getPriceFrom3Commas(threeCommasClient, coin, baseCoin);
          source = '3commas_fallback';
        } else {
          throw new Error(`Unknown fallback price source: ${config.fallbackSource}`);
        }
        
        if (botId) {
          await LogEntry.log(db, 'INFO', `Used fallback price source ${source} for ${coin}`, botId);
        }
      } catch (fallbackError) {
        if (botId) {
          await LogEntry.log(db, 'ERROR', `Fallback price source failed: ${fallbackError.message}`, botId);
        }
        throw fallbackError; // Rethrow the error after logging
      }
    }
    
    return {
      price,
      source
    };
  }
}

module.exports = new PriceService();
