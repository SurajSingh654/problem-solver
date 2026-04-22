// ============================================================================
// ProbSolver v3.0 — Axios Instance
// ============================================================================
//
// The interceptor reads the token from localStorage and attaches it.
// No changes needed for team context — the JWT already contains
// currentTeamId, and the backend reads it from the token.
//
// ============================================================================

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor: attach JWT ──────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle auth errors ─────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.code

    // Token expired or invalid — force logout
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')

      // Only redirect if not already on auth pages
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login'
      }
    }

    // Onboarding required — redirect to onboarding
    if (status === 403 && code === 'ONBOARDING_REQUIRED') {
      if (window.location.pathname !== '/onboarding') {
        window.location.href = '/onboarding'
      }
    }

    // Password change required
    if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      if (window.location.pathname !== '/auth/change-password') {
        window.location.href = '/auth/change-password'
      }
    }

    // No team context
    if (status === 403 && code === 'NO_TEAM_CONTEXT') {
      if (window.location.pathname !== '/onboarding') {
        window.location.href = '/onboarding'
      }
    }

    return Promise.reject(error)
  }
)

export default api