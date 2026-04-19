const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  account: {
    type: String,
    enum: ['Cash', 'Piyush', 'Sanjay', 'Online'],
    required: [true, 'Account is required']
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: [true, 'Transaction type is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be positive']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  reference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DailyEntry'
  },
  // For loan disbursement debit entries
  loanReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan'
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  }
}, { timestamps: true });

ledgerEntrySchema.index({ account: 1, date: 1 });
ledgerEntrySchema.index({ loanReference: 1 }, { sparse: true });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
