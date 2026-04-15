const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/:category', authenticate, dataController.getCategory);
router.get('/:category/:id', authenticate, dataController.getItem);
router.post('/:category', authenticate, authorize('editor', 'admin'), dataController.createItem);

module.exports = router;
