/**
 * Migration to add commission tracking fields to the trades table
 */
const { DataTypes } = require('sequelize');

module.exports = {
  id: '006_add_commission_fields_to_trades',
  description: 'Add commission_rate and commission_amount columns to trades table',
  up: async (queryInterface) => {
    console.log('Adding commission tracking fields to trades table...');
    
    try {
      // Check if columns exist first
      const columns = await queryInterface.describeTable('trades');
      
      // Add from_amount column if it doesn't exist
      if (!columns.from_amount) {
        await queryInterface.addColumn('trades', 'from_amount', {
          type: DataTypes.FLOAT,
          allowNull: true
        });
        console.log('Added from_amount column to trades table');
      } else {
        console.log('from_amount column already exists');
      }
      
      // Add to_amount column if it doesn't exist
      if (!columns.to_amount) {
        await queryInterface.addColumn('trades', 'to_amount', {
          type: DataTypes.FLOAT,
          allowNull: true
        });
        console.log('Added to_amount column to trades table');
      } else {
        console.log('to_amount column already exists');
      }
      
      // Add from_price column if it doesn't exist
      if (!columns.from_price) {
        await queryInterface.addColumn('trades', 'from_price', {
          type: DataTypes.FLOAT,
          allowNull: true
        });
        console.log('Added from_price column to trades table');
      } else {
        console.log('from_price column already exists');
      }
      
      // Add to_price column if it doesn't exist
      if (!columns.to_price) {
        await queryInterface.addColumn('trades', 'to_price', {
          type: DataTypes.FLOAT,
          allowNull: true
        });
        console.log('Added to_price column to trades table');
      } else {
        console.log('to_price column already exists');
      }
      
      // Add commission_rate column if it doesn't exist
      if (!columns.commission_rate) {
        await queryInterface.addColumn('trades', 'commission_rate', {
          type: DataTypes.FLOAT,
          allowNull: true,
          defaultValue: 0.002 // Default 0.2% commission
        });
        console.log('Added commission_rate column to trades table');
      } else {
        console.log('commission_rate column already exists');
      }
      
      // Add commission_amount column if it doesn't exist
      if (!columns.commission_amount) {
        await queryInterface.addColumn('trades', 'commission_amount', {
          type: DataTypes.FLOAT,
          allowNull: true,
          defaultValue: 0.0
        });
        console.log('Added commission_amount column to trades table');
      } else {
        console.log('commission_amount column already exists');
      }
    } catch (error) {
      console.error('Error adding commission fields to trades table:', error);
    }
    
    console.log('Migration completed successfully');
  },
  down: async (queryInterface) => {
    console.log('Rolling back migration...');
    try {
      await queryInterface.removeColumn('trades', 'commission_rate');
      await queryInterface.removeColumn('trades', 'commission_amount');
      await queryInterface.removeColumn('trades', 'from_amount');
      await queryInterface.removeColumn('trades', 'to_amount');
      await queryInterface.removeColumn('trades', 'from_price');
      await queryInterface.removeColumn('trades', 'to_price');
      console.log('Columns removed successfully');
    } catch (error) {
      console.log('Could not remove columns: ', error.message);
    }
  }
};
