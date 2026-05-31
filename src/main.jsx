import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import SchedulePage from './pages/SchedulePage'
import './index.css'

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('wfm-theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('wfm-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return <SchedulePage theme={theme} toggleTheme={toggleTheme} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
