// Script to apply the enhanced swap logic migration directly using the project's DB configuration
const db = require('./src/models');
const Sequelize = db.Sequelize;
const queryInterface = db.sequelize.getQueryInterface();
const migration = require('./migrations/20250710_enhanced_swap_logic');

async function runMigration() {
  console.log('Starting migration for enhanced swap logic...');
  
  try {
    // Run the migration's "up" function
    await migration.up(queryInterface, Sequelize);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error.message);
    console.error(error.stack);
  } finally {
    // Close the database connection
    await db.sequelize.close();
    console.log('Database connection closed');
  }
}

// Run the migration
runMigration();
