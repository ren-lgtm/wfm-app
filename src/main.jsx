import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import SchedulePage from './pages/SchedulePage'
import LoginPage from './pages/LoginPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import './index.css'

function AppContent() {
  const { user, role, loading, signOut } = useAuth()

  const [theme, setTheme] = useState(() => localStorage.getItem('wfm-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('wfm-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0F14] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (!role) {
    return (
      <div className="min-h-screen bg-[#0C0F14] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-sm text-gray-400">Your account doesn't have access to this app.</p>
          <p className="text-xs text-gray-600">{user.email}</p>
          <button
            onClick={signOut}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <SchedulePage theme={theme} toggleTheme={toggleTheme} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </React.StrictMode>
)
