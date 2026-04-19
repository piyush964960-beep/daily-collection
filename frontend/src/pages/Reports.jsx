import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

const fmt = (n) => n ? `₹${(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Reports() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchReport = async () => {
    setLoading(true)
    try {
      const res = await api.get('/reports/monthly', { params: { year, month } })
      setReport(res.data.data)
    } catch { toast.error('Failed to load report') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchReport() }, [year, month])

  const handleExport = async () => {
    setExporting(true)
    try {
      const token = localStorage.getItem('dc_token')
      const response = await fetch(`/api/reports/monthly/export?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Monthly_Report_${MONTHS[month-1]}_${year}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Report exported!')
    } catch { toast.error('Export failed') }
    finally { setExporting(false) }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const daysArray = report ? Array.from({ length: report.daysInMonth }, (_, i) => i + 1) : []

  // Compute totals
  const grandTotal = report?.rows.reduce((a, r) => ({
    interest: a.interest + r.totalInterest,
    principal: a.principal + r.totalPrincipal,
    total: a.total + r.totalAmount,
    cash: a.cash + r.cashTotal,
    piyush: a.piyush + r.piyushTotal,
    sanjay: a.sanjay + r.sanjayTotal,
  }), { interest: 0, principal: 0, total: 0, cash: 0, piyush: 0, sanjay: 0 })

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="card p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Monthly Report</p>
              <p className="text-xs text-gray-500">Collection summary</p>
            </div>
          </div>
          <div className="flex gap-2">
            <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting || !report?.rows.length} className="btn-success">
          {exporting ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Download className="w-4 h-4" />}
          Export Excel
        </button>
      </div>

      {/* Summary Cards */}
      {report && grandTotal && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ['Total', grandTotal.total, 'bg-primary-600'],
            ['Interest', grandTotal.interest, 'bg-orange-500'],
            ['Principal', grandTotal.principal, 'bg-blue-500'],
            ['Cash', grandTotal.cash, 'bg-teal-500'],
            ['Piyush', grandTotal.piyush, 'bg-green-500'],
            ['Sanjay', grandTotal.sanjay, 'bg-purple-500'],
          ].map(([label, val, color]) => (
            <div key={label} className={`${color} text-white rounded-xl p-4`}>
              <p className="text-xs font-medium opacity-80">{label}</p>
              <p className="text-base font-bold mt-0.5">{fmt(val)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" /></div>
      ) : !report?.rows.length ? (
        <div className="card p-12 text-center text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No data for {MONTHS[month-1]} {year}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-primary-900 text-white sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left font-medium whitespace-nowrap sticky left-0 bg-primary-900">Borrower</th>
                  <th className="px-3 py-3 text-left font-medium whitespace-nowrap">Collector</th>
                  {daysArray.map(d => <th key={d} className="px-1.5 py-3 text-center font-medium w-8">{d}</th>)}
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Principal</th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Interest</th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Total</th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Cash</th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Piyush</th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">Sanjay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.rows.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-inherit">{row.borrowerName}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{row.collectorName}</td>
                    {daysArray.map(d => (
                      <td key={d} className="px-1 py-2.5 text-center">
                        {row.days[d] ? <span className="font-medium text-green-700">{row.days[d]}</span> : <span className="text-gray-200">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-medium text-blue-700 whitespace-nowrap">{fmt(row.totalPrincipal)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-orange-600 whitespace-nowrap">{fmt(row.totalInterest)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap">{fmt(row.totalAmount)}</td>
                    <td className="px-3 py-2.5 text-right text-teal-700 whitespace-nowrap">{fmt(row.cashTotal)}</td>
                    <td className="px-3 py-2.5 text-right text-green-700 whitespace-nowrap">{fmt(row.piyushTotal)}</td>
                    <td className="px-3 py-2.5 text-right text-purple-700 whitespace-nowrap">{fmt(row.sanjayTotal)}</td>
                  </tr>
                ))}
                {/* Grand total row */}
                <tr className="bg-primary-900 text-white font-bold">
                  <td className="px-3 py-3 sticky left-0 bg-primary-900">GRAND TOTAL</td>
                  <td className="px-3 py-3"></td>
                  {daysArray.map(d => <td key={d} className="px-1 py-3"></td>)}
                  <td className="px-3 py-3 text-right">{fmt(grandTotal.principal)}</td>
                  <td className="px-3 py-3 text-right">{fmt(grandTotal.interest)}</td>
                  <td className="px-3 py-3 text-right">{fmt(grandTotal.total)}</td>
                  <td className="px-3 py-3 text-right">{fmt(grandTotal.cash)}</td>
                  <td className="px-3 py-3 text-right">{fmt(grandTotal.piyush)}</td>
                  <td className="px-3 py-3 text-right">{fmt(grandTotal.sanjay)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
