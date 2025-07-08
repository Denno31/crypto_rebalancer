/**
 * Migration to add commission tracking fields to the bots table
 */
const { DataTypes } = require('sequelize');

module.exports = {
  id: '005_add_commission_fields_to_bots',
  description: 'Add commission_rate and total_commissions_paid columns to bots table',
  up: async (queryInterface) => {
    console.log('Adding commission fields to bots table...');
    
    try {
      // Check if columns exist first
      const columns = await queryInterface.describeTable('bots');
      
      // Add commission_rate column if it doesn't exist
      if (!columns.commission_rate) {
        await queryInterface.addColumn('bots', 'commission_rate', {
          type: DataTypes.FLOAT,
          allowNull: false,
          defaultValue: 0.002 // Default 0.2% commission
        });
        console.log('Added commission_rate column to bots table');
      } else {
        console.log('commission_rate column already exists');
      }
      
      // Add total_commissions_paid column if it doesn't exist
      if (!columns.total_commissions_paid) {
        await queryInterface.addColumn('bots', 'total_commissions_paid', {
          type: DataTypes.FLOAT,
          allowNull: false,
          defaultValue: 0.0
        });
        console.log('Added total_commissions_paid column to bots table');
      } else {
        console.log('total_commissions_paid column already exists');
      }
    } catch (error) {
      console.error('Error adding commission fields:', error);
    }
    
    console.log('Migration completed successfully');
  },
  down: async (queryInterface) => {
    console.log('Rolling back migration...');
    try {
      await queryInterface.removeColumn('bots', 'commission_rate');
      await queryInterface.removeColumn('bots', 'total_commissions_paid');
      console.log('Columns removed successfully');
    } catch (error) {
      console.log('Could not remove columns: ', error.message);
    }
  }
};
