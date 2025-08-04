'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bot_swap_decisions', {
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
      from_coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      to_coin: {
        type: Sequelize.STRING,
        allowNull: false
      },
      // Price data
      from_coin_price: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      to_coin_price: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      from_coin_snapshot: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      to_coin_snapshot: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      // Deviation metrics
      price_deviation_percent: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      price_threshold: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      deviation_triggered: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Value metrics
      unit_gain_percent: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      eth_equivalent_value: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      min_eth_equivalent: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      // Global protection
      global_peak_value: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      global_protection_triggered: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Decision outcome
      swap_performed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // If a swap was performed, reference the trade
      trade_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'trades',
          key: 'id'
        },
        onDelete: 'SET NULL'
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
    await queryInterface.addIndex('bot_swap_decisions', ['bot_id']);
    await queryInterface.addIndex('bot_swap_decisions', ['from_coin', 'to_coin']);
    await queryInterface.addIndex('bot_swap_decisions', ['swap_performed']);
    await queryInterface.addIndex('bot_swap_decisions', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('bot_swap_decisions');
  }
};
