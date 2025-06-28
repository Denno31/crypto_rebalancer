// This configuration supports both individual DB params and a DATABASE_URL string (for Render.com)
let config = {
  dialect: "postgres",
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

// If DATABASE_URL environment variable is provided (as in Render.com), use it
if (process.env.DATABASE_URL) {
  config.url = process.env.DATABASE_URL;
  // SSL is required in production
  if (process.env.NODE_ENV === 'production') {
    config.dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false // Required for Render PostgreSQL
      }
    };
  }
} else {
  // Otherwise use individual connection parameters
  config.HOST = process.env.DB_HOST || "localhost";
  config.USER = process.env.DB_USER || "postgres";
  config.PASSWORD = process.env.DB_PASSWORD || "dennis";
  config.DB = process.env.DB_NAME || "crypto_rebalancer";
}

module.exports = config;
