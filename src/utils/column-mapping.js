/**
 * Column Mapping Configuration
 * 
 * This file contains mapping functions to update Sequelize models to use the correct
 * column names from the existing PostgreSQL database, handling the conversion between
 * camelCase (JS) and snake_case (PostgreSQL) naming conventions.
 */

/**
 * Apply column name mappings to all models to match existing database schema
 * @param {Object} db - The database object containing all models
 */
module.exports = function applyColumnMappings(db) {
  console.log('Applying column name mappings to match existing database schema...');
  
  // Mapping for common fields that appear in multiple models
  const commonMappings = {
    userId: 'user_id',
    botId: 'bot_id',
    apiKey: 'api_key',
    apiSecret: 'api_secret',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hashedPassword: 'password',
    isActive: 'is_active',
    isSuperuser: 'is_superuser',
    lastCheckTime: 'last_check_time',
    initialCoin: 'initial_coin',
    currentCoin: 'current_coin',
    referenceCoin: 'reference_coin',
    accountId: 'account_id',
    thresholdPercentage: 'threshold_percentage',
    checkInterval: 'check_interval',
    globalThresholdPercentage: 'global_threshold_percentage',
    globalPeakValue: 'global_peak_value',
    minAcceptableValue: 'min_acceptable_value',
    pricingSource: 'pricing_source',
    fallbackSource: 'fallback_source',
    updateInterval: 'update_interval',
    websocketEnabled: 'websocket_enabled',
    analyticsEnabled: 'analytics_enabled',
    analyticsSaveInterval: 'analytics_save_interval'
  };

  // Apply mappings to all models
  Object.keys(db).forEach(modelName => {
    // Skip the Sequelize and sequelize properties
    if (modelName === 'Sequelize' || modelName === 'sequelize') {
      return;
    }
    
    const model = db[modelName];
    
    // Skip if not a proper model
    if (!model.rawAttributes) {
      return;
    }
    
    console.log(`Processing model: ${modelName}`);
    
    // Get all attributes
    const attributes = model.rawAttributes;
    
    // Update field mappings for each attribute based on common mappings
    Object.keys(attributes).forEach(attrName => {
      if (commonMappings[attrName] && !attributes[attrName].field) {
        console.log(`  Mapping ${attrName} → ${commonMappings[attrName]}`);
        attributes[attrName].field = commonMappings[attrName];
      }
    });
    
    // Update index fields if they exist
    if (model.options.indexes) {
      model.options.indexes.forEach(index => {
        if (index.fields) {
          index.fields = index.fields.map(field => {
            // If field is a string and has a mapping, use the mapping
            if (typeof field === 'string' && commonMappings[field]) {
              console.log(`  Mapping index field ${field} → ${commonMappings[field]}`);
              return commonMappings[field];
            }
            return field;
          });
        }
      });
    }
  });
  
  console.log('Column mapping complete.');
};
