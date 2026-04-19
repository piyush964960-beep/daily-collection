const express = require('express');
const router = express.Router();
const { getLedgerEntries, getLedgerBalances } = require('../controllers/ledgerController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/balances', getLedgerBalances);
router.get('/', getLedgerEntries);

module.exports = router;
