module.exports = (sequelize, Sequelize) => {
  const ApiConfig = sequelize.define("apiConfig", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'name',
      unique: false // Not setting to unique here as it will be unique per user, which we'll enforce in table constraints
    },
    apiKey: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'api_key'
    },
    apiSecret: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'api_secret'
    },
    mode: {
      type: Sequelize.STRING,
      defaultValue: 'paper',
      field: 'mode'
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'user_id', // Map to the actual column name in the database
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'api_config',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['name', 'user_id'] // Making sure a user can't have duplicate API configs with same name
      }
    ]
  });

  return ApiConfig;
};
