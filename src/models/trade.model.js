module.exports = (sequelize, Sequelize) => {
  const Trade = sequelize.define("trade", {
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
    tradeId: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'trade_id',
      unique: true // 3commas trade ID, must be unique
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
    amount: {
      type: Sequelize.FLOAT,
      allowNull: false
    },
    priceChange: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'price_change'
    },
    status: {
      type: Sequelize.STRING, // pending, completed, failed
      allowNull: false
    },
    executedAt: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      field: 'executed_at'
    }
  }, {
    tableName: 'trades',
    timestamps: false,
    indexes: [
      {
        fields: ['bot_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['executed_at']
      }
    ]
  });

  return Trade;
};
