module.exports = (sequelize, Sequelize) => {
  const BotAsset = sequelize.define("botAsset", {
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
    coin: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'coin'
    },
    amount: {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0.0,
      field: 'amount'
    },
    entryPrice: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'entry_price'
    },
    usdtEquivalent: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'usdt_equivalent'
    },
    lastUpdated: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      field: 'last_updated'
    },
    stablecoin: {
      type: Sequelize.STRING,
      defaultValue: 'USDT',
      field: 'stablecoin'
    }
  }, {
    tableName: 'bot_assets',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return BotAsset;
};
