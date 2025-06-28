module.exports = (sequelize, Sequelize) => {
  const PriceHistory = sequelize.define("priceHistory", {
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
      allowNull: false
    },
    price: {
      type: Sequelize.FLOAT,
      allowNull: false
    },
    timestamp: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    // Optional source field to track where price data came from
    source: {
      type: Sequelize.STRING,
      allowNull: true
    }
  }, {
    tableName: 'price_history',
    timestamps: false,
    indexes: [
      {
        fields: ['coin']
      },
      {
        fields: ['botId', 'timestamp']
      }
    ]
  });

  return PriceHistory;
};
