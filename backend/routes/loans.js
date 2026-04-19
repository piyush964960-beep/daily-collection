const express = require('express');
const router = express.Router();
const { getLoans, createLoan, getLoan, updateLoan, deleteLoan } = require('../controllers/loanController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

router.use(protect);
router.get('/', getLoans);
router.post('/', adminOnly, createLoan);
router.get('/:id', getLoan);
router.put('/:id', adminOnly, updateLoan);
router.delete('/:id', adminOnly, deleteLoan);

module.exports = router;
