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
    initialPrice: {
      type: Sequelize.FLOAT,
      allowNull: false,
      field: 'initial_price'
    },
    snapshotTimestamp: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      field: 'snapshot_timestamp'
    },
    unitsHeld: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      field: 'units_held'
    },
    ethEquivalentValue: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      field: 'eth_equivalent_value'
    },
    wasEverHeld: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      field: 'was_ever_held'
    },
    maxUnitsReached: {
      type: Sequelize.FLOAT,
      defaultValue: 0.0,
      field: 'max_units_reached'
    },
    resetCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'reset_count'
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
