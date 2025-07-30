const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const botRoutes = require('./routes/bot.routes');
const configRoutes = require('./routes/config.routes');
const accountRoutes = require('./routes/account.routes');
const deviationRoutes = require('./routes/deviation.routes');
const coinRoutes = require('./routes/coins.routes');
const snapshotRoutes = require('./routes/snapshot.routes');
const tradeRoutes = require('./routes/trade.routes');

// Import database
const db = require('./models');

// Initialize Express app
const app = express();

// Set port - Digital Ocean typically provides a PORT environment variable
// For local development, use 3000, but cloud platforms will specify their own
const PORT = process.env.PORT || 3000;
console.log(`Server configured to use port: ${PORT}`);

// For deployment platforms that might need this info
const HOST = process.env.HOST || '0.0.0.0'; // Use 0.0.0.0 to bind to all available network interfaces

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Crypto Rebalancer API' });
});

// Routes
app.use('/api', authRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/config', configRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/deviations', deviationRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/trades', tradeRoutes);

// Start server without attempting to sync the database schema
// We're connecting to an existing database, so we won't attempt to modify the schema
console.log('Starting server without database synchronization');

// Just authenticate to check the connection
db.sequelize.authenticate()
  .then(() => {
    console.log('Database connection established successfully');
    
    app.listen(PORT, HOST, () => {
      console.log(`Server is running on ${HOST}:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to database:', err);
  });
  
// Note: For schema changes, use the migration tool:
// npm run migrate

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
