/**
 * Coin routes
 * Endpoints for fetching available coins from 3Commas
 */

const express = require('express');
const router = express.Router();
const ApiConfig = require('../models').apiConfig;
const ThreeCommasService = require('../services/threeCommas.service');

/**
 * @route GET /api/coins/accounts/:accountId
 * @desc Get available coins for a specific 3Commas account
 * @access Private
 */
router.get('/accounts/:accountId', async (req, res) => {
  const { accountId } = req.params;
  console.log({accountId})
  
  // Get 3Commas API config
  const apiConfig = await ApiConfig.findOne({ 
    where: { name: '3commas' } 
  });
  
  if (!apiConfig) {
    return res.status(404).json({ 
      success: false, 
      message: '3Commas API configuration not found' 
    });
  }
  
  try {
    // Initialize 3Commas client
    const threeCommasClient = new ThreeCommasService(
      apiConfig.dataValues.apiKey, 
      apiConfig.dataValues.apiSecret,
      apiConfig.dataValues.mode || 'paper'
    );
 console.log(apiConfig.dataValues)
    console.log(threeCommasClient)
    // Fetch available coins with balances
    const [error, availableCoins] = await threeCommasClient.getAvailableCoins(accountId);
   
    
    if (error) {
      throw new Error(error.message || 'Error fetching coins from 3Commas');
    }
    
    // Use the coins returned by getAvailableCoins
    const coinsWithBalances = availableCoins || [];
    
    // Sort by USD value (highest first)
    coinsWithBalances.sort((a, b) => b.amountInUsd - a.amountInUsd);
    
    return res.json({
      success: true,
      data: coinsWithBalances
    });
  } catch (error) {
    console.error('Error fetching account coins:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching coins from 3Commas' 
    });
  }
});

/**
 * @route GET /api/coins/accounts
 * @desc Get list of accounts from 3Commas
 * @access Private
 */
router.get('/accounts', async (req, res) => {
  // Get 3Commas API config
  const apiConfig = await ApiConfig.findOne({ 
    where: { name: '3commas' } 
  });
  
  if (!apiConfig) {
    return res.status(404).json({ 
      success: false, 
      message: '3Commas API configuration not found' 
    });
  }
  
  try {
    // Initialize 3Commas client
    const threeCommasClient = new ThreeCommasService(
      apiConfig.key, 
      apiConfig.secret,
      apiConfig.mode || 'paper'
    );
    console.log(threeCommasClient)
    // Fetch accounts
    const accounts = await threeCommasClient.getAccounts();
    
    return res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Error fetching 3Commas accounts:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching accounts from 3Commas' 
    });
  }
});

module.exports = router;
