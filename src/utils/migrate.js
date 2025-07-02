/**
 * Database migration utility
 * This script helps to apply database migrations to fix schema sync issues
 */

require('dotenv').config();
const db = require('../models');
const { Sequelize, DataTypes } = require('sequelize');

// Migration records to track which migrations have been run
const migrations = [
  {
    id: '001_add_global_peak_value_to_bots',
    description: 'Add global_peak_value and min_acceptable_value columns to Bot model',
    up: async (queryInterface) => {
      console.log('Adding global_peak_value and min_acceptable_value columns to bots table...');
      
      // Check if columns exist first
      const columns = await queryInterface.describeTable('bots');
      
      // Add global_peak_value column if it doesn't exist
      if (!columns.globalPeakValue) {
        await queryInterface.addColumn('bots', 'globalPeakValue', {
          type: DataTypes.FLOAT,
          allowNull: true,
          defaultValue: 0
        });
        console.log('Added globalPeakValue column');
      } else {
        console.log('globalPeakValue column already exists');
      }
      
      // Add min_acceptable_value column if it doesn't exist
      if (!columns.minAcceptableValue) {
        await queryInterface.addColumn('bots', 'minAcceptableValue', {
          type: DataTypes.FLOAT,
          allowNull: true,
          defaultValue: 0
        });
        console.log('Added minAcceptableValue column');
      } else {
        console.log('minAcceptableValue column already exists');
      }
      
      console.log('Migration completed successfully');
    },
    down: async (queryInterface) => {
      console.log('Rolling back migration...');
      await queryInterface.removeColumn('bots', 'globalPeakValue');
      await queryInterface.removeColumn('bots', 'minAcceptableValue');
      console.log('Columns removed successfully');
    }
  },
  {
    id: '002_add_bot_allocation_fields',
    description: 'Add allocation_percentage and manual_budget_amount columns to bots table and create bot_assets table',
    up: async (queryInterface) => {
      console.log('Adding allocation fields to bots table and creating bot_assets table...');
      
      // Check if columns exist first in bots table
      const botColumns = await queryInterface.describeTable('bots');
      
      // Add allocation_percentage column if it doesn't exist
      if (!botColumns.allocation_percentage) {
        await queryInterface.addColumn('bots', 'allocation_percentage', {
          type: DataTypes.FLOAT,
          allowNull: true,
          defaultValue: 100.0
        });
        console.log('Added allocation_percentage column to bots table');
      } else {
        console.log('allocation_percentage column already exists');
      }
      
      // Add manual_budget_amount column if it doesn't exist
      if (!botColumns.manual_budget_amount) {
        await queryInterface.addColumn('bots', 'manual_budget_amount', {
          type: DataTypes.FLOAT,
          allowNull: true
        });
        console.log('Added manual_budget_amount column to bots table');
      } else {
        console.log('manual_budget_amount column already exists');
      }
      
      // Check if bot_assets table exists
      try {
        await queryInterface.describeTable('bot_assets');
        console.log('bot_assets table already exists');
      } catch (error) {
        // Table doesn't exist, create it
        console.log('Creating bot_assets table...');
        
        await queryInterface.createTable('bot_assets', {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          bot_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'bots',
              key: 'id'
            },
            onDelete: 'CASCADE'
          },
          coin: {
            type: DataTypes.STRING,
            allowNull: false
          },
          amount: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0.0
          },
          entry_price: {
            type: DataTypes.FLOAT,
            allowNull: true
          },
          usdt_equivalent: {
            type: DataTypes.FLOAT,
            allowNull: true
          },
          created_at: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          last_updated: {
            type: DataTypes.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        // Create index on bot_id and coin combination for quick lookups
        await queryInterface.addIndex('bot_assets', ['bot_id', 'coin'], {
          unique: true,
          name: 'bot_assets_bot_id_coin_unique'
        });
        
        console.log('Created bot_assets table with indexes');
      }
      
      console.log('Migration completed successfully');
    },
    down: async (queryInterface) => {
      console.log('Rolling back migration...');
      
      // Remove columns from bots table
      await queryInterface.removeColumn('bots', 'allocation_percentage');
      await queryInterface.removeColumn('bots', 'manual_budget_amount');
      
      // Drop bot_assets table
      await queryInterface.dropTable('bot_assets');
      
      console.log('Rollback completed successfully');
    }
  },
  {
    id: '003_add_preferred_stablecoin_to_bots',
    description: 'Add preferred_stablecoin column to bots table',
    up: async (queryInterface) => {
      console.log('Adding preferred_stablecoin column to bots table...');
      
      // Check if columns exist first
      const columns = await queryInterface.describeTable('bots');
      
      // Add preferred_stablecoin column if it doesn't exist
      if (!columns.preferred_stablecoin) {
        await queryInterface.addColumn('bots', 'preferred_stablecoin', {
          type: DataTypes.STRING(10),
          allowNull: false,
          defaultValue: 'USDT'
        });
        console.log('Added preferred_stablecoin column to bots table');
      } else {
        console.log('preferred_stablecoin column already exists');
      }
      
      console.log('Migration completed successfully');
    },
    down: async (queryInterface) => {
      console.log('Rolling back migration...');
      await queryInterface.removeColumn('bots', 'preferred_stablecoin');
      console.log('Column removed successfully');
    }
  },
  {
    id: '004_add_stablecoin_to_bot_assets',
    description: 'Add stablecoin column to bot_assets table',
    up: async (queryInterface) => {
      console.log('Adding stablecoin column to bot_assets table...');
      
      try {
        // Check if table and columns exist first
        const columns = await queryInterface.describeTable('bot_assets');
        
        // Add stablecoin column if it doesn't exist
        if (!columns.stablecoin) {
          await queryInterface.addColumn('bot_assets', 'stablecoin', {
            type: DataTypes.STRING(10),
            allowNull: false,
            defaultValue: 'USDT'
          });
          console.log('Added stablecoin column to bot_assets table');
        } else {
          console.log('stablecoin column already exists');
        }
      } catch (error) {
        // Table might not exist yet if migration 002 wasn't run
        console.log('Bot assets table does not exist yet. Migration will be handled by 002_add_bot_allocation_fields');
      }
      
      console.log('Migration completed successfully');
    },
    down: async (queryInterface) => {
      console.log('Rolling back migration...');
      try {
        await queryInterface.removeColumn('bot_assets', 'stablecoin');
        console.log('Column removed successfully');
      } catch (error) {
        console.log('Could not remove column: bot_assets table does not exist');
      }
    }
  }
  // Add more migrations here as needed
];

// Track migrations in database
async function setupMigrationTable() {
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id VARCHAR(255) PRIMARY KEY,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Check if a migration has been applied
async function isMigrationApplied(id) {
  const result = await db.sequelize.query(
    'SELECT id FROM migrations WHERE id = $1',
    { 
      bind: [id],
      type: Sequelize.QueryTypes.SELECT 
    }
  );
  return result.length > 0;
}

// Record a migration as applied
async function recordMigration(id, description) {
  await db.sequelize.query(
    'INSERT INTO migrations (id, description) VALUES ($1, $2)',
    { 
      bind: [id, description],
      type: Sequelize.QueryTypes.INSERT 
    }
  );
}

// Main migration function
async function migrate() {
  try {
    console.log('Starting database migration...');
    
    // Setup migration tracking table
    await setupMigrationTable();
    
    // Get queryInterface for schema changes
    const queryInterface = db.sequelize.getQueryInterface();
    
    // Run each pending migration
    for (const migration of migrations) {
      // Check if migration has already been applied
      const applied = await isMigrationApplied(migration.id);
      
      if (!applied) {
        console.log(`\nApplying migration: ${migration.id}`);
        console.log(`Description: ${migration.description}`);
        
        // Run the migration
        await migration.up(queryInterface);
        
        // Record the migration as applied
        await recordMigration(migration.id, migration.description);
        
        console.log(`Migration ${migration.id} applied successfully`);
      } else {
        console.log(`\nMigration ${migration.id} already applied, skipping`);
      }
    }
    
    console.log('\nAll migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await db.sequelize.close();
  }
}

// Run migrations
migrate();
