// Enhanced configuration to support multiple deployment environments including Digital Ocean
let config = {
  dialect: "postgres",
  pool: {
    max: 5,
    min: 0,
    acquire: 60000, // Increased from 30000 to allow more time for connection establishment
    idle: 10000
  },
  retry: {
    max: 5, // Number of connection retry attempts
    timeout: 3000 // Time between retries in ms
  }
};

// Digital Ocean managed databases use port 25060, not the standard 5432
const DIGITAL_OCEAN_PORT = 25060;

// Check for environment variables
console.log('DB Config - Environment Check:', {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? '[SET]' : '[NOT SET]',
  DB_HOST: process.env.DB_HOST || '[NOT SET]'
});

// If DATABASE_URL environment variable is provided, use it
if (process.env.DATABASE_URL) {
  config.url = process.env.DATABASE_URL;
  console.log('Using database URL connection string');
  
  // SSL is required in production for most cloud providers
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SSL === 'true') {
    console.log('Enabling SSL for database connection');
    config.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false // Required for many cloud PostgreSQL providers
      }
    };
  }
} else {
  // Use individual connection parameters
  config.HOST = process.env.DB_HOST || "localhost";
  config.USER = process.env.DB_USER || "postgres";
  config.PASSWORD = process.env.DB_PASSWORD || "dennis";
  config.DB = process.env.DB_NAME || "crypto_rebalancer";
  
  // Check if this is a Digital Ocean database
  if (process.env.DB_HOST?.includes('digitalocean.com')) {
    console.log('Digital Ocean database detected - using port 25060');
    config.PORT = DIGITAL_OCEAN_PORT;
    
    // Create a connection URL for Digital Ocean
    const host = process.env.DB_HOST;
    const database = process.env.DB_NAME;
    const username = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    config.url = `postgres://${username}:${password}@${host}:${DIGITAL_OCEAN_PORT}/${database}`;
    console.log(`Using connection string with host: ${host} and port: ${DIGITAL_OCEAN_PORT}`);
  }
  
  // Enable SSL for cloud providers
  if (
    process.env.NODE_ENV === 'production' || 
    process.env.ENABLE_SSL === 'true' ||
    process.env.DB_HOST?.includes('digitalocean.com') ||
    process.env.DB_HOST?.match(/\d+\.\d+\.\d+\.\d+/) // IP address pattern
  ) {
    console.log('Detected possible cloud host - enabling SSL');
    config.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    };
  }
}

module.exports = config;
