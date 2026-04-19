const Loan = require('../models/Loan');
const Borrower = require('../models/Borrower');
const LedgerEntry = require('../models/LedgerEntry');

// Helper: add all computed fields to a loan plain object
const withInterest = (loan) => {
  const obj = loan.toObject ? loan.toObject() : loan;
  const pa  = obj.principalAmount  || 0;
  const ti  = obj.totalInterest    || 0;
  const dur = obj.duration         || 0;

  if (ti > 0 && dur > 0) {
    // ── New model (fixed total interest) ──────────────────────────────────
    obj.interestAmount      = parseFloat((ti  / dur).toFixed(2));          // daily interest
    obj.dailyPrincipalAmount = parseFloat((pa  / dur).toFixed(2));          // daily principal
    obj.dailyAmount         = parseFloat(((pa + ti) / dur).toFixed(2));     // daily total
    obj.totalLoanAmount     = parseFloat((pa + ti).toFixed(2));             // total payable
    const totalPaid = (obj.totalPrincipalPaid || 0) + (obj.totalInterestPaid || 0);
    obj.remainingAmount     = parseFloat(Math.max(0, pa + ti - totalPaid).toFixed(2));
  } else {
    // ── Legacy model (rate %) ─────────────────────────────────────────────
    const rate = obj.interestRate || 0;
    const rem  = obj.remainingPrincipal || 0;
    if (obj.loanType === 'Daily') {
      obj.interestAmount = parseFloat(((rem * rate / 100) / 30).toFixed(2));
    } else {
      obj.interestAmount = parseFloat((rem * rate / 100).toFixed(2));
    }
    obj.dailyPrincipalAmount = 0;
    obj.dailyAmount          = obj.interestAmount;
    obj.totalLoanAmount      = pa;
    obj.remainingAmount      = obj.remainingPrincipal || 0;
  }
  return obj;
};

// @GET /api/loans
const getLoans = async (req, res) => {
  try {
    const { borrowerId, status, loanType, sortBy, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (loanType) query.loanType = loanType;

    // Search by borrower name
    if (search) {
      const matchingBorrowers = await Borrower.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id');
      query.borrower = { $in: matchingBorrowers.map(b => b._id) };
    }

    if (borrowerId) query.borrower = borrowerId;

    // Collector: only loans for their borrowers
    if (req.user.role === 'collector') {
      const myBorrowers = await Borrower.find({ assignedCollector: req.user._id }).select('_id');
      const myIds = myBorrowers.map(b => b._id);
      if (query.borrower && query.borrower.$in) {
        // Intersect
        const existing = query.borrower.$in.map(id => id.toString());
        query.borrower = { $in: myIds.filter(id => existing.includes(id.toString())) };
      } else if (!borrowerId) {
        query.borrower = { $in: myIds };
      }
    }

    // Sort logic
    let sort = { createdAt: -1 };
    if (sortBy === 'completionDate_asc') sort = { completionDate: 1, createdAt: -1 };
    else if (sortBy === 'completionDate_desc') sort = { completionDate: -1, createdAt: -1 };
    else if (sortBy === 'isDefault') sort = { isDefault: -1, createdAt: -1 };

    const total = await Loan.countDocuments(query);
    const loans = await Loan.find(query)
      .populate('borrower', 'name phone assignedCollector')
      .sort(sort)
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const loansWithInterest = loans.map(withInterest);

    res.json({
      success: true,
      data: loansWithInterest,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/loans
const createLoan = async (req, res) => {
  try {
    const {
      borrower, principalAmount, interestRate, totalInterest, startDate,
      duration, loanType, collectionPoint, isDefault,
      disbursementMode,   // legacy single-mode (backward compat)
      disbursements,      // new multi-account array [{ mode, amount, accountName }]
      notes
    } = req.body;

    const borrowerDoc = await Borrower.findById(borrower);
    if (!borrowerDoc) {
      return res.status(404).json({ success: false, message: 'Borrower not found' });
    }

    // ── Normalise disbursement items ─────────────────────────────────────────
    // Prefer new `disbursements` array; fall back to legacy single `disbursementMode`
    const disbursementItems = (() => {
      if (Array.isArray(disbursements) && disbursements.length > 0) {
        return disbursements
          .filter(d => d.mode && parseFloat(d.amount) > 0)
          .map(d => ({
            mode:        d.mode,
            amount:      parseFloat(d.amount),
            accountName: d.accountName || ''
          }));
      }
      if (disbursementMode) {
        return [{ mode: disbursementMode, amount: parseFloat(principalAmount), accountName: '' }];
      }
      return [];
    })();

    const loan = await Loan.create({
      borrower,
      principalAmount,
      remainingPrincipal: principalAmount,
      interestRate:     interestRate     || 0,
      totalInterest:    totalInterest    || 0,
      startDate:        startDate        || new Date(),
      duration,
      loanType:         loanType         || 'Daily',
      collectionPoint:  collectionPoint  || '',
      isDefault:        isDefault        || false,
      disbursementMode: disbursementMode || undefined,
      disbursements:    disbursementItems.length > 0 ? disbursementItems : undefined,
      notes
    });

    // ── Create one ledger DEBIT entry per disbursement source ────────────────
    for (const item of disbursementItems) {
      const accountLabel = item.mode === 'Online' && item.accountName
        ? `Online (${item.accountName})`
        : item.mode;
      await LedgerEntry.create({
        account:     item.mode,
        type:        'debit',
        amount:      item.amount,
        description: `Loan disbursed to ${borrowerDoc.name} [${loan.loanId}] via ${accountLabel}`,
        loanReference: loan._id,
        date:        loan.startDate || new Date()
      });
    }

    await loan.populate('borrower', 'name phone');
    res.status(201).json({ success: true, data: withInterest(loan) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @GET /api/loans/:id
const getLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('borrower', 'name phone address assignedCollector');

    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    res.json({ success: true, data: withInterest(loan) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/loans/:id
const updateLoan = async (req, res) => {
  try {
    const { interestRate, totalInterest, duration, status, collectionPoint, isDefault, notes, loanType } = req.body;

    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });

    // Update fields
    if (interestRate !== undefined) loan.interestRate = interestRate;
    if (totalInterest !== undefined) loan.totalInterest = totalInterest;
    if (duration !== undefined) loan.duration = duration;
    if (status !== undefined) loan.status = status;
    if (collectionPoint !== undefined) loan.collectionPoint = collectionPoint;
    if (isDefault !== undefined) loan.isDefault = isDefault;
    if (notes !== undefined) loan.notes = notes;
    if (loanType !== undefined) loan.loanType = loanType;

    await loan.save(); // triggers pre-save to recompute completionDate
    await loan.populate('borrower', 'name phone');

    res.json({ success: true, data: withInterest(loan) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @DELETE /api/loans/:id
const deleteLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }
    // Reverse disbursement ledger entry (if any)
    await LedgerEntry.deleteMany({ loanReference: req.params.id });
    await loan.deleteOne();
    res.json({ success: true, message: 'Loan deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getLoans, createLoan, getLoan, updateLoan, deleteLoan };
