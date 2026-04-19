const mongoose = require('mongoose');

const paymentItemSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['Cash', 'Piyush', 'Sanjay', 'Online'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  accountName: {
    // For Online payments: capture the account holder name
    type: String,
    trim: true,
    default: ''
  }
}, { _id: false });

const dailyEntrySchema = new mongoose.Schema({
  borrower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Borrower',
    required: [true, 'Borrower is required']
  },
  loan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: [true, 'Loan is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  },
  amountPaid: {
    // Total of all payment items
    type: Number,
    required: true,
    min: [0.01, 'Amount must be positive']
  },
  interestPortion: {
    type: Number,
    required: true,
    default: 0
  },
  principalPortion: {
    type: Number,
    required: true,
    default: 0
  },
  // Legacy single mode — kept for backward compat; derived from payments[0].mode
  mode: {
    type: String,
    enum: ['Cash', 'Piyush', 'Sanjay', 'Online'],
    default: 'Cash'
  },
  // NEW: split payments across multiple modes
  payments: {
    type: [paymentItemSchema],
    default: []
  },
  collectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Collector is required']
  },
  notes: {
    type: String,
    trim: true
  }
}, { timestamps: true });

dailyEntrySchema.index({ borrower: 1, date: 1 });
dailyEntrySchema.index({ loan: 1, date: 1 });
dailyEntrySchema.index({ date: 1 });

module.exports = mongoose.model('DailyEntry', dailyEntrySchema);
