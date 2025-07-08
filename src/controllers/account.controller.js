const db = require('../models');
const ApiConfig = db.apiConfig;
const BotAsset = db.botAsset;
const ThreeCommasService = require('../services/threeCommas.service');

// Get user's trading accounts
exports.getAccounts = async (req, res) => {
  try {
    console.log("=== Getting trading accounts ===");
    console.log(`User ID: ${req.userId}`);
    
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
    console.log(`Found config: api_key=${config.apiKey.substring(0, 8)}..., mode=${config.mode}`);
    const p3cw = new ThreeCommasService(
      config.apiKey,
      config.apiSecret,
      {
        requestTimeout: 10000,
        maxRetries: 1
      }
    );
    
    // Request account data from 3commas
    console.log("Making request to 3commas API...");
    const [error, accounts] = await p3cw.getAccounts();
    
    console.log(`Error: ${JSON.stringify(error)}`);
    console.log(`Accounts response type: ${typeof accounts}`);
    console.log(`Accounts: ${JSON.stringify(accounts)}`);
    
    if (error) {
      console.log(`3commas API error: ${JSON.stringify(error)}`);
      return res.status(500).json({
        message: "Error from 3Commas API",
        error
      });
    }
    
    // Format accounts for response
    const formattedAccounts = accounts.map(acc => ({
      id: acc.id.toString(),
      name: `${acc.name} (${acc.exchange_name})`,
      type: '3commas',
      balance: parseFloat(acc.balance_amount_in_usd || 0)
    }));
    
    return res.json(formattedAccounts);
  } catch (error) {
    console.error(`Error getting trading accounts: ${error.message}`);
    return res.status(500).json({
      message: "Error getting trading accounts",
      error: error.message
    });
  }
};

// Get available coins from a 3Commas account
exports.getAvailableCoins = async (req, res) => {
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
