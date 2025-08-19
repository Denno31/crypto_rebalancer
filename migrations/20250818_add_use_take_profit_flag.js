'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bots', 'use_take_profit', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
    
    // Also ensure the take_profit_percentage column exists
    const columns = await queryInterface.describeTable('bots');
    if (!columns.take_profit_percentage) {
      await queryInterface.addColumn('bots', 'take_profit_percentage', {
        type: Sequelize.FLOAT,
        defaultValue: 5.0, // Default to 5% take profit
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('bots', 'use_take_profit');
  }
};
