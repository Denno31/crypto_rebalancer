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
