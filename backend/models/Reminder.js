const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  borrower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Borrower',
    required: [true, 'Borrower is required']
  },
  loan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan'
  },
  title: {
    type: String,
    trim: true,
    default: 'Payment Reminder'
  },
  message: {
    type: String,
    trim: true,
    default: ''
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  amount: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Done'],
    default: 'Pending'
  },
  completedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

reminderSchema.index({ status: 1, dueDate: 1 });
reminderSchema.index({ borrower: 1, status: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
