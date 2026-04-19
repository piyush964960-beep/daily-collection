const Borrower = require('../models/Borrower');
const Loan = require('../models/Loan');

// @GET /api/borrowers
const getBorrowers = async (req, res) => {
  try {
    const { search, collector, page = 1, limit = 20 } = req.query;
    const query = {};

    // Collector can only see their assigned borrowers
    if (req.user.role === 'collector') {
      query.assignedCollector = req.user._id;
    } else if (collector) {
      query.assignedCollector = collector;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Borrower.countDocuments(query);
    const borrowers = await Borrower.find(query)
      .populate('assignedCollector', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: borrowers,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/borrowers
const createBorrower = async (req, res) => {
  try {
    const { name, phone, address, assignedCollector, notes } = req.body;

    const existing = await Borrower.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Borrower with this name already exists' });
    }

    const borrower = await Borrower.create({ name, phone, address, assignedCollector, notes });
    await borrower.populate('assignedCollector', 'name email');

    res.status(201).json({ success: true, data: borrower });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @GET /api/borrowers/:id
const getBorrower = async (req, res) => {
  try {
    const borrower = await Borrower.findById(req.params.id)
      .populate('assignedCollector', 'name email');

    if (!borrower) {
      return res.status(404).json({ success: false, message: 'Borrower not found' });
    }

    // Get associated loans
    const loans = await Loan.find({ borrower: req.params.id }).sort({ createdAt: -1 });

    res.json({ success: true, data: { ...borrower.toObject(), loans } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/borrowers/:id
const updateBorrower = async (req, res) => {
  try {
    const { name, phone, address, assignedCollector, notes, isActive } = req.body;

    // Check uniqueness if name is being changed
    if (name) {
      const existing = await Borrower.findOne({
        name: { $regex: `^${name}$`, $options: 'i' },
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Borrower with this name already exists' });
      }
    }

    const borrower = await Borrower.findByIdAndUpdate(
      req.params.id,
      { name, phone, address, assignedCollector, notes, isActive },
      { new: true, runValidators: true }
    ).populate('assignedCollector', 'name email');

    if (!borrower) {
      return res.status(404).json({ success: false, message: 'Borrower not found' });
    }

    res.json({ success: true, data: borrower });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @DELETE /api/borrowers/:id
const deleteBorrower = async (req, res) => {
  try {
    const borrower = await Borrower.findByIdAndDelete(req.params.id);
    if (!borrower) {
      return res.status(404).json({ success: false, message: 'Borrower not found' });
    }
    res.json({ success: true, message: 'Borrower deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getBorrowers, createBorrower, getBorrower, updateBorrower, deleteBorrower };
