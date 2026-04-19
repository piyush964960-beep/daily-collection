const LedgerEntry = require('../models/LedgerEntry');

// @GET /api/ledger
const getLedgerEntries = async (req, res) => {
  try {
    const { account, startDate, endDate, type, page = 1, limit = 50 } = req.query;
    const query = {};

    if (account) query.account = account;
    if (type) query.type = type;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const total = await LedgerEntry.countDocuments(query);
    const entries = await LedgerEntry.find(query)
      .populate('reference')
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

// @GET /api/ledger/balances
const getLedgerBalances = async (req, res) => {
  try {
    const accounts = ['Cash', 'Piyush', 'Sanjay', 'Online'];
    const balances = {};

    for (const account of accounts) {
      const result = await LedgerEntry.aggregate([
        { $match: { account } },
        {
          $group: {
            _id: null,
            totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
            totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } }
          }
        }
      ]);

      const r = result[0] || { totalCredit: 0, totalDebit: 0 };
      balances[account] = {
        credit: parseFloat(r.totalCredit.toFixed(2)),
        debit: parseFloat(r.totalDebit.toFixed(2)),
        balance: parseFloat((r.totalCredit - r.totalDebit).toFixed(2))
      };
    }

    const totalBalance = Object.values(balances).reduce((sum, a) => sum + a.balance, 0);

    res.json({ success: true, data: { accounts: balances, total: parseFloat(totalBalance.toFixed(2)) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getLedgerEntries, getLedgerBalances };
