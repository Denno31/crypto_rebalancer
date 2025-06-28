/**
 * Migration utility for foreign key columns
 * This script adds any missing foreign key columns needed for relationships
 */

require('dotenv').config();
const db = require('../models');
const { Sequelize, DataTypes } = require('sequelize');

async function createMigrationsTableIfNeeded() {
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id VARCHAR(255) PRIMARY KEY,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

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

async function recordMigration(id, description) {
  await db.sequelize.query(
    'INSERT INTO migrations (id, description) VALUES ($1, $2)',
    { 
      bind: [id, description],
      type: Sequelize.QueryTypes.INSERT 
    }
  );
}

/**
 * Checks if a column exists in a table
 * @param {Object} sequelize - Sequelize instance
 * @param {String} tableName - Table name
 * @param {String} columnName - Column name
 * @returns {Promise<Boolean>} - True if column exists
 */
async function columnExists(sequelize, tableName, columnName) {
  try {
    const query = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${tableName}' 
      AND column_name = '${columnName}'
    `;
    
    const result = await sequelize.query(query, { 
      type: Sequelize.QueryTypes.SELECT 
    });
    
    return result.length > 0;
  } catch (error) {
    console.error(`Error checking if column ${columnName} exists in ${tableName}:`, error);
    return false;
  }
}

/**
 * Adds a column to a table if it doesn't exist
 * @param {Object} sequelize - Sequelize instance
 * @param {String} tableName - Table name
 * @param {String} columnName - Column name
 * @param {String} dataType - Column data type
 * @param {Boolean} allowNull - Whether to allow NULL values
 * @returns {Promise<Boolean>} - True if column was added or already exists
 */
async function addColumnIfNotExists(sequelize, tableName, columnName, dataType, allowNull = true) {
  try {
    const exists = await columnExists(sequelize, tableName, columnName);
    
    if (!exists) {
      console.log(`Adding column ${columnName} to ${tableName}`);
      const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${dataType} ${allowNull ? '' : 'NOT NULL'}`;
      await sequelize.query(query);
      return true;
    } else {
      console.log(`Column ${columnName} already exists in ${tableName}`);
      return true;
    }
  } catch (error) {
    console.error(`Error adding column ${columnName} to ${tableName}:`, error);
    return false;
  }
}

async function runMigrations() {
  try {
    console.log('Starting foreign key migrations...');
    
    // Setup migration tracking table
    await createMigrationsTableIfNeeded();
    
    // Migration: Add user_id column to api_config table
    const migrationId1 = '002_add_user_id_to_api_config';
    const migrationApplied1 = await isMigrationApplied(migrationId1);
    
    if (!migrationApplied1) {
      console.log(`\nApplying migration: ${migrationId1}`);
      
      // Add user_id column if it doesn't exist
      await addColumnIfNotExists(
        db.sequelize, 
        'api_config', 
        'user_id', 
        'INTEGER REFERENCES users(id)',
        false
      );
      
      // Record the migration as applied
      await recordMigration(migrationId1, 'Add user_id column to api_config table');
      console.log(`Migration ${migrationId1} applied successfully`);
    } else {
      console.log(`\nMigration ${migrationId1} already applied, skipping`);
    }
    
    // Migration: Add user_id column to bots table
    const migrationId2 = '003_add_user_id_to_bots';
    const migrationApplied2 = await isMigrationApplied(migrationId2);
    
    if (!migrationApplied2) {
      console.log(`\nApplying migration: ${migrationId2}`);
      
      // Add user_id column if it doesn't exist
      await addColumnIfNotExists(
        db.sequelize,
        'bots',
        'user_id',
        'INTEGER REFERENCES users(id)',
        false
      );
      
      // Record the migration as applied
      await recordMigration(migrationId2, 'Add user_id column to bots table');
      console.log(`Migration ${migrationId2} applied successfully`);
    } else {
      console.log(`\nMigration ${migrationId2} already applied, skipping`);
    }
    
    // Migration: Add user_id column to system_config table
    const migrationId3 = '004_add_user_id_to_system_config';
    const migrationApplied3 = await isMigrationApplied(migrationId3);
    
    if (!migrationApplied3) {
      console.log(`\nApplying migration: ${migrationId3}`);
      
      // Add user_id column if it doesn't exist
      await addColumnIfNotExists(
        db.sequelize,
        'system_config',
        'user_id',
        'INTEGER REFERENCES users(id)',
        false
      );
      
      // Record the migration as applied
      await recordMigration(migrationId3, 'Add user_id column to system_config table');
      console.log(`Migration ${migrationId3} applied successfully`);
    } else {
      console.log(`\nMigration ${migrationId3} already applied, skipping`);
    }
    
    // Migration: Add bot_id column to price_history table
    const migrationId4 = '005_add_bot_id_to_price_history';
    const migrationApplied4 = await isMigrationApplied(migrationId4);
    
    if (!migrationApplied4) {
      console.log(`\nApplying migration: ${migrationId4}`);
      
      // Add bot_id column if it doesn't exist
      await addColumnIfNotExists(
        db.sequelize,
        'price_history',
        'bot_id',
        'INTEGER REFERENCES bots(id)',
        false
      );
      
      // Record the migration as applied
      await recordMigration(migrationId4, 'Add bot_id column to price_history table');
      console.log(`Migration ${migrationId4} applied successfully`);
    } else {
      console.log(`\nMigration ${migrationId4} already applied, skipping`);
    }
    
    console.log('\nAll migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    // Close the connection
    await db.sequelize.close();
  }
}

// Run migrations
runMigrations();
