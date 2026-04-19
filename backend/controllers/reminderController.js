const Reminder = require('../models/Reminder');

// Compute counts for the 4 summary cards
const getCounts = async () => {
  const todayStart = new Date(); todayStart.setHours(0,  0,  0,   0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [overdue, today, upcoming, done] = await Promise.all([
    Reminder.countDocuments({ status: 'Pending', dueDate: { $lt: todayStart } }),
    Reminder.countDocuments({ status: 'Pending', dueDate: { $gte: todayStart, $lte: todayEnd } }),
    Reminder.countDocuments({ status: 'Pending', dueDate: { $gt: todayEnd } }),
    Reminder.countDocuments({ status: 'Done' })
  ]);

  return { overdue, today, upcoming, done };
};

// @GET /api/reminders
const getReminders = async (req, res) => {
  try {
    const { status, borrowerId, page = 1, limit = 200 } = req.query;
    const query = {};

    if (status === 'Pending') query.status = 'Pending';
    else if (status === 'Done') query.status = 'Done';

    if (borrowerId) query.borrower = borrowerId;

    const total = await Reminder.countDocuments(query);
    const reminders = await Reminder.find(query)
      .populate('borrower', 'name phone')
      .populate('loan', 'loanId remainingPrincipal totalInterest totalPrincipalPaid totalInterestPaid')
      .populate('createdBy', 'name')
      // Pending: oldest due first (overdue at top); Done: most recently completed first
      .sort(status === 'Done' ? { completedAt: -1, dueDate: -1 } : { dueDate: 1, createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const summary = await getCounts();

    res.json({
      success: true,
      data: reminders,
      summary,
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

// @POST /api/reminders
const createReminder = async (req, res) => {
  try {
    const { borrower, loan, title, message, dueDate, amount } = req.body;

    const reminder = await Reminder.create({
      borrower,
      loan:        loan    || undefined,
      title:       title   || 'Payment Reminder',
      message:     message || '',
      dueDate,
      amount:      amount  ? parseFloat(amount) : undefined,
      status:      'Pending',
      createdBy:   req.user._id
    });

    await reminder.populate([
      { path: 'borrower',   select: 'name phone' },
      { path: 'loan',       select: 'loanId remainingPrincipal' },
      { path: 'createdBy',  select: 'name' }
    ]);

    res.status(201).json({ success: true, data: reminder });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @PUT /api/reminders/:id
const updateReminder = async (req, res) => {
  try {
    const { title, message, dueDate, amount, loan, status } = req.body;

    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' });

    if (title   !== undefined) reminder.title   = title;
    if (message !== undefined) reminder.message = message;
    if (dueDate !== undefined) reminder.dueDate = dueDate;
    if (loan    !== undefined) reminder.loan    = loan || undefined;
    if (amount  !== undefined) reminder.amount  = amount ? parseFloat(amount) : undefined;

    if (status !== undefined) {
      reminder.status      = status;
      reminder.completedAt = status === 'Done' ? new Date() : undefined;
    }

    await reminder.save();
    await reminder.populate([
      { path: 'borrower',  select: 'name phone' },
      { path: 'loan',      select: 'loanId remainingPrincipal' },
      { path: 'createdBy', select: 'name' }
    ]);

    res.json({ success: true, data: reminder });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @DELETE /api/reminders/:id
const deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' });
    await reminder.deleteOne();
    res.json({ success: true, message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getReminders, createReminder, updateReminder, deleteReminder };
