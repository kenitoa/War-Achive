const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const { validateRegister, validateLogin } = require('../middleware/validator');

// POST /api/auth/register
router.post('/register', rateLimiter, validateRegister, authController.register);

// POST /api/auth/login
router.post('/login', rateLimiter, validateLogin, authController.login);

// POST /api/auth/refresh
router.post('/refresh', authController.refresh);

// DELETE /api/auth/delete
router.delete('/delete', auth, authController.deleteAccount);

module.exports = router;
