import { useState, useEffect, useCallback } from 'react'
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export default function Ledger() {
  const [entries, setEntries] = useState([])
  const [balances, setBalances] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ account: '', startDate: '', endDate: '' })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })

  const fetchBalances = useCallback(async () => {
    try {
      const res = await api.get('/ledger/balances')
      setBalances(res.data.data)
    } catch { toast.error('Failed to load balances') }
  }, [])

  const fetchEntries = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const res = await api.get('/ledger', { params: { ...filters, page, limit: 30 } })
      setEntries(res.data.data)
      setPagination(res.data.pagination)
    } catch { toast.error('Failed to load ledger') }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { fetchBalances(); fetchEntries() }, [fetchBalances, fetchEntries])

  const accountColors = {
    Cash: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700' },
    Piyush: { bg: 'bg-green-500', light: 'bg-green-50', text: 'text-green-700' },
    Sanjay: { bg: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-700' },
    Online: { bg: 'bg-teal-500', light: 'bg-teal-50', text: 'text-teal-700' }
  }

  return (
    <div className="space-y-5">
      {/* Account Balance Cards */}
      {balances && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          {['Cash', 'Piyush', 'Sanjay', 'Online'].map(acc => {
            const ac = accountColors[acc]
            const b = balances.accounts[acc]
            return (
              <div key={acc} className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${ac.bg} flex items-center justify-center`}>
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{acc} Account</p>
                    <p className={`text-xl font-bold ${ac.text}`}>{fmt(b?.balance)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`rounded-lg p-2 ${ac.light}`}>
                    <p className="text-gray-500">Total In</p>
                    <p className={`font-semibold ${ac.text}`}>{fmt(b?.credit)}</p>
                  </div>
                  <div className="rounded-lg p-2 bg-red-50">
                    <p className="text-gray-500">Total Out</p>
                    <p className="font-semibold text-red-600">{fmt(b?.debit)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Grand Total */}
      {balances && (
        <div className="card p-4 flex items-center justify-between bg-primary-900 text-white rounded-xl">
          <p className="font-semibold text-sm sm:text-base">Grand Total Balance (All Accounts)</p>
          <p className="text-xl sm:text-2xl font-bold">{fmt(balances.total)}</p>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <div>
            <label className="label text-xs">Account</label>
            <select className="input w-full" value={filters.account} onChange={e => setFilters(p => ({...p,account:e.target.value}))}>
              <option value="">All</option>
              <option>Cash</option><option>Piyush</option><option>Sanjay</option><option>Online</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">From</label>
            <input type="date" className="input w-full" value={filters.startDate} onChange={e => setFilters(p => ({...p,startDate:e.target.value}))} />
          </div>
          <div>
            <label className="label text-xs">To</label>
            <input type="date" className="input w-full" value={filters.endDate} onChange={e => setFilters(p => ({...p,endDate:e.target.value}))} />
          </div>
          <div className="flex items-end">
            <button onClick={() => fetchEntries()} className="btn-primary w-full">Apply</button>
          </div>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No ledger entries</div>
        ) : entries.map(e => (
          <div key={e._id} className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('en-IN')}</span>
                <span className={`badge ${e.account === 'Cash' ? 'badge-blue' : e.account === 'Piyush' ? 'badge-green' : 'badge-yellow'}`}>{e.account}</span>
              </div>
              <span className={`font-semibold text-sm ${e.type === 'credit' ? 'text-green-700' : 'text-red-700'}`}>
                {e.type === 'credit' ? '+' : '-'}{fmt(e.amount)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              {e.type === 'credit'
                ? <TrendingUp className="w-3 h-3 text-green-500 flex-shrink-0" />
                : <TrendingDown className="w-3 h-3 text-red-500 flex-shrink-0" />
              }
              <span className={`capitalize ${e.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>{e.type}</span>
              <span className="text-gray-300 mx-1">·</span>
              <span className="truncate text-gray-500">{e.description}</span>
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
                {['Date','Account','Type','Amount','Description'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" /></div></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">No ledger entries</td></tr>
              ) : entries.map(e => (
                <tr key={e._id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${e.account === 'Cash' ? 'badge-blue' : e.account === 'Piyush' ? 'badge-green' : 'badge-yellow'}`}>{e.account}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {e.type === 'credit' ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                      <span className={e.type === 'credit' ? 'text-green-600' : 'text-red-600'}>{e.type}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${e.type === 'credit' ? 'text-green-700' : 'text-red-700'}`}>
                    {e.type === 'credit' ? '+' : '-'}{fmt(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="px-6 py-3 border-t flex justify-between text-sm text-gray-500">
            <span>{pagination.total} entries</span>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => fetchEntries(p)} className={`px-3 py-1 rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Pagination */}
      {pagination.pages > 1 && (
        <div className="md:hidden flex justify-between text-sm text-gray-500">
          <span>{pagination.total} entries</span>
          <div className="flex gap-1">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => fetchEntries(p)} className={`px-3 py-1 rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
