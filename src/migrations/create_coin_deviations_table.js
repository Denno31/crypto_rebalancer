/**
 * Migration to create the coin_deviations table
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('coin_deviations', {
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
      base_coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      target_coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      base_price: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      target_price: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      deviation_percent: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for performance
    await queryInterface.addIndex('coin_deviations', ['bot_id']);
    await queryInterface.addIndex('coin_deviations', ['timestamp']);
    await queryInterface.addIndex('coin_deviations', ['base_coin', 'target_coin']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('coin_deviations');
  }
};
