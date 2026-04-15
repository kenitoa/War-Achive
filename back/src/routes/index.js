const express = require('express');
const router = express.Router();
const { apiLimiter } = require('../middleware/rateLimiter');

const authRoutes = require('./auth');
const userRoutes = require('./users');
const dataRoutes = require('./data');

router.use(apiLimiter);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/data', dataRoutes);

module.exports = router;
