const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const auth = require('../middleware/auth');

// GET /api/data/:category/:id
router.get('/:category/:id', dataController.getData);

module.exports = router;
