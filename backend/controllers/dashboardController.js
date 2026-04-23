const DailyEntry = require('../models/DailyEntry');
const Loan = require('../models/Loan');
const Borrower = require('../models/Borrower');
const LedgerEntry = require('../models/LedgerEntry');

// @GET /api/dashboard/stats
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Today's collection
    const todayEntries = await DailyEntry.aggregate([
      { $match: { date: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: null, total: { $sum: '$amountPaid' }, count: { $sum: 1 } } }
    ]);

    // Month collection
    const monthEntries = await DailyEntry.aggregate([
      { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: null, total: { $sum: '$amountPaid' }, interest: { $sum: '$interestPortion' }, principal: { $sum: '$principalPortion' } } }
    ]);

    // Outstanding loans — total remaining (principal + interest) per loan
    const outstandingLoans = await Loan.aggregate([
      { $match: { status: 'Active' } },
      {
        $addFields: {
          // New model: remaining = (principal + totalInterest) - (paidPrincipal + paidInterest)
          // Legacy model: remaining = remainingPrincipal
          _remaining: {
            $cond: {
              if: { $gt: [{ $ifNull: ['$totalInterest', 0] }, 0] },
              then: {
                $max: [0, {
                  $subtract: [
                    { $add: ['$principalAmount', '$totalInterest'] },
                    { $add: [{ $ifNull: ['$totalPrincipalPaid', 0] }, { $ifNull: ['$totalInterestPaid', 0] }] }
                  ]
                }]
              },
              else: { $ifNull: ['$remainingPrincipal', 0] }
            }
          },
          _remainingPrincipal: {
            $cond: {
              if: { $gt: [{ $ifNull: ['$totalInterest', 0] }, 0] },
              then: { $max: [0, { $subtract: ['$principalAmount', { $ifNull: ['$totalPrincipalPaid', 0] }] }] },
              else: { $ifNull: ['$remainingPrincipal', 0] }
            }
          },
          _remainingInterest: {
            $cond: {
              if: { $gt: [{ $ifNull: ['$totalInterest', 0] }, 0] },
              then: { $max: [0, { $subtract: ['$totalInterest', { $ifNull: ['$totalInterestPaid', 0] }] }] },
              else: 0
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRemaining:          { $sum: '$_remaining' },
          totalRemainingPrincipal: { $sum: '$_remainingPrincipal' },
          totalRemainingInterest:  { $sum: '$_remainingInterest' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Account balances
    const accounts = ['Cash', 'Piyush', 'Sanjay'];
    const balances = {};
    for (const acc of accounts) {
      const result = await LedgerEntry.aggregate([
        { $match: { account: acc } },
        {
          $group: {
            _id: null,
            credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
            debit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } }
          }
        }
      ]);
      const r = result[0] || { credit: 0, debit: 0 };
      balances[acc] = parseFloat((r.credit - r.debit).toFixed(2));
    }

    // Recent transactions (last 10)
    const recentEntries = await DailyEntry.find()
      .populate('borrower', 'name')
      .populate('loan', 'loanId')
      .populate('collectedBy', 'name')
      .sort({ date: -1 })
      .limit(10);

    // Monthly trend (last 6 months)
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const result = await DailyEntry.aggregate([
        { $match: { date: { $gte: mStart, $lte: mEnd } } },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ]);
      trend.push({
        month: mStart.toLocaleString('default', { month: 'short', year: '2-digit' }),
        total: result[0]?.total || 0
      });
    }

    // Counts
    const totalBorrowers = await Borrower.countDocuments({ isActive: true });
    const totalActiveLoans = await Loan.countDocuments({ status: 'Active' });
    const totalClosedLoans = await Loan.countDocuments({ status: 'Closed' });

    res.json({
      success: true,
      data: {
        todayCollection: {
          total: todayEntries[0]?.total || 0,
          count: todayEntries[0]?.count || 0
        },
        monthCollection: {
          total: monthEntries[0]?.total || 0,
          interest: monthEntries[0]?.interest || 0,
          principal: monthEntries[0]?.principal || 0
        },
        outstandingLoans: {
          totalRemaining:          parseFloat((outstandingLoans[0]?.totalRemaining          || 0).toFixed(2)),
          totalRemainingPrincipal: parseFloat((outstandingLoans[0]?.totalRemainingPrincipal || 0).toFixed(2)),
          totalRemainingInterest:  parseFloat((outstandingLoans[0]?.totalRemainingInterest  || 0).toFixed(2)),
          count: outstandingLoans[0]?.count || 0
        },
        accountBalances: balances,
        recentTransactions: recentEntries,
        counts: { borrowers: totalBorrowers, activeLoans: totalActiveLoans, closedLoans: totalClosedLoans },
        monthlyTrend: trend
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDashboardStats };
