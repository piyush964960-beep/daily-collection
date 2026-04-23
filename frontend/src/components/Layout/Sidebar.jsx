import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, CreditCard, BookOpen,
  Wallet, BarChart3, TrendingUp, LogOut, PieChart, Bell, X, Receipt
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/borrowers', label: 'Borrowers', icon: Users },
  { to: '/loans', label: 'Loans', icon: CreditCard },
  { to: '/entries', label: 'Daily Entries', icon: BookOpen },
  { to: '/daily-report', label: 'Daily Report', icon: PieChart },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/ledger', label: 'Ledger', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 }
]

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth()

  return (
    <aside className="w-64 h-full flex-shrink-0 bg-gradient-to-b from-primary-900 to-primary-700 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-700" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Daily Collection</p>
              <p className="text-blue-200 text-xs">Finance Manager</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-white/70 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-semibold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-blue-200 text-xs capitalize">{user?.role}</p>
          </div>
        </div>
        <button onClick={logout} className="sidebar-link w-full text-red-200 hover:bg-red-500/20 hover:text-red-100">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
