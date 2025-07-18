'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Check if columns exist in the bots table
    const botsTableColumns = await queryInterface.describeTable('bots');
    
    // Add missing columns to bots table if needed
    const botColumnsToAdd = [];
    
    if (!botsTableColumns.global_peak_value_in_eth) {
      botColumnsToAdd.push({
        name: 'global_peak_value_in_eth',
        spec: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 0,
        }
      });
      console.log('Adding global_peak_value_in_eth column to bots table');
    }
    
    if (!botsTableColumns.global_threshold_percentage) {
      botColumnsToAdd.push({
        name: 'global_threshold_percentage',
        spec: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 10,
        }
      });
      console.log('Adding global_threshold_percentage column to bots table');
    }

    if (!botsTableColumns.use_take_profit) {
      botColumnsToAdd.push({
        name: 'use_take_profit',
        spec: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
          defaultValue: false,
        }
      });
      console.log('Adding use_take_profit column to bots table');
    }

    if (!botsTableColumns.take_profit_percentage) {
      botColumnsToAdd.push({
        name: 'take_profit_percentage',
        spec: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 2,
        }
      });
      console.log('Adding take_profit_percentage column to bots table');
    }

    if (!botsTableColumns.preferred_stablecoin) {
      botColumnsToAdd.push({
        name: 'preferred_stablecoin',
        spec: {
          type: Sequelize.STRING,
          allowNull: true,
          defaultValue: 'USDT',
        }
      });
      console.log('Adding preferred_stablecoin column to bots table');
    }
    
    // Execute bot table migrations
    for (const column of botColumnsToAdd) {
      await queryInterface.addColumn('bots', column.name, column.spec);
    }
    
    // Step 2: Check if columns exist in the coin_snapshots table
    try {
      const snapshotsTableColumns = await queryInterface.describeTable('coin_snapshots');
      
      // Add missing columns to coin_snapshots table if needed
      const snapshotColumnsToAdd = [];
      
      if (!snapshotsTableColumns.snapshot_timestamp) {
        snapshotColumnsToAdd.push({
          name: 'snapshot_timestamp',
          spec: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          }
        });
        console.log('Adding snapshot_timestamp column to coin_snapshots table');
      }
      
      if (!snapshotsTableColumns.eth_equivalent_value) {
        snapshotColumnsToAdd.push({
          name: 'eth_equivalent_value',
          spec: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 0,
          }
        });
        console.log('Adding eth_equivalent_value column to coin_snapshots table');
      }

      if (!snapshotsTableColumns.was_ever_held) {
        snapshotColumnsToAdd.push({
          name: 'was_ever_held',
          spec: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          }
        });
        console.log('Adding was_ever_held column to coin_snapshots table');
      }

      if (!snapshotsTableColumns.max_units_reached) {
        snapshotColumnsToAdd.push({
          name: 'max_units_reached',
          spec: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 0,
          }
        });
        console.log('Adding max_units_reached column to coin_snapshots table');
      }
      
      // Execute snapshot table migrations
      for (const column of snapshotColumnsToAdd) {
        await queryInterface.addColumn('coin_snapshots', column.name, column.spec);
      }
    } catch (error) {
      if (error.message.includes('relation "coin_snapshots" does not exist')) {
        console.log('Creating coin_snapshots table...');
        await queryInterface.createTable('coin_snapshots', {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          bot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'bots',
              key: 'id'
            }
          },
          coin: {
            type: Sequelize.STRING,
            allowNull: false
          },
          initial_price: {
            type: Sequelize.FLOAT,
            allowNull: false
          },
          units_held: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 0
          },
          eth_equivalent_value: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 0
          },
          was_ever_held: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
          },
          max_units_reached: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 0
          },
          snapshot_timestamp: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });

        // Add unique constraint to ensure one snapshot per bot-coin pair
        await queryInterface.addConstraint('coin_snapshots', {
          fields: ['bot_id', 'coin'],
          type: 'unique',
          name: 'unique_bot_coin_snapshot'
        });
      } else {
        throw error;
      }
    }
    
    // Step 3: Check if coin_deviations table exists and create if not
    try {
      await queryInterface.describeTable('coin_deviations');
      console.log('coin_deviations table already exists');
    } catch (error) {
      if (error.message.includes('relation "coin_deviations" does not exist')) {
        console.log('Creating coin_deviations table...');
        await queryInterface.createTable('coin_deviations', {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          bot_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'bots',
              key: 'id'
            }
          },
          base_coin: {
            type: Sequelize.STRING,
            allowNull: false
          },
          target_coin: {
            type: Sequelize.STRING,
            allowNull: false
          },
          base_price: {
            type: Sequelize.FLOAT,
            allowNull: false
          },
          target_price: {
            type: Sequelize.FLOAT,
            allowNull: false
          },
          deviation_percent: {
            type: Sequelize.FLOAT,
            allowNull: false
          },
          timestamp: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        // Add indexes for improved query performance
        await queryInterface.addIndex('coin_deviations', {
          fields: ['bot_id']
        });
        await queryInterface.addIndex('coin_deviations', {
          fields: ['timestamp']
        });
        await queryInterface.addIndex('coin_deviations', {
          fields: ['base_coin', 'target_coin']
        });
      } else {
        throw error;
      }
    }
    
    // Step 4: Check if coin_unit_trackers table exists and create if not
    try {
      // Try with snake_case naming first
      try {
        await queryInterface.describeTable('coin_unit_trackers');
        console.log('coin_unit_trackers table already exists');
      } catch (snakeError) {
        // Try with camelCase naming as fallback
        try {
          await queryInterface.describeTable('coinUnitTrackers');
          console.log('coinUnitTrackers table already exists (camelCase)');
        } catch (camelError) {
          // If neither table exists, create a new one with snake_case naming
          console.log('Creating coin_unit_trackers table...');
          await queryInterface.createTable('coin_unit_trackers', {
            id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true
            },
            bot_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              references: {
                model: 'bots',
                key: 'id'
              }
            },
            coin: {
              type: Sequelize.STRING,
              allowNull: false
            },
            units: {
              type: Sequelize.FLOAT,
              allowNull: false,
              defaultValue: 0
            },
            last_updated: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
          });
          
          // Add unique constraint to ensure one tracker per bot-coin pair
          await queryInterface.addConstraint('coin_unit_trackers', {
            fields: ['bot_id', 'coin'],
            type: 'unique',
            name: 'unique_bot_coin_tracker'
          });
        }
      }
    } catch (error) {
      console.error('Error handling coin unit trackers table:', error.message);
      throw error;
    }

    console.log('Migration completed successfully');
    return Promise.resolve();
  },

  down: async (queryInterface, Sequelize) => {
    // Remove added columns and tables
    console.log('Rolling back migration...');
    
    // Remove columns from bots table
    try {
      const botsColumns = await queryInterface.describeTable('bots');
      if (botsColumns.global_peak_value_in_eth) {
        await queryInterface.removeColumn('bots', 'global_peak_value_in_eth');
      }
      if (botsColumns.global_threshold_percentage) {
        await queryInterface.removeColumn('bots', 'global_threshold_percentage');
      }
      if (botsColumns.use_take_profit) {
        await queryInterface.removeColumn('bots', 'use_take_profit');
      }
      if (botsColumns.take_profit_percentage) {
        await queryInterface.removeColumn('bots', 'take_profit_percentage');
      }
      if (botsColumns.preferred_stablecoin) {
        await queryInterface.removeColumn('bots', 'preferred_stablecoin');
      }
    } catch (error) {
      console.error('Error removing columns from bots table:', error);
    }
    
    // Drop coin_deviations table
    try {
      await queryInterface.dropTable('coin_deviations');
    } catch (error) {
      console.error('Error dropping coin_deviations table:', error);
    }
    
    // Note: We're not dropping the coin_snapshots and coin_unit_trackers tables
    // as they might contain important data from previous implementations
    // Instead, we'll just log that they should be manually reviewed
    console.log('WARNING: coin_snapshots and coin_unit_trackers tables were not dropped.');
    console.log('Please review these tables manually if you want to fully roll back the migration.');

    console.log('Rollback completed');
    return Promise.resolve();
  }
};
