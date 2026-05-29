import { Navigate } from 'react-router-dom'
import useAuthStore from '@store/useAuthStore'

// Public route gate. Authenticated users get sent to /dashboard; everyone else
// sees the public element. Used for the landing page at "/" so cold visitors
// land on marketing copy and authed users skip straight to their dashboard.
//
// Note: SUPER_ADMIN users are also sent to /dashboard, not /super-admin.
// That's intentional — clicking the wordmark from a logged-in superadmin
// session should never re-show the marketing page. SUPER_ADMIN can navigate
// to /super-admin via their normal sidebar entry.
export default function PublicOrAuthRedirect({ publicElement }) {
    const { isAuthenticated, user } = useAuthStore()

    if (isAuthenticated && user) {
        // Honor the same gates ProtectedRoute would: password change first,
        // onboarding second, then dashboard. Avoids landing-page flicker
        // for users mid-flow.
        if (user.mustChangePassword) {
            return <Navigate to="/auth/change-password" replace />
        }
        if (!user.onboardingComplete && user.globalRole !== 'SUPER_ADMIN') {
            return <Navigate to="/onboarding" replace />
        }
        if (user.globalRole === 'SUPER_ADMIN') {
            return <Navigate to="/super-admin" replace />
        }
        return <Navigate to="/dashboard" replace />
    }

    return publicElement
}
