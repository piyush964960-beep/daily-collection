import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, History, CheckCircle2, X, ChevronDown, ChevronUp, BarChart2, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const today = new Date().toISOString().split('T')[0]

const emptyPayment = () => ({ mode: 'Cash', amount: '', accountName: '' })

// ── Proportional split (new model) / interest-first (legacy) ─────────────────
// dailyPrincipal = 0 means legacy model → interest-first
const calcSplit = (dailyInterest, dailyPrincipal, remaining, totalPaid) => {
  const paid = parseFloat(totalPaid) || 0
  if (paid === 0) return { interest: 0, principal: 0 }

  if (dailyPrincipal > 0) {
    // Proportional split
    const dailyTotal  = dailyInterest + dailyPrincipal
    const ratio       = dailyTotal > 0 ? dailyInterest / dailyTotal : 0
    const interest    = parseFloat((paid * ratio).toFixed(2))
    const principal   = parseFloat(Math.min(Math.max(0, paid - interest), remaining).toFixed(2))
    return { interest, principal }
  }

  // Interest-first (legacy)
  const interest  = parseFloat(Math.min(dailyInterest, paid).toFixed(2))
  const principal = parseFloat(Math.min(Math.max(0, paid - interest), remaining).toFixed(2))
  return { interest, principal }
}

const PAYMENT_MODES = ['Cash', 'Piyush', 'Sanjay', 'Online']
const MODE_COLORS   = { Cash: 'badge-blue', Piyush: 'badge-green', Sanjay: 'badge-yellow', Online: 'badge-gray' }
const ACCOUNT_BG    = { Cash: 'bg-blue-50 text-blue-800', Piyush: 'bg-green-50 text-green-800', Sanjay: 'bg-yellow-50 text-yellow-800', Online: 'bg-gray-50 text-gray-800' }

export default function DailyEntries() {
  const { isAdmin } = useAuth()
  const navigate    = useNavigate()
  const [activeTab, setActiveTab]     = useState('collection')
  const [selectedDate, setSelectedDate] = useState(today)

  // ── Collection state ──────────────────────────────────────────────────────
  const [borrowerTable, setBorrowerTable] = useState([])
  const [tableLoading,  setTableLoading]  = useState(true)
  const [expandedRows,  setExpandedRows]  = useState({})   // loanId → bool (individual mode)
  const [rowPayments,   setRowPayments]   = useState({})   // loanId → [{mode, amount, accountName}]
  const [savingRow,     setSavingRow]     = useState({})   // loanId → bool

  // ── Entry mode ────────────────────────────────────────────────────────────
  const [entryMode,  setEntryMode]  = useState('individual')
  const [bulkInputs, setBulkInputs] = useState({})   // loanId → [{mode, amount, accountName}]
  const [bulkSaving, setBulkSaving] = useState(false)

  // ── History state ─────────────────────────────────────────────────────────
  const [historyEntries,    setHistoryEntries]    = useState([])
  const [historyLoading,    setHistoryLoading]    = useState(false)
  const [historyFilters,    setHistoryFilters]    = useState({ startDate: today, endDate: today, mode: '' })
  const [historyPagination, setHistoryPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [collectedByFilter, setCollectedByFilter] = useState('')
  const [collectorsList,    setCollectorsList]    = useState([])

  // ── Borrower history modal ────────────────────────────────────────────────
  const [historyModal, setHistoryModal] = useState({ open: false, borrower: null, entries: [], totals: null, loading: false })

  // ── Collectors list (admin only) ─────────────────────────────────────────
  useEffect(() => {
    if (isAdmin) {
      api.get('/auth/collectors').then(r => setCollectorsList(r.data.data || [])).catch(() => {})
    }
  }, [isAdmin])

  // ── Borrower table fetch ──────────────────────────────────────────────────

  const fetchBorrowerTable = useCallback(async () => {
    setTableLoading(true)
    try {
      const res = await api.get('/daily-entries/borrower-table', { params: { date: selectedDate } })
      setBorrowerTable(res.data.data)

      // Initialise payment state for pending rows
      const initIndividual = {}
      const initBulk       = {}
      res.data.data.forEach(row => {
        if (!row.todayEntry) {
          initIndividual[row.loan._id] = [emptyPayment()]
          initBulk[row.loan._id]       = [emptyPayment()]
        }
      })
      setRowPayments(p => ({ ...initIndividual, ...p }))
      setBulkInputs(initBulk)
    } catch { toast.error('Failed to load borrower table') }
    finally { setTableLoading(false) }
  }, [selectedDate])

  useEffect(() => { fetchBorrowerTable() }, [fetchBorrowerTable])

  // ── Individual mode helpers ───────────────────────────────────────────────

  const updatePayment = (loanId, index, field, value) => {
    setRowPayments(p => {
      const updated = [...(p[loanId] || [emptyPayment()])]
      updated[index] = { ...updated[index], [field]: value }
      return { ...p, [loanId]: updated }
    })
  }
  const addPaymentLine = (loanId) =>
    setRowPayments(p => ({ ...p, [loanId]: [...(p[loanId] || [emptyPayment()]), emptyPayment()] }))

  const removePaymentLine = (loanId, index) =>
    setRowPayments(p => {
      const updated = (p[loanId] || []).filter((_, i) => i !== index)
      return { ...p, [loanId]: updated.length ? updated : [emptyPayment()] }
    })

  const getRowTotal = (loanId) =>
    (rowPayments[loanId] || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

  const saveRow = async (row) => {
    const loanId   = row.loan._id
    const payments = (rowPayments[loanId] || []).filter(p => parseFloat(p.amount) > 0)
    if (!payments.length) { toast.error('Enter at least one payment amount'); return }

    setSavingRow(p => ({ ...p, [loanId]: true }))
    try {
      await api.post('/daily-entries', {
        borrower: row.borrower._id,
        loan:     loanId,
        payments: payments.map(p => ({ mode: p.mode, amount: parseFloat(p.amount), accountName: p.accountName || '' })),
        date:     selectedDate,
        notes:    ''
      })
      toast.success(`Payment saved for ${row.borrower.name}`)
      setExpandedRows(p => ({ ...p, [loanId]: false }))
      fetchBorrowerTable()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save')
    } finally {
      setSavingRow(p => ({ ...p, [loanId]: false }))
    }
  }

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Delete this entry? Loan balance will be reversed.')) return
    try { await api.delete(`/daily-entries/${entryId}`); toast.success('Entry deleted'); fetchBorrowerTable() }
    catch (err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  // ── Bulk mode helpers ─────────────────────────────────────────────────────

  const updateBulk = (loanId, index, field, value) =>
    setBulkInputs(p => {
      const updated = [...(p[loanId] || [emptyPayment()])]
      updated[index] = { ...updated[index], [field]: value }
      return { ...p, [loanId]: updated }
    })

  const addBulkLine = (loanId) =>
    setBulkInputs(p => ({ ...p, [loanId]: [...(p[loanId] || [emptyPayment()]), emptyPayment()] }))

  const removeBulkLine = (loanId, index) =>
    setBulkInputs(p => {
      const updated = (p[loanId] || []).filter((_, i) => i !== index)
      return { ...p, [loanId]: updated.length ? updated : [emptyPayment()] }
    })

  const getBulkTotal = (loanId) =>
    (bulkInputs[loanId] || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

  // ── Real-time bulk aggregation ────────────────────────────────────────────
  const bulkAgg = useMemo(() => {
    const acc = { total: 0, Cash: 0, Piyush: 0, Sanjay: 0, Online: 0 }
    Object.values(bulkInputs).forEach(payments => {
      if (!Array.isArray(payments)) return
      payments.forEach(p => {
        const amt = parseFloat(p.amount) || 0
        if (amt > 0) {
          acc[p.mode] = (acc[p.mode] || 0) + amt
          acc.total += amt
        }
      })
    })
    return acc
  }, [bulkInputs])

  const saveAllBulk = async () => {
    const pendingRows = borrowerTable.filter(r => !r.todayEntry)
    const toSubmit    = pendingRows.filter(r => {
      const pmts = bulkInputs[r.loan._id]
      return Array.isArray(pmts) && pmts.some(p => parseFloat(p.amount) > 0)
    })
    if (!toSubmit.length) { toast.error('Enter at least one amount'); return }

    setBulkSaving(true)
    const results = await Promise.allSettled(
      toSubmit.map(row => {
        const pmts = (bulkInputs[row.loan._id] || []).filter(p => parseFloat(p.amount) > 0)
        return api.post('/daily-entries', {
          borrower: row.borrower._id,
          loan:     row.loan._id,
          payments: pmts.map(p => ({ mode: p.mode, amount: parseFloat(p.amount), accountName: p.accountName || '' })),
          date:     selectedDate,
          notes:    ''
        })
      })
    )
    const saved  = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed === 0) toast.success(`${saved} entr${saved === 1 ? 'y' : 'ies'} saved`)
    else              toast.error(`${saved} saved, ${failed} failed`)
    setBulkSaving(false)
    fetchBorrowerTable()
  }

  // ── Borrower history modal ────────────────────────────────────────────────

  const openHistory = async (borrower) => {
    setHistoryModal({ open: true, borrower, entries: [], totals: null, loading: true })
    try {
      const res = await api.get(`/daily-entries/borrower-history/${borrower._id}`, { params: { limit: 100 } })
      setHistoryModal({ open: true, borrower, entries: res.data.data, totals: res.data.totals, loading: false })
    } catch {
      toast.error('Failed to load history')
      setHistoryModal(p => ({ ...p, loading: false }))
    }
  }

  // ── History tab fetch ─────────────────────────────────────────────────────

  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true)
    try {
      const params = { ...historyFilters, page, limit: 30 }
      if (collectedByFilter) params.collectedBy = collectedByFilter
      const res = await api.get('/daily-entries', { params })
      setHistoryEntries(res.data.data)
      setHistoryPagination(res.data.pagination)
    } catch { toast.error('Failed to load history') }
    finally { setHistoryLoading(false) }
  }, [historyFilters, collectedByFilter])

  useEffect(() => { if (activeTab === 'history') fetchHistory() }, [activeTab, fetchHistory])

  // ── Counts ────────────────────────────────────────────────────────────────
  const pendingCount = borrowerTable.filter(r => !r.todayEntry).length
  const paidCount    = borrowerTable.filter(r =>  r.todayEntry).length

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[['collection', 'Daily Collection'], ['history', 'History']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ COLLECTION TAB ════════════════════════════════════════════════════ */}
      {activeTab === 'collection' && (
        <div className="space-y-4">
          {/* Controls strip */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Date:</label>
              <input type="date" className="input w-auto" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>

            {/* Individual / Bulk toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[['individual', 'Individual'], ['bulk', 'Bulk']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setEntryMode(val)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    entryMode === val ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {val === 'bulk' && <Layers className="w-3.5 h-3.5" />}
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 ml-auto items-center">
              <span className="badge bg-yellow-100 text-yellow-800">{pendingCount} Pending</span>
              <span className="badge-green">{paidCount} Paid</span>
              <button
                onClick={() => navigate(`/daily-report?date=${selectedDate}`)}
                className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
              >
                <BarChart2 className="w-3.5 h-3.5" /> View Report
              </button>
            </div>
          </div>

          {/* ── INDIVIDUAL MODE ────────────────────────────────────────────── */}
          {entryMode === 'individual' && (
            <div className="card overflow-hidden">
              {tableLoading ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
                </div>
              ) : borrowerTable.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No active loans found</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {borrowerTable.map((row) => {
                    const loanId     = row.loan._id
                    const isExpanded = expandedRows[loanId]
                    const payments   = rowPayments[loanId] || [emptyPayment()]
                    const total      = getRowTotal(loanId)
                    const split      = calcSplit(row.dailyInterestAmount, row.dailyPrincipalAmount, row.loan.remainingPrincipal, total)
                    const isPaid     = !!row.todayEntry

                    return (
                      <div key={loanId} className={isPaid ? 'bg-green-50/40' : 'bg-white'}>
                        {/* Row Header */}
                        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-[160px]">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isPaid ? 'bg-green-500 text-white' : 'bg-primary-100 text-primary-700'}`}>
                              {isPaid ? <CheckCircle2 className="w-4 h-4" /> : row.borrower.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-gray-900">{row.borrower.name}</p>
                              {row.loan.collectionPoint && <p className="text-xs text-gray-400">{row.loan.collectionPoint}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span className="font-mono bg-gray-100 px-2 py-1 rounded">{row.loan.loanId}</span>
                            <span className={row.loan.loanType === 'Daily' ? 'badge-blue' : 'badge-yellow'}>{row.loan.loanType}</span>
                            <span>Remaining: <strong className="text-blue-700">{fmt(row.remainingAmount)}</strong></span>
                            {row.dailyPrincipalAmount > 0 ? (
                              <span>Daily: <strong className="text-gray-700">{fmt(row.dailyAmount)}</strong>
                                <span className="text-gray-400 ml-1">(Int {fmt(row.dailyInterestAmount)} + Prin {fmt(row.dailyPrincipalAmount)})</span>
                              </span>
                            ) : (
                              <span>Int/day: <strong className="text-orange-600">{fmt(row.dailyInterestAmount)}</strong></span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            {!isPaid && (
                              <button
                                onClick={() => setExpandedRows(p => ({ ...p, [loanId]: !isExpanded }))}
                                className={`btn text-xs py-1.5 ${isExpanded ? 'btn-secondary' : 'btn-primary'}`}
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                {isExpanded ? 'Close' : 'Enter Payment'}
                              </button>
                            )}
                            <button onClick={() => openHistory(row.borrower)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50" title="History">
                              <History className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Paid: summary */}
                        {isPaid && row.todayEntry && (
                          <div className="px-4 pb-3 ml-10">
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="font-bold text-green-700 text-sm">{fmt(row.todayEntry.amountPaid)}</span>
                              <span className="text-orange-600">Interest: {fmt(row.todayEntry.interestPortion)}</span>
                              <span className="text-blue-600">Principal: {fmt(row.todayEntry.principalPortion)}</span>
                              {row.todayEntry.payments?.length > 0
                                ? row.todayEntry.payments.map((p, i) => (
                                    <span key={i} className={`${MODE_COLORS[p.mode]} badge`}>
                                      {p.mode}{p.accountName ? ` (${p.accountName})` : ''}: {fmt(p.amount)}
                                    </span>
                                  ))
                                : <span className={`${MODE_COLORS[row.todayEntry.mode]} badge`}>{row.todayEntry.mode}</span>
                              }
                              {isAdmin && (
                                <button onClick={() => deleteEntry(row.todayEntry._id)} className="text-red-400 hover:text-red-600 ml-2">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Expanded: entry form */}
                        {!isPaid && isExpanded && (
                          <div className="px-4 pb-4 ml-10 space-y-3">
                            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                              {payments.map((payment, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  <select className="input w-28 text-sm" value={payment.mode} onChange={e => updatePayment(loanId, i, 'mode', e.target.value)}>
                                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                  {payment.mode === 'Online' && (
                                    <input type="text" className="input w-32 text-sm" placeholder="Account name" value={payment.accountName} onChange={e => updatePayment(loanId, i, 'accountName', e.target.value)} />
                                  )}
                                  <input type="number" className="input w-28 text-sm" placeholder="Amount" min="0" step="0.01" value={payment.amount} onChange={e => updatePayment(loanId, i, 'amount', e.target.value)} />
                                  {payments.length > 1 && (
                                    <button type="button" onClick={() => removePaymentLine(loanId, i)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                  )}
                                </div>
                              ))}
                              <button type="button" onClick={() => addPaymentLine(loanId)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                                <Plus className="w-3.5 h-3.5" /> Add Split Payment
                              </button>

                              {total > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-3 gap-2 text-xs">
                                  <div className="bg-white rounded-lg p-2 text-center">
                                    <p className="text-gray-500">Total</p>
                                    <p className="font-bold text-gray-900">{fmt(total)}</p>
                                  </div>
                                  <div className="bg-orange-50 rounded-lg p-2 text-center">
                                    <p className="text-gray-500">Interest</p>
                                    <p className="font-bold text-orange-600">{fmt(split.interest)}</p>
                                  </div>
                                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                                    <p className="text-gray-500">Principal</p>
                                    <p className="font-bold text-blue-600">{fmt(split.principal)}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => saveRow(row)}
                              disabled={savingRow[loanId] || total === 0}
                              className="btn-primary w-full justify-center"
                            >
                              {savingRow[loanId]
                                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                : <><CheckCircle2 className="w-4 h-4" /> Save Payment {total > 0 ? fmt(total) : ''}</>
                              }
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── BULK MODE ──────────────────────────────────────────────────── */}
          {entryMode === 'bulk' && (
            <div className="space-y-4">
              {tableLoading ? (
                <div className="card flex justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* ── Real-time aggregation banner ──────────────────────── */}
                  {bulkAgg.total > 0 && (
                    <div className="card p-4 bg-gradient-to-r from-primary-50 to-indigo-50 border border-primary-100">
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Running Total</p>
                          <p className="text-2xl font-bold text-primary-700">{fmt(bulkAgg.total)}</p>
                        </div>
                        <div className="flex flex-wrap gap-3 ml-4">
                          {PAYMENT_MODES.filter(m => (bulkAgg[m] || 0) > 0).map(mode => (
                            <div key={mode} className={`px-3 py-2 rounded-xl text-sm font-medium ${ACCOUNT_BG[mode]}`}>
                              <span className="opacity-70 text-xs block">{mode}</span>
                              <span className="font-bold">{fmt(bulkAgg[mode])}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Pending rows ──────────────────────────────────────── */}
                  {borrowerTable.filter(r => !r.todayEntry).length > 0 && (
                    <div className="card overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-sm font-semibold text-gray-700">Pending Payments ({pendingCount})</h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {borrowerTable.filter(r => !r.todayEntry).map(row => {
                          const loanId    = row.loan._id
                          const pmts      = bulkInputs[loanId] || [emptyPayment()]
                          const bulkTotal = getBulkTotal(loanId)
                          const split     = calcSplit(row.dailyInterestAmount, row.dailyPrincipalAmount, row.loan.remainingPrincipal, bulkTotal)

                          return (
                            <div key={loanId} className="px-4 py-3 space-y-2">
                              {/* Borrower header row */}
                              <div className="flex flex-wrap items-start gap-3">
                                {/* Name + loan info */}
                                <div className="min-w-[140px]">
                                  <p className="font-semibold text-sm text-gray-900">{row.borrower.name}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">{row.loan.loanId}</span>
                                    {row.loan.collectionPoint && <span className="text-[11px] text-gray-400">{row.loan.collectionPoint}</span>}
                                  </div>
                                </div>

                                {/* Amounts info */}
                                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                                  <span>Remaining: <strong className="text-blue-700">{fmt(row.remainingAmount)}</strong></span>
                                  {row.dailyPrincipalAmount > 0 ? (
                                    <span>Daily: <strong className="text-gray-700">{fmt(row.dailyAmount)}</strong>
                                      <span className="text-gray-400 ml-1">(Int {fmt(row.dailyInterestAmount)} + Prin {fmt(row.dailyPrincipalAmount)})</span>
                                    </span>
                                  ) : (
                                    <span>Int/day: <strong className="text-orange-600">{fmt(row.dailyInterestAmount)}</strong></span>
                                  )}
                                </div>

                                {/* Split preview */}
                                {bulkTotal > 0 && (
                                  <div className="ml-auto flex items-center gap-2 text-xs">
                                    <span className="bg-white border rounded-lg px-2 py-1 font-semibold text-gray-800">{fmt(bulkTotal)}</span>
                                    <span className="text-orange-600">Int {fmt(split.interest)}</span>
                                    <span className="text-blue-600">Prin {fmt(split.principal)}</span>
                                  </div>
                                )}
                              </div>

                              {/* Payment lines */}
                              <div className="space-y-2 pl-2 border-l-2 border-gray-100">
                                {pmts.map((payment, i) => (
                                  <div key={i} className="flex items-center gap-2 flex-wrap">
                                    <select
                                      className="input text-sm py-1.5 w-28"
                                      value={payment.mode}
                                      onChange={e => updateBulk(loanId, i, 'mode', e.target.value)}
                                    >
                                      {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    {payment.mode === 'Online' && (
                                      <input
                                        type="text"
                                        className="input text-sm py-1.5 w-28"
                                        placeholder="Account name"
                                        value={payment.accountName}
                                        onChange={e => updateBulk(loanId, i, 'accountName', e.target.value)}
                                      />
                                    )}
                                    <input
                                      type="number"
                                      className="input text-sm py-1.5 w-28"
                                      placeholder="Amount"
                                      min="0"
                                      step="0.01"
                                      value={payment.amount}
                                      onChange={e => updateBulk(loanId, i, 'amount', e.target.value)}
                                    />
                                    {pmts.length > 1 && (
                                      <button type="button" onClick={() => removeBulkLine(loanId, i)} className="text-gray-400 hover:text-red-500">
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                    {i === pmts.length - 1 && (
                                      <button type="button" onClick={() => addBulkLine(loanId)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 ml-1">
                                        <Plus className="w-3.5 h-3.5" /> Split
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Already paid today */}
                  {borrowerTable.filter(r => r.todayEntry).length > 0 && (
                    <div className="card overflow-hidden">
                      <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                        <h3 className="text-sm font-semibold text-green-700">Paid Today ({paidCount})</h3>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {borrowerTable.filter(r => r.todayEntry).map(row => (
                          <div key={row.loan._id} className="px-4 py-2.5 flex items-center gap-3 bg-green-50/30 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-medium text-gray-900 min-w-[120px]">{row.borrower.name}</span>
                            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{row.loan.loanId}</span>
                            <span className="font-semibold text-green-700">{fmt(row.todayEntry.amountPaid)}</span>
                            <span className="text-orange-600 text-xs">Int: {fmt(row.todayEntry.interestPortion)}</span>
                            <span className="text-blue-600 text-xs">Prin: {fmt(row.todayEntry.principalPortion)}</span>
                            {isAdmin && (
                              <button onClick={() => deleteEntry(row.todayEntry._id)} className="ml-auto text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save All button */}
                  {borrowerTable.filter(r => !r.todayEntry).length > 0 && (
                    <button onClick={saveAllBulk} disabled={bulkSaving} className="btn-primary w-full justify-center py-3">
                      {bulkSaving
                        ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                        : <><CheckCircle2 className="w-5 h-5" /> Save All Entries{bulkAgg.total > 0 ? ` — ${fmt(bulkAgg.total)}` : ''}</>
                      }
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ HISTORY TAB ═══════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          <div className="card p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="label text-xs">From</label>
              <input type="date" className="input" value={historyFilters.startDate} onChange={e => setHistoryFilters(p => ({...p, startDate: e.target.value}))} />
            </div>
            <div>
              <label className="label text-xs">To</label>
              <input type="date" className="input" value={historyFilters.endDate} onChange={e => setHistoryFilters(p => ({...p, endDate: e.target.value}))} />
            </div>
            <div>
              <label className="label text-xs">Mode</label>
              <select className="input" value={historyFilters.mode} onChange={e => setHistoryFilters(p => ({...p, mode: e.target.value}))}>
                <option value="">All</option>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            {isAdmin && collectorsList.length > 0 && (
              <div>
                <label className="label text-xs">Collector</label>
                <select className="input" value={collectedByFilter} onChange={e => setCollectedByFilter(e.target.value)}>
                  <option value="">All Collectors</option>
                  {collectorsList.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <button onClick={() => fetchHistory()} className="btn-primary">Apply</button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    {['Date', 'Borrower', 'Loan', 'Amount', 'Interest', 'Principal', 'Payments', 'Collector', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historyLoading ? (
                    <tr><td colSpan={9} className="text-center py-12">
                      <div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" /></div>
                    </td></tr>
                  ) : historyEntries.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">No entries found</td></tr>
                  ) : historyEntries.map(e => (
                    <tr key={e._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openHistory(e.borrower)} className="font-medium text-primary-600 hover:underline text-left">{e.borrower?.name}</button>
                      </td>
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{e.loan?.loanId}</span></td>
                      <td className="px-4 py-3 font-semibold text-green-700">{fmt(e.amountPaid)}</td>
                      <td className="px-4 py-3 text-orange-600">{fmt(e.interestPortion)}</td>
                      <td className="px-4 py-3 text-blue-600">{fmt(e.principalPortion)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.payments?.length > 0
                            ? e.payments.map((p, i) => (
                                <span key={i} className={`${MODE_COLORS[p.mode]} badge text-[10px]`}>
                                  {p.mode}{p.accountName ? ` (${p.accountName})` : ''}: {fmt(p.amount)}
                                </span>
                              ))
                            : <span className={`${MODE_COLORS[e.mode]} badge`}>{e.mode}</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{e.collectedBy?.name}</td>
                      <td className="px-4 py-3">
                        {isAdmin && (
                          <button
                            onClick={() => api.delete(`/daily-entries/${e._id}`).then(() => { toast.success('Deleted'); fetchHistory() }).catch(err => toast.error(err.response?.data?.message || 'Failed'))}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyPagination.pages > 1 && (
              <div className="px-6 py-3 border-t flex justify-between text-sm text-gray-500">
                <span>{historyPagination.total} entries</span>
                <div className="flex gap-1">
                  {Array.from({ length: historyPagination.pages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => fetchHistory(p)} className={`px-3 py-1 rounded ${p === historyPagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Borrower History Modal ════════════════════════════════════════════ */}
      <Modal isOpen={historyModal.open} onClose={() => setHistoryModal(p => ({...p, open: false}))} title={`Payment History — ${historyModal.borrower?.name}`} size="xl">
        {historyModal.loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {historyModal.totals && (
              <div className="grid grid-cols-3 gap-3">
                {[['Total Received', historyModal.totals.amount, 'bg-primary-600'], ['Total Interest', historyModal.totals.interest, 'bg-orange-500'], ['Total Principal', historyModal.totals.principal, 'bg-blue-500']].map(([label, val, color]) => (
                  <div key={label} className={`${color} text-white rounded-xl p-3 text-center`}>
                    <p className="text-xs opacity-80">{label}</p>
                    <p className="font-bold text-sm mt-0.5">{fmt(val)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs sticky top-0">
                  <tr>
                    {['Date', 'Loan', 'Amount', 'Interest', 'Principal', 'Payments'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historyModal.entries.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No payment history</td></tr>
                  ) : historyModal.entries.map(e => (
                    <tr key={e._id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                        {new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2.5"><span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{e.loan?.loanId}</span></td>
                      <td className="px-3 py-2.5 font-semibold text-green-700">{fmt(e.amountPaid)}</td>
                      <td className="px-3 py-2.5 text-orange-600">{fmt(e.interestPortion)}</td>
                      <td className="px-3 py-2.5 text-blue-600">{fmt(e.principalPortion)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {e.payments?.length > 0
                            ? e.payments.map((p, i) => (
                                <span key={i} className={`${MODE_COLORS[p.mode]} badge text-[10px]`}>
                                  {p.mode}{p.accountName ? `(${p.accountName})` : ''}: {fmt(p.amount)}
                                </span>
                              ))
                            : <span className={`${MODE_COLORS[e.mode] || 'badge-gray'} badge`}>{e.mode}</span>
                          }
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
