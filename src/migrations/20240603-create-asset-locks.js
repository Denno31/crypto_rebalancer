'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('asset_locks', {
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
        },
        onDelete: 'CASCADE'
      },
      coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      amount: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'locked' // locked, released
      },
      reason: {
        type: Sequelize.STRING,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for performance
    await queryInterface.addIndex('asset_locks', ['bot_id', 'coin']);
    await queryInterface.addIndex('asset_locks', ['status', 'expires_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('asset_locks');
  }
};
