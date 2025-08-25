'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First add reset_count to bots table
    await queryInterface.addColumn('bots', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to bot_assets
    await queryInterface.addColumn('bot_assets', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to trades
    await queryInterface.addColumn('trades', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to trade_steps
    await queryInterface.addColumn('trade_steps', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to price_history
    await queryInterface.addColumn('price_history', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to log_entries
    await queryInterface.addColumn('log_entries', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to bot_swap_decisions
    await queryInterface.addColumn('bot_swap_decisions', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to coin_snapshots
    await queryInterface.addColumn('coin_snapshots', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // Add reset_count to coin_deviations
    await queryInterface.addColumn('coin_deviations', 'reset_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove reset_count from all tables in reverse order
    await queryInterface.removeColumn('coin_deviations', 'reset_count');
    await queryInterface.removeColumn('coin_snapshots', 'reset_count');
    await queryInterface.removeColumn('bot_swap_decisions', 'reset_count');
    await queryInterface.removeColumn('log_entries', 'reset_count');
    await queryInterface.removeColumn('price_history', 'reset_count');
    await queryInterface.removeColumn('trade_steps', 'reset_count');
    await queryInterface.removeColumn('trades', 'reset_count');
    await queryInterface.removeColumn('bot_assets', 'reset_count');
    await queryInterface.removeColumn('bots', 'reset_count');
  }
};
