const path = require('path');
const fs = require('fs');

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
