/**
 * Migration to update the trades table to support multi-step trades
 * Created on: 2025-07-18
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Add new columns to the trades table
      await queryInterface.addColumn('trades', 'composite_trade_id', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'trade_id'
      });

      await queryInterface.addColumn('trades', 'intermediary_coin', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'to_coin'
      });

      await queryInterface.addColumn('trades', 'is_multi_step', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        after: 'intermediary_coin'
      });

      await queryInterface.addColumn('trades', 'completed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'executed_at'
      });

      // Remove unique constraint from trade_id
      // First, get the constraint name
      const [constraintInfo] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME 
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
         WHERE TABLE_NAME = 'trades' 
         AND CONSTRAINT_TYPE = 'UNIQUE'
         AND CONSTRAINT_SCHEMA = DATABASE()`
      );

      // If a unique constraint exists, remove it
      if (constraintInfo && constraintInfo.length > 0) {
        const constraintName = constraintInfo[0].CONSTRAINT_NAME;
        await queryInterface.removeConstraint('trades', constraintName);
      }

      // Make the trade_id column nullable
      await queryInterface.changeColumn('trades', 'trade_id', {
        type: Sequelize.STRING,
        allowNull: true
      });

      // Add index for composite_trade_id
      await queryInterface.addIndex('trades', ['composite_trade_id']);

      console.log('Successfully updated trades table for multi-step trade support');
      return Promise.resolve();
    } catch (error) {
      console.error('Error updating trades table:', error);
      return Promise.reject(error);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Remove added columns
      await queryInterface.removeColumn('trades', 'composite_trade_id');
      await queryInterface.removeColumn('trades', 'intermediary_coin');
      await queryInterface.removeColumn('trades', 'is_multi_step');
      await queryInterface.removeColumn('trades', 'completed_at');

      // Add unique constraint back to trade_id
      await queryInterface.addConstraint('trades', {
        fields: ['trade_id'],
        type: 'unique',
        name: 'trades_trade_id_key'
      });

      // Make trade_id non-nullable again
      await queryInterface.changeColumn('trades', 'trade_id', {
        type: Sequelize.STRING,
        allowNull: false
      });

      console.log('Successfully reverted trades table changes');
      return Promise.resolve();
    } catch (error) {
      console.error('Error reverting trades table changes:', error);
      return Promise.reject(error);
    }
  }
};
