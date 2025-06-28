const express = require('express');
const accountController = require('../controllers/account.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware.verifyToken);

// Account routes
router.get('/', accountController.getAccounts);

module.exports = router;
