import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Bell, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

// Returns { label, type } for a reminder's due date relative to today
const getDateStatus = (dueDate) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < -1) return { label: `${Math.abs(diff)} days overdue`, type: 'overdue' }
  if (diff === -1) return { label: '1 day overdue', type: 'overdue' }
  if (diff === 0)  return { label: 'Today', type: 'today' }
  if (diff === 1)  return { label: 'Tomorrow', type: 'upcoming' }
  return { label: `In ${diff} days`, type: 'upcoming' }
}

const EMPTY_FORM = {
  borrower: '',
  loan:     '',
  title:    'Payment Reminder',
  message:  '',
  dueDate:  new Date().toISOString().split('T')[0],
  amount:   ''
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReminderCard({ reminder: r, isDone = false, onMarkDone, onMarkPending, onEdit, onDelete }) {
  const ds = getDateStatus(r.dueDate)

  const avatarCls = isDone
    ? 'bg-green-100 text-green-700'
    : ds.type === 'overdue'
      ? 'bg-red-100 text-red-700'
      : ds.type === 'today'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-blue-100 text-blue-700'

  const dateBadgeCls = isDone
    ? 'bg-green-100 text-green-700'
    : ds.type === 'overdue'
      ? 'bg-red-100 text-red-700'
      : ds.type === 'today'
        ? 'bg-orange-100 text-orange-700'
        : 'bg-blue-100 text-blue-700'

  // Compute remaining for linked loan
  const loanRemaining = r.loan
    ? (() => {
        const l = r.loan
        if ((l.totalInterest || 0) > 0) {
          const paid = (l.totalPrincipalPaid || 0) + (l.totalInterestPaid || 0)
          return Math.max(0, l.principalAmount + l.totalInterest - paid)
        }
        return l.remainingPrincipal || 0
      })()
    : null

  return (
    <div className="px-4 py-4 flex items-start gap-3 hover:bg-gray-50/40 transition-colors group">
      {/* Avatar initial */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarCls}`}>
        {r.borrower?.name?.charAt(0).toUpperCase()}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          {/* Left: name + meta */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 text-sm">{r.borrower?.name}</p>
              {r.loan && (
                <span className="font-mono text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {r.loan.loanId}
                </span>
              )}
              {r.amount > 0 && (
                <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                  {fmt(r.amount)}
                </span>
              )}
              {loanRemaining !== null && !r.amount && (
                <span className="text-xs text-gray-400">Remaining {fmt(loanRemaining)}</span>
              )}
            </div>
            <p className="text-xs font-medium text-gray-500 mt-0.5">{r.title}</p>
          </div>

          {/* Right: date badge */}
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${dateBadgeCls}`}>
            {isDone
              ? new Date(r.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : ds.label
            }
          </span>
        </div>

        {/* Message */}
        {r.message && (
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed italic">"{r.message}"</p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="text-[11px] text-gray-400">
            {new Date(r.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {r.createdBy && (
            <span className="text-[11px] text-gray-400">· Added by {r.createdBy.name}</span>
          )}
          {isDone && r.completedAt && (
            <span className="text-[11px] text-green-600">
              · Done {new Date(r.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-1">
            {!isDone ? (
              <button
                onClick={() => onMarkDone(r._id)}
                className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Done
              </button>
            ) : (
              <button
                onClick={() => onMarkPending(r._id)}
                className="text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                Re-open
              </button>
            )}
            <button
              onClick={() => onEdit(r)}
              className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(r._id)}
              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReminderGroup({ title, colorKey, count, reminders, onMarkDone, onEdit, onDelete }) {
  const styles = {
    red:    { header: 'bg-red-50 border-red-100',    dot: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700' },
    orange: { header: 'bg-orange-50 border-orange-100', dot: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
    blue:   { header: 'bg-blue-50 border-blue-100',  dot: 'bg-blue-500',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' }
  }
  const s = styles[colorKey]

  return (
    <div className="card overflow-hidden">
      <div className={`px-4 py-3 ${s.header} border-b flex items-center gap-2`}>
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <h3 className={`text-sm font-semibold ${s.text}`}>{title}</h3>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{count}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {reminders.map(r => (
          <ReminderCard
            key={r._id}
            reminder={r}
            onMarkDone={onMarkDone}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Reminders() {
  const { isAdmin } = useAuth()
  const [reminders,    setReminders]    = useState([])
  const [summary,      setSummary]      = useState({ overdue: 0, today: 0, upcoming: 0, done: 0 })
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState('pending')
  const [borrowers,    setBorrowers]    = useState([])
  const [borrowerLoans, setBorrowerLoans] = useState([])
  const [showModal,    setShowModal]    = useState(false)
  const [editReminder, setEditReminder] = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchReminders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/reminders', {
        params: { status: activeTab === 'pending' ? 'Pending' : 'Done' }
      })
      setReminders(res.data.data)
      setSummary(res.data.summary)
    } catch { toast.error('Failed to load reminders') }
    finally { setLoading(false) }
  }, [activeTab])

  useEffect(() => { fetchReminders() }, [fetchReminders])

  // Borrowers list for modal
  useEffect(() => {
    api.get('/borrowers', { params: { limit: 200 } })
      .then(r => setBorrowers(r.data.data))
      .catch(() => {})
  }, [])

  // Loans for selected borrower (modal)
  useEffect(() => {
    if (form.borrower) {
      api.get('/loans', { params: { borrowerId: form.borrower, status: 'Active', limit: 20 } })
        .then(r => setBorrowerLoans(r.data.data))
        .catch(() => setBorrowerLoans([]))
    } else {
      setBorrowerLoans([])
    }
  }, [form.borrower])

  // ── Grouping pending reminders by urgency ────────────────────────────────────

  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)

  const overdueList  = reminders.filter(r => { const d = new Date(r.dueDate); d.setHours(0,0,0,0); return d < todayMidnight })
  const todayList    = reminders.filter(r => { const d = new Date(r.dueDate); d.setHours(0,0,0,0); return d.getTime() === todayMidnight.getTime() })
  const upcomingList = reminders.filter(r => { const d = new Date(r.dueDate); d.setHours(0,0,0,0); return d > todayMidnight })

  // ── Actions ─────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditReminder(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const handleEdit = (reminder) => {
    setEditReminder(reminder)
    setForm({
      borrower: reminder.borrower?._id || '',
      loan:     reminder.loan?._id     || '',
      title:    reminder.title         || 'Payment Reminder',
      message:  reminder.message       || '',
      dueDate:  new Date(reminder.dueDate).toISOString().split('T')[0],
      amount:   reminder.amount        || ''
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editReminder) {
        await api.put(`/reminders/${editReminder._id}`, {
          title:   form.title,
          message: form.message,
          dueDate: form.dueDate,
          loan:    form.loan   || undefined,
          amount:  form.amount !== '' ? parseFloat(form.amount) : undefined
        })
        toast.success('Reminder updated')
      } else {
        await api.post('/reminders', {
          borrower: form.borrower,
          loan:     form.loan    || undefined,
          title:    form.title,
          message:  form.message,
          dueDate:  form.dueDate,
          amount:   form.amount !== '' ? parseFloat(form.amount) : undefined
        })
        toast.success('Reminder created')
      }
      setShowModal(false)
      setEditReminder(null)
      setForm(EMPTY_FORM)
      fetchReminders()
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const markDone = async (id) => {
    try { await api.put(`/reminders/${id}`, { status: 'Done' }); fetchReminders() }
    catch { toast.error('Failed') }
  }

  const markPending = async (id) => {
    try { await api.put(`/reminders/${id}`, { status: 'Pending' }); fetchReminders() }
    catch { toast.error('Failed') }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this reminder?')) return
    try { await api.delete(`/reminders/${id}`); toast.success('Deleted'); fetchReminders() }
    catch { toast.error('Failed') }
  }

  const urgentCount = summary.overdue + summary.today

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-600" />
            Reminders
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Schedule payment follow-ups for borrowers</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> New Reminder
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Overdue',   value: summary.overdue,   bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-700',    num: 'text-red-600'    },
          { label: 'Due Today', value: summary.today,     bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700', num: 'text-orange-600' },
          { label: 'Upcoming',  value: summary.upcoming,  bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700',   num: 'text-blue-600'   },
          { label: 'Done',      value: summary.done,      bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-green-700',  num: 'text-green-600'  }
        ].map(c => (
          <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
            <p className={`text-xs font-semibold ${c.text} uppercase tracking-wide`}>{c.label}</p>
            <p className={`text-3xl font-bold ${c.num} mt-1`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[['pending', 'Pending'], ['done', 'Done']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {key === 'pending' && urgentCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {urgentCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : reminders.length === 0 ? (
        <div className="card text-center py-20 space-y-3">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <Bell className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-400 font-medium">No {activeTab} reminders</p>
          {activeTab === 'pending' && (
            <button onClick={openCreate} className="btn-primary mt-2">
              <Plus className="w-4 h-4" /> Create First Reminder
            </button>
          )}
        </div>
      ) : activeTab === 'pending' ? (
        <div className="space-y-4">
          {overdueList.length > 0 && (
            <ReminderGroup
              title="Overdue"
              colorKey="red"
              count={overdueList.length}
              reminders={overdueList}
              onMarkDone={markDone}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
          {todayList.length > 0 && (
            <ReminderGroup
              title="Due Today"
              colorKey="orange"
              count={todayList.length}
              reminders={todayList}
              onMarkDone={markDone}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
          {upcomingList.length > 0 && (
            <ReminderGroup
              title="Upcoming"
              colorKey="blue"
              count={upcomingList.length}
              reminders={upcomingList}
              onMarkDone={markDone}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      ) : (
        /* Done tab — flat list */
        <div className="card overflow-hidden divide-y divide-gray-50">
          {reminders.map(r => (
            <ReminderCard
              key={r._id}
              reminder={r}
              isDone
              onMarkPending={markPending}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditReminder(null) }}
        title={editReminder ? 'Edit Reminder' : 'New Reminder'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Borrower */}
          <div>
            <label className="label">Borrower</label>
            <select
              className="input"
              value={form.borrower}
              onChange={e => setForm(p => ({ ...p, borrower: e.target.value, loan: '' }))}
              required
              disabled={!!editReminder}
            >
              <option value="">Select borrower…</option>
              {borrowers.map(b => (
                <option key={b._id} value={b._id}>{b.name}{b.phone ? ` · ${b.phone}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Linked loan (optional, shown after borrower selected) */}
          {form.borrower && (
            <div>
              <label className="label">
                Linked Loan <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                className="input"
                value={form.loan}
                onChange={e => setForm(p => ({ ...p, loan: e.target.value }))}
              >
                <option value="">No specific loan</option>
                {borrowerLoans.map(l => (
                  <option key={l._id} value={l._id}>
                    {l.loanId} — Rem {fmt(l.remainingAmount || l.remainingPrincipal)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. EMI Due, Follow-up Call, Overdue Notice"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              required
            />
          </div>

          {/* Date + Amount row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Remind On</label>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">
                Due Amount (₹) <span className="text-gray-400 font-normal text-xs">(optional)</span>
              </label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 2500"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="label">Note / Message</label>
            <textarea
              className="input"
              rows={3}
              placeholder="e.g. Call borrower and follow up on overdue May installment"
              value={form.message}
              onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditReminder(null) }}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving
                ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : editReminder ? 'Update Reminder' : 'Create Reminder'
              }
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
