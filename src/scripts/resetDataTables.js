/**
 * Reset Data Tables Script
 * 
 * This script truncates all tables except users, system_configs, and bots.
 * Use with caution as it will delete all data from the specified tables.
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const db = require('../models');

// Create fallback logging function in case logger module is not available
let logMessage;
try {
  // Try to import the project's logger
  const logger = require('../utils/logger');
  logMessage = logger.logMessage;
} catch (err) {
  // Fallback to console if logger module is not found
  logMessage = (level, message, botName = '') => {
    const prefix = botName ? `[${botName}] ` : '';
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${level}: ${prefix}${message}`);
  };
}

async function resetDataTables() {
  const connection = db.sequelize;
  let transaction;

  try {
    logMessage('INFO', 'Starting database reset operation');
    
    // Start transaction
    transaction = await connection.transaction();
    
    // Tables to preserve - using actual database table names
    const preserveTables = ['users', 'system_config', 'bots', 'api_config'];
    
    // Get all table names from the database
    const [results] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `, { transaction });
    
    // Filter out the tables we want to preserve
    const tablesToTruncate = results
      .map(row => row.table_name)
      .filter(tableName => !preserveTables.includes(tableName));
    
    // Disable foreign key constraints for the transaction
    await connection.query('SET CONSTRAINTS ALL DEFERRED', { transaction });
    
    // Truncate each table
    for (const tableName of tablesToTruncate) {
      logMessage('INFO', `Truncating table: ${tableName}`);
      await connection.query(`TRUNCATE TABLE "${tableName}" CASCADE`, { transaction });
    }
    
    // Commit transaction
    await transaction.commit();
    
    logMessage('INFO', 'Database reset completed successfully');
    logMessage('INFO', `Preserved tables: ${preserveTables.join(', ')}`);
    logMessage('INFO', `Truncated tables: ${tablesToTruncate.join(', ')}`);
    
    return {
      success: true,
      preservedTables: preserveTables,
      truncatedTables: tablesToTruncate
    };
  } catch (error) {
    // Rollback transaction on error
    if (transaction) await transaction.rollback();
    
    logMessage('ERROR', `Database reset failed: ${error.message}`);
    console.error('Stack trace:', error.stack);
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close connection
    await connection.close();
  }
}

// Execute if this script is run directly
if (require.main === module) {
  resetDataTables()
    .then(result => {
      if (result.success) {
        console.log('Database reset completed successfully');
        console.log(`Preserved tables: ${result.preservedTables.join(', ')}`);
        console.log(`Truncated tables: ${result.truncatedTables.join(', ')}`);
      } else {
        console.error(`Database reset failed: ${result.error}`);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Unexpected error:', err);
      process.exit(1);
    });
} else {
  // Export for use as a module
  module.exports = resetDataTables;
}
