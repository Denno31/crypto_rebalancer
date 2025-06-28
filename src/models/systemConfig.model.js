module.exports = (sequelize, Sequelize) => {
  const SystemConfig = sequelize.define("systemConfig", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    pricingSource: {
      type: Sequelize.STRING,
      defaultValue: '3commas',
      field: 'pricing_source'
    },
    fallbackSource: {
      type: Sequelize.STRING,
      defaultValue: 'coingecko',
      field: 'fallback_source'
    },
    updateInterval: {
      type: Sequelize.INTEGER,
      defaultValue: 1,
      field: 'update_interval'
    },
    websocketEnabled: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      field: 'websocket_enabled'
    },
    analyticsEnabled: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      field: 'analytics_enabled'
    },
    analyticsSaveInterval: {
      type: Sequelize.INTEGER,
      defaultValue: 60,
      field: 'analytics_save_interval'
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'system_config',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id']
      }
    ]
  });

  return SystemConfig;
};
