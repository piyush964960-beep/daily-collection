import { useLocation } from 'react-router-dom'
import { Bell, Menu } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const titles = {
  '/': 'Dashboard',
  '/borrowers': 'Borrowers',
  '/loans': 'Loans',
  '/entries': 'Daily Entries',
  '/daily-report': 'Daily Report',
  '/reminders': 'Reminders',
  '/ledger': 'Ledger',
  '/reports': 'Reports'
}

export default function Header({ onMenuClick }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const title = titles[pathname] || 'Daily Collection'

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-500 hidden sm:block">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="text-xs text-gray-500 capitalize hidden sm:block">{user?.role}</p>
        </div>
      </div>
    </header>
  )
}
