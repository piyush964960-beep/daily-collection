const express = require('express');
const router = express.Router();
const { register, login, getMe, getCollectors } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/collectors', protect, getCollectors);

module.exports = router;
