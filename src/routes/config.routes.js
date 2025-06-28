const express = require('express');
const configController = require('../controllers/config.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware.verifyToken);

// API Config routes
router.get('/api', configController.getApiConfigs);
router.put('/api/:name', configController.updateApiConfig);

// System Config routes
router.get('/system', configController.getSystemConfig);
router.put('/system', configController.updateSystemConfig);

module.exports = router;
