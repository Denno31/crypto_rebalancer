const db = require('../models');
const ApiConfig = db.apiConfig;
const SystemConfig = db.systemConfig;

// API Config Controller
exports.getApiConfigs = async (req, res) => {
  try {
    const configs = await ApiConfig.findAll({
      where: { userId: req.userId }
    });
    
    // Format response to match the Python API
    const formattedConfigs = {};
    configs.forEach(config => {
      formattedConfigs[config.name] = {
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        mode: config.mode
      };
    });
    
    return res.json(formattedConfigs);
  } catch (error) {
    console.error('Error getting API configs:', error);
    return res.status(500).json({
      message: "Error getting API configurations",
      error: error.message
    });
  }
};

exports.updateApiConfig = async (req, res) => {
  try {
    const { name } = req.params;
    const { apiKey, apiSecret, mode } = req.body;
    
    // Find if config already exists for this user
    let config = await ApiConfig.findOne({
      where: {
        name,
        userId: req.userId
      }
    });
    
    if (config) {
      // Update existing config
      await config.update({
        apiKey,
        apiSecret,
        mode: mode || 'paper'
      });
    } else {
      // Create new config
      config = await ApiConfig.create({
        name,
        apiKey,
        apiSecret,
        mode: mode || 'paper',
        userId: req.userId
      });
    }
    
    return res.json({
      id: config.id,
      name,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      mode: config.mode
    });
  } catch (error) {
    console.error('Error updating API config:', error);
    return res.status(500).json({
      message: "Error updating API configuration",
      error: error.message
    });
  }
};

// System Config Controller
exports.getSystemConfig = async (req, res) => {
  try {
    let config = await SystemConfig.findOne({
      where: { userId: req.userId }
    });
    
    // Create default config if none exists
    if (!config) {
      config = await SystemConfig.create({
        userId: req.userId
      });
    }
    
    return res.json(config);
  } catch (error) {
    console.error('Error getting system config:', error);
    return res.status(500).json({
      message: "Error getting system configuration",
      error: error.message
    });
  }
};

exports.updateSystemConfig = async (req, res) => {
  try {
    const {
      pricingSource,
      fallbackSource,
      updateInterval,
      websocketEnabled,
      analyticsEnabled,
      analyticsSaveInterval
    } = req.body;
    
    // Find or create config
    let config = await SystemConfig.findOne({
      where: { userId: req.userId }
    });
    
    if (!config) {
      config = await SystemConfig.create({
        pricingSource: pricingSource || '3commas',
        fallbackSource: fallbackSource || 'coingecko',
        updateInterval: updateInterval || 1,
        websocketEnabled: websocketEnabled !== undefined ? websocketEnabled : true,
        analyticsEnabled: analyticsEnabled !== undefined ? analyticsEnabled : true,
        analyticsSaveInterval: analyticsSaveInterval || 60,
        userId: req.userId
      });
    } else {
      // Update existing config
      await config.update({
        pricingSource: pricingSource !== undefined ? pricingSource : config.pricingSource,
        fallbackSource: fallbackSource !== undefined ? fallbackSource : config.fallbackSource,
        updateInterval: updateInterval !== undefined ? updateInterval : config.updateInterval,
        websocketEnabled: websocketEnabled !== undefined ? websocketEnabled : config.websocketEnabled,
        analyticsEnabled: analyticsEnabled !== undefined ? analyticsEnabled : config.analyticsEnabled,
        analyticsSaveInterval: analyticsSaveInterval !== undefined ? analyticsSaveInterval : config.analyticsSaveInterval
      });
    }
    
    return res.json(config);
  } catch (error) {
    console.error('Error updating system config:', error);
    return res.status(500).json({
      message: "Error updating system configuration",
      error: error.message
    });
  }
};
