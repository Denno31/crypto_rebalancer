/**
 * Test runner script that properly closes database connections after tests complete
 */
const { execSync } = require('child_process');
const db = require('./src/models');

// Get command line arguments
const args = process.argv.slice(2);
const testCommand = args.length > 0 ? `npx mocha ${args.join(' ')}` : 'npx mocha test/services/**/*.test.js';

try {
  // Run the tests
  console.log(`Running: ${testCommand}`);
  execSync(testCommand, { stdio: 'inherit' });
  console.log('Tests completed');
} catch (error) {
  // Tests failed but we still need to close connections
  console.error('Tests failed with errors');
} finally {
  // Make sure to close database connections
  console.log('Closing database connections...');
  if (db.sequelize) {
    db.sequelize.close().then(() => {
      console.log('Database connections closed');
      process.exit(0);
    }).catch(err => {
      console.error('Error closing connections:', err);
      process.exit(1);
    });
  } else {
    console.log('No active sequelize connection to close');
    process.exit(0);
  }
}
