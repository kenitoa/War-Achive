const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');

router.post('/register', loginLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
