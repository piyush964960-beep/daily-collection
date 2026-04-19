import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Edit2, Trash2, Phone, MapPin, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const EMPTY_FORM = { name: '', phone: '', address: '', assignedCollector: '', notes: '' }

export default function Borrowers() {
  const { isAdmin } = useAuth()
  const [borrowers, setBorrowers] = useState([])
  const [collectors, setCollectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedBorrower, setSelectedBorrower] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })

  const fetchBorrowers = useCallback(async (page = 1) => {
    try {
      setLoading(true)
      const res = await api.get('/borrowers', { params: { search, page, limit: 10 } })
      setBorrowers(res.data.data)
      setPagination(res.data.pagination)
    } catch (err) {
      toast.error('Failed to load borrowers')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchBorrowers() }, [fetchBorrowers])

  useEffect(() => {
    api.get('/auth/collectors').then(r => setCollectors(r.data.data)).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (selectedBorrower) {
        await api.put(`/borrowers/${selectedBorrower._id}`, form)
        toast.success('Borrower updated')
      } else {
        await api.post('/borrowers', form)
        toast.success('Borrower added')
      }
      setShowModal(false)
      setForm(EMPTY_FORM)
      setSelectedBorrower(null)
      fetchBorrowers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (borrower) => {
    setSelectedBorrower(borrower)
    setForm({
      name: borrower.name,
      phone: borrower.phone,
      address: borrower.address,
      assignedCollector: borrower.assignedCollector?._id || '',
      notes: borrower.notes || ''
    })
    setShowModal(true)
  }

  const handleView = async (borrower) => {
    try {
      const res = await api.get(`/borrowers/${borrower._id}`)
      setSelectedBorrower(res.data.data)
      setShowViewModal(true)
    } catch {
      toast.error('Failed to load details')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this borrower?')) return
    try {
      await api.delete(`/borrowers/${id}`)
      toast.success('Borrower deleted')
      fetchBorrowers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete')
    }
  }

  const openAdd = () => {
    setSelectedBorrower(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search borrowers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Borrower
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                {['Name','Phone','Address','Assigned Collector','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">
                  <div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent" /></div>
                </td></tr>
              ) : borrowers.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">No borrowers found</td></tr>
              ) : borrowers.map(b => (
                <tr key={b._id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-xs">
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                    <div className="flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" />{b.address}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-blue">{b.assignedCollector?.name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleView(b)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye className="w-4 h-4" /></button>
                      {isAdmin && <>
                        <button onClick={() => handleEdit(b)} className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(b._id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Showing {borrowers.length} of {pagination.total}</span>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => fetchBorrowers(p)} className={`px-3 py-1 rounded ${p === pagination.page ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{p}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={selectedBorrower ? 'Edit Borrower' : 'Add Borrower'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[['name','Full Name','text','Ramesh Kumar'],['phone','Phone Number','tel','9876543210'],['address','Address','text','123 Main St, City']].map(([field,label,type,placeholder]) => (
            <div key={field}>
              <label className="label">{label}</label>
              <input type={type} className="input" placeholder={placeholder} value={form[field]} onChange={e => setForm(p => ({...p,[field]:e.target.value}))} required />
            </div>
          ))}
          <div>
            <label className="label">Assigned Collector</label>
            <select className="input" value={form.assignedCollector} onChange={e => setForm(p => ({...p,assignedCollector:e.target.value}))} required>
              <option value="">Select collector</option>
              {collectors.map(c => <option key={c._id} value={c._id}>{c.name} ({c.role})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} placeholder="Any notes..." value={form.notes} onChange={e => setForm(p => ({...p,notes:e.target.value}))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : (selectedBorrower ? 'Update' : 'Add Borrower')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Borrower Details" size="lg">
        {selectedBorrower && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-500">Name</p><p className="font-semibold">{selectedBorrower.name}</p></div>
              <div><p className="text-xs text-gray-500">Phone</p><p className="font-semibold">{selectedBorrower.phone}</p></div>
              <div className="col-span-2"><p className="text-xs text-gray-500">Address</p><p className="font-semibold">{selectedBorrower.address}</p></div>
              <div><p className="text-xs text-gray-500">Collector</p><p className="font-semibold">{selectedBorrower.assignedCollector?.name}</p></div>
              <div><p className="text-xs text-gray-500">Notes</p><p className="font-semibold">{selectedBorrower.notes || '—'}</p></div>
            </div>
            {selectedBorrower.loans?.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Associated Loans</h4>
                <div className="space-y-2">
                  {selectedBorrower.loans.map(l => (
                    <div key={l._id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{l.loanId}</span>
                        <span className="text-xs text-gray-500 ml-2">₹{l.principalAmount?.toLocaleString('en-IN')} @ {l.interestRate}%</span>
                      </div>
                      <span className={l.status === 'Active' ? 'badge-green' : 'badge-gray'}>{l.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
