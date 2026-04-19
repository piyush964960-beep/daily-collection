const express = require('express');
const router = express.Router();
const { getBorrowers, createBorrower, getBorrower, updateBorrower, deleteBorrower } = require('../controllers/borrowerController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');

router.use(protect);
router.get('/', getBorrowers);
router.post('/', adminOnly, createBorrower);
router.get('/:id', getBorrower);
router.put('/:id', adminOnly, updateBorrower);
router.delete('/:id', adminOnly, deleteBorrower);

module.exports = router;
