const express = require('express');
const router = express.Router();
const { getMonthlyReport, exportMonthlyReport } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/monthly', getMonthlyReport);
router.get('/monthly/export', exportMonthlyReport);

module.exports = router;
