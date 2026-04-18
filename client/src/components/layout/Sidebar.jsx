import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@store/useAuthStore'
import { useUIStore } from '@store/useUIStore'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Tooltip } from '@components/ui/Tooltip'
import { cn } from '@utils/cn'
import { useMe } from '@hooks/useAuth'

// ── Nav item data ──────────────────────────────────────
function useNavItems(isAdmin, reviewDue) {
    return [
        {
            group: 'Main',
            items: [
                {
                    to: '/',
                    end: true,
                    label: 'Dashboard',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                        </svg>
                    ),
                },
                {
                    to: '/problems',
                    label: 'Problems',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    ),
                },
            ],
        },
        {
            group: 'Practice',
            items: [
                {
                    to: '/interview',
                    label: 'Interview Sim',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    ),
                },
                {
                    to: '/quizzes',
                    label: 'Quiz',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    ),
                },
                {
                    to: '/review',
                    label: 'Review Queue',
                    badge: reviewDue > 0 ? String(reviewDue) : null,
                    badgeVariant: 'danger',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                    ),
                },
            ],
        },
        {
            group: 'Progress',
            items: [
                {
                    to: '/report',
                    label: 'My Report',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                    ),
                },
                {
                    to: '/leaderboard',
                    label: 'Leaderboard',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                    ),
                },
                {
                    to: '/profile',
                    label: 'My Profile',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    ),
                },
            ],
        },
        ...(isAdmin ? [{
            group: 'Admin',
            items: [
                {
                    to: '/admin',
                    label: 'Admin Panel',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    ),
                },
                {
                    to: '/admin/problems/new',
                    label: 'Add Problem',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="16" />
                            <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                    ),
                },
                {
                    to: '/admin/showcase',
                    label: 'Showcase',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                    ),
                },
            ],
        }] : []),
        {
            group: 'Account',
            items: [
                {
                    to: '/settings',
                    label: 'Settings',
                    icon: (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    ),
                },
            ],
        },
    ]
}

// ── Single nav item ────────────────────────────────────
function NavItem({ item, collapsed }) {
    const getClass = ({ isActive }) =>
        cn(
            'group relative flex items-center gap-3 px-3 py-2 rounded-xl',
            'text-sm font-medium transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
            collapsed ? 'justify-center' : '',
            isActive
                ? 'bg-brand-400/12 text-brand-300 border border-brand-400/20'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3 border border-transparent'
        )

    return (
        <Tooltip content={collapsed ? item.label : null} side="right">
            <NavLink to={item.to} end={item.end} className={getClass}>
                {({ isActive }) => (
                    <>
                        {/* Active indicator bar */}
                        {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2
                               w-[3px] h-[55%] bg-brand-400 rounded-full
                               shadow-glow-sm" />
                        )}

                        {/* Icon */}
                        <span className={cn(
                            'flex-shrink-0 w-[18px] h-[18px]',
                            'transition-transform duration-200',
                            'group-hover:scale-110'
                        )}>
                            {item.icon}
                        </span>

                        {/* Label + badge */}
                        {!collapsed && (
                            <>
                                <span className="flex-1 truncate">{item.label}</span>
                                {item.badge && (
                                    <Badge
                                        variant={item.badgeVariant || 'brand'}
                                        size="xs"
                                        dot
                                        pulse
                                    >
                                        {item.badge}
                                    </Badge>
                                )}
                            </>
                        )}

                        {/* Collapsed badge dot */}
                        {collapsed && item.badge && (
                            <span className="absolute top-1 right-1 w-2 h-2
                               rounded-full bg-danger" />
                        )}
                    </>
                )}
            </NavLink>
        </Tooltip>
    )
}

// ── Main Sidebar component ─────────────────────────────
export function Sidebar() {
    const { user } = useAuthStore()
    const { data: me } = useMe()
    const {
        sidebarCollapsed,
        toggleSidebar,
        mobileSidebarOpen,
        closeMobileSidebar,
    } = useUIStore()

    const location = useLocation()
    const overlayRef = useRef(null)

    // Close mobile sidebar on route change
    useEffect(() => {
        closeMobileSidebar()
    }, [location.pathname, closeMobileSidebar])

    const currentUser = me || user
    const isAdmin = currentUser?.role === 'ADMIN'
    const streak = currentUser?.streak || 0
    const reviewDue = 0 // will be computed from solutions in later step

    const navItems = useNavItems(isAdmin, reviewDue)

    // ── Sidebar inner content ─────────────────────────────
    const sidebarContent = (
        <div className="flex flex-col h-full">

            {/* Logo */}
            <div className={cn(
                'flex items-center gap-3 px-4 py-5 flex-shrink-0',
                'border-b border-border-default',
                sidebarCollapsed && 'justify-center px-0'
            )}>
                <div
                    className={cn(
                        'flex-shrink-0 w-9 h-9 rounded-xl',
                        'flex items-center justify-center',
                        'bg-gradient-to-br from-brand-400 to-blue-500',
                        'shadow-glow-sm'
                    )}
                    style={{ animation: 'pulse-glow 3s ease-in-out infinite' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="white" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                </div>

                <AnimatePresence initial={false}>
                    {!sidebarCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <p className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                            to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                                ProbSolver
                            </p>
                            <p className="text-[10px] text-text-disabled font-mono uppercase
                            tracking-widest whitespace-nowrap">
                                Team Edition
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* User profile */}
            <NavLink
                to="/profile"
                className={cn(
                    'flex items-center gap-3 mx-3 my-3 px-3 py-2.5 rounded-xl',
                    'bg-surface-2 border border-border-default',
                    'hover:border-brand-400/40 hover:bg-surface-3',
                    'transition-all duration-150 cursor-pointer flex-shrink-0',
                    sidebarCollapsed && 'justify-center px-2'
                )}
            >
                <Avatar
                    name={currentUser?.username || 'U'}
                    color={currentUser?.avatarColor || '#7c6ff7'}
                    size="sm"
                    online
                />

                <AnimatePresence initial={false}>
                    {!sidebarCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex-1 overflow-hidden min-w-0"
                        >
                            <p className="text-sm font-semibold text-text-primary truncate">
                                {currentUser?.username || 'Loading…'}
                            </p>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    'text-[10px] font-bold px-1.5 py-px rounded-full',
                                    isAdmin
                                        ? 'bg-warning/15 text-warning'
                                        : 'bg-brand-400/12 text-brand-300'
                                )}>
                                    {isAdmin ? '⚡ Admin' : 'Member'}
                                </span>
                                {streak > 0 && (
                                    <span className="text-[10px] text-warning font-mono font-bold">
                                        🔥 {streak}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </NavLink>

            {/* Navigation */}
            <nav className="flex-1 px-3 pb-3 overflow-y-auto no-scrollbar space-y-4">
                {navItems.map(group => (
                    <div key={group.group}>

                        <AnimatePresence initial={false}>
                            {!sidebarCollapsed && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="text-[10px] font-bold text-text-disabled uppercase
                             tracking-widest px-3 pb-1.5"
                                >
                                    {group.group}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        <div className="space-y-0.5">
                            {group.items.map(item => (
                                <NavItem
                                    key={item.to}
                                    item={item}
                                    collapsed={sidebarCollapsed}
                                />
                            ))}
                        </div>

                    </div>
                ))}
            </nav>

            {/* Collapse toggle */}
            <div className="px-3 pb-4 flex-shrink-0">
                <Tooltip
                    content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    side="right"
                >
                    <button
                        onClick={toggleSidebar}
                        className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl',
                            'text-text-tertiary hover:text-text-primary hover:bg-surface-3',
                            'text-xs font-medium transition-all duration-150',
                            sidebarCollapsed && 'justify-center'
                        )}
                    >
                        <svg
                            width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={cn(
                                'flex-shrink-0 transition-transform duration-300',
                                sidebarCollapsed && 'rotate-180'
                            )}
                        >
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                        <AnimatePresence initial={false}>
                            {!sidebarCollapsed && (
                                <motion.span
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden whitespace-nowrap"
                                >
                                    Collapse
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>
            </div>

        </div>
    )

    return (
        <>
            {/* Desktop sidebar */}
            <motion.aside
                animate={{ width: sidebarCollapsed ? 68 : 256 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                    'fixed top-0 left-0 h-screen z-sticky',
                    'bg-surface-1 border-r border-border-default',
                    'hidden lg:flex flex-col overflow-hidden',
                    'flex-shrink-0'
                )}
            >
                {sidebarContent}
            </motion.aside>

            {/* Mobile sidebar — drawer */}
            <AnimatePresence>
                {mobileSidebarOpen && (
                    <>
                        {/* Overlay */}
                        <motion.div
                            ref={overlayRef}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-overlay bg-black/65 backdrop-blur-sm lg:hidden"
                            onClick={closeMobileSidebar}
                        />

                        {/* Drawer */}
                        <motion.aside
                            initial={{ x: -280 }}
                            animate={{ x: 0 }}
                            exit={{ x: -280 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                            className={cn(
                                'fixed top-0 left-0 h-screen z-modal w-64',
                                'bg-surface-1 border-r border-border-default',
                                'flex flex-col overflow-hidden lg:hidden',
                                'shadow-xl'
                            )}
                        >
                            {sidebarContent}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}