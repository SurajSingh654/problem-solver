import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@store/useAuthStore'

export function ProtectedRoute({ children, adminOnly = false }) {
    const { isAuthenticated, user } = useAuthStore()
    const location = useLocation()

    if (!isAuthenticated) {
        return (
            <Navigate
                to="/login"
                state={{ from: location.pathname }}
                replace
            />
        )
    }

    if (adminOnly && user?.role !== 'ADMIN') {
        return <Navigate to="/" replace />
    }

    return children
}