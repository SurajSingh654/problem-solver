// ============================================================================
// ProbSolver v3.0 — Sidebar with Team Switcher
// ============================================================================
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import { useUIStore } from '@store/useUIStore'
import { cn } from '@utils/cn'

export default function Sidebar() {
    const navigate = useNavigate()
    const { user, switchTeam } = useAuthStore()
    const { mobileSidebarOpen: sidebarOpen } = useUIStore()
    const [showSwitcher, setShowSwitcher] = useState(false)
    const [switching, setSwitching] = useState(false)

    if (!user) return null

    const isSuperAdmin = user.globalRole === 'SUPER_ADMIN'
    const isTeamAdmin = !isSuperAdmin && user.teamRole === 'TEAM_ADMIN'
    const isPersonal = user.currentTeamId === user.personalTeamId

    const teamName = isPersonal ? 'My Practice' : (user.currentTeam?.name || 'Team')

    // ── Handle team switch ─────────────────────────────────
    async function handleSwitch(teamId) {
        setSwitching(true)
        const result = await switchTeam(teamId)
        setSwitching(false)
        setShowSwitcher(false)
        if (result.success) navigate('/', { replace: true })
    }

    // ── Navigation items based on role ───────────────────────
    let mainNav = []
    let adminNav = []

    if (isSuperAdmin) {
        const apiDocsUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '/api-docs')
        mainNav = [
            { to: '/super-admin', icon: '⚡', label: 'Platform Dashboard' },
            { to: '/team', icon: '👥', label: 'Manage Teams' },
            { to: '/settings', icon: '⚙️', label: 'Settings' },
            { to: apiDocsUrl, icon: '📖', label: 'API Docs', external: true },
        ]
    } else {
        // Team members & individuals: practice tools
        mainNav = [
            { to: '/', icon: '📊', label: 'Dashboard' },
            { to: '/problems', icon: '📋', label: 'Problems' },
            { to: '/review', icon: '🧠', label: 'Review Queue' },
            { to: '/quizzes', icon: '🧩', label: 'Quizzes' },
            { to: '/mock-interview', icon: '💬', label: 'Mock Interview' },
            { to: '/interview-history', icon: '📜', label: 'Interview History' },
            { to: '/report', icon: '📈', label: 'Intelligence Report' },
        ]

        // Leaderboard only in team mode (not personal)
        if (!isPersonal) {
            mainNav.push({ to: '/leaderboard', icon: '🏆', label: 'Leaderboard' })
        }

        // Team admin tools
        if (isTeamAdmin) {
            adminNav = [
                { to: '/admin', icon: '👑', label: 'Team Admin' },
                { to: '/admin/add-problem', icon: '➕', label: 'Add Problem' },
                { to: '/admin/analytics', icon: '📊', label: 'Team Analytics' },
            ]
        }
    }

    return (
        <aside className={cn(
            'fixed inset-y-0 left-0 z-30 w-64 bg-surface-1 border-r border-border-default',
            'flex flex-col transition-transform duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}>
            {/* ── Logo ──────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border-default">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-blue-500
                       flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                </div>
                <span className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                        to-blue-400 bg-clip-text text-transparent">
                    ProbSolver
                </span>
            </div>

            {/* ── SUPER_ADMIN badge ────────────────────────────── */}
            {isSuperAdmin && (
                <div className="px-3 py-3 border-b border-border-default">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                                   bg-danger/5 border border-danger/20">
                        <span className="text-lg">🛡️</span>
                        <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-bold text-text-primary">Platform Admin</p>
                            <p className="text-[10px] text-danger">Super Administrator</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Team Switcher (not for SUPER_ADMIN) ─────────── */}
            {!isSuperAdmin && (
                <div className="px-3 py-3 border-b border-border-default">
                    <button
                        onClick={() => setShowSwitcher(!showSwitcher)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                         bg-surface-2 border border-border-subtle
                         hover:border-brand-400/30 transition-all"
                    >
                        <span className="text-lg">{isPersonal ? '🧠' : '👥'}</span>
                        <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-bold text-text-primary truncate">{teamName}</p>
                            <p className="text-[10px] text-text-disabled">
                                {isPersonal ? 'Individual mode' : `${user.teamRole === 'TEAM_ADMIN' ? 'Admin' : 'Member'}`}
                            </p>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" className="text-text-disabled">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {/* Switcher dropdown */}
                    <AnimatePresence>
                        {showSwitcher && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="mt-2 bg-surface-0 border border-border-default rounded-xl
                             shadow-lg overflow-hidden"
                            >
                                {/* Personal space option */}
                                {user.personalTeamId && user.currentTeamId !== user.personalTeamId && (
                                    <button
                                        onClick={() => handleSwitch(user.personalTeamId)}
                                        disabled={switching}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                                 hover:bg-surface-2 transition-colors"
                                    >
                                        <span className="text-sm">🧠</span>
                                        <span className="text-xs text-text-secondary">My Practice</span>
                                    </button>
                                )}

                                {/* Current team (if in personal mode and has a team) */}
                                {isPersonal && user.currentTeamId !== user.personalTeamId && (
                                    <button
                                        onClick={() => handleSwitch(user.currentTeamId)}
                                        disabled={switching}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                                 hover:bg-surface-2 transition-colors"
                                    >
                                        <span className="text-sm">👥</span>
                                        <span className="text-xs text-text-secondary">{user.currentTeam?.name}</span>
                                    </button>
                                )}

                                {/* Team management link */}
                                <button
                                    onClick={() => { setShowSwitcher(false); navigate('/team') }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                               hover:bg-surface-2 transition-colors border-t border-border-subtle"
                                >
                                    <span className="text-sm">⚙️</span>
                                    <span className="text-xs text-text-tertiary">Manage Teams</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Navigation ────────────────────────────────────── */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                {mainNav.map((item) => (
                    item.external ? (
                        <a
                            key={item.to}
                            href={item.to}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium
                                       text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
                        >
                            <span className="text-sm">{item.icon}</span>
                            {item.label}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" className="ml-auto text-text-disabled">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                        </a>
                    ) : (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/' || item.to === '/super-admin'}
                            className={({ isActive }) => cn(
                                'flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                                isActive
                                    ? isSuperAdmin
                                        ? 'bg-danger/10 text-danger font-bold'
                                        : 'bg-brand-400/10 text-brand-300 font-bold'
                                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-2'
                            )}
                        >
                            <span className="text-sm">{item.icon}</span>
                            {item.label}
                        </NavLink>
                    )
                ))}

                {/* Team admin section (not for SUPER_ADMIN) */}
                {adminNav.length > 0 && (
                    <>
                        <div className="pt-4 pb-1 px-3">
                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                Team Admin
                            </p>
                        </div>
                        {adminNav.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) => cn(
                                    'flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                                    isActive
                                        ? 'bg-warning/10 text-warning font-bold'
                                        : 'text-text-tertiary hover:text-text-primary hover:bg-surface-2'
                                )}
                            >
                                <span className="text-sm">{item.icon}</span>
                                {item.label}
                            </NavLink>
                        ))}
                    </>
                )}
            </nav>

            {/* ── User footer ───────────────────────────────────── */}
            <div className="px-3 py-3 border-t border-border-default">
                <NavLink
                    to="/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-xl
                     hover:bg-surface-2 transition-colors"
                >
                    <div className="w-7 h-7 rounded-full bg-brand-400/20 flex items-center
                         justify-center text-xs font-bold text-brand-300">
                        {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-text-primary truncate">{user.name}</p>
                        <p className="text-[10px] text-text-disabled truncate">{user.email}</p>
                    </div>
                </NavLink>
            </div>
        </aside>
    )
}