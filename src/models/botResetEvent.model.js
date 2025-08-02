'use strict';

module.exports = (sequelize, DataTypes) => {
  const BotResetEvent = sequelize.define('BotResetEvent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    botId: {
      type: DataTypes.INTEGER,
      field: 'bot_id'
    },
    resetType: {
      type: DataTypes.STRING,
      field: 'reset_type'
    },
    previousCoin: {
      type: DataTypes.STRING,
      field: 'previous_coin'
    },
    previousGlobalPeak: {
      type: DataTypes.DECIMAL(20, 8),
      field: 'previous_global_peak',
      allowNull: true
    },
    timestamp: {
      type: DataTypes.DATE
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at'
    }
  }, {
    tableName: 'bot_reset_events',
    timestamps: true,
    underscored: true
  });

  BotResetEvent.associate = (models) => {
    BotResetEvent.belongsTo(models.Bot, {
      foreignKey: 'bot_id',
      as: 'bot'
    });
  };

  return BotResetEvent;
};
