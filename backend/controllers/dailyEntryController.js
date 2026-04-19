const DailyEntry = require('../models/DailyEntry');
const Loan = require('../models/Loan');
const Borrower = require('../models/Borrower');
const LedgerEntry = require('../models/LedgerEntry');

// ── Payment Split Logic ────────────────────────────────────────────────────────
//
// NEW MODEL  (totalInterest > 0):  Proportional split
//   dailyInterest  = totalInterest / duration
//   dailyPrincipal = principalAmount / duration
//   dailyTotal     = dailyInterest + dailyPrincipal
//   interestPortion  = (dailyInterest / dailyTotal) × amountPaid
//   principalPortion = amountPaid − interestPortion
//
// LEGACY MODEL (interestRate %):  Interest-first split
//   dailyInterest    = (remainingPrincipal × rate/100) / 30
//   interestPortion  = min(dailyInterest, amountPaid)
//   principalPortion = max(0, amountPaid − interestPortion)
//
const calculateSplit = (loan, amountPaid) => {
  if (loan.totalInterest > 0 && loan.duration > 0) {
    // ── Proportional split (new model) ──
    const dailyInterest  = loan.totalInterest  / loan.duration;
    const dailyPrincipal = loan.principalAmount / loan.duration;
    const dailyTotal     = dailyInterest + dailyPrincipal;

    const ratio = dailyTotal > 0 ? dailyInterest / dailyTotal : 0;
    let interestPortion  = parseFloat((amountPaid * ratio).toFixed(2));
    let principalPortion = parseFloat((amountPaid - interestPortion).toFixed(2));

    // Cap at what is still outstanding
    const remainingInterest = Math.max(0, loan.totalInterest - (loan.totalInterestPaid || 0));
    interestPortion  = Math.min(interestPortion,  remainingInterest);
    principalPortion = Math.min(principalPortion, Math.max(0, loan.remainingPrincipal));

    return {
      interestPortion:  parseFloat(interestPortion.toFixed(2)),
      principalPortion: parseFloat(principalPortion.toFixed(2))
    };
  }

  // ── Interest-first split (legacy model) ──
  const dailyInterest  = (loan.remainingPrincipal * (loan.interestRate || 0) / 100) / 30;
  let interestPortion  = Math.min(dailyInterest, amountPaid);
  let principalPortion = Math.max(0, amountPaid - interestPortion);
  principalPortion = Math.min(principalPortion, loan.remainingPrincipal);

  return {
    interestPortion:  parseFloat(interestPortion.toFixed(2)),
    principalPortion: parseFloat(principalPortion.toFixed(2))
  };
};

// Normalize account name for ledger
const getLedgerAccount = (mode) => {
  if (['Cash', 'Piyush', 'Sanjay', 'Online'].includes(mode)) return mode;
  return 'Cash';
};

// ── @GET /api/daily-entries/borrower-table?date=YYYY-MM-DD ─────────────────────
const getBorrowerTable = async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr); startOfDay.setHours(0,  0,  0,   0);
    const endOfDay   = new Date(dateStr); endOfDay.setHours(23, 59, 59, 999);

    // Build loan query
    const loanQuery = { status: 'Active' };
    if (req.user.role === 'collector') {
      const myBorrowers = await Borrower.find({ assignedCollector: req.user._id }).select('_id');
      loanQuery.borrower = { $in: myBorrowers.map(b => b._id) };
    }

    const loans = await Loan.find(loanQuery)
      .populate({
        path: 'borrower',
        select: 'name phone assignedCollector',
        populate: { path: 'assignedCollector', select: 'name' }
      })
      .sort({ createdAt: 1 });

    // Fetch today's entries
    const loanIds = loans.map(l => l._id);
    const todayEntries = await DailyEntry.find({
      loan: { $in: loanIds },
      date: { $gte: startOfDay, $lte: endOfDay }
    }).populate('collectedBy', 'name');

    const entryMap = {};
    todayEntries.forEach(e => { entryMap[e.loan.toString()] = e; });

    const tableData = loans.map(loan => {
      const hasNewModel = loan.totalInterest > 0 && loan.duration > 0;

      // ── Per-day amounts ──────────────────────────────────────────────────
      const dailyInterestAmount = hasNewModel
        ? parseFloat((loan.totalInterest  / loan.duration).toFixed(2))
        : parseFloat(((loan.remainingPrincipal * (loan.interestRate || 0) / 100) / 30).toFixed(2));

      const dailyPrincipalAmount = hasNewModel
        ? parseFloat((loan.principalAmount / loan.duration).toFixed(2))
        : 0;

      const dailyAmount = parseFloat((dailyInterestAmount + dailyPrincipalAmount).toFixed(2));

      // ── Remaining amount ─────────────────────────────────────────────────
      const totalPaid  = (loan.totalPrincipalPaid || 0) + (loan.totalInterestPaid || 0);
      const remainingAmount = hasNewModel
        ? parseFloat(Math.max(0, loan.principalAmount + loan.totalInterest - totalPaid).toFixed(2))
        : parseFloat((loan.remainingPrincipal || 0).toFixed(2));

      return {
        borrower: loan.borrower,
        loan: {
          _id:               loan._id,
          loanId:            loan.loanId,
          loanType:          loan.loanType,
          principalAmount:   loan.principalAmount,
          totalInterest:     loan.totalInterest  || 0,
          totalLoanAmount:   loan.principalAmount + (loan.totalInterest || 0),
          remainingPrincipal: loan.remainingPrincipal,
          remainingAmount,
          totalPrincipalPaid: loan.totalPrincipalPaid || 0,
          totalInterestPaid:  loan.totalInterestPaid  || 0,
          interestRate:       loan.interestRate || 0,
          duration:           loan.duration,
          collectionPoint:    loan.collectionPoint,
          completionDate:     loan.completionDate
        },
        dailyInterestAmount,
        dailyPrincipalAmount,
        dailyAmount,
        remainingAmount,
        todayEntry: entryMap[loan._id.toString()] || null
      };
    });

    res.json({ success: true, data: tableData, date: dateStr });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── @GET /api/daily-entries/daily-report?date=YYYY-MM-DD ───────────────────────
const getDailyReport = async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateStr); startOfDay.setHours(0,  0,  0,   0);
    const endOfDay   = new Date(dateStr); endOfDay.setHours(23, 59, 59, 999);

    const query = { date: { $gte: startOfDay, $lte: endOfDay } };
    if (req.user.role === 'collector') query.collectedBy = req.user._id;

    const entries = await DailyEntry.find(query)
      .populate('borrower', 'name')
      .populate('loan', 'loanId');

    let totalAmount = 0, totalInterest = 0, totalPrincipal = 0;
    const accountBreakdown = { Cash: 0, Piyush: 0, Sanjay: 0, Online: 0 };
    const onlineDetails = {};

    entries.forEach(e => {
      totalAmount    += e.amountPaid;
      totalInterest  += e.interestPortion;
      totalPrincipal += e.principalPortion;

      if (e.payments && e.payments.length > 0) {
        e.payments.forEach(p => {
          const acc = getLedgerAccount(p.mode);
          accountBreakdown[acc] = (accountBreakdown[acc] || 0) + p.amount;
          if (p.mode === 'Online' && p.accountName) {
            onlineDetails[p.accountName] = (onlineDetails[p.accountName] || 0) + p.amount;
          }
        });
      } else {
        const acc = getLedgerAccount(e.mode);
        accountBreakdown[acc] = (accountBreakdown[acc] || 0) + e.amountPaid;
      }
    });

    res.json({
      success: true,
      data: {
        date: dateStr,
        totalEntries: entries.length,
        totalAmount:    parseFloat(totalAmount.toFixed(2)),
        totalInterest:  parseFloat(totalInterest.toFixed(2)),
        totalPrincipal: parseFloat(totalPrincipal.toFixed(2)),
        accountBreakdown: Object.fromEntries(
          Object.entries(accountBreakdown).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
        ),
        onlineDetails,
        entries
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── @GET /api/daily-entries/borrower-history/:borrowerId ───────────────────────
const getBorrowerHistory = async (req, res) => {
  try {
    const { borrowerId } = req.params;
    const { loanId, page = 1, limit = 50 } = req.query;

    const query = { borrower: borrowerId };
    if (loanId) query.loan = loanId;

    const total = await DailyEntry.countDocuments(query);
    const entries = await DailyEntry.find(query)
      .populate('loan', 'loanId loanType remainingPrincipal interestRate')
      .populate('collectedBy', 'name')
      .sort({ date: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const allEntries = await DailyEntry.find(query);
    const totals = allEntries.reduce((acc, e) => ({
      amount:    acc.amount    + e.amountPaid,
      interest:  acc.interest  + e.interestPortion,
      principal: acc.principal + e.principalPortion
    }), { amount: 0, interest: 0, principal: 0 });

    res.json({
      success: true,
      data: entries,
      totals: {
        amount:    parseFloat(totals.amount.toFixed(2)),
        interest:  parseFloat(totals.interest.toFixed(2)),
        principal: parseFloat(totals.principal.toFixed(2))
      },
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── @GET /api/daily-entries ────────────────────────────────────────────────────
const getDailyEntries = async (req, res) => {
  try {
    const { borrowerId, loanId, startDate, endDate, mode, page = 1, limit = 50 } = req.query;
    const query = {};

    if (borrowerId) query.borrower = borrowerId;
    if (loanId)     query.loan     = loanId;
    if (mode)       query.mode     = mode;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate)   { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query.date.$lte = end; }
    }

    if (req.user.role === 'collector') {
      query.collectedBy = req.user._id;
    } else if (req.query.collectedBy) {
      query.collectedBy = req.query.collectedBy;
    }

    const total = await DailyEntry.countDocuments(query);
    const entries = await DailyEntry.find(query)
      .populate('borrower', 'name phone')
      .populate('loan', 'loanId interestRate remainingPrincipal loanType totalInterest duration')
      .populate('collectedBy', 'name')
      .sort({ date: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: entries,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── @POST /api/daily-entries ───────────────────────────────────────────────────
const createDailyEntry = async (req, res) => {
  try {
    const { borrower, loan: loanId, payments, date, notes } = req.body;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one payment is required' });
    }

    const amountPaid = parseFloat(
      payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2)
    );
    if (amountPaid <= 0) {
      return res.status(400).json({ success: false, message: 'Total payment amount must be positive' });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    if (loan.status === 'Closed') return res.status(400).json({ success: false, message: 'Loan is already closed' });

    // Calculate proportional / legacy split
    const { interestPortion, principalPortion } = calculateSplit(loan, amountPaid);

    const primaryMode = payments[0].mode;

    const entry = await DailyEntry.create({
      borrower,
      loan: loanId,
      amountPaid,
      interestPortion,
      principalPortion,
      mode: primaryMode,
      payments: payments.map(p => ({
        mode:        p.mode,
        amount:      parseFloat(p.amount),
        accountName: p.accountName || ''
      })),
      date:        date || new Date(),
      collectedBy: req.user._id,
      notes
    });

    // ── Update loan balances ─────────────────────────────────────────────────
    loan.remainingPrincipal  = parseFloat((loan.remainingPrincipal  - principalPortion).toFixed(2));
    loan.totalInterestPaid   = parseFloat(((loan.totalInterestPaid  || 0) + interestPortion).toFixed(2));
    loan.totalPrincipalPaid  = parseFloat(((loan.totalPrincipalPaid || 0) + principalPortion).toFixed(2));

    // Close when fully paid
    if (loan.totalInterest > 0) {
      // New model: close when (principal + interest) fully collected
      const totalRemaining = (loan.principalAmount + loan.totalInterest)
        - (loan.totalPrincipalPaid + loan.totalInterestPaid);
      if (totalRemaining < 0.01) {
        loan.remainingPrincipal = 0;
        loan.status = 'Closed';
      }
    } else {
      // Legacy model: close when remaining principal is zero
      if (loan.remainingPrincipal <= 0) {
        loan.remainingPrincipal = 0;
        loan.status = 'Closed';
      }
    }

    await loan.save();

    // ── Ledger entries — one per payment item ────────────────────────────────
    for (const payment of payments) {
      const account = getLedgerAccount(payment.mode);
      const desc = payment.mode === 'Online'
        ? `Payment from ${loan.loanId} [Online - ${payment.accountName || 'Unknown'}] | Int: ₹${interestPortion} Prin: ₹${principalPortion}`
        : `Payment from ${loan.loanId} [${payment.mode}] | Int: ₹${interestPortion} Prin: ₹${principalPortion}`;
      await LedgerEntry.create({
        account,
        type:      'credit',
        amount:    parseFloat(payment.amount),
        description: desc,
        reference: entry._id,
        date:      entry.date
      });
    }

    await entry.populate([
      { path: 'borrower',     select: 'name phone' },
      { path: 'loan',         select: 'loanId interestRate remainingPrincipal loanType' },
      { path: 'collectedBy',  select: 'name' }
    ]);

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── @GET /api/daily-entries/:id ────────────────────────────────────────────────
const getDailyEntry = async (req, res) => {
  try {
    const entry = await DailyEntry.findById(req.params.id)
      .populate('borrower', 'name phone')
      .populate('loan', 'loanId interestRate remainingPrincipal loanType')
      .populate('collectedBy', 'name');
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── @DELETE /api/daily-entries/:id ────────────────────────────────────────────
const deleteDailyEntry = async (req, res) => {
  try {
    const entry = await DailyEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });

    const loan = await Loan.findById(entry.loan);
    if (loan) {
      loan.remainingPrincipal = parseFloat((loan.remainingPrincipal + entry.principalPortion).toFixed(2));
      loan.totalInterestPaid  = parseFloat(((loan.totalInterestPaid  || 0) - entry.interestPortion).toFixed(2));
      loan.totalPrincipalPaid = parseFloat(((loan.totalPrincipalPaid || 0) - entry.principalPortion).toFixed(2));
      if (loan.status === 'Closed' && loan.remainingPrincipal > 0) loan.status = 'Active';
      await loan.save();
    }

    await LedgerEntry.deleteMany({ reference: entry._id });
    await entry.deleteOne();

    res.json({ success: true, message: 'Entry deleted and loan/ledger reversed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getDailyEntries,
  createDailyEntry,
  getDailyEntry,
  deleteDailyEntry,
  getBorrowerTable,
  getDailyReport,
  getBorrowerHistory
};
