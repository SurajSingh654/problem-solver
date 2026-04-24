// ============================================================================
// ProbSolver v3.0 — API Client
// ============================================================================
//
// ARCHITECTURE:
//
// Single Axios instance with interceptors for:
// 1. Auto-attach JWT token from localStorage
// 2. Handle 401 (expired token) → force logout
// 3. Handle 403 codes → redirect to appropriate page
// 4. Structured error extraction for consistent error handling
//
// VERSIONING:
// Base URL points to /api which aliases to /api/v1 on the server.
// When v2 is available, create a separate apiV2 instance pointing
// to /api/v2 — or update VITE_API_URL to /api/v2.
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

// ── Response interceptor: centralized error handling ─────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.code

    // Token expired or invalid — force logout and redirect
    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login'
      }
      return Promise.reject(error)
    }

    // 403 with specific codes — redirect to appropriate page
    if (status === 403) {
      switch (code) {
        case 'ONBOARDING_REQUIRED':
          if (window.location.pathname !== '/onboarding') {
            window.location.href = '/onboarding'
          }
          break
        case 'PASSWORD_CHANGE_REQUIRED':
          if (window.location.pathname !== '/auth/change-password') {
            window.location.href = '/auth/change-password'
          }
          break
        case 'NO_TEAM_CONTEXT':
          // Don't redirect SuperAdmin to onboarding — they don't need a team
          // This case should not happen with proper route isolation,
          // but is a safety net.
          {
            const user = JSON.parse(localStorage.getItem('user') || 'null')
            if (user?.globalRole === 'SUPER_ADMIN') {
              if (!window.location.pathname.startsWith('/super-admin')) {
                window.location.href = '/super-admin'
              }
            } else if (window.location.pathname !== '/onboarding') {
              window.location.href = '/onboarding'
            }
          }
          break
      }
    }

    // 400 with SUPER_ADMIN_NEEDS_TEAM_OVERRIDE — SuperAdmin hit a team endpoint
    // This shouldn't happen with proper route isolation but is a safety net.
    if (status === 400 && code === 'SUPER_ADMIN_NEEDS_TEAM_OVERRIDE') {
      const currentPath = window.location.pathname
      if (!currentPath.startsWith('/super-admin')) {
        window.location.href = '/super-admin'
      }
    }

    return Promise.reject(error)
  }
)

export default api