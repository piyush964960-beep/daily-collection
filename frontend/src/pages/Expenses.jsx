import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, TrendingDown, TrendingUp, Wallet, Filter, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

// ── Categories per type ───────────────────────────────────────────────────────
const CATEGORIES = {
  expense: ['Rent', 'Salary', 'Electricity', 'Office Supplies', 'Travel', 'Maintenance', 'Food & Refreshments', 'Printing', 'Mobile/Internet', 'Other'],
  profit_takeoff: ['Personal Withdrawal', 'Partner Share - Piyush', 'Partner Share - Sanjay', 'Savings Transfer', 'Investment', 'Other'],
  extra_income: ['Extra Collection', 'Interest Income', 'Penalty Received', 'Other']
}

const ACCOUNTS = ['Cash', 'Piyush', 'Sanjay', 'Online']

const TYPE_META = {
  expense:       { label: 'Expense',       color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',   badge: 'bg-red-100 text-red-700',    icon: TrendingDown },
  profit_takeoff:{ label: 'Profit Takeoff',color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200',badge: 'bg-orange-100 text-orange-700',icon: TrendingDown },
  extra_income:  { label: 'Extra Income',  color: 'text-green-600',  bg: 'bg-green-50',   border: 'border-green-200', badge: 'bg-green-100 text-green-700',  icon: TrendingUp  }
}

const EMPTY_FORM = {
  txType:      'expense',
  category:    '',
  account:     'Cash',
  accountName: '',
  amount:      '',
  description: '',
  date:        new Date().toISOString().split('T')[0]
}

// ── Summary card ─────────────────────────────────────────────────────────────
const SummaryCard = ({ label, value, sub, meta }) => {
  const Icon = meta.icon
  return (
    <div className={`card p-4 border-l-4 ${meta.border}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold mt-0.5 ${meta.color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${meta.color}`} />
        </div>
      </div>
    </div>
  )
}

export default function Expenses() {
  const { isAdmin } = useAuth()
  const [transactions, setTransactions]   = useState([])
  const [summary, setSummary]             = useState({ expense: { total: 0, count: 0 }, profit_takeoff: { total: 0, count: 0 }, extra_income: { total: 0, count: 0 } })
  const [loading, setLoading]             = useState(true)
  const [pagination, setPagination]       = useState({ page: 1, pages: 1, total: 0 })

  // Filters
  const [activeTab, setActiveTab]         = useState('')  // '' = All
  const [account,   setAccount]           = useState('')
  const [startDate, setStartDate]         = useState('')
  const [endDate,   setEndDate]           = useState('')

  // Modal
  const [showModal, setShowModal]         = useState(false)
  const [editTx,    setEditTx]            = useState(null)
  const [form,      setForm]              = useState(EMPTY_FORM)
  const [saving,    setSaving]            = useState(false)

  const fetchTx = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const res = await api.get('/transactions', {
        params: { txType: activeTab, account, startDate, endDate, page, limit: 30 }
      })
      setTransactions(res.data.data)
      setSummary(res.data.summary)
      setPagination(res.data.pagination)
    } catch { toast.error('Failed to load transactions') }
    finally { setLoading(false) }
  }, [activeTab, account, startDate, endDate])

  useEffect(() => { fetchTx() }, [fetchTx])

  // Reset category when type changes
  useEffect(() => {
    setForm(p => ({ ...p, category: CATEGORIES[p.txType][0] }))
  }, [form.txType])

  const openAdd = () => {
    setEditTx(null)
    setForm({ ...EMPTY_FORM, category: CATEGORIES['expense'][0] })
    setShowModal(true)
  }

  const openEdit = (tx) => {
    setEditTx(tx)
    setForm({
      txType:      tx.txType,
      category:    tx.category,
      account:     tx.account,
      accountName: tx.accountName || '',
      amount:      tx.amount,
      description: tx.description || '',
      date:        tx.date?.split('T')[0] || new Date().toISOString().split('T')[0]
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editTx) {
        await api.put(`/transactions/${editTx._id}`, form)
        toast.success('Updated successfully')
      } else {
        await api.post('/transactions', form)
        toast.success('Transaction added')
      }
      setShowModal(false)
      fetchTx()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction? The ledger entry will also be reversed.')) return
    try {
      await api.delete(`/transactions/${id}`)
      toast.success('Deleted and ledger reversed')
      fetchTx()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  const netThisMonth = (summary.extra_income?.total || 0) - (summary.expense?.total || 0) - (summary.profit_takeoff?.total || 0)

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          label="Expenses This Month"
          value={fmt(summary.expense?.total)}
          sub={`${summary.expense?.count || 0} entries`}
          meta={TYPE_META.expense}
        />
        <SummaryCard
          label="Profit Takeoff"
          value={fmt(summary.profit_takeoff?.total)}
          sub={`${summary.profit_takeoff?.count || 0} entries`}
          meta={TYPE_META.profit_takeoff}
        />
        <SummaryCard
          label="Extra Income"
          value={fmt(summary.extra_income?.total)}
          sub={`${summary.extra_income?.count || 0} entries`}
          meta={TYPE_META.extra_income}
        />
        <div className={`card p-4 border-l-4 ${netThisMonth >= 0 ? 'border-green-400' : 'border-red-400'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Net This Month</p>
              <p className={`text-xl font-bold mt-0.5 ${netThisMonth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netThisMonth >= 0 ? '+' : ''}{fmt(netThisMonth)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Income − Expenses − Takeoff</p>
            </div>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${netThisMonth >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <Wallet className={`w-4 h-4 ${netThisMonth >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          {[
            ['', 'All'],
            ['expense', 'Expenses'],
            ['profit_takeoff', 'Profit Takeoff'],
            ['extra_income', 'Extra Income']
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setActiveTab(val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === val ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="btn-primary w-full sm:w-auto">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-3 items-end">
        <Filter className="w-4 h-4 text-gray-400 self-center" />
        <div>
          <label className="label text-xs">Account</label>
          <select className="input w-auto text-sm" value={account} onChange={e => setAccount(e.target.value)}>
            <option value="">All Accounts</option>
            {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">From</label>
          <input type="date" className="input text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">To</label>
          <input type="date" className="input text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button onClick={() => { setAccount(''); setStartDate(''); setEndDate('') }} className="btn-secondary text-sm py-2">
          Clear
        </button>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 card p-8">No transactions found</div>
        ) : transactions.map(tx => {
          const meta = TYPE_META[tx.txType]
          return (
            <div key={tx._id} className={`card p-4 border-l-4 ${meta.border}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tx.category}</span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{tx.account}{tx.accountName ? ` (${tx.accountName})` : ''}</span>
                  </div>
                  <p className={`text-lg font-bold ${meta.color}`}>
                    {tx.txType === 'extra_income' ? '+' : '-'}{fmt(tx.amount)}
                  </p>
                  {tx.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{tx.description}</p>}
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {new Date(tx.date).toLocaleDateString('en-IN')}
                    {tx.createdBy?.name && <span className="ml-2">· {tx.createdBy.name}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(tx)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(tx._id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                {['Date', 'Type', 'Category', 'Account', 'Amount', 'Description', 'Added By', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" /></div>
                </td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No transactions found</td></tr>
              ) : transactions.map(tx => {
                const meta = TYPE_META[tx.txType]
                return (
                  <tr key={tx._id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{tx.category}</td>
                    <td className="px-4 py-3">
                      <span className="badge-blue">{tx.account}{tx.accountName ? ` (${tx.accountName})` : ''}</span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${meta.color}`}>
                      {tx.txType === 'extra_income' ? '+' : '-'}{fmt(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{tx.description || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{tx.createdBy?.name || '—'}</td>
                    <td className="px-4 py-3">
                      {isAdmin && (
                        <div className="flex gap-1.5">
                          <button onClick={() => openEdit(tx)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(tx._id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>{pagination.total} transactions</span>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => fetchTx(p)}
                  className={`px-3 py-1 rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editTx ? 'Edit Transaction' : 'Add Transaction'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Type selector */}
          {!editTx && (
            <div>
              <label className="label">Transaction Type</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(TYPE_META).map(([key, meta]) => {
                  const Icon = meta.icon
                  return (
                    <label
                      key={key}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        form.txType === key
                          ? `${meta.border} ${meta.bg} ${meta.color}`
                          : 'border-gray-200 hover:border-gray-300 text-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        className="hidden"
                        value={key}
                        checked={form.txType === key}
                        onChange={e => setForm(p => ({ ...p, txType: e.target.value }))}
                      />
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium text-center leading-tight">{meta.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              required
            >
              <option value="">Select category</option>
              {CATEGORIES[form.txType].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Account */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Account</label>
              <select
                className="input"
                value={form.account}
                onChange={e => setForm(p => ({ ...p, account: e.target.value }))}
                required
              >
                {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {form.account === 'Online' && (
              <div>
                <label className="label">Account Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. HDFC Savings"
                  value={form.accountName}
                  onChange={e => setForm(p => ({ ...p, accountName: e.target.value }))}
                />
              </div>
            )}
            <div className={form.account === 'Online' ? 'col-span-2' : ''}>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                className="input"
                placeholder="500"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="label">Description <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
            <textarea
              className="input"
              rows={2}
              placeholder="e.g. Monthly office rent for April..."
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>

          {/* Ledger note */}
          <div className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${
            form.txType === 'extra_income'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {form.txType === 'extra_income'
              ? <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
              : <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
            }
            <span>
              This will create a <strong>{form.txType === 'extra_income' ? 'CREDIT' : 'DEBIT'}</strong> entry
              in the <strong>{form.account}</strong> ledger account.
            </span>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : editTx ? 'Update' : 'Save Transaction'
              }
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
