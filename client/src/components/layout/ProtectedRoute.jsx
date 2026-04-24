// ============================================================================
// ProbSolver v3.0 — Route Guards
// ============================================================================
//
// ARCHITECTURE:
//
// Each guard checks ONE thing and either renders children or redirects.
// Guards compose via nesting in App.jsx:
//
//   <RequireAuth>                    ← has valid token?
//     <RequireSuperAdmin>            ← is SUPER_ADMIN?
//       <AppShell />                 ← SuperAdmin layout
//     </RequireSuperAdmin>
//   </RequireAuth>
//
// This follows Single Responsibility Principle — each guard is
// independently testable and understandable.
//
// CRITICAL DESIGN RULE:
// SuperAdmin routes and team routes are COMPLETELY ISOLATED.
// SuperAdmin never enters the team layout group.
// Team users never enter the SuperAdmin layout group.
// This eliminates the entire class of "wrong hooks firing" bugs.
//
// ============================================================================
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '@store/useAuthStore'

/**
 * Legacy ProtectedRoute — maintained for backward compatibility.
 * New routes should use the individual guards below instead.
 */
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
        if (user.globalRole !== 'SUPER_ADMIN') {
            return <Navigate to="/onboarding" replace />
        }
    }

    // ── SuperAdmin guard ─────────────────────────────────
    if (requireSuperAdmin && user.globalRole !== 'SUPER_ADMIN') {
        return <Navigate to="/" replace />
    }

    // ── Team admin guard ─────────────────────────────────
    if (requireTeamAdmin) {
        const isAdmin = user.globalRole === 'SUPER_ADMIN' || user.teamRole === 'TEAM_ADMIN'
        if (!isAdmin) {
            return <Navigate to="/" replace />
        }
    }

    // ── Team context guard (STRICT — no SuperAdmin bypass) ──
    if (requireTeamContext) {
        if (!user.currentTeamId) {
            // SuperAdmin should never reach team routes — redirect to their dashboard
            if (user.globalRole === 'SUPER_ADMIN') {
                return <Navigate to="/super-admin" replace />
            }
            return <Navigate to="/onboarding" replace />
        }
    }

    return children
}