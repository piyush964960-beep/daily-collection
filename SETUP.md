# Daily Collection — Loan Management System

A production-ready SaaS application for managing daily loan collections, borrowers, ledger accounts, and monthly reports.

---

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Auth**: JWT (7-day tokens)
- **Export**: ExcelJS (`.xlsx`)

---

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- npm

---

## Local Setup

### 1. Backend

```bash
cd backend
npm install

# .env is already created. Edit if needed:
# MONGODB_URI=mongodb://localhost:27017/daily-collection
# JWT_SECRET=your_secret_here

# Start development server
npm run dev
# Server runs at http://localhost:5000
```

### 2. Seed Sample Data (optional but recommended)

```bash
cd backend
npm run seed
```

This creates:
- **Admin**: `admin@dailycollection.com` / `admin123`
- **Collector (Piyush)**: `piyush@dailycollection.com` / `collector123`
- **Collector (Sanjay)**: `sanjay@dailycollection.com` / `collector123`
- 5 borrowers, 5 loans, 7 days of daily entries

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## Features

### Authentication
- JWT login/register with role-based access (Admin / Collector)
- Admin: full access — add/edit/delete everything
- Collector: view-only access to their assigned borrowers

### Borrower Management
- Unique borrower names enforced
- Search by name, phone, address
- Assign collector per borrower
- View associated loans

### Loan Management
- Auto-generated Loan IDs (LN00001, LN00002, ...)
- Track principal, interest rate, duration, status
- Progress bar showing repayment %
- Close loans automatically when principal reaches zero

### Daily Collections (Core Feature)
- Add daily payment entry (Borrower → Loan → Amount → Mode)
- **Live breakdown preview** before saving: Interest vs Principal split
- Formula: `Daily Interest = (Remaining Principal × Rate%) / 30`
- Payment → Interest first → Remaining → Principal
- Deleting an entry reverses the loan balance automatically

### Ledger System
- Auto-updated on every payment
- Separate balances: Cash, Piyush, Sanjay
- View inflow/outflow per account
- Filter by account and date range

### Dashboard
- Today's and monthly collection totals
- Outstanding loan summary
- Account balances
- 6-month collection trend chart (Recharts)
- Recent transactions table

### Monthly Reports
- Calendar-grid view (Day 1–31 columns)
- Per-borrower breakdown: Principal, Interest, Total
- Mode breakdown: Cash / Piyush / Sanjay
- **Export to Excel (.xlsx)** with formatted cells and grand total row

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |
| GET | /api/auth/collectors | Get all users |
| GET | /api/borrowers | List borrowers (search, filter) |
| POST | /api/borrowers | Create borrower |
| PUT | /api/borrowers/:id | Update borrower |
| DELETE | /api/borrowers/:id | Delete borrower |
| GET | /api/loans | List loans (filter by borrower, status) |
| POST | /api/loans | Create loan |
| PUT | /api/loans/:id | Update loan |
| DELETE | /api/loans/:id | Delete loan |
| GET | /api/daily-entries | List entries (filter by date, mode) |
| POST | /api/daily-entries | Add entry (auto splits + updates loan + ledger) |
| DELETE | /api/daily-entries/:id | Delete + reverse all effects |
| GET | /api/ledger | List ledger entries |
| GET | /api/ledger/balances | Get per-account balances |
| GET | /api/dashboard/stats | Full dashboard stats |
| GET | /api/reports/monthly | Monthly report data (JSON) |
| GET | /api/reports/monthly/export | Download Excel file |

---

## Deployment

### Backend → Render

1. Create new Web Service on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set **Root Directory**: `backend`
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `npm start`
6. Add environment variables:
   - `MONGODB_URI` → your MongoDB Atlas connection string
   - `JWT_SECRET` → a strong random string
   - `FRONTEND_URL` → your Vercel frontend URL

### Frontend → Vercel

1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Set **Root Directory**: `frontend`
4. Add environment variable:
   - In `vite.config.js`, update the proxy target to your Render backend URL for production,
     OR set `VITE_API_URL` and update `src/services/api.js` baseURL accordingly.
5. Deploy

### MongoDB Atlas (Free)

1. Create cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create database user
3. Whitelist `0.0.0.0/0` (allow all IPs) for cloud deployments
4. Copy connection string to `MONGODB_URI`

---

## Folder Structure

```
Daily Collection/
├── backend/
│   ├── models/           # Mongoose schemas
│   │   ├── User.js
│   │   ├── Borrower.js
│   │   ├── Loan.js
│   │   ├── DailyEntry.js
│   │   └── LedgerEntry.js
│   ├── routes/           # Express routers
│   ├── controllers/      # Business logic
│   ├── middleware/        # JWT auth + role checks
│   ├── server.js
│   ├── seed.js           # Sample data
│   └── .env
└── frontend/
    └── src/
        ├── pages/         # Dashboard, Borrowers, Loans, DailyEntries, Ledger, Reports
        ├── components/    # Layout (Sidebar, Header), UI (Modal)
        ├── context/       # AuthContext
        └── services/      # api.js (axios)
```

---

## Business Logic

- **Daily Interest** = `(Remaining Principal × Rate / 100) / 30`
- Payment allocation: interest first, remainder reduces principal
- Loan auto-closes when `remainingPrincipal <= 0`
- Ledger auto-updates on every entry (and reverses on delete)
- Collectors only see their own borrowers/entries
