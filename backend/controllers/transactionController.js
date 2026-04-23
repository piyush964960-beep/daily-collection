const Transaction  = require('../models/Transaction');
const LedgerEntry  = require('../models/LedgerEntry');

// Ledger direction: expense/profit_takeoff = debit (money out), extra_income = credit (money in)
const ledgerType = (txType) => txType === 'extra_income' ? 'credit' : 'debit';

const ledgerDescription = (tx) => {
  const labels = { expense: 'Expense', profit_takeoff: 'Profit Takeoff', extra_income: 'Extra Income' };
  const base = `${labels[tx.txType]}: ${tx.category}`;
  return tx.description ? `${base} — ${tx.description}` : base;
};

// ── GET /api/transactions ─────────────────────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const { txType, account, startDate, endDate, page = 1, limit = 30 } = req.query;
    const query = {};

    if (txType)    query.txType  = txType;
    if (account)   query.account = account;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate); end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const total = await Transaction.countDocuments(query);
    const data  = await Transaction.find(query)
      .populate('createdBy', 'name')
      .sort({ date: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Monthly summary (current month)
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const summary = await Transaction.aggregate([
      { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
      {
        $group: {
          _id: '$txType',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const summaryMap = { expense: { total: 0, count: 0 }, profit_takeoff: { total: 0, count: 0 }, extra_income: { total: 0, count: 0 } };
    summary.forEach(s => { summaryMap[s._id] = { total: s.total, count: s.count }; });

    res.json({
      success: true,
      data,
      summary: summaryMap,
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

// ── POST /api/transactions ────────────────────────────────────────────────────
const createTransaction = async (req, res) => {
  try {
    const { txType, category, account, accountName, amount, description, date } = req.body;

    const accountLabel = account === 'Online' && accountName
      ? `Online (${accountName})` : account;

    // Create ledger entry first
    const ledger = await LedgerEntry.create({
      account,
      type:        ledgerType(txType),
      amount:      parseFloat(amount),
      description: ledgerDescription({ txType, category, description }),
      date:        date ? new Date(date) : new Date()
    });

    // Create transaction linked to ledger
    const tx = await Transaction.create({
      txType,
      category,
      account,
      accountName:  accountName || '',
      amount:       parseFloat(amount),
      description:  description || '',
      date:         date ? new Date(date) : new Date(),
      createdBy:    req.user._id,
      ledgerRef:    ledger._id
    });

    await tx.populate('createdBy', 'name');
    res.status(201).json({ success: true, data: tx });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── PUT /api/transactions/:id ─────────────────────────────────────────────────
const updateTransaction = async (req, res) => {
  try {
    const { category, account, accountName, amount, description, date } = req.body;

    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // Update linked ledger entry
    if (tx.ledgerRef) {
      await LedgerEntry.findByIdAndUpdate(tx.ledgerRef, {
        account:     account      || tx.account,
        amount:      amount       ? parseFloat(amount) : tx.amount,
        description: ledgerDescription({ txType: tx.txType, category: category || tx.category, description: description ?? tx.description }),
        date:        date         ? new Date(date) : tx.date
      });
    }

    // Update transaction
    if (category)    tx.category    = category;
    if (account)     tx.account     = account;
    if (accountName !== undefined) tx.accountName = accountName;
    if (amount)      tx.amount      = parseFloat(amount);
    if (description !== undefined) tx.description = description;
    if (date)        tx.date        = new Date(date);

    await tx.save();
    await tx.populate('createdBy', 'name');
    res.json({ success: true, data: tx });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/transactions/:id ──────────────────────────────────────────────
const deleteTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // Reverse ledger entry
    if (tx.ledgerRef) {
      await LedgerEntry.findByIdAndDelete(tx.ledgerRef);
    }

    await tx.deleteOne();
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getTransactions, createTransaction, updateTransaction, deleteTransaction };
