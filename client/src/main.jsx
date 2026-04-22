import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
import './styles/prose.css'

// Apply saved theme before first render (prevents flash)
const savedTheme = localStorage.getItem('ps_ui')
try {
  const parsed = JSON.parse(savedTheme)
  const theme = parsed?.state?.theme || 'dark'
  if (theme === 'light') {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  } else {
    document.documentElement.classList.remove('light')
    document.documentElement.classList.add('dark')
  }
} catch {
  document.documentElement.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)