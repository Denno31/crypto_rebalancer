const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.user;

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: "Unauthorized: No auth token provided"
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.sub; // Using 'sub' claim for user ID
    req.username = decoded.username;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized: Invalid token"
    });
  }
};

const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (!user.isSuperuser) {
      return res.status(403).json({
        message: "Require Admin Role!"
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      message: "Unable to validate user role",
      error: error.message
    });
  }
};

const authMiddleware = {
  verifyToken,
  isAdmin
};

module.exports = authMiddleware;
