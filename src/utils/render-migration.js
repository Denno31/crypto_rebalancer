// Script for running database migrations on Render deployment
const { execSync } = require('child_process');
const db = require('../models');

async function runMigrations() {
  try {
    console.log('Checking database connection...');
    await db.sequelize.authenticate();
    console.log('Database connection established successfully');
    
    // Run migrations in sequence
    console.log('Running migrations...');
    try {
      console.log('Running base migration...');
      require('./migrate');
      
      console.log('Running foreign keys migration...');
      require('./migrate-foreign-keys');
      
      console.log('Running price source migration...');
      require('./migrate-price-source');
      
      console.log('Running price history migration...');
      require('./migrate-price-history');
      
      console.log('All migrations completed successfully');
    } catch (migrateError) {
      console.error('Error during migrations:', migrateError);
      throw migrateError;
    }
  } catch (error) {
    console.error('Error in migration process:', error);
    process.exit(1);
  }
}

// Only run directly (not when imported)
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
