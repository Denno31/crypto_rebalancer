'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bot_reset_events', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      bot_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'bots',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      reset_type: {
        type: Sequelize.STRING
      },
      previous_coin: {
        type: Sequelize.STRING
      },
      previous_global_peak: {
        type: Sequelize.DECIMAL(20, 8),
        allowNull: true
      },
      timestamp: {
        type: Sequelize.DATE
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('bot_reset_events');
  }
};
