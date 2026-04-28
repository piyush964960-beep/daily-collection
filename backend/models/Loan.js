const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  loanId: {
    type: String,
    unique: true
  },
  borrower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Borrower',
    required: [true, 'Borrower is required']
  },
  loanType: {
    type: String,
    enum: ['Daily', 'Monthly'],
    default: 'Daily'
  },
  principalAmount: {
    type: Number,
    required: [true, 'Principal amount is required'],
    min: [1, 'Principal must be positive']
  },
  remainingPrincipal: {
    type: Number,
    required: true
  },
  interestRate: {
    type: Number,
    min: [0, 'Interest rate cannot be negative'],
    default: 0
  },
  // Total fixed interest for the whole loan (new model)
  totalInterest: {
    type: Number,
    min: [0, 'Total interest cannot be negative'],
    default: 0
  },
  // Legacy single-mode disbursement (kept for backward compat)
  disbursementMode: {
    type: String,
    enum: ['Cash', 'Piyush', 'Sanjay', 'Online']
  },
  // Multi-account disbursements (new model — one entry per funding source)
  disbursements: [{
    mode: {
      type: String,
      enum: ['Cash', 'Piyush', 'Sanjay', 'Online'],
      required: true
    },
    amount: {
      type: Number,
      min: 0,
      required: true
    },
    accountName: {     // For Online mode — which account (e.g. "HDFC Savings")
      type: String,
      default: ''
    }
  }],
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    default: Date.now
  },
  completionDate: {
    type: Date
    // Auto-set to startDate + duration days for Daily loans; null for Monthly
  },
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: [1, 'Duration must be at least 1']
    // Number of installments. Total days = duration × emiFrequency
  },
  // Days between installments: 1=daily, 5=every-5-days, 7=weekly, 10=every-10-days, etc.
  emiFrequency: {
    type: Number,
    default: 1,
    min: [1, 'EMI frequency must be at least 1 day']
  },
  collectionPoint: {
    type: String,
    trim: true,
    default: ''
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Active', 'Closed'],
    default: 'Active'
  },
  totalInterestPaid: {
    type: Number,
    default: 0
  },
  totalPrincipalPaid: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  }
}, { timestamps: true });

// Auto-generate loanId and set completionDate
loanSchema.pre('save', async function(next) {
  if (!this.loanId) {
    // Use the highest existing loanId number (not count) so deletes never cause collisions
    const last = await mongoose.model('Loan').findOne({}, { loanId: 1 }).sort({ loanId: -1 }).lean();
    let nextNum = 1;
    if (last?.loanId) {
      const parsed = parseInt(last.loanId.replace('LN', ''), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    this.loanId = `LN${String(nextNum).padStart(5, '0')}`;
  }
  if (this.isNew) {
    this.remainingPrincipal = this.principalAmount;
  }
  // For Daily loans: completion = startDate + (duration × emiFrequency) days
  if (this.loanType === 'Daily' && this.startDate) {
    const d = new Date(this.startDate);
    const freq = this.emiFrequency || 1;
    d.setDate(d.getDate() + ((this.duration || 100) * freq));
    this.completionDate = d;
  } else {
    this.completionDate = undefined;
  }
  next();
});

// ── Virtuals ──────────────────────────────────────────────────────────────────

// Total loan amount = principal + total fixed interest
loanSchema.virtual('totalLoanAmount').get(function() {
  return parseFloat((this.principalAmount + (this.totalInterest || 0)).toFixed(2));
});

// Remaining total = (principal + totalInterest) - (totalPrincipalPaid + totalInterestPaid)
// For new model (totalInterest > 0): tracks combined remaining amount
// For legacy model: returns remainingPrincipal
loanSchema.virtual('remainingAmount').get(function() {
  if (this.totalInterest > 0) {
    const totalLoan = this.principalAmount + this.totalInterest;
    const totalPaid = (this.totalPrincipalPaid || 0) + (this.totalInterestPaid || 0);
    return parseFloat(Math.max(0, totalLoan - totalPaid).toFixed(2));
  }
  return parseFloat((this.remainingPrincipal || 0).toFixed(2));
});

// Daily interest amount (new model: fixed; legacy: rate-based)
loanSchema.virtual('interestAmount').get(function() {
  if (this.totalInterest > 0 && this.duration > 0) {
    return parseFloat((this.totalInterest / this.duration).toFixed(2));
  }
  if (this.loanType === 'Daily') {
    return parseFloat(((this.remainingPrincipal * this.interestRate / 100) / 30).toFixed(2));
  }
  return parseFloat((this.remainingPrincipal * this.interestRate / 100).toFixed(2));
});

// Daily principal amount (new model only)
loanSchema.virtual('dailyPrincipalAmount').get(function() {
  if (this.totalInterest > 0 && this.duration > 0) {
    return parseFloat((this.principalAmount / this.duration).toFixed(2));
  }
  return 0;
});

// Daily total payment (interest + principal per day)
loanSchema.virtual('dailyAmount').get(function() {
  if (this.totalInterest > 0 && this.duration > 0) {
    return parseFloat(((this.principalAmount + this.totalInterest) / this.duration).toFixed(2));
  }
  return this.interestAmount; // legacy: only interest tracked per day
});

loanSchema.set('toJSON', { virtuals: true });
loanSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Loan', loanSchema);
