const jwt = require('jsonwebtoken');

/**
 * Generate a JWT access token
 * @param {Object} userData - User data to include in the token
 * @param {Number} expiresIn - Token expiry time in seconds
 * @returns {String} JWT token
 */
const generateToken = (userData, expiresIn = 2592000) => { // Default to 30 days (1 month)
  return jwt.sign(
    {
      sub: userData.id,
      username: userData.username
    },
    process.env.JWT_SECRET,
    {
      expiresIn: expiresIn
    }
  );
};

module.exports = {
  generateToken
};
