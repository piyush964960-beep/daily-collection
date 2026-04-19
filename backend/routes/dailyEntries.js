const express = require('express');
const router = express.Router();
const {
  getDailyEntries, createDailyEntry, getDailyEntry, deleteDailyEntry,
  getBorrowerTable, getDailyReport, getBorrowerHistory
} = require('../controllers/dailyEntryController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

router.use(protect);

// Special routes BEFORE :id param routes
router.get('/borrower-table', getBorrowerTable);
router.get('/daily-report', getDailyReport);
router.get('/borrower-history/:borrowerId', getBorrowerHistory);

// Standard CRUD
router.get('/', getDailyEntries);
router.post('/', createDailyEntry);
router.get('/:id', getDailyEntry);
router.delete('/:id', adminOnly, deleteDailyEntry);

module.exports = router;
