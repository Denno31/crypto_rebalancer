module.exports = (sequelize, Sequelize) => {
  const CoinSnapshot = sequelize.define("coinSnapshot", {
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
    initialPrice: {
      type: Sequelize.FLOAT,
      allowNull: false
    },
    snapshotTimestamp: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    unitsHeld: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0
    },
    ethEquivalentValue: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0
    },
    wasEverHeld: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    maxUnitsReached: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0
    }
  }, {
    tableName: 'coin_snapshots',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['botId', 'coin'] // Ensure unique constraint for one snapshot per coin per bot
      }
    ]
  });

  return CoinSnapshot;
};
