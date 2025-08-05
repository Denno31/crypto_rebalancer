const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// Register new user
router.post(
  '/register',
  [
    // Validation middleware
    body('email').isEmail().withMessage('Must be a valid email address'),
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters long'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  authController.register
);

// Login route
router.post(
  '/token',
  [
    // Validation middleware
    body('username').not().isEmpty().withMessage('Username is required'),
    body('password').not().isEmpty().withMessage('Password is required')
  ],
  authController.login
);

// Request password reset route
router.post(
  '/password-reset-request',
  [
    // Validation middleware
    body('email').isEmail().withMessage('Must be a valid email address')
  ],
  authController.requestPasswordReset
);

// Reset password with token route
router.post(
  '/password-reset',
  [
    // Validation middleware
    body('token').not().isEmpty().withMessage('Token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  authController.resetPassword
);

module.exports = router;
