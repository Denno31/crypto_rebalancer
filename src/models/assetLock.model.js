module.exports = (sequelize, Sequelize) => {
  const AssetLock = sequelize.define("assetLock", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    botId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'bot_id', // Using snake_case for DB compatibility
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
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'locked', // locked, released
      field: 'status'
    },
    reason: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'reason'
    },
    expiresAt: {
      type: Sequelize.DATE,
      allowNull: false,
      field: 'expires_at'
    }
  }, {
    tableName: 'asset_locks',
    timestamps: true,
    underscored: true, // Use snake_case for the timestamps
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['bot_id', 'coin'], // Index for faster lookups
      },
      {
        fields: ['status', 'expires_at'], // Index for expiration queries
      }
    ]
  });

  return AssetLock;
};
