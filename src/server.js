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

// Import database
const db = require('./models');

// Initialize Express app
const app = express();

// Set port
const PORT = process.env.PORT || 3000;

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

// Start server without attempting to sync the database schema
// We're connecting to an existing database, so we won't attempt to modify the schema
console.log('Starting server without database synchronization');

// Just authenticate to check the connection
db.sequelize.authenticate()
  .then(() => {
    console.log('Database connection established successfully');
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
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
