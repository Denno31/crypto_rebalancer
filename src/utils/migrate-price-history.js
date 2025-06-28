/**
 * Migration utility to add the source column to the price_history table
 */

require('dotenv').config();
const db = require('../models');
const { Sequelize } = require('sequelize');

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
 * @returns {Promise<Boolean>} - True if column was added or already exists
 */
async function addColumnIfNotExists(sequelize, tableName, columnName, dataType) {
  try {
    const exists = await columnExists(sequelize, tableName, columnName);
    
    if (!exists) {
      console.log(`Adding column ${columnName} to ${tableName}`);
      const query = `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${dataType}`;
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

async function runMigration() {
  try {
    console.log('Starting price_history source column migration...');
    
    // Setup migration tracking table
    await createMigrationsTableIfNeeded();
    
    // Migration: Add source column to price_history table
    const migrationId = '007_add_source_to_price_history';
    const migrationApplied = await isMigrationApplied(migrationId);
    
    if (!migrationApplied) {
      console.log(`Applying migration: ${migrationId}`);
      
      // Add source column if it doesn't exist
      const success = await addColumnIfNotExists(
        db.sequelize, 
        'price_history', 
        'source', 
        'VARCHAR(255)'
      );
      
      if (success) {
        // Record the migration as applied
        await recordMigration(migrationId, 'Add source column to price_history table');
        console.log(`Migration ${migrationId} applied successfully`);
      } else {
        console.error(`Failed to apply migration ${migrationId}`);
      }
    } else {
      console.log(`Migration ${migrationId} already applied, skipping`);
    }
    
    console.log('\nMigration completed');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    // Close the connection
    await db.sequelize.close();
  }
}

// Run migration
runMigration();
