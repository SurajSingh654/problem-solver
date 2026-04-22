// ============================================================================
// ProbSolver v3.0 — Protected Route
// ============================================================================
//
// Multi-layered protection:
// 1. Must be authenticated (has valid token)
// 2. Must be verified (email verified)
// 3. Must have completed onboarding (chose team/individual)
// 4. Must not need password change
// 5. Optionally: must be SUPER_ADMIN or TEAM_ADMIN
//
// ============================================================================

import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '@store/useAuthStore'

export default function ProtectedRoute({
    children,
    requireSuperAdmin = false,
    requireTeamAdmin = false,
    requireTeamContext = false,
}) {
    const { isAuthenticated, user } = useAuthStore()
    const location = useLocation()

    // ── Not logged in ────────────────────────────────────
    if (!isAuthenticated || !user) {
        return <Navigate to="/auth/login" state={{ from: location }} replace />
    }

    // ── Must change password ─────────────────────────────
    if (user.mustChangePassword && location.pathname !== '/auth/change-password') {
        return <Navigate to="/auth/change-password" replace />
    }

    // ── Must complete onboarding ─────────────────────────
    if (!user.onboardingComplete && location.pathname !== '/onboarding') {
        // SUPER_ADMIN doesn't need onboarding
        if (user.globalRole !== 'SUPER_ADMIN') {
            return <Navigate to="/onboarding" replace />
        }
    }

    // ── Role checks ──────────────────────────────────────
    if (requireSuperAdmin && user.globalRole !== 'SUPER_ADMIN') {
        return <Navigate to="/" replace />
    }

    if (requireTeamAdmin) {
        const isAdmin = user.globalRole === 'SUPER_ADMIN' || user.teamRole === 'TEAM_ADMIN'
        if (!isAdmin) {
            return <Navigate to="/" replace />
        }
    }

    // ── Team context required ────────────────────────────
    // ── Team context required ────────────────────────────
    if (requireTeamContext && !user.currentTeamId) {
        // SUPER_ADMIN doesn't need team context — they manage the platform
        if (user.globalRole !== 'SUPER_ADMIN') {
            return <Navigate to="/onboarding" replace />
        }
    }

    return children
}