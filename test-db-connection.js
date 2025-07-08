// Database connection test script
require('dotenv').config();
const { Sequelize } = require('sequelize');

// Log all environment variables related to database connection
console.log('=== ENVIRONMENT VARIABLES ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '[SET]' : '[NOT SET]');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]');

// Create connection configuration
const config = {
  host: process.env.DB_HOST,
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: console.log, // Enable logging to see SQL queries
  retry: {
    max: 3,
    match: [
      /ETIMEDOUT/,
      /EHOSTUNREACH/,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/
    ]
  }
};

console.log('\n=== CONNECTION CONFIG ===');
console.log('Host:', config.host);
console.log('SSL Enabled:', !!config.dialectOptions?.ssl);
console.log('Max Retries:', config.retry.max);

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  config
);

// Test the connection
async function testConnection() {
  try {
    console.log('\n=== TESTING CONNECTION ===');
    console.log('Attempting to connect to database...');
    
    await sequelize.authenticate();
    
    console.log('Connection has been established successfully.');
    
    // Try a simple query
    console.log('\n=== RUNNING TEST QUERY ===');
    const result = await sequelize.query('SELECT NOW() as time');
    console.log('Database time:', result[0][0].time);
    
    return true;
  } catch (error) {
    console.error('\n=== CONNECTION ERROR ===');
    console.error('Unable to connect to the database:', error);
    
    // Show more details about the error
    if (error.parent) {
      console.error('\nError details:');
      console.error('Code:', error.parent.code);
      console.error('Errno:', error.parent.errno);
      console.error('Address:', error.parent.address);
      console.error('Port:', error.parent.port);
    }
    
    return false;
  } finally {
    // Close connection
    await sequelize.close();
  }
}

// Run the test
testConnection()
  .then(success => {
    console.log('\n=== TEST COMPLETE ===');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
    process.exit(1);
  });
