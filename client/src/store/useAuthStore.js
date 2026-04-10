/**
 * AUTH STORE — Zustand
 * Manages current user and JWT token.
 * Server state (profile data) goes through React Query.
 * This store only holds authentication state.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:  null,
      token: null,
      isAuthenticated: false,

      // Set user and token after login/register
      setAuth: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
      }),

      // Update user profile fields
      updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null,
      })),

      // Clear auth state on logout
      clearAuth: () => set({
        user:            null,
        token:           null,
        isAuthenticated: false,
      }),

      // Computed
      isAdmin: () => get().user?.role === 'ADMIN',
    }),
    {
      name:    'ps_auth',
      // Only persist these fields
      partialize: (state) => ({
        user:  state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      // Sync token to localStorage for axios interceptor
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem('ps_token', state.token)
        }
      },
    }
  )
)