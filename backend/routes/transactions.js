const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  getTransactions, createTransaction, updateTransaction, deleteTransaction
} = require('../controllers/transactionController');

router.use(protect);

router.get('/',    getTransactions);
router.post('/',   createTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;
