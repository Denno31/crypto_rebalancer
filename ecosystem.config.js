// Load environment variables from .env file
require('dotenv').config();
// Convert environment variables to an object
const envVars = Object.keys(process.env).reduce((env, key) => {
  env[key] = process.env[key];
  return env;
}, {});

module.exports = {
  apps: [{
    name: "crypto-rebalancer-api",
    script: "./src/server.js",
    env: {
      NODE_ENV: "development",
      ...envVars  // Spread all environment variables
    },
    env_production: {
      NODE_ENV: "production"
      // Production variables will be loaded at runtime
    }
  },
  {
    name: "crypto-rebalancer-bot",
    script: "./src/scripts/runBot.js",
    env: {
      NODE_ENV: "development",
      ...envVars  // Spread all environment variables 
    },
    env_production: {
      NODE_ENV: "production"
      // Production variables will be loaded at runtime
    },
    // Bot-specific settings
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    // Log configuration
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}
