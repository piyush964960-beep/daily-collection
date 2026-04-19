const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const User = require('./models/User');
const Borrower = require('./models/Borrower');
const Loan = require('./models/Loan');
const DailyEntry = require('./models/DailyEntry');
const LedgerEntry = require('./models/LedgerEntry');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/daily-collection');
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Borrower.deleteMany({});
    await Loan.deleteMany({});
    await DailyEntry.deleteMany({});
    await LedgerEntry.deleteMany({});

    // Create users
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@dailycollection.com',
      password: 'admin123',
      role: 'admin'
    });

    const piyush = await User.create({
      name: 'Piyush',
      email: 'piyush@dailycollection.com',
      password: 'collector123',
      role: 'collector'
    });

    const sanjay = await User.create({
      name: 'Sanjay',
      email: 'sanjay@dailycollection.com',
      password: 'collector123',
      role: 'collector'
    });

    console.log('✅ Users created');

    // Create borrowers
    const borrowers = await Borrower.insertMany([
      { name: 'Ramesh Kumar', phone: '9876543210', address: '123 Main Street, Mumbai', assignedCollector: piyush._id },
      { name: 'Suresh Patel', phone: '9876543211', address: '456 Market Road, Delhi', assignedCollector: piyush._id },
      { name: 'Mahesh Singh', phone: '9876543212', address: '789 Lake View, Pune', assignedCollector: sanjay._id },
      { name: 'Naresh Gupta', phone: '9876543213', address: '101 Hill Road, Bangalore', assignedCollector: sanjay._id },
      { name: 'Dinesh Shah', phone: '9876543214', address: '202 River Lane, Ahmedabad', assignedCollector: piyush._id }
    ]);

    console.log('✅ Borrowers created');

    // Create loans
    const loans = [];
    const loanData = [
      { borrower: borrowers[0]._id, principalAmount: 50000, interestRate: 2, duration: 180 },
      { borrower: borrowers[1]._id, principalAmount: 30000, interestRate: 2.5, duration: 120 },
      { borrower: borrowers[2]._id, principalAmount: 75000, interestRate: 1.8, duration: 240 },
      { borrower: borrowers[3]._id, principalAmount: 20000, interestRate: 3, duration: 90 },
      { borrower: borrowers[4]._id, principalAmount: 40000, interestRate: 2.2, duration: 150 }
    ];

    for (const ld of loanData) {
      const loan = new Loan({ ...ld, startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });
      await loan.save();
      loans.push(loan);
    }

    console.log('✅ Loans created');

    // Create some daily entries for last 7 days
    const modes = ['Cash', 'Piyush', 'Sanjay'];
    const collectors = [piyush, sanjay];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(10, 0, 0, 0);

      for (let j = 0; j < loans.length; j++) {
        const loan = await Loan.findById(loans[j]._id);
        if (loan.status === 'Closed') continue;

        const amountPaid = 500 + Math.floor(Math.random() * 500);
        const dailyInterest = (loan.remainingPrincipal * loan.interestRate / 100) / 30;
        const interestPortion = Math.min(dailyInterest, amountPaid);
        const principalPortion = Math.min(Math.max(0, amountPaid - interestPortion), loan.remainingPrincipal);
        const mode = modes[j % modes.length];

        const entry = await DailyEntry.create({
          borrower: loan.borrower,
          loan: loan._id,
          date,
          amountPaid,
          interestPortion: parseFloat(interestPortion.toFixed(2)),
          principalPortion: parseFloat(principalPortion.toFixed(2)),
          mode,
          collectedBy: collectors[j % collectors.length]._id
        });

        loan.remainingPrincipal = parseFloat((loan.remainingPrincipal - principalPortion).toFixed(2));
        loan.totalInterestPaid = parseFloat((loan.totalInterestPaid + interestPortion).toFixed(2));
        loan.totalPrincipalPaid = parseFloat((loan.totalPrincipalPaid + principalPortion).toFixed(2));
        if (loan.remainingPrincipal <= 0) { loan.remainingPrincipal = 0; loan.status = 'Closed'; }
        await loan.save();

        await LedgerEntry.create({
          account: mode,
          type: 'credit',
          amount: amountPaid,
          description: `Payment from ${loan.loanId}`,
          reference: entry._id,
          date
        });
      }
    }

    console.log('✅ Daily entries and ledger created');
    console.log('\n🎉 Seed complete! Login credentials:');
    console.log('   Admin: admin@dailycollection.com / admin123');
    console.log('   Collector: piyush@dailycollection.com / collector123');
    console.log('   Collector: sanjay@dailycollection.com / collector123');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
};

seed();
