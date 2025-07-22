'use strict';

/**
 * Add raw_trade_data column to trades table
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.addColumn(
        'trades',
        'raw_trade_data',
        {
          type: Sequelize.JSON,
          allowNull: true
        }
      );
      console.log('Successfully added raw_trade_data column to trades table');
      return Promise.resolve();
    } catch (error) {
      console.error('Error adding raw_trade_data column:', error);
      return Promise.reject(error);
    }
  },

  down: async (queryInterface) => {
    try {
      await queryInterface.removeColumn('trades', 'raw_trade_data');
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
};
