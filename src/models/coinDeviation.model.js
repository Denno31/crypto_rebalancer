module.exports = (sequelize, Sequelize) => {
  const CoinDeviation = sequelize.define("coinDeviation", {
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
    baseCoin: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'base_coin'
    },
    targetCoin: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'target_coin'
    },
    basePrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'base_price'
    },
    targetPrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'target_price'
    },
    deviationPercent: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'deviation_percent'
    },
    timestamp: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  }, {
    tableName: 'coin_deviations',
    timestamps: false,
    indexes: [
      {
        fields: ['bot_id']
      },
      {
        fields: ['timestamp']
      },
      {
        fields: ['base_coin', 'target_coin']
      }
    ]
  });

  return CoinDeviation;
};
