const db = require('../models');
const User = db.user;
const jwtUtils = require('../utils/jwt.utils');
const { validationResult } = require('express-validator');

exports.register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, password } = req.body;

    // Check if email already exists
    const emailExists = await User.findOne({ where: { email } });
    if (emailExists) {
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    // Check if username already exists
    const usernameExists = await User.findOne({ where: { username } });
    if (usernameExists) {
      return res.status(400).json({
        message: "Username already taken"
      });
    }

    // Create the new user
    const newUser = await User.create({
      email,
      username,
      password: User.hashPassword(password),
      isActive: true,
      isSuperuser: false
    });

    // Return the new user (without password)
    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      isActive: newUser.isActive,
      isSuperuser: newUser.isSuperuser,
      createdAt: newUser.createdAt
    });
  } catch (error) {
    console.error('Error in user registration:', error);
    return res.status(500).json({
      message: "Server error during registration",
      error: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('in login')
    const { username, password } = req.body;

    // Find user by username
    const user = await User.findOne({ where: { username } });
    console.log(user)
    
    // Check if user exists and password is valid
    if (!user || !user.verifyPassword(password)) {
      return res.status(401).json({
        message: "Incorrect username or password"
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        message: "User account is disabled"
      });
    }

    // Generate JWT token (30 minute expiry)
    const token = jwtUtils.generateToken(user);

    return res.json({
      access_token: token,
      token_type: "bearer"
    });
  } catch (error) {
    console.error('Error in user login:', error);
    return res.status(500).json({
      message: "Server error during login",
      error: error.message
    });
  }
};
