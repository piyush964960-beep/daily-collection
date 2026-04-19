import { useState, useEffect } from 'react'
import { TrendingUp, Users, CreditCard, Wallet, ArrowUpRight, IndianRupee } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../services/api'

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const StatCard = ({ title, value, sub, icon: Icon, color }) => (
  <div className="stat-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
)

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(r => setStats(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
    </div>
  )

  if (!stats) return <div className="text-center text-gray-500 py-12">Failed to load dashboard</div>

  const modeColors = { Cash: 'badge-blue', Piyush: 'badge-green', Sanjay: 'badge-yellow' }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Today's Collection"
          value={fmt(stats.todayCollection.total)}
          sub={`${stats.todayCollection.count} entries`}
          icon={IndianRupee}
          color="bg-primary-600"
        />
        <StatCard
          title="Month's Collection"
          value={fmt(stats.monthCollection.total)}
          sub={`Interest: ${fmt(stats.monthCollection.interest)}`}
          icon={TrendingUp}
          color="bg-green-500"
        />
        <StatCard
          title="Outstanding Loans"
          value={fmt(stats.outstandingLoans.totalPrincipal)}
          sub={`${stats.outstandingLoans.count} active loans`}
          icon={CreditCard}
          color="bg-orange-500"
        />
        <StatCard
          title="Total Balance"
          value={fmt(Object.values(stats.accountBalances).reduce((a, b) => a + b, 0))}
          sub="All accounts"
          icon={Wallet}
          color="bg-purple-500"
        />
      </div>

      {/* Account Balances */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        {['Cash', 'Piyush', 'Sanjay', 'Online'].map(acc => (
          <div key={acc} className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{acc} Account</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{fmt(stats.accountBalances[acc])}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-600" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Borrowers count */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-6 lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4">Monthly Collection Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="total" fill="#2563eb" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Overview</h3>
          <div className="space-y-4">
            {[
              { label: 'Total Borrowers', value: stats.counts.borrowers, icon: Users, color: 'text-blue-600 bg-blue-50' },
              { label: 'Active Loans', value: stats.counts.activeLoans, icon: CreditCard, color: 'text-green-600 bg-green-50' },
              { label: 'Closed Loans', value: stats.counts.closedLoans, icon: ArrowUpRight, color: 'text-gray-600 bg-gray-50' }
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-lg font-bold text-gray-900">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                {['Date','Borrower','Loan ID','Amount','Interest','Principal','Mode','Collector'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.recentTransactions.map(t => (
                <tr key={t._id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{new Date(t.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.borrower?.name}</td>
                  <td className="px-4 py-3 text-gray-600">{t.loan?.loanId}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{fmt(t.amountPaid)}</td>
                  <td className="px-4 py-3 text-orange-600">{fmt(t.interestPortion)}</td>
                  <td className="px-4 py-3 text-blue-600">{fmt(t.principalPortion)}</td>
                  <td className="px-4 py-3"><span className={modeColors[t.mode] + ' badge'}>{t.mode}</span></td>
                  <td className="px-4 py-3 text-gray-600">{t.collectedBy?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!stats.recentTransactions?.length && (
            <div className="text-center py-8 text-gray-400">No transactions yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
