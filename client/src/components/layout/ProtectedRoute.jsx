import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@store/useAuthStore'

export function ProtectedRoute({ children, adminOnly = false }) {
    const { isAuthenticated, user } = useAuthStore()
    const location = useLocation()

    console.log('[ProtectedRoute] Path:', location.pathname)
    console.log('[ProtectedRoute] isAuthenticated:', isAuthenticated)
    console.log('[ProtectedRoute] emailVerified:', user?.emailVerified)

    if (!isAuthenticated) {
        console.log('[ProtectedRoute] → Redirecting to /login (not authenticated)')
        return (
            <Navigate
                to="/login"
                state={{ from: location.pathname }}
                replace
            />
        )
    }

    if (adminOnly && user?.role !== 'ADMIN') {
        console.log('[ProtectedRoute] → Redirecting to / (not admin)')
        return <Navigate to="/" replace />
    }

    return children
}