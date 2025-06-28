# Crypto Rebalancer (Node.js)

A Node.js implementation of the Crypto Portfolio Rebalancer, migrated from the original Python version. This application provides an API for managing cryptocurrency trading bots that automatically rebalance portfolios based on price movements and configurable thresholds.

## Features

- User authentication and authorization with JWT
- Bot management (CRUD operations)
- Integration with 3Commas API for trading
- Price history tracking
- Trade execution and logging
- Global profit protection
- System and API configuration
- Database migrations

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- 3Commas account with API key and secret

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create .env file with the following variables:
   ```
   PORT=3000
   NODE_ENV=development
   DB_HOST=localhost
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=crypto_rebalancer
   JWT_SECRET=your_jwt_secret
   CORS_ORIGINS=http://localhost:3000,http://localhost:5000
   ```

## Database Setup

1. Create the PostgreSQL database:
   ```sql
   CREATE DATABASE crypto_rebalancer;
   ```
2. Run the database migrations:
   ```
   npm run migrate
   ```

## Running the Application

### Development Mode

```
npm run dev
```

### Production Mode

```
npm start
```

## API Endpoints

### Authentication
- `POST /api/register`: Register a new user
- `POST /api/token`: Login and get access token

### Bot Management
- `GET /api/bots`: Get all bots
- `POST /api/bots`: Create a new bot
- `GET /api/bots/:botId`: Get a specific bot
- `PUT /api/bots/:botId`: Update a bot
- `DELETE /api/bots/:botId`: Delete a bot
- `POST /api/bots/:botId/toggle`: Toggle bot on/off
- `GET /api/bots/:botId/state`: Get bot state
- `GET /api/bots/:botId/prices`: Get bot price history
- `GET /api/bots/:botId/trades`: Get bot trades
- `GET /api/bots/:botId/logs`: Get bot logs

### Configuration
- `GET /api/config/api`: Get API configurations
- `PUT /api/config/api/:name`: Update API configuration
- `GET /api/config/system`: Get system configuration
- `PUT /api/config/system`: Update system configuration

### Account Management
- `GET /api/accounts`: Get trading accounts

## Database Schema

The application uses the following main models:

- **User**: User accounts with authentication
- **Bot**: Trading bot configurations and state
- **ApiConfig**: API connection settings
- **PriceHistory**: Historical price data
- **Trade**: Executed trades
- **LogEntry**: System and bot logs
- **SystemConfig**: Application configuration
- **CoinUnitTracker**: Track coin units over time
- **CoinSnapshot**: Snapshots of coin data

## Error Handling

The application includes comprehensive error handling with appropriate HTTP status codes and messages. All database operations are wrapped in try/catch blocks with error logging.

## Security

- Password hashing with bcrypt
- JWT authentication for API endpoints
- User ownership checks for all resources
- Environment variable configuration

## Migration Notes

This project is a Node.js port of the original Python implementation using:
- Express.js instead of FastAPI
- Sequelize ORM instead of SQLAlchemy
- JWT authentication similar to the Python version
- Database schema matching the original application

## License

ISC
