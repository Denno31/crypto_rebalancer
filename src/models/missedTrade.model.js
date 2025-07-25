module.exports = (sequelize, Sequelize) => {
  const MissedTrade = sequelize.define("missed_trade", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    bot_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'bots',
        key: 'id'
      }
    },
    from_coin: {
      type: Sequelize.STRING,
      allowNull: false
    },
    to_coin: {
      type: Sequelize.STRING,
      allowNull: false
    },
    reason: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    score: {
      type: Sequelize.FLOAT,
      allowNull: true
    },
    deviation_percentage: {
      type: Sequelize.FLOAT,
      allowNull: true
    },
    threshold: {
      type: Sequelize.FLOAT,
      allowNull: true
    }
  }, {
    // Use camelCase for JS and snake_case for DB
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  
  return MissedTrade;
};
