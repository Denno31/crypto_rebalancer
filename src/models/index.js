const dbConfig = require('../config/db.config.js');
const Sequelize = require('sequelize');

// Connection configuration based on whether we're using a URL or individual params
let sequelizeConfig;

if (dbConfig.url) {
  // Using connection string (DATABASE_URL)
  console.log('Initializing Sequelize with connection string');
  sequelizeConfig = {
    dialect: dbConfig.dialect,
    pool: dbConfig.pool,
    logging: false, // Disable SQL query logging
    retry: {
      max: 5, // Maximum retry attempts
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/
      ]
    }
  };
  
  // Add SSL configuration if specified
  if (dbConfig.dialectOptions) {
    sequelizeConfig.dialectOptions = dbConfig.dialectOptions;
  }
  
  // Create Sequelize instance with URL
  sequelize = new Sequelize(dbConfig.url, sequelizeConfig);
} else {
  // Using individual parameters
  console.log(`Initializing Sequelize with host: ${dbConfig.HOST}`);
  sequelizeConfig = {
    host: dbConfig.HOST,
    dialect: dbConfig.dialect,
    operatorsAliases: false,
    pool: dbConfig.pool,
    logging: false, // Disable SQL query logging
    retry: {
      max: 5,
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /SequelizeConnectionError/
      ]
    }
  };
  
  // Add SSL configuration if specified
  if (dbConfig.dialectOptions) {
    sequelizeConfig.dialectOptions = dbConfig.dialectOptions;
    console.log('Using SSL for database connection');
  }
  
  // Create Sequelize instance with individual parameters
  sequelize = new Sequelize(
    dbConfig.DB,
    dbConfig.USER,
    dbConfig.PASSWORD,
    sequelizeConfig
  );
}

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.user = require('./user.model.js')(sequelize, Sequelize);
db.apiConfig = require('./apiConfig.model.js')(sequelize, Sequelize);
db.bot = require('./bot.model.js')(sequelize, Sequelize);
db.priceHistory = require('./priceHistory.model.js')(sequelize, Sequelize);
db.trade = require('./trade.model.js')(sequelize, Sequelize);
db.logEntry = require('./logEntry.model.js')(sequelize, Sequelize);
db.systemConfig = require('./systemConfig.model.js')(sequelize, Sequelize);
db.coinUnitTracker = require('./coinUnitTracker.model.js')(sequelize, Sequelize);
db.coinSnapshot = require('./coinSnapshot.model.js')(sequelize, Sequelize);
db.botAsset = require('./botAsset.model.js')(sequelize, Sequelize);
db.coinDeviation = require('./coinDeviation.model.js')(sequelize, Sequelize);
db.assetLock = require('./assetLock.model.js')(sequelize, Sequelize);
db.tradeStep = require('./tradeStep.model.js')(sequelize, Sequelize);
db.missedTrade = require('./missedTrade.model.js')(sequelize, Sequelize);

// Define relationships
db.user.hasMany(db.apiConfig, { foreignKey: 'userId' });
db.apiConfig.belongsTo(db.user, { foreignKey: 'userId' });

db.user.hasMany(db.bot, { foreignKey: 'userId' });
db.bot.belongsTo(db.user, { foreignKey: 'userId' });

db.user.hasMany(db.systemConfig, { foreignKey: 'userId' });
db.systemConfig.belongsTo(db.user, { foreignKey: 'userId' });

db.bot.hasMany(db.priceHistory, { foreignKey: 'botId' });
db.priceHistory.belongsTo(db.bot, { foreignKey: 'botId' });

db.bot.hasMany(db.trade, { foreignKey: 'botId' });
db.trade.belongsTo(db.bot, { foreignKey: 'botId' });

db.bot.hasMany(db.logEntry, { foreignKey: 'botId' });
db.logEntry.belongsTo(db.bot, { foreignKey: 'botId' });

db.bot.hasMany(db.coinUnitTracker, { foreignKey: 'botId' });
db.coinUnitTracker.belongsTo(db.bot, { foreignKey: 'botId' });

db.bot.hasMany(db.coinSnapshot, { foreignKey: 'botId' });
db.coinSnapshot.belongsTo(db.bot, { foreignKey: 'botId' });

// BotAsset relationships
db.bot.hasMany(db.botAsset, { foreignKey: 'botId' });
db.botAsset.belongsTo(db.bot, { foreignKey: 'botId' });

// CoinDeviation relationships
db.bot.hasMany(db.coinDeviation, { foreignKey: 'botId' });
db.coinDeviation.belongsTo(db.bot, { foreignKey: 'botId' });

// MissedTrade relationships
db.bot.hasMany(db.missedTrade, { foreignKey: 'bot_id' });
db.missedTrade.belongsTo(db.bot, { foreignKey: 'bot_id' });

// Apply column mappings to match existing database schema
const applyColumnMappings = require('../utils/column-mapping');
applyColumnMappings(db);

// Apply correct timestamp field mappings for all models
Object.keys(db).forEach(modelName => {
  // Skip the Sequelize and sequelize properties
  if (modelName === 'Sequelize' || modelName === 'sequelize') {
    return;
  }
  
  const model = db[modelName];
  
  // Skip if not a proper model
  if (!model.options) {
    return;
  }
  
  // Update the model options
  if (model.options.timestamps) {
    model.options.underscored = true; // Use snake_case
    model.options.createdAt = 'created_at';
    model.options.updatedAt = 'updated_at';
  }
});

module.exports = db;
