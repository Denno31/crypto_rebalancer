/**
 * Bot Swap Decision Model
 * 
 * Tracks each time the bot evaluates a potential swap between coins,
 * including all decision factors and price data for transparency.
 */
module.exports = (sequelize, Sequelize) => {
  const BotSwapDecision = sequelize.define("bot_swap_decision", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    botId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'bot_id',
      references: {
        model: 'bots',
        key: 'id'
      }
    },
    fromCoin: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'from_coin'
    },
    toCoin: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'to_coin'
    },
    // Price data
    fromCoinPrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'from_coin_price'
    },
    toCoinPrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'to_coin_price'
    },
    fromCoinSnapshot: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'from_coin_snapshot'
    },
    toCoinSnapshot: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'to_coin_snapshot'
    },
    // Deviation metrics
    priceDeviationPercent: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'price_deviation_percent'
    },
    priceThreshold: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'price_threshold'
    },
    deviationTriggered: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'deviation_triggered'
    },
    // Value metrics
    unitGainPercent: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'unit_gain_percent'
    },
    ethEquivalentValue: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'eth_equivalent_value'
    },
    minEthEquivalent: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'min_eth_equivalent'
    },
    // Global protection
    globalPeakValue: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'global_peak_value'
    },
    currentGlobalPeakValue: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'current_global_peak_value'
    },
    globalProtectionTriggered: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'global_protection_triggered'
    },
    // Decision outcome
    swapPerformed: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'swap_performed'
    },
    reason: {
      type: Sequelize.TEXT,
      allowNull: true,
      field: 'reason'
    },
    // If a swap was performed, reference the trade
    tradeId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      field: 'trade_id',
      references: {
        model: 'trades',
        key: 'id'
      }
    },
    // Timestamps are handled automatically by Sequelize
    // createdAt -> created_at
    // updatedAt -> updated_at
    resetCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'reset_count'
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'bot_swap_decisions'
  });

  return BotSwapDecision;
};
