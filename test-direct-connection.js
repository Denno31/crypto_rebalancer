// Direct database connection test using connection string
require('dotenv').config();
const { Sequelize } = require('sequelize');

// Create connection string from individual parameters
const host = process.env.DB_HOST;
const database = process.env.DB_NAME;
const username = process.env.DB_USER;
const password = process.env.DB_PASSWORD;

// Build the connection string
const connectionString = `postgres://${username}:${password}@${host}:25060/${database}`;
console.log('Using connection string (redacted password):');
console.log(connectionString.replace(password, '********'));

// Create Sequelize instance with direct connection string
const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: console.log,
  retry: {
    max: 3
  }
});

// Test the connection
async function testConnection() {
  try {
    console.log('\nAttempting to connect to database...');
    await sequelize.authenticate();
    console.log('Connection successful!');
    
    // Try a simple query
    const result = await sequelize.query('SELECT NOW() as time');
    console.log('Database time:', result[0][0].time);
    
    return true;
  } catch (error) {
    console.error('Connection failed:', error);
    return false;
  } finally {
    await sequelize.close();
  }
}

testConnection()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
