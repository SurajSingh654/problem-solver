import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from '@components/ui/CommandPalette'
import { useUIStore } from '@store/useUIStore'
import { useAuthStore } from '@store/useAuthStore'
import { useMe } from '@hooks/useAuth'
import { cn } from '@utils/cn'

function useKeyboardShortcuts() {
    const { toggleSidebar, toggleTheme } = useUIStore()

    useEffect(() => {
        const handler = (e) => {
            const tag = document.activeElement?.tagName
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
                if (e.key === 'Escape') document.activeElement.blur()
                return
            }
            if (e.key === '[' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                toggleSidebar()
                return
            }
            if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
                e.preventDefault()
                toggleTheme()
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [toggleSidebar, toggleTheme])
}

export function AppShell() {
    const { sidebarCollapsed } = useUIStore()

    useMe()

    // Force password change if required
    const { user } = useAuthStore()
    const navigate = useNavigate()
    const location = useLocation()


    useEffect(() => {
        if (
            user?.mustChangePassword &&
            location.pathname !== '/change-password'
        ) {
            navigate('/change-password', { replace: true })
        }
    }, [user?.mustChangePassword, location.pathname])
    useKeyboardShortcuts()

    return (
        <div className="min-h-screen bg-surface-0">

            {/* Sidebar — fixed left panel */}
            <Sidebar />

            {/* Topbar — fixed top bar, left offset matches sidebar width */}
            <Topbar />

            {/* Page content
          - margin-left pushes content right of sidebar
          - padding-top clears the fixed topbar (60px)
          - On mobile: no left margin (sidebar is a drawer overlay)
      */}
            <div
                className={cn(
                    // Mobile: no sidebar margin
                    'ml-0',
                    // Desktop: match sidebar width
                    sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-64',
                    // Clear fixed topbar
                    'pt-[60px]',
                    // Smooth transition when sidebar collapses
                    'transition-[margin-left] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
                    // Min height so short pages don't look cut off
                    'min-h-screen'
                )}
            >
                {/* Per-route fade animation */}
                <motion.div
                    key={window.location.pathname}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                    <Outlet />
                </motion.div>
            </div>

            {/* Global overlays */}
            <CommandPalette />

        </div>
    )
}