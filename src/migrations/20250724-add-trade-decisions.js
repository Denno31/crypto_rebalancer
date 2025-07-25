'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add columns to trades table
    await queryInterface.addColumn('trades', 'decision_reason', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    
    await queryInterface.addColumn('trades', 'deviation_percentage', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true
    });
    
    // Create missed_trades table
    await queryInterface.createTable('missed_trades', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      bot_id: {
        type: Sequelize.INTEGER,
        references: { model: 'bots', key: 'id' }
      },
      from_coin: Sequelize.STRING,
      to_coin: Sequelize.STRING,
      deviation_percentage: Sequelize.DECIMAL(10, 2),
      reason: Sequelize.TEXT,
      timestamp: Sequelize.DATE,
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
  
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('trades', 'decision_reason');
    await queryInterface.removeColumn('trades', 'deviation_percentage');
    await queryInterface.dropTable('missed_trades');
  }
};
