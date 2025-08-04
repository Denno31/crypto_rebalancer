module.exports = (sequelize, Sequelize) => {
  const Bot = sequelize.define("bot", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'name'
    },
    enabled: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      field: 'enabled'
    },
    coins: {
      type: Sequelize.STRING, // Stored as comma-separated string
      allowNull: false,
      field: 'coins'
    },
    thresholdPercentage: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'threshold_percentage'
    },
    checkInterval: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'check_interval'
    },
    initialCoin: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'initial_coin'
    },
    allocationPercentage: {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 100.0, // Default to 100% if not specified
      field: 'allocation_percentage'
    },
    manualBudgetAmount: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'manual_budget_amount'
    },
    currentCoin: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'current_coin'
    },
    accountId: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'account_id'
    },
    lastCheckTime: {
      type: Sequelize.DATE,
      allowNull: true,
      field: 'last_check_time'
    },
    activeTradeId: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'active_trade_id'
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'user_id'
    },
    referenceCoin: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'reference_coin'
    },
    maxGlobalEquivalent: {
      type: Sequelize.FLOAT,
      defaultValue: 1.0,
      field: 'max_global_equivalent'
    },
    globalThresholdPercentage: {
      type: Sequelize.FLOAT,
      defaultValue: 10.0,
      field: 'global_threshold_percentage'
    },
    takeProfitPercentage: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'take_profit_percentage'
    },
    // Making sure to include these fields that were missing in the original python implementation
    globalPeakValue: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      field: 'global_peak_value'
    },
    minAcceptableValue: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      field: 'min_acceptable_value'
    },
    globalPeakValueInETH: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      field: 'global_peak_value_eth'
    },
    commissionRate: {
      type: Sequelize.FLOAT,
      field: 'commission_rate',
      allowNull: false,
      defaultValue: 0.002  // Default 0.2% commission
    },
    totalCommissionsPaid: {
      type: Sequelize.FLOAT,
      field: 'total_commissions_paid',
      allowNull: false,
      defaultValue: 0.0
    },
    priceSource: {
      type: Sequelize.STRING,
      defaultValue: "three_commas",
      field: 'price_source',
      allowNull: true // Make it optional until migration adds the column
    },
    preferredStablecoin: {
      type: Sequelize.STRING,
      defaultValue: "USDT",
      field: 'preferred_stablecoin',
      allowNull: true // Make it optional until migration adds the column
    }
  }, {
    tableName: 'bots',
    timestamps: true,
    underscored: true, // This will use snake_case for timestamps (created_at, updated_at)
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Instance methods for handling coins as array
  Bot.prototype.getCoinsArray = function() {
    return this.coins ? this.coins.split(',') : [];
  };

  Bot.prototype.setCoinsArray = function(coinsArray) {
    this.coins = coinsArray.join(',');
  };

  return Bot;
};
