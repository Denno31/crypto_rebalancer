/**
 * Migration to add currentGlobalPeakValue column to bot_swap_decisions table
 * 
 * This column will store the netValue calculation at the time of decision making:
 * netValue = currentAsset.amount * currentPrice * (1 - commissionRate)
 * 
 * This allows for comparing the current coin value against the global peak value
 * for transparency in global protection decisions.
 */
const tableName = 'bot_swap_decisions';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(tableName, 'current_global_peak_value', {
      type: Sequelize.FLOAT,
      allowNull: true,
      after: 'global_peak_value'
    });

    console.log('Added current_global_peak_value column to bot_swap_decisions table');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn(tableName, 'current_global_peak_value');
    console.log('Removed current_global_peak_value column from bot_swap_decisions table');
  }
};
