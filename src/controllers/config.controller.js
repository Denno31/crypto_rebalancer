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
    // Use snake_case from API, consistent with frontend
    const { api_key, api_secret, mode } = req.body;
    
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
        apiKey: api_key, // Convert from snake_case (API) to camelCase (model)
        apiSecret: api_secret, // Convert from snake_case (API) to camelCase (model)
        mode: mode || 'paper'
      });
    } else {
      // Create new config
      config = await ApiConfig.create({
        name,
        apiKey: api_key, // Convert from snake_case (API) to camelCase (model)
        apiSecret: api_secret, // Convert from snake_case (API) to camelCase (model)
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
    
    // Convert camelCase model to snake_case for API response
    const formattedConfig = {
      id: config.id,
      pricing_source: config.pricingSource,
      fallback_source: config.fallbackSource,
      update_interval: config.updateInterval,
      websocket_enabled: config.websocketEnabled,
      analytics_enabled: config.analyticsEnabled,
      analytics_save_interval: config.analyticsSaveInterval,
      created_at: config.createdAt,
      updated_at: config.updatedAt
    };
    
    return res.json(formattedConfig);
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
    // Use snake_case from API, consistent with frontend
    const {
      pricing_source,
      fallback_source,
      update_interval,
      websocket_enabled,
      analytics_enabled,
      analytics_save_interval
    } = req.body;
    
    // Find or create config
    let config = await SystemConfig.findOne({
      where: { userId: req.userId }
    });
    
    if (!config) {
      config = await SystemConfig.create({
        pricingSource: pricing_source || '3commas', // Convert from snake_case (API) to camelCase (model)
        fallbackSource: fallback_source || 'coingecko', // Convert from snake_case (API) to camelCase (model)
        updateInterval: update_interval || 1, // Convert from snake_case (API) to camelCase (model)
        websocketEnabled: websocket_enabled !== undefined ? websocket_enabled : true, // Convert from snake_case (API) to camelCase (model)
        analyticsEnabled: analytics_enabled !== undefined ? analytics_enabled : true, // Convert from snake_case (API) to camelCase (model)
        analyticsSaveInterval: analytics_save_interval || 60, // Convert from snake_case (API) to camelCase (model)
        userId: req.userId
      });
    } else {
      // Update existing config
      await config.update({
        pricingSource: pricing_source !== undefined ? pricing_source : config.pricingSource, // Convert from snake_case (API) to camelCase (model)
        fallbackSource: fallback_source !== undefined ? fallback_source : config.fallbackSource, // Convert from snake_case (API) to camelCase (model)
        updateInterval: update_interval !== undefined ? update_interval : config.updateInterval, // Convert from snake_case (API) to camelCase (model)
        websocketEnabled: websocket_enabled !== undefined ? websocket_enabled : config.websocketEnabled, // Convert from snake_case (API) to camelCase (model)
        analyticsEnabled: analytics_enabled !== undefined ? analytics_enabled : config.analyticsEnabled, // Convert from snake_case (API) to camelCase (model)
        analyticsSaveInterval: analytics_save_interval !== undefined ? analytics_save_interval : config.analyticsSaveInterval // Convert from snake_case (API) to camelCase (model)
      });
    }
    
    // Convert camelCase model to snake_case for API response
    const formattedConfig = {
      id: config.id,
      pricing_source: config.pricingSource,
      fallback_source: config.fallbackSource,
      update_interval: config.updateInterval,
      websocket_enabled: config.websocketEnabled,
      analytics_enabled: config.analyticsEnabled,
      analytics_save_interval: config.analyticsSaveInterval,
      created_at: config.createdAt,
      updated_at: config.updatedAt
    };
    
    return res.json(formattedConfig);
  } catch (error) {
    console.error('Error updating system config:', error);
    return res.status(500).json({
      message: "Error updating system configuration",
      error: error.message
    });
  }
};
