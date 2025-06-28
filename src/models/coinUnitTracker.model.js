module.exports = (sequelize, Sequelize) => {
  const CoinUnitTracker = sequelize.define("coinUnitTracker", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    botId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'bots',
        key: 'id'
      }
    },
    coin: {
      type: Sequelize.STRING,
      allowNull: false
    },
    units: {
      type: Sequelize.FLOAT,
      allowNull: false
    },
    lastUpdated: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    }
  }, {
    tableName: 'coin_unit_tracker',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['botId', 'coin'] // Each coin should have only one entry per bot
      }
    ]
  });

  return CoinUnitTracker;
};
