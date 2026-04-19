import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const today = new Date().toISOString().split('T')[0]

const MODE_COLORS = { Cash: 'badge-blue', Piyush: 'badge-green', Sanjay: 'badge-yellow', Online: 'badge-gray' }

export default function DailyReport() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today)
  const [report, setReport] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const [reportRes, entriesRes] = await Promise.all([
        api.get('/daily-entries/daily-report', { params: { date: selectedDate } }),
        api.get('/daily-entries', { params: { startDate: selectedDate, endDate: selectedDate, limit: 200 } })
      ])
      setReport(reportRes.data.data)
      setEntries(entriesRes.data.data)
    } catch {
      toast.error('Failed to load daily report')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { fetchReport() }, [fetchReport])

  // Compute per-collector breakdown (admin only) from entries list
  const collectorBreakdown = entries.reduce((acc, e) => {
    const name = e.collectedBy?.name || 'Unknown'
    if (!acc[name]) acc[name] = { count: 0, amount: 0, interest: 0, principal: 0 }
    acc[name].count += 1
    acc[name].amount += e.amountPaid
    acc[name].interest += e.interestPortion
    acc[name].principal += e.principalPortion
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => navigate('/entries')}
          className="btn-secondary py-2 px-3 flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">Daily Report</h1>
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="date"
            className="input w-auto"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
          <button onClick={fetchReport} disabled={loading} className="btn-secondary p-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : !report || report.totalEntries === 0 ? (
        <div className="card text-center py-20 text-gray-400">
          <p className="text-lg font-medium">No entries for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      ) : (
        <>
          {/* Date heading */}
          <p className="text-sm text-gray-500 font-medium -mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Collected', value: fmt(report.totalAmount), color: 'bg-primary-600' },
              { label: 'Total Interest', value: fmt(report.totalInterest), color: 'bg-orange-500' },
              { label: 'Total Principal', value: fmt(report.totalPrincipal), color: 'bg-blue-500' },
              { label: 'Total Entries', value: report.totalEntries, color: 'bg-green-500' },
            ].map(card => (
              <div key={card.label} className={`${card.color} text-white rounded-2xl p-5`}>
                <p className="text-xs font-medium opacity-75 uppercase tracking-wide">{card.label}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Account breakdown */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Account Breakdown</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(report.accountBreakdown).map(([acc, val]) => (
                <div key={acc} className="bg-gray-50 rounded-xl p-4 text-center">
                  <span className={`${MODE_COLORS[acc]} badge text-xs mb-2 inline-block`}>{acc}</span>
                  <p className="font-bold text-gray-900 text-lg">{fmt(val)}</p>
                </div>
              ))}
            </div>
            {/* Online sub-breakdown */}
            {report.onlineDetails && Object.keys(report.onlineDetails).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-2">Online Accounts</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(report.onlineDetails).map(([name, val]) => (
                    <div key={name} className="bg-gray-100 rounded-lg px-3 py-1.5 text-sm flex items-center gap-2">
                      <span className="font-medium text-gray-700">{name}</span>
                      <span className="text-gray-500">·</span>
                      <span className="font-semibold text-gray-900">{fmt(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Collector breakdown — admin only */}
          {isAdmin && Object.keys(collectorBreakdown).length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Collector Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      {['Collector', 'Entries', 'Collected', 'Interest', 'Principal'].map(h => (
                        <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(collectorBreakdown).map(([name, data]) => (
                      <tr key={name} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-medium text-gray-900">{name}</td>
                        <td className="px-5 py-3 text-gray-600">{data.count}</td>
                        <td className="px-5 py-3 font-semibold text-green-700">{fmt(data.amount)}</td>
                        <td className="px-5 py-3 text-orange-600">{fmt(data.interest)}</td>
                        <td className="px-5 py-3 text-blue-600">{fmt(data.principal)}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-5 py-3 text-gray-700">Total</td>
                      <td className="px-5 py-3 text-gray-700">{report.totalEntries}</td>
                      <td className="px-5 py-3 text-green-700">{fmt(report.totalAmount)}</td>
                      <td className="px-5 py-3 text-orange-600">{fmt(report.totalInterest)}</td>
                      <td className="px-5 py-3 text-blue-600">{fmt(report.totalPrincipal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Entries table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">All Entries ({entries.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    {['Borrower', 'Loan', 'Amount', 'Interest', 'Principal', 'Mode', 'Collector', 'Time'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-gray-400">No entries</td></tr>
                  ) : entries.map(e => (
                    <tr key={e._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{e.borrower?.name}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{e.loan?.loanId}</span></td>
                      <td className="px-4 py-3 font-semibold text-green-700">{fmt(e.amountPaid)}</td>
                      <td className="px-4 py-3 text-orange-600">{fmt(e.interestPortion)}</td>
                      <td className="px-4 py-3 text-blue-600">{fmt(e.principalPortion)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.payments?.length > 0
                            ? e.payments.map((p, i) => (
                                <span key={i} className={`${MODE_COLORS[p.mode] || 'badge-gray'} badge text-[10px]`}>
                                  {p.mode}{p.accountName ? ` (${p.accountName})` : ''}: {fmt(p.amount)}
                                </span>
                              ))
                            : <span className={`${MODE_COLORS[e.mode] || 'badge-gray'} badge text-[10px]`}>{e.mode}</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{e.collectedBy?.name}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {new Date(e.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
