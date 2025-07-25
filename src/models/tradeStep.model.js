module.exports = (sequelize, Sequelize) => {
  const TradeStep = sequelize.define("tradeStep", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    parentTradeId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'parent_trade_id',
      references: {
        model: 'trades',
        key: 'id'
      }
    },
    stepNumber: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'step_number'
    },
    tradeId: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'trade_id'
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
    commissionAmount: {
      type: Sequelize.FLOAT,
      allowNull: true,
      field: 'commission_amount'
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
    completedAt: {
      type: Sequelize.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    rawTradeData: {
      type: Sequelize.JSON,
      allowNull: true,
      field: 'raw_trade_data'
    }
  }, {
    tableName: 'trade_steps',
    timestamps: false,
    indexes: [
      {
        fields: ['parent_trade_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['executed_at']
      }
    ]
  });

  return TradeStep;
};
