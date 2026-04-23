import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Borrowers from './pages/Borrowers'
import Loans from './pages/Loans'
import DailyEntries from './pages/DailyEntries'
import DailyReport from './pages/DailyReport'
import Ledger from './pages/Ledger'
import Reports from './pages/Reports'
import Reminders from './pages/Reminders'
import Expenses from './pages/Expenses'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

const AppRoutes = () => {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="borrowers" element={<Borrowers />} />
        <Route path="loans" element={<Loans />} />
        <Route path="entries" element={<DailyEntries />} />
        <Route path="daily-report" element={<DailyReport />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
