'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bots', 'take_profit_percentage', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null,
      after: 'global_threshold_percentage'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('bots', 'take_profit_percentage');
  }
};
