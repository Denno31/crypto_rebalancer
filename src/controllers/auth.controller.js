const db = require('../models');
const User = db.user;
const jwtUtils = require('../utils/jwt.utils');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  host: 'mail.microplustechnologies.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: 'support@microplustechnologies.com',
    pass: process.env.FROM_EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  }
});

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
    const { username, password } = req.body;

    // Find user by username
    const user = await User.findOne({ where: { username } });
    
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

// Request a password reset
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email exists
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(404).json({
        message: "No user found with that email address"
      });
    }

    // Generate a random token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Store the token and expiration time (1 hour)
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
    await user.save();
    
    // Prepare reset link and email content
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5174'}/reset-password/${resetToken}`;
    
    // Configure email options
    const mailOptions = {
      from: '"Crypto Rebalancer" <support@microplustechnologies.com>',
      to: user.email,
      subject: 'Password Reset Request',
      text: `Hello ${user.username},\n\nYou requested a password reset for your Crypto Rebalancer account.\n\nClick the link below to reset your password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you did not request a password reset, please ignore this email.\n\nRegards,\nThe Crypto Rebalancer Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4a5568;">Password Reset Request</h2>
          <p>Hello ${user.username},</p>
          <p>You requested a password reset for your Crypto Rebalancer account.</p>
          <p>Click the button below to reset your password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #3182ce; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you did not request a password reset, please ignore this email.</p>
          <p>Regards,<br>The Crypto Rebalancer Team</p>
        </div>
      `
    };
    
    // Send the email
    await transporter.sendMail(mailOptions);
    
    // Log success (for debugging)
    console.log(`Reset email sent to ${user.email}. Reset link: ${resetLink}`);
    
    return res.json({
      message: "Password reset link sent",
      // Only include the token in development mode
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (error) {
    console.error('Error in password reset request:', error);
    return res.status(500).json({
      message: "Server error during password reset request",
      error: error.message
    });
  }
};

// Reset password with token
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    
    // Find user with this token and ensure it hasn't expired
    const user = await User.findOne({ 
      where: { 
        resetToken: token,
        resetTokenExpiry: { [db.Sequelize.Op.gt]: new Date() } // Token expiry should be greater than now
      }
    });
    
    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired password reset token"
      });
    }
    
    // Update password and clear token
    user.password = User.hashPassword(password);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();
    
    return res.json({
      message: "Password has been reset successfully"
    });
  } catch (error) {
    console.error('Error in password reset:', error);
    return res.status(500).json({
      message: "Server error during password reset",
      error: error.message
    });
  }
};
