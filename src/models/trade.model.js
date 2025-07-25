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
    fromAmount: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'from_amount'
    },
    toAmount: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'to_amount'
    },
    fromPrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'from_price'
    },
    toPrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'to_price'
    },
    commissionRate: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'commission_rate'
    },
    commissionAmount: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'commission_amount'
    },
    priceChange: {
      type: Sequelize.FLOAT,
      allowNull: true,
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
    },
    decisionReason: {
      type: Sequelize.TEXT,
      allowNull: true,
      field: 'decision_reason',
      comment: 'Explanation for why this trade was executed'
    },
    deviationPercentage: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      field: 'deviation_percentage',
      comment: 'Percentage deviation that triggered the trade'
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
