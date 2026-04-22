// ============================================================================
// ProbSolver v3.0 — Auth Store (Zustand)
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Team context lives here: currentTeamId, teamRole, personalTeamId
//    are stored alongside user auth state. This is the single source
//    of truth for "which team am I in?" across the entire app.
//
// 2. Token management: On login/switch-team, the JWT is stored in
//    localStorage. The decoded user object is stored in Zustand.
//    This gives instant access to team context without decoding
//    the JWT on every render.
//
// 3. switchTeam action: Calls the backend, receives a new JWT with
//    updated team context, and updates the store. All components
//    that read from this store automatically re-render.
//
// 4. isPersonalMode computed: Derived from comparing currentTeamId
//    with personalTeamId. The UI uses this to show "My Practice"
//    vs team name, and to hide/show team-specific features like
//    leaderboard.
//
// ============================================================================

import { create } from 'zustand'
import api from '@services/api'

const useAuthStore = create((set, get) => ({
  // ── Auth state ─────────────────────────────────────────
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,

  // ── Computed getters (derived from user) ───────────────
  get isSuperAdmin() {
    return get().user?.globalRole === 'SUPER_ADMIN'
  },

  get isTeamAdmin() {
    return get().user?.teamRole === 'TEAM_ADMIN'
  },

  get isPersonalMode() {
    const user = get().user
    if (!user) return false
    return user.currentTeamId === user.personalTeamId
  },

  get currentTeamId() {
    return get().user?.currentTeamId || null
  },

  get needsOnboarding() {
    const user = get().user
    return user && !user.onboardingComplete
  },

  get needsPasswordChange() {
    return get().user?.mustChangePassword === true
  },

  // ── Actions ────────────────────────────────────────────

  setAuth: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null, isAuthenticated: false })
  },

  updateUser: (userData) => {
    const current = get().user
    const updated = { ...current, ...userData }
    localStorage.setItem('user', JSON.stringify(updated))
    set({ user: updated })
  },

  // ── Switch team context ────────────────────────────────
  // Calls backend, receives new JWT, updates store.
  // All team-scoped components re-render automatically.
  switchTeam: async (teamId) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/switch-team', { teamId })
      const { token, user } = res.data

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      set({ token, user, isAuthenticated: true, isLoading: false })

      return { success: true, message: res.data.message }
    } catch (err) {
      set({ isLoading: false })
      return {
        success: false,
        error: err.response?.data?.error || 'Failed to switch team.',
      }
    }
  },

  // ── Complete onboarding ────────────────────────────────
  completeOnboarding: async (data) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/onboarding', data)
      const { token, user } = res.data

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      set({ token, user, isAuthenticated: true, isLoading: false })

      return { success: true, message: res.data.message, pendingTeam: res.data.pendingTeam }
    } catch (err) {
      set({ isLoading: false })
      return {
        success: false,
        error: err.response?.data?.error || 'Onboarding failed.',
      }
    }
  },

  // ── Refresh user data from server ──────────────────────
  refreshUser: async () => {
    try {
      const res = await api.get('/auth/me')
      const user = res.data.user
      localStorage.setItem('user', JSON.stringify(user))
      set({ user })
    } catch {
      // If refresh fails (token expired), logout
      get().logout()
    }
  },
}))

export default useAuthStore