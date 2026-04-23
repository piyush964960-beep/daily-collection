const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  txType: {
    type: String,
    enum: ['expense', 'profit_takeoff', 'extra_income'],
    required: [true, 'Transaction type is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  account: {
    type: String,
    enum: ['Cash', 'Piyush', 'Sanjay', 'Online'],
    required: [true, 'Account is required']
  },
  accountName: { type: String, default: '' },   // for Online
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be positive']
  },
  description: { type: String, trim: true, default: '' },
  date: { type: Date, required: true, default: Date.now },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Linked ledger entry — one-to-one so we can reverse on delete/edit
  ledgerRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LedgerEntry'
  }
}, { timestamps: true });

transactionSchema.index({ txType: 1, date: -1 });
transactionSchema.index({ account: 1, date: -1 });
transactionSchema.index({ createdBy: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
