const bcrypt = require('bcrypt');

module.exports = (sequelize, Sequelize) => {
  const User = sequelize.define("user", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: Sequelize.STRING,
      unique: true,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    username: {
      type: Sequelize.STRING,
      unique: true,
      allowNull: false
    },
    password: {
      type: Sequelize.STRING,
      allowNull: false,
      field: 'hashed_password' // Map to the actual column name in the database
    },
    isActive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    isSuperuser: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      field: 'is_superuser'
    },
    createdAt: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'users',
    timestamps: true
  });

  // Instance method to verify password
  User.prototype.verifyPassword = function(plainPassword) {
    return bcrypt.compareSync(plainPassword, this.password);
  };

  // Static method to hash password
  User.hashPassword = function(password) {
    return bcrypt.hashSync(password, 10);
  };

  return User;
};
