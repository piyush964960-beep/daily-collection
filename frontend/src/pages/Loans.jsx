import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Search, AlertTriangle, MapPin, X, Clock, Calendar, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const fmt  = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtn = (n) => parseFloat((n || 0).toFixed(2))

// ── WhatsApp helpers ─────────────────────────────────────────────────────────
const fmtPhone = (phone = '') => {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d
}

const sendLoanWhatsApp = (loan) => {
  const name       = loan.borrower?.name  || 'Customer'
  const phone      = loan.borrower?.phone || ''
  const startDate  = loan.startDate  ? new Date(loan.startDate).toLocaleDateString('en-IN')  : '—'
  const dueDate    = loan.completionDate ? new Date(loan.completionDate).toLocaleDateString('en-IN') : '—'
  const totalLoan  = loan.totalLoanAmount || loan.principalAmount || 0
  const daily      = loan.dailyAmount     || loan.interestAmount  || 0

  const msg =
`Dear ${name},

Your loan has been created successfully! 🎉

📋 *Loan Details:*
• Loan ID: ${loan.loanId}
• Start Date: ${startDate}
• Principal: ${fmt(loan.principalAmount)}
• Total Interest: ${fmt(loan.totalInterest || 0)}
• *Total Payable: ${fmt(totalLoan)}*
• Daily Payment: *${fmt(daily)}/day*
• Duration: ${loan.duration} days
• Expected Completion: ${dueDate}

Please ensure timely daily payments.

Thank you! 🙏`

  window.open(`https://wa.me/${fmtPhone(phone)}?text=${encodeURIComponent(msg)}`, '_blank')
}

// ── EMI Frequency helpers ─────────────────────────────────────────────────────
const FREQ_OPTIONS = [
  { value: 1,  label: 'Daily',      short: 'Daily' },
  { value: 5,  label: 'Every 5 Days', short: '5-Day' },
  { value: 7,  label: 'Weekly',     short: 'Weekly' },
  { value: 10, label: 'Every 10 Days', short: '10-Day' },
  { value: 15, label: 'Every 15 Days', short: '15-Day' },
  { value: 30, label: 'Monthly',    short: 'Monthly' },
]

const freqLabel = (freq) => {
  if (!freq || freq === 1) return null
  const opt = FREQ_OPTIONS.find(o => o.value === freq)
  return opt ? opt.short : `Every ${freq} Days`
}

const freqBadgeClass = (freq) => {
  if (!freq || freq === 1) return ''
  if (freq === 7)  return 'bg-purple-100 text-purple-700'
  if (freq === 30) return 'bg-yellow-100 text-yellow-700'
  return 'bg-indigo-100 text-indigo-700'
}

const EMPTY_FORM = {
  borrower:        '',
  principalAmount: '',
  totalInterest:   '',   // fixed total interest (new model)
  totalLoanAmount: '',   // principal + interest (helper field)
  interestRate:    '',   // legacy % — kept for edit backward compat
  disbursements:   [{ mode: 'Cash', amount: '', accountName: '' }],
  startDate:       new Date().toISOString().split('T')[0],
  duration:        '',
  emiFrequency:    1,
  loanType:        'Daily',
  collectionPoint: '',
  isDefault:       false,
  notes:           ''
}

export default function Loans() {
  const { isAdmin } = useAuth()
  const [loans, setLoans]             = useState([])
  const [borrowers, setBorrowers]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [activeFilter, setActiveFilter]     = useState('all') // 'all'|'daily'|'periodic'|'monthly'|'overdue'
  const [overdueFilter, setOverdueFilter]   = useState(false)
  const [sortBy, setSortBy]           = useState('')
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [editLoan, setEditLoan]       = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [pagination, setPagination]   = useState({ page: 1, pages: 1, total: 0 })

  const fetchLoans = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = { sortBy, search, page, limit: 15 }
      if (activeFilter === 'overdue') {
        params.overdue = 'true'
      } else if (activeFilter === 'monthly') {
        params.loanType = 'Monthly'
      } else if (activeFilter === 'daily') {
        params.loanType = 'Daily'; params.freqFilter = 'daily'
      } else if (activeFilter === 'periodic') {
        params.loanType = 'Daily'; params.freqFilter = 'periodic'
      }
      const res = await api.get('/loans', { params })
      setLoans(res.data.data)
      setPagination(res.data.pagination)
    } catch { toast.error('Failed to load loans') }
    finally { setLoading(false) }
  }, [activeFilter, sortBy, search])

  useEffect(() => { fetchLoans() }, [fetchLoans])

  useEffect(() => {
    api.get('/borrowers', { params: { limit: 200 } })
      .then(r => setBorrowers(r.data.data))
      .catch(() => {})
  }, [])

  // ── Form field handlers — keep principal / totalInterest / totalLoanAmount in sync ──

  const onChangePrincipal = (val) => {
    const pa = val
    const ti = form.totalInterest
    const tla = pa !== '' && ti !== ''
      ? String(fmtn(parseFloat(pa) + parseFloat(ti)))
      : form.totalLoanAmount
    setForm(p => ({ ...p, principalAmount: pa, totalLoanAmount: tla }))
  }

  const onChangeTotalInterest = (val) => {
    const ti  = val
    const pa  = form.principalAmount
    const tla = ti !== '' && pa !== ''
      ? String(fmtn(parseFloat(pa) + parseFloat(ti)))
      : form.totalLoanAmount
    setForm(p => ({ ...p, totalInterest: ti, totalLoanAmount: tla }))
  }

  const onChangeTotalLoanAmount = (val) => {
    const tla = val
    const pa  = form.principalAmount
    const ti  = tla !== '' && pa !== ''
      ? String(Math.max(0, fmtn(parseFloat(tla) - parseFloat(pa))))
      : form.totalInterest
    setForm(p => ({ ...p, totalLoanAmount: tla, totalInterest: ti }))
  }

  // ── Disbursement helpers ─────────────────────────────────────────────────────

  const updateDisb = (index, field, value) =>
    setForm(p => {
      const updated = [...p.disbursements]
      updated[index] = { ...updated[index], [field]: value }
      return { ...p, disbursements: updated }
    })

  const addDisbLine = () =>
    setForm(p => ({ ...p, disbursements: [...p.disbursements, { mode: 'Cash', amount: '', accountName: '' }] }))

  const removeDisbLine = (index) =>
    setForm(p => ({
      ...p,
      disbursements: p.disbursements.length > 1
        ? p.disbursements.filter((_, i) => i !== index)
        : p.disbursements
    }))

  const totalDisbursed = form.disbursements.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)

  // ── Computed preview values ──────────────────────────────────────────────────

  const pa  = parseFloat(form.principalAmount) || 0
  const ti  = parseFloat(form.totalInterest)   || 0
  const dur = parseFloat(form.duration)         || 0
  const tla = pa + ti

  const previewDailyTotal     = dur > 0 && tla > 0 ? fmtn(tla / dur)   : null
  const previewDailyInterest  = dur > 0 && ti  > 0 ? fmtn(ti  / dur)   : null
  const previewDailyPrincipal = dur > 0 && pa  > 0 ? fmtn(pa  / dur)   : null
  const freq = parseInt(form.emiFrequency) || 1
  const totalDays = dur * freq
  const previewCompletionDate = form.loanType === 'Daily' && form.startDate && dur > 0
    ? new Date(new Date(form.startDate).getTime() + totalDays * 86400000).toLocaleDateString('en-IN')
    : null

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editLoan) {
        await api.put(`/loans/${editLoan._id}`, {
          totalInterest:   form.totalInterest  !== '' ? parseFloat(form.totalInterest)  : undefined,
          interestRate:    form.interestRate   !== '' ? parseFloat(form.interestRate)   : undefined,
          duration:        form.duration,
          emiFrequency:    form.emiFrequency   || 1,
          startDate:       form.startDate      || undefined,
          status:          form.status,
          loanType:        form.loanType,
          collectionPoint: form.collectionPoint,
          isDefault:       form.isDefault,
          notes:           form.notes
        })
        toast.success('Loan updated')
      } else {
        const validDisb = form.disbursements.filter(d => parseFloat(d.amount) > 0)
        await api.post('/loans', {
          ...form,
          totalInterest:   form.totalInterest !== '' ? parseFloat(form.totalInterest) : 0,
          principalAmount: parseFloat(form.principalAmount),
          interestRate:    0,
          disbursements:   validDisb.length > 0
            ? validDisb.map(d => ({ mode: d.mode, amount: parseFloat(d.amount), accountName: d.accountName || '' }))
            : undefined
        })
        toast.success('Loan created')
      }
      setShowModal(false); setEditLoan(null); setForm(EMPTY_FORM); fetchLoans()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const handleEdit = (loan) => {
    setEditLoan(loan)
    const loanTI  = loan.totalInterest || 0
    const loanPA  = loan.principalAmount || 0
    setForm({
      borrower:        loan.borrower?._id || '',
      principalAmount: loanPA,
      totalInterest:   loanTI,
      totalLoanAmount: loanPA + loanTI,
      interestRate:    loan.interestRate || '',
      disbursements:   [{ mode: 'Cash', amount: '', accountName: '' }],
      startDate:       loan.startDate ? new Date(loan.startDate).toISOString().split('T')[0] : '',
      duration:        loan.duration,
      emiFrequency:    loan.emiFrequency || 1,
      loanType:        loan.loanType || 'Daily',
      collectionPoint: loan.collectionPoint || '',
      isDefault:       loan.isDefault || false,
      status:          loan.status,
      notes:           loan.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this loan?')) return
    try { await api.delete(`/loans/${id}`); toast.success('Loan deleted'); fetchLoans() }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to delete') }
  }

  const progress = (loan) => {
    const total     = loan.totalLoanAmount || loan.principalAmount || 0
    const remaining = loan.remainingAmount !== undefined ? loan.remainingAmount : loan.remainingPrincipal
    return total > 0 ? Math.round(((total - remaining) / total) * 100) : 0
  }

  return (
    <div className="space-y-5">
      {/* Top Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Search by borrower name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <button
              onClick={() => { setEditLoan(null); setForm(EMPTY_FORM); setShowModal(true) }}
              className="btn-primary w-full sm:w-auto whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> New Loan
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-start sm:items-center">
          <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { val: 'all',      label: 'All' },
              { val: 'daily',    label: 'Daily EMI' },
              { val: 'periodic', label: 'Periodic EMI' },
              { val: 'monthly',  label: 'Monthly' },
            ].map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setActiveFilter(val)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeFilter === val
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setActiveFilter(f => f === 'overdue' ? 'all' : 'overdue')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeFilter === 'overdue'
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'text-red-500 hover:text-red-700 hover:bg-red-50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Overdue
            </button>
          </div>
          <select
            className="input w-full sm:w-auto text-sm"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="">Sort: Default</option>
            <option value="completionDate_asc">Completion Date ↑</option>
            <option value="completionDate_desc">Completion Date ↓</option>
            <option value="isDefault">Defaults First</option>
          </select>
          <span className="text-sm text-gray-500 sm:ml-auto">
            {activeFilter === 'overdue' && <span className="text-red-500 font-medium mr-1">Overdue:</span>}
            {activeFilter === 'periodic' && <span className="text-indigo-500 font-medium mr-1">Periodic EMI:</span>}
            {pagination.total} loans
          </span>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : loans.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No loans found</div>
        ) : loans.map(l => (
          <div key={l._id} className={`card p-4 ${
            l.isOverdue ? 'border-l-4 border-l-red-400 bg-red-50/20' :
            l.isDefault ? 'border-l-4 border-l-orange-400' : ''
          }`}>
            {/* Header: Loan ID + badges */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{l.loanId}</span>
              {l.isDefault && (
                <span className="badge bg-orange-100 text-orange-700 text-[10px]">
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5 inline" />DEFAULT
                </span>
              )}
              {l.isOverdue && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                  <Clock className="w-2.5 h-2.5" />OVERDUE
                </span>
              )}
              <span className={`ml-auto ${l.status === 'Active' ? 'badge-green' : 'badge-gray'}`}>{l.status}</span>
            </div>

            {/* Borrower name */}
            <p className="font-semibold text-gray-900 text-sm mb-2">{l.borrower?.name}</p>

            {/* Daily payment */}
            <div className="mb-2">
              {l.totalInterest > 0 ? (
                <>
                  <span className="font-semibold text-gray-900 text-sm">{fmt(l.dailyAmount)}/day</span>
                  <span className="text-[11px] text-gray-400 ml-1">
                    Int {fmt(l.interestAmount)} + Prin {fmt(l.dailyPrincipalAmount)}
                  </span>
                </>
              ) : (
                <span className="text-orange-600 font-medium text-sm">{fmt(l.interestAmount)}/day
                  {l.interestRate > 0 && <span className="text-gray-400 text-xs ml-1">({l.interestRate}%)</span>}
                </span>
              )}
            </div>

            {/* Remaining / Total */}
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-blue-700 font-semibold">
                {fmt(l.remainingAmount !== undefined ? l.remainingAmount : l.remainingPrincipal)} remaining
              </span>
              {l.totalInterest > 0 && (
                <span className="text-xs text-gray-400">of {fmt(l.totalLoanAmount)}</span>
              )}
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-primary-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${progress(l)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8">{progress(l)}%</span>
            </div>

            {/* Dates row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
              {l.startDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  <span>Start: <strong className="text-gray-700">{new Date(l.startDate).toLocaleDateString('en-IN')}</strong></span>
                </div>
              )}
              {l.loanType === 'Daily' && l.completionDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  <span className={l.isOverdue ? 'text-red-600' : ''}>
                    Due: <strong>{new Date(l.completionDate).toLocaleDateString('en-IN')}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Overdue banner */}
            {l.isOverdue && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-red-600">
                  {l.daysOverdue} {l.daysOverdue === 1 ? 'day' : 'days'} overdue
                </span>
              </div>
            )}

            {/* Collection point + Type + Frequency */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
              {l.collectionPoint && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{l.collectionPoint}
                </div>
              )}
              <span className={l.loanType === 'Daily' ? 'badge-blue' : 'badge-yellow'}>{l.loanType || 'Daily'}</span>
              {freqLabel(l.emiFrequency) && (
                <span className={`badge text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${freqBadgeClass(l.emiFrequency)}`}>
                  {freqLabel(l.emiFrequency)}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => sendLoanWhatsApp(l)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors border border-green-200"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
              {isAdmin && (
                <>
                  <button onClick={() => handleEdit(l)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm text-gray-600 hover:text-primary-600 hover:bg-primary-50 transition-colors border border-gray-200">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                  <button onClick={() => handleDelete(l._id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors border border-gray-200">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                {['Loan ID', 'Borrower', 'Type', 'Daily Payment', 'Remaining', 'Progress', 'Collection Point', 'Start Date', 'Completion', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" />
                  </div>
                </td></tr>
              ) : loans.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">No loans found</td></tr>
              ) : loans.map(l => (
                <tr key={l._id} className={`hover:bg-gray-50/50 ${
                  l.isOverdue ? 'border-l-2 border-l-red-400 bg-red-50/20' :
                  l.isDefault ? 'border-l-2 border-l-orange-400' : ''
                }`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{l.loanId}</span>
                      {l.isDefault && (
                        <span className="badge bg-orange-100 text-orange-700 text-[10px]">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5 inline" />DEFAULT
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{l.borrower?.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={l.loanType === 'Daily' ? 'badge-blue' : 'badge-yellow'}>
                        {l.loanType || 'Daily'}
                      </span>
                      {freqLabel(l.emiFrequency) && (
                        <span className={`badge text-[10px] px-1.5 py-0.5 rounded-full font-semibold w-fit ${freqBadgeClass(l.emiFrequency)}`}>
                          {freqLabel(l.emiFrequency)}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Daily Payment column */}
                  <td className="px-4 py-3">
                    {l.totalInterest > 0 ? (
                      <>
                        <span className="font-semibold text-gray-900">{fmt(l.dailyAmount)}</span>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Int {fmt(l.interestAmount)} + Prin {fmt(l.dailyPrincipalAmount)}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-orange-600 font-medium">{fmt(l.interestAmount)}</span>
                        {l.interestRate > 0 && (
                          <span className="text-gray-400 text-xs ml-1">({l.interestRate}%)</span>
                        )}
                      </>
                    )}
                  </td>
                  {/* Remaining column */}
                  <td className="px-4 py-3">
                    <span className="text-blue-700 font-semibold">
                      {fmt(l.remainingAmount !== undefined ? l.remainingAmount : l.remainingPrincipal)}
                    </span>
                    {l.totalInterest > 0 && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        of {fmt(l.totalLoanAmount)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 min-w-[100px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-primary-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${progress(l)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8">{progress(l)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {l.collectionPoint ? (
                      <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{l.collectionPoint}</div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Start Date */}
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {l.startDate
                      ? <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{new Date(l.startDate).toLocaleDateString('en-IN')}</div>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  {/* Completion + Overdue */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.loanType === 'Daily' && l.completionDate ? (
                      <div>
                        <span className={l.isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {new Date(l.completionDate).toLocaleDateString('en-IN')}
                        </span>
                        {l.isOverdue && (
                          <div className="flex items-center gap-1 mt-1 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 w-fit">
                            <Clock className="w-3 h-3 text-red-500" />
                            <span className="text-[11px] font-semibold text-red-600">{l.daysOverdue} days overdue</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={l.status === 'Active' ? 'badge-green' : 'badge-gray'}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={() => sendLoanWhatsApp(l)}
                        title="Send WhatsApp reminder"
                        className="p-1.5 rounded text-green-500 hover:text-green-700 hover:bg-green-50 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                      <div className="flex gap-1.5">
                        <button onClick={() => handleEdit(l)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(l._id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>{pagination.total} loans</span>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => fetchLoans(p)}
                  className={`px-3 py-1 rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Pagination */}
      {pagination.pages > 1 && (
        <div className="md:hidden flex items-center justify-between text-sm text-gray-500">
          <span>{pagination.total} loans</span>
          <div className="flex gap-1">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => fetchLoans(p)}
                className={`px-3 py-1 rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editLoan ? 'Edit Loan' : 'Create New Loan'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Loan Type */}
          <div>
            <label className="label">Loan Type</label>
            <div className="flex gap-3">
              {['Daily', 'Monthly'].map(t => (
                <label key={t} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors ${form.loanType === t ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" className="hidden" value={t} checked={form.loanType === t} onChange={e => setForm(p => ({...p, loanType: e.target.value}))} />
                  <span className="font-medium">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Borrower (create only) */}
          {!editLoan && (
            <div>
              <label className="label">Borrower</label>
              <select className="input" value={form.borrower} onChange={e => setForm(p => ({...p, borrower: e.target.value}))} required>
                <option value="">Select borrower</option>
                {borrowers.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* Loan amount trio — only on create */}
          {!editLoan && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Principal Amount (₹)</label>
                  <input
                    type="number" className="input" placeholder="10000" min="1"
                    value={form.principalAmount}
                    onChange={e => onChangePrincipal(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Total Loan Amount (₹) <span className="text-gray-400 font-normal text-xs">Principal + Interest</span></label>
                  <input
                    type="number" className="input" placeholder="12000" min="1"
                    value={form.totalLoanAmount}
                    onChange={e => onChangeTotalLoanAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* ── Multi-account Disbursement ───────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">
                    Disbursement <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  {totalDisbursed > 0 && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      pa > 0 && Math.abs(totalDisbursed - pa) < 0.01
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      Total: {fmt(totalDisbursed)}
                      {pa > 0 && Math.abs(totalDisbursed - pa) >= 0.01 &&
                        <span className="ml-1 opacity-75">/ {fmt(pa)} principal</span>
                      }
                    </span>
                  )}
                </div>

                <div className="space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  {form.disbursements.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      {/* Mode */}
                      <select
                        className="input w-32 text-sm"
                        value={d.mode}
                        onChange={e => updateDisb(i, 'mode', e.target.value)}
                      >
                        <option value="Cash">Cash</option>
                        <option value="Piyush">Piyush Acct</option>
                        <option value="Sanjay">Sanjay Acct</option>
                        <option value="Online">Online</option>
                      </select>

                      {/* Account name (Online only) */}
                      {d.mode === 'Online' && (
                        <input
                          type="text"
                          className="input w-32 text-sm"
                          placeholder="Account name"
                          value={d.accountName}
                          onChange={e => updateDisb(i, 'accountName', e.target.value)}
                        />
                      )}

                      {/* Amount */}
                      <input
                        type="number"
                        className="input w-32 text-sm"
                        placeholder="Amount"
                        min="0"
                        step="0.01"
                        value={d.amount}
                        onChange={e => updateDisb(i, 'amount', e.target.value)}
                      />

                      {/* Quick-fill principal button (first line only) */}
                      {i === 0 && pa > 0 && (
                        <button
                          type="button"
                          onClick={() => updateDisb(0, 'amount', String(pa))}
                          className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap"
                        >
                          Fill {fmt(pa)}
                        </button>
                      )}

                      {/* Remove line */}
                      {form.disbursements.length > 1 && (
                        <button type="button" onClick={() => removeDisbLine(i)} className="text-gray-400 hover:text-red-500 ml-auto">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add another source */}
                  <button
                    type="button"
                    onClick={addDisbLine}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Another Account
                  </button>
                </div>

                <p className="text-xs text-gray-400 mt-1.5">
                  Each account creates a separate debit ledger entry. Leave amounts empty to skip.
                </p>
              </div>
            </>
          )}

          {/* Interest + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Total Interest (₹)</label>
              <input
                type="number" step="0.01" className="input" placeholder="2000" min="0"
                value={form.totalInterest}
                onChange={e => onChangeTotalInterest(e.target.value)}
                required={!editLoan}
              />
            </div>
            <div>
              <label className="label">
                {form.loanType === 'Daily'
                  ? `No. of Installments${form.emiFrequency > 1 ? ` (× ${form.emiFrequency} days each)` : ''}`
                  : 'Duration (months)'}
              </label>
              <input
                type="number" className="input" placeholder={form.loanType === 'Daily' ? '100' : '12'} min="1"
                value={form.duration}
                onChange={e => setForm(p => ({...p, duration: e.target.value}))}
                required
              />
            </div>
          </div>

          {/* EMI Frequency — Daily loans only */}
          {form.loanType === 'Daily' && (
            <div>
              <label className="label">EMI Frequency</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {FREQ_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, emiFrequency: opt.value }))}
                    className={`px-2 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      form.emiFrequency === opt.value
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {form.emiFrequency > 1 && form.duration && (
                <p className="text-xs text-indigo-600 mt-1.5 bg-indigo-50 rounded px-2 py-1">
                  {form.duration} installments × {form.emiFrequency} days = <strong>{form.duration * form.emiFrequency} total days</strong>
                </p>
              )}
            </div>
          )}

          {/* Edit-mode legacy interestRate (shown only if loan has it) */}
          {editLoan && (editLoan.interestRate > 0) && (
            <div>
              <label className="label">Interest Rate (%/month) <span className="text-gray-400 font-normal text-xs">— legacy</span></label>
              <input
                type="number" step="0.01" className="input" placeholder="2.5" min="0"
                value={form.interestRate}
                onChange={e => setForm(p => ({...p, interestRate: e.target.value}))}
              />
            </div>
          )}

          {/* ── Daily Breakdown Preview ──────────────────────────────────────── */}
          {previewDailyTotal !== null && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Daily Breakdown Preview</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-[11px] text-gray-500 mb-1">Daily Total</p>
                  <p className="font-bold text-gray-900">{fmt(previewDailyTotal)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center shadow-sm">
                  <p className="text-[11px] text-gray-500 mb-1">Daily Interest</p>
                  <p className="font-bold text-orange-600">{fmt(previewDailyInterest)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center shadow-sm">
                  <p className="text-[11px] text-gray-500 mb-1">Daily Principal</p>
                  <p className="font-bold text-blue-600">{fmt(previewDailyPrincipal)}</p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-gray-500 pt-1 border-t border-blue-100">
                <span>Total Payable: <strong className="text-gray-800">{fmt(tla)}</strong></span>
                <span>Principal: <strong className="text-gray-800">{fmt(pa)}</strong></span>
                <span>Interest: <strong className="text-gray-800">{fmt(ti)}</strong></span>
              </div>
              {/* Partial payment note */}
              <p className="text-[11px] text-blue-600 bg-blue-100 rounded px-2 py-1">
                Partial payments split proportionally — Interest {ti > 0 && tla > 0 ? Math.round((ti / tla) * 100) : 0}% · Principal {pa > 0 && tla > 0 ? Math.round((pa / tla) * 100) : 0}%
              </p>
            </div>
          )}

          {/* Start Date (create + edit) */}
          <div>
            <label className="label">Start Date</label>
            <input
              type="date" className="input"
              value={form.startDate}
              onChange={e => setForm(p => ({...p, startDate: e.target.value}))}
              required
            />
            {editLoan && form.loanType === 'Daily' && form.startDate && form.duration && (
              <p className="text-xs text-blue-600 mt-1">
                New completion date:{' '}
                <strong>
                  {new Date(new Date(form.startDate).getTime() + parseFloat(form.duration) * (form.emiFrequency || 1) * 86400000).toLocaleDateString('en-IN')}
                </strong>
                {form.emiFrequency > 1
                  ? ` (${form.duration} × ${form.emiFrequency} = ${form.duration * form.emiFrequency} days)`
                  : ` (${form.duration} days)`}
              </p>
            )}
          </div>

          {/* Completion date preview (create only) */}
          {previewCompletionDate && !editLoan && (
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              Completion date: <strong>{previewCompletionDate}</strong>
              {freq > 1
                ? ` (${dur} installments × ${freq} days = ${totalDays} days)`
                : ` (${dur} days from start)`}
            </div>
          )}

          <div>
            <label className="label">Collection Point</label>
            <input type="text" className="input" placeholder="e.g. Market Area, Near Bank..." value={form.collectionPoint} onChange={e => setForm(p => ({...p, collectionPoint: e.target.value}))} />
          </div>

          {editLoan && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}>
                <option value="Active">Active</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          )}

          {/* Is Default Toggle */}
          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-200">
            <div>
              <p className="text-sm font-medium text-orange-800">Mark as Default</p>
              <p className="text-xs text-orange-600 mt-0.5">Flag this loan as a defaulted loan</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(p => ({...p, isDefault: !p.isDefault}))}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.isDefault ? 'bg-orange-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isDefault ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : (editLoan ? 'Update Loan' : 'Create Loan')
              }
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
