/**
 * Simplified test runner - runs a single test and exits properly
 */
const Mocha = require('mocha');
const path = require('path');
const db = require('./src/models');

// Get test file and grep pattern from command line args
const args = process.argv.slice(2);
const testFile = args[0];
const grepPattern = args[1] ? args[1] : null;

// Create new mocha instance
const mocha = new Mocha({
  timeout: 10000,
  grep: grepPattern
});

// Add the test file
mocha.addFile(path.resolve(testFile));

// Run the tests
console.log(`Running test: ${testFile} ${grepPattern ? 'with pattern: ' + grepPattern : ''}`);

mocha.run(failures => {
  console.log(`Tests ${failures ? 'failed' : 'passed'}`);
  
  // Close DB connections
  if (db.sequelize) {
    db.sequelize.close().then(() => {
      console.log('DB connections closed');
      process.exit(failures ? 1 : 0);
    }).catch(err => {
      console.error('Error closing DB connection:', err);
      process.exit(1);
    });
  } else {
    process.exit(failures ? 1 : 0);
  }
});
