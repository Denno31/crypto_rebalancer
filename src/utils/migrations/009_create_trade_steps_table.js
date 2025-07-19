/**
 * Migration to add multi-step trade support
 * This creates the trade_steps table and adds necessary fields to trades table
 */

const { Sequelize, DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    console.log('Adding multi-step trade support...');

    // 1. Update trades table with new fields for multi-step trades
    try {
      const columns = await queryInterface.describeTable('trades');

      // Add isMultiStep column if it doesn't exist
      if (!columns.is_multi_step) {
        await queryInterface.addColumn('trades', 'is_multi_step', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
        console.log('Added is_multi_step column to trades table');
      } else {
        console.log('is_multi_step column already exists');
      }

      // Add compositeTradeId column if it doesn't exist
      if (!columns.composite_trade_id) {
        await queryInterface.addColumn('trades', 'composite_trade_id', {
          type: DataTypes.UUID,
          allowNull: true
        });
        console.log('Added composite_trade_id column to trades table');
      } else {
        console.log('composite_trade_id column already exists');
      }

      // Make tradeId nullable (for parent multi-step trades)
      if (columns.trade_id && !columns.trade_id.allowNull) {
        await queryInterface.changeColumn('trades', 'trade_id', {
          type: DataTypes.STRING,
          allowNull: true
        });
        console.log('Modified trade_id column to be nullable');
      }
    } catch (error) {
      console.error('Error updating trades table:', error);
      throw error;
    }

    // 2. Create trade_steps table if it doesn't exist
    try {
      // Check if trade_steps table exists
      const tables = await queryInterface.showAllTables();
      
      if (!tables.includes('trade_steps')) {
        await queryInterface.createTable('trade_steps', {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          parent_trade_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'trades',
              key: 'id'
            },
            onDelete: 'CASCADE'
          },
          step_number: {
            type: DataTypes.INTEGER,
            allowNull: false
          },
          trade_id: {
            type: DataTypes.STRING,
            allowNull: false
          },
          from_coin: {
            type: DataTypes.STRING,
            allowNull: false
          },
          to_coin: {
            type: DataTypes.STRING,
            allowNull: false
          },
          from_amount: {
            type: DataTypes.FLOAT,
            allowNull: false
          },
          to_amount: {
            type: DataTypes.FLOAT,
            allowNull: false
          },
          from_price: {
            type: DataTypes.FLOAT,
            allowNull: false
          },
          to_price: {
            type: DataTypes.FLOAT,
            allowNull: false
          },
          commission_amount: {
            type: DataTypes.FLOAT,
            allowNull: true
          },
          status: {
            type: DataTypes.STRING, // pending, completed, failed
            allowNull: false
          },
          executed_at: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.fn('NOW')
          },
          completed_at: {
            type: DataTypes.DATE,
            allowNull: true
          },
          raw_trade_data: {
            type: DataTypes.JSON,
            allowNull: true
          }
        });

        // Create indexes for faster lookups if they don't exist
        const createIndexSafely = async (tableName, fields, indexName) => {
          try {
            await queryInterface.addIndex(tableName, fields, { name: indexName });
            console.log(`Created index ${indexName} successfully`);
          } catch (indexError) {
            if (indexError.parent && indexError.parent.code === '42P07') {
              console.log(`Index ${indexName} already exists, skipping...`);
            } else {
              throw indexError;
            }
          }
        };
        
        await createIndexSafely('trade_steps', ['parent_trade_id'], 'trade_steps_parent_trade_id');
        await createIndexSafely('trade_steps', ['trade_id'], 'trade_steps_trade_id');
        await createIndexSafely('trade_steps', ['status'], 'trade_steps_status');
        await createIndexSafely('trade_steps', ['executed_at'], 'trade_steps_executed_at');

        console.log('trade_steps table created successfully');
      } else {
        console.log('trade_steps table already exists');
      }
    } catch (error) {
      console.error('Error creating trade_steps table:', error);
      throw error;
    }

    console.log('Multi-step trade support migration completed successfully');
  },

  down: async (queryInterface) => {
    console.log('Rolling back multi-step trade migration...');
    
    try {
      // Drop the trade_steps table
      await queryInterface.dropTable('trade_steps');
      console.log('Dropped trade_steps table');
      
      // Remove columns from trades table
      await queryInterface.removeColumn('trades', 'is_multi_step');
      await queryInterface.removeColumn('trades', 'composite_trade_id');
      console.log('Removed multi-step columns from trades table');
      
      // Set trade_id back to non-nullable if needed
      await queryInterface.changeColumn('trades', 'trade_id', {
        type: DataTypes.STRING,
        allowNull: false
      });
      
      console.log('Rollback completed successfully');
    } catch (error) {
      console.error('Error during rollback:', error);
      throw error;
    }
  }
};
