const db = require('../models')
const path = require('path');
const fs = require('fs');
const ApiConfig = db.apiConfig
const ThreeCommasService = require('../services/threeCommas.service');

/**
 * Controller for coin-related operations
 */

/**
 * Get list of available coins from pre-generated JSON file
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.getAvailableCoins = async (req, res) => {
  try {
    // Path to the JSON file containing available coins
    const coinsFilePath = path.join(__dirname, '..', '..', 'data', 'availableCoins.json');
    
    // Check if file exists
    if (!fs.existsSync(coinsFilePath)) {
      return res.status(404).json({
        success: false,
        message: "Available coins data not found. Please run the coin extraction utility."
      });
    }
    
    // Read and parse the JSON file
    const coinsData = JSON.parse(fs.readFileSync(coinsFilePath, 'utf8'));
    
    return res.status(200).json({
      success: true,
      data: coinsData
    });
  } catch (error) {
    console.error('Error fetching available coins:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve available coins",
      error: error.message
    });
  }
};

exports.getAvailableCoinsAccountCoins = async (req, res) => {
  try {
    const { accountId } = req.params;
    
    if (!accountId) {
      return res.status(400).json({
        message: "Account ID is required"
      });
    }
    
    console.log(`Getting available coins for account ${accountId}`);
    
    // Find 3commas API config for this user
    const config = await ApiConfig.findOne({
      where: {
        name: '3commas',
        userId: req.userId
      }
    });
    
    if (!config) {
      return res.status(404).json({
        message: "3Commas API configuration not found for this user"
      });
    }
    
    // Initialize 3commas client
    const threeCommasClient = new ThreeCommasService(
      config.apiKey,
      config.apiSecret,
      {
        requestTimeout: 10000,
        maxRetries: 1
      }
    );
    
    // Get available coins from 3commas
    const [error, availableCoins] = await threeCommasClient.getAvailableCoins(accountId);
    
    if (error) {
      console.log(`3commas API error: ${JSON.stringify(error)}`);
      return res.status(500).json({
        message: "Error from 3Commas API",
        error
      });
    }
    
    return res.json(availableCoins);
  } catch (error) {
    console.error(`Error getting available coins: ${error.message}`);
    return res.status(500).json({
      message: "Error getting available coins",
      error: error.message
    });
  }
};