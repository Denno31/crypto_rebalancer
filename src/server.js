const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cluster = require('cluster');
const os = require('os');

// Load environment variables
dotenv.config();

// Import database
const db = require('./models');

// Number of CPU cores
const numCPUs = os.cpus().length;

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  console.log(`Starting ${numCPUs} workers...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Restart a worker if it dies
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Starting a new one...`);
    cluster.fork();
  });

} else {
  // Workers share the TCP connection

  // Initialize Express app
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Crypto Rebalancer API' });
  });

  app.use('/api', require('./routes/auth.routes'));
  app.use('/api/bots', require('./routes/bot.routes'));
  app.use('/api/config', require('./routes/config.routes'));
  app.use('/api/accounts', require('./routes/account.routes'));
  app.use('/api/deviations', require('./routes/deviation.routes'));
  app.use('/api/coins', require('./routes/coins.routes'));
  app.use('/api/snapshots', require('./routes/snapshot.routes'));
  app.use('/api/trades', require('./routes/trade.routes'));
  app.use('/api/dashboard', require('./routes/dashboard.routes'));

  // DB connection check
  db.sequelize.authenticate()
    .then(() => {
      console.log(`Worker ${process.pid} connected to DB`);

      app.listen(PORT, HOST, () => {
        console.log(`Worker ${process.pid} running on ${HOST}:${PORT}`);
      });
    })
    .catch(err => {
      console.error(`Worker ${process.pid} failed to connect to DB:`, err);
    });

  // Error handling
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
}
