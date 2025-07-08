module.exports = {
  apps: [{
    name: "crypto-rebalancer-api",
    script: "./src/server.js",
    env: {
      NODE_ENV: "development",
      // Environment variables will be loaded from .env file with --env-from-file option
      // or can be defined here for development environment
    },
    env_production: {
      NODE_ENV: "production",
      // Production-specific variables can be defined here
    }
  },
  {
    name: "crypto-rebalancer-bot",
    script: "./src/scripts/runBot.js",
    env: {
      NODE_ENV: "development",
      // Environment variables will be loaded from .env file with --env-from-file option
      // or can be defined here for development environment
    },
    env_production: {
      NODE_ENV: "production",
      // Production-specific variables can be defined here
    },
    // Bot-specific settings
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    // Log configuration
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}
