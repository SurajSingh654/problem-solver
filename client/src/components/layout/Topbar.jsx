import { useState, useEffect } from 'react'
import { useLocation, useNavigate, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import { useUIStore } from '@store/useUIStore'
import { Avatar } from '@components/ui/Avatar'
import { Tooltip } from '@components/ui/Tooltip'
import { cn } from '@utils/cn'
import { useMe, useLogout } from '@hooks/useAuth'
import { formatCountdown } from '@utils/formatters'


// ── Page metadata ──────────────────────────────────────
const PAGE_META = {
    '/': { title: 'Dashboard', crumb: 'Home' },
    '/problems': { title: 'Problems', crumb: 'Problems' },
    '/interview': { title: 'Interview Sim', crumb: 'Practice' },
    '/review': { title: 'Review Queue', crumb: 'Practice' },
    '/report': { title: 'My Report', crumb: 'Progress' },
    '/leaderboard': { title: 'Leaderboard', crumb: 'Progress' },
    '/profile': { title: 'My Profile', crumb: 'Progress' },
    '/admin': { title: 'Admin Panel', crumb: 'Admin' },
    '/admin/problems/new': { title: 'Add Problem', crumb: 'Admin' },
    '/settings': { title: 'Settings', crumb: 'Account' },
    '/docs/readme': { title: 'README', crumb: 'Docs' },
    '/docs/setup': { title: 'Setup Guide', crumb: 'Docs' },
    // SuperAdmin pages
    '/super-admin': { title: 'Platform Dashboard', crumb: 'Platform' },
    '/super-admin/teams': { title: 'All Teams', crumb: 'Platform' },
    '/super-admin/users': { title: 'All Users', crumb: 'Platform' },
    '/super-admin/analytics': { title: 'Platform Analytics', crumb: 'Platform' },
    '/super-admin/settings': { title: 'Settings', crumb: 'Account' },
    '/super-admin/profile': { title: 'My Profile', crumb: 'Account' },
}

function getPageMeta(pathname) {
    // Exact match first
    if (PAGE_META[pathname]) return PAGE_META[pathname]
    // Prefix match for dynamic routes
    if (pathname.startsWith('/problems/')) {
        const parts = pathname.split('/')
        if (parts[3] === 'submit') return { title: 'Submit Solution', crumb: 'Problems' }
        return { title: 'Problem Detail', crumb: 'Problems' }
    }
    if (pathname.startsWith('/super-admin/profile/')) return { title: 'User Profile', crumb: 'Platform' }
    if (pathname.startsWith('/profile/')) return { title: 'Profile', crumb: 'Progress' }
    if (pathname.startsWith('/admin/')) return { title: 'Admin', crumb: 'Admin' }
    return { title: 'ProbSolver', crumb: '' }
}

// ── Profile dropdown ───────────────────────────────────
function ProfileDropdown({ user, onClose }) {
    const logout = useLogout()
    const navigate = useNavigate()

    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const profilePath = isSuperAdmin ? '/super-admin/profile' : '/profile'
    const settingsPath = isSuperAdmin ? '/super-admin/settings' : '/settings'

    const items = [
        {
            label: 'My Profile',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            ),
            action: () => { navigate(profilePath); onClose() },
        },
        {
            label: 'Settings',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            ),
            action: () => { navigate(settingsPath); onClose() },
        },
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
                'absolute right-0 top-full mt-2 w-56 z-dropdown',
                'bg-surface-2 border border-border-strong rounded-xl',
                'shadow-lg overflow-hidden'
            )}
        >
            {/* User info header */}
            <div className="px-4 py-3 border-b border-border-default">
                <p className="text-sm font-semibold text-text-primary truncate">
                    {user?.name}
                </p>
                <p className="text-xs text-text-tertiary truncate mt-0.5">
                    {user?.email}
                </p>
            </div>
            {/* Menu items */}
            <div className="p-1.5">
                {items.map(item => (
                    <button
                        key={item.label}
                        onClick={item.action}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                       text-sm text-text-secondary hover:text-text-primary
                       hover:bg-surface-3 transition-colors text-left"
                    >
                        <span className="text-text-tertiary">{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </div>
            {/* Logout */}
            <div className="p-1.5 border-t border-border-default">
                <button
                    onClick={() => { logout(); onClose() }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                     text-sm text-danger hover:bg-danger/8 transition-colors text-left"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                </button>
            </div>
        </motion.div>
    )
}

// ── Main Topbar component ──────────────────────────────
export function Topbar() {
    const location = useLocation()
    const { user } = useAuthStore()
    const { data: me } = useMe()
    const {
        sidebarCollapsed,
        theme,
        toggleTheme,
        openCommandPalette,
        openMobileSidebar,
    } = useUIStore()

    const [profileOpen, setProfileOpen] = useState(false)
    const currentUser = me || user
    // Add this line alongside the existing variables
    const isSuperAdmin = currentUser?.globalRole === 'SUPER_ADMIN'
    const meta = getPageMeta(location.pathname)
    const countdown = formatCountdown(currentUser?.interviewDate)

    // Close dropdown on outside click
    useEffect(() => {
        if (!profileOpen) return
        const close = (e) => {
            if (!e.target.closest('[data-profile-dropdown]')) {
                setProfileOpen(false)
            }
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [profileOpen])

    // Close on route change
    useEffect(() => {
        setProfileOpen(false)
    }, [location.pathname])

    return (
        <header
            className={cn(
                // Fixed to top, z-index above content but below modals
                'fixed top-0 z-sticky',
                'h-[60px] flex items-center gap-4 px-6',
                'border-b border-border-default',
                'bg-surface-0/85 backdrop-blur-xl',
                'transition-[left,right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
                // Right edge always reaches viewport edge
                'right-0',
                // Left edge clears the sidebar
                // Mobile: full width (sidebar is a drawer, not in flow)
                'left-0',
                // Desktop: offset by sidebar width
                sidebarCollapsed ? 'lg:left-[68px]' : 'lg:left-64'
            )}
        >
            {/* Mobile menu button */}
            <button
                onClick={openMobileSidebar}
                className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl
                   text-text-secondary hover:text-text-primary hover:bg-surface-3
                   transition-colors flex-shrink-0"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            {/* Page title */}
            <div className="flex-1 min-w-0">
                <motion.div
                    key={meta.title}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <h1 className="text-base font-bold text-text-primary leading-tight truncate">
                        {meta.title}
                    </h1>
                    {meta.crumb && (
                        <p className="text-[11px] text-text-disabled font-mono">
                            {meta.crumb}
                        </p>
                    )}
                </motion.div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 flex-shrink-0">

                {/* Interview countdown */}
                {countdown && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full
                       bg-warning/10 border border-warning/25 text-warning
                       text-xs font-semibold"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {countdown}
                    </motion.div>
                )}

                {/* Docs and Deploy — SuperAdmin only */}
                {isSuperAdmin && (
                    <Tooltip content="README" side="bottom">
                        <NavLink
                            to="/docs/readme"
                            className={({ isActive }) => cn(
                                'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
                                'text-xs font-semibold border transition-all',
                                isActive
                                    ? 'bg-brand-400/15 border-brand-400/30 text-brand-300'
                                    : 'bg-surface-2 border-border-default text-text-tertiary',
                                'hover:text-brand-300 hover:border-brand-400/40 hover:bg-brand-400/10'
                            )}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            Docs
                        </NavLink>
                    </Tooltip>
                )}

                {isSuperAdmin && (
                    <Tooltip content="Deploy Guide" side="bottom">
                        <NavLink
                            to="/docs/deploy"
                            className={({ isActive }) => cn(
                                'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
                                'text-xs font-semibold border transition-all',
                                isActive
                                    ? 'bg-success/15 border-success/30 text-success'
                                    : 'bg-surface-2 border-border-default text-text-tertiary',
                                'hover:text-success hover:border-success/40 hover:bg-success/10'
                            )}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.93 3.32a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l1.25-1.25a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            Deploy
                        </NavLink>
                    </Tooltip>
                )}

                {/* Search / Command Palette */}
                <Tooltip content="Search  ⌘K" side="bottom">
                    <button
                        onClick={openCommandPalette}
                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl
                       bg-surface-2 border border-border-default
                       text-text-tertiary hover:text-text-primary
                       hover:border-border-strong hover:bg-surface-3
                       transition-all text-xs font-medium"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span className="hidden md:inline">Search</span>
                        <kbd className="hidden md:inline-block text-[10px] bg-surface-3
                            border border-border-strong rounded px-1.5 py-0.5
                            font-mono text-text-disabled">
                            ⌘K
                        </kbd>
                    </button>
                </Tooltip>

                {/* Theme toggle */}
                <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'} side="bottom">
                    <button
                        onClick={toggleTheme}
                        className="w-9 h-9 flex items-center justify-center rounded-xl
                       text-text-tertiary hover:text-text-primary hover:bg-surface-3
                       border border-transparent hover:border-border-default
                       transition-all"
                    >
                        <motion.div
                            key={theme}
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            transition={{ duration: 0.25 }}
                        >
                            {theme === 'dark' ? (
                                // Sun icon
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="5" />
                                    <line x1="12" y1="1" x2="12" y2="3" />
                                    <line x1="12" y1="21" x2="12" y2="23" />
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                    <line x1="1" y1="12" x2="3" y2="12" />
                                    <line x1="21" y1="12" x2="23" y2="12" />
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                                </svg>
                            ) : (
                                // Moon icon
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                </svg>
                            )}
                        </motion.div>
                    </button>
                </Tooltip>

                {/* Profile */}
                <div
                    className="relative"
                    data-profile-dropdown
                >
                    <button
                        onClick={() => setProfileOpen(v => !v)}
                        className="flex items-center gap-2 p-1 rounded-xl
                       hover:bg-surface-3 transition-all
                       border border-transparent hover:border-border-default"
                    >
                        <Avatar
                            name={currentUser?.name || 'U'}
                            color={currentUser?.avatarUrl || '#7c6ff7'}
                            size="sm"
                        />
                    </button>

                    <AnimatePresence>
                        {profileOpen && (
                            <ProfileDropdown
                                user={currentUser}
                                onClose={() => setProfileOpen(false)}
                            />
                        )}
                    </AnimatePresence>
                </div>

            </div>
        </header>
    )
}