// ============================================================================
// ProbSolver — Sidebar (collapsible + grouped sections + tooltips)
// ============================================================================
//
// Two states:
//   • Expanded (w-64, ~256px) — labels + section headers visible.
//   • Collapsed (w-[68px]) — icon-only with hover tooltips.
//
// State persists via useUIStore (`sidebarCollapsed`, localStorage). The
// matching width adjustments live in AppShell (`lg:ml-[68px]` vs
// `lg:ml-64`) and Topbar (`lg:left-[68px]` vs `lg:left-64`) — keep those
// in sync if you change the collapsed width here.
//
// Mobile: the collapsed/expanded toggle has no effect; the mobile drawer
// always renders full-width when open. The collapse toggle button hides
// itself on mobile.
// ============================================================================
import { useState, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import { useUIStore } from '@store/useUIStore'
import { cn } from '@utils/cn'

// ── Section definitions per role ─────────────────────────────
function buildSections({ user, isSuperAdmin, isTeamAdmin, isPersonal, apiDocsUrl }) {
    const featureTeaching = import.meta.env.VITE_FEATURE_TEACHING_SESSIONS === 'true'
    const featureNotes = import.meta.env.VITE_FEATURE_NOTES_ENABLED === 'true'
    const sections = []

    if (isSuperAdmin) {
        sections.push({
            id: 'platform',
            label: 'Platform',
            items: [
                { to: '/super-admin', icon: '⚡', label: 'Dashboard', end: true },
                { to: '/super-admin/teams', icon: '🏢', label: 'All Teams' },
                { to: '/super-admin/users', icon: '👥', label: 'All Users' },
                { to: '/super-admin/analytics', icon: '📊', label: 'Analytics' },
            ],
        })
        sections.push({
            id: 'content',
            label: 'Content',
            items: [
                { to: '/super-admin/showcase', icon: '🎪', label: 'Showcase' },
                { to: '/super-admin/roadmap', icon: '🗺️', label: 'Roadmap' },
                { to: '/super-admin/learning', icon: '🎓', label: 'Learning Content' },
            ],
        })
        sections.push({
            id: 'health',
            label: 'Health & Audit',
            items: [
                { to: '/super-admin/feedback', icon: '🐛', label: 'Feedback Inbox' },
                { to: '/super-admin/verdicts', icon: '⚖️', label: 'Verdict Audit' },
                { to: '/super-admin/ai-usage', icon: '📡', label: 'AI Usage' },
                { to: '/super-admin/diagnostics', icon: '🩺', label: 'Diagnostics' },
            ],
        })
        if (featureTeaching) {
            sections.push({
                id: 'teaching',
                label: 'Teaching',
                items: [
                    { to: '/teaching', icon: '📚', label: 'Sessions' },
                    { to: '/super-admin/teaching-flags', icon: '🚩', label: 'Flags' },
                ],
            })
        }
        sections.push({
            id: 'settings',
            label: 'Settings',
            items: [
                { to: '/super-admin/settings', icon: '⚙️', label: 'Settings' },
                { to: apiDocsUrl, icon: '📖', label: 'API Docs', external: true },
            ],
        })
        return sections
    }

    // Team members & individuals
    sections.push({
        id: 'practice',
        label: 'Practice',
        items: [
            { to: '/', icon: '📊', label: 'Dashboard', end: true },
            { to: '/problems', icon: '📋', label: 'Problems' },
            { to: '/review', icon: '🧠', label: 'Review Queue' },
            { to: '/quizzes', icon: '🧩', label: 'Quizzes' },
            { to: '/mock-interview', icon: '💬', label: 'Mock Interview' },
            { to: '/design-studio', icon: '🏗️', label: 'Design Studio' },
            { to: '/learn', icon: '🎓', label: 'Learn' },
        ],
    })

    const progressItems = [
        { to: '/interview-history', icon: '📜', label: 'Interview History' },
        { to: '/report', icon: '📈', label: 'Intelligence Report' },
    ]
    if (featureNotes) {
        progressItems.push({ to: '/notes', icon: '📝', label: 'Notes' })
    }
    sections.push({ id: 'progress', label: 'Progress', items: progressItems })

    if (!isPersonal) {
        const teamItems = [{ to: '/leaderboard', icon: '🏆', label: 'Leaderboard' }]
        if (featureTeaching) {
            teamItems.push({ to: '/teaching', icon: '📚', label: 'Teaching' })
        }
        sections.push({ id: 'team', label: 'Team', items: teamItems })
    }

    if (isTeamAdmin) {
        sections.push({
            id: 'admin',
            label: 'Team Admin',
            adminAccent: true,
            items: [
                { to: '/admin', icon: '👑', label: 'Overview' },
                { to: '/admin/add-problem', icon: '➕', label: 'Add Problem' },
                { to: '/admin/design-references', icon: '🧭', label: 'References' },
                { to: '/admin/analytics', icon: '📊', label: 'Analytics' },
            ],
        })
    }

    sections.push({
        id: 'help',
        label: 'Help',
        items: [
            { to: '/feedback', icon: '🐛', label: 'Feedback' },
            { to: '/docs/how-to', icon: '📘', label: 'How-To Guide' },
        ],
    })

    // user variable kept in signature for future per-user customization
    void user
    return sections
}

// ── Tooltip shown when sidebar is collapsed and an icon is hovered ──
function NavTooltip({ children }) {
    return (
        <span
            className="invisible opacity-0 group-hover/navitem:visible group-hover/navitem:opacity-100
                       group-focus-within/navitem:visible group-focus-within/navitem:opacity-100
                       absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md
                       bg-surface-3 text-xs font-bold text-text-primary whitespace-nowrap
                       border border-border-default shadow-lg z-50
                       transition-opacity duration-100 pointer-events-none"
        >
            {children}
        </span>
    )
}

function NavItem({ item, collapsed, accent }) {
    const baseClasses = cn(
        'group/navitem relative flex items-center rounded-xl text-xs font-medium transition-colors',
        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
    )

    if (item.external) {
        return (
            <a
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    baseClasses,
                    'text-text-tertiary hover:text-text-primary hover:bg-surface-2',
                )}
                aria-label={item.label}
            >
                <span className="text-sm">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && (
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="ml-auto text-text-disabled shrink-0"
                    >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                )}
                {collapsed && <NavTooltip>{item.label}</NavTooltip>}
            </a>
        )
    }

    const activeStyle =
        accent === 'admin'
            ? 'bg-warning-soft text-warning-fg font-bold'
            : accent === 'super-admin'
                ? 'bg-danger-soft text-danger-fg font-bold'
                : 'bg-brand-soft text-brand-fg-soft font-bold'

    return (
        <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
                cn(
                    baseClasses,
                    isActive
                        ? activeStyle
                        : 'text-text-tertiary hover:text-text-primary hover:bg-surface-2',
                )
            }
            aria-label={item.label}
        >
            <span className="text-sm">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
            {collapsed && <NavTooltip>{item.label}</NavTooltip>}
        </NavLink>
    )
}

function CollapseToggle({ collapsed, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex items-center justify-center w-full h-7 rounded-lg
                       text-text-disabled hover:text-text-primary hover:bg-surface-2
                       transition-colors"
        >
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                    'transition-transform duration-200',
                    collapsed ? 'rotate-180' : '',
                )}
            >
                <polyline points="15 18 9 12 15 6" />
            </svg>
        </button>
    )
}

export default function Sidebar() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, switchTeam } = useAuthStore()
    const {
        mobileSidebarOpen,
        sidebarCollapsed,
        toggleSidebar,
        recentPaths,
    } = useUIStore()
    const [showSwitcher, setShowSwitcher] = useState(false)
    const [switching, setSwitching] = useState(false)

    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const isTeamAdmin = !isSuperAdmin && user?.teamRole === 'TEAM_ADMIN'
    const isPersonal = user?.currentTeamId === user?.personalTeamId

    const teamName = isPersonal ? 'My Practice' : user?.currentTeam?.name || 'Team'
    const apiDocsUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(
        '/api',
        '/api-docs',
    )

    // Computed even when user is missing (returns empty array) so this
    // hook always runs in the same order — required by react-hooks rules.
    const sections = useMemo(
        () =>
            user
                ? buildSections({ user, isSuperAdmin, isTeamAdmin, isPersonal, apiDocsUrl })
                : [],
        [user, isSuperAdmin, isTeamAdmin, isPersonal, apiDocsUrl],
    )

    // ── Recents — top 3 recently-visited routes that map to a nav item.
    // We exclude the current path (no point linking to where you are)
    // and external links. If fewer than 2 recents survive the filter,
    // hide the section to avoid noise on first load.
    const recentItems = useMemo(() => {
        const flatNav = sections.flatMap((s) =>
            s.items
                .filter((it) => !it.external)
                .map((it) => ({ ...it, sectionLabel: s.label })),
        )
        const byPath = new Map(flatNav.map((it) => [it.to, it]))
        const out = []
        const seen = new Set()
        for (const path of recentPaths) {
            if (path === location.pathname) continue
            if (seen.has(path)) continue
            const item = byPath.get(path)
            if (!item) continue
            out.push(item)
            seen.add(path)
            if (out.length >= 3) break
        }
        return out
    }, [sections, recentPaths, location.pathname])

    if (!user) return null

    // The collapsed flag only takes effect on lg+ screens; on mobile the
    // drawer is always full-width. We pass `collapsedDesktop` to children
    // so their conditional UI uses CSS to hide labels on lg only.
    const collapsed = sidebarCollapsed

    async function handleSwitch(teamId) {
        setSwitching(true)
        const result = await switchTeam(teamId)
        setSwitching(false)
        setShowSwitcher(false)
        if (result.success) navigate('/', { replace: true })
    }

    return (
        <aside
            className={cn(
                'fixed inset-y-0 left-0 z-30 bg-surface-1 border-r border-border-default',
                'flex flex-col transition-[width,transform] duration-200',
                // Desktop width responds to collapsed state
                collapsed ? 'lg:w-[68px]' : 'lg:w-64',
                // Mobile: always full width (w-64) inside the slide-in drawer
                'w-64',
                // Slide-in / out on mobile based on the drawer state
                mobileSidebarOpen
                    ? 'translate-x-0'
                    : '-translate-x-full lg:translate-x-0',
            )}
        >
            {/* ── Logo ───────────────────────────────────────── */}
            <Logo collapsed={collapsed} />

            {/* ── SUPER_ADMIN badge ─────────────────────────── */}
            {isSuperAdmin && <SuperAdminBadge collapsed={collapsed} />}

            {/* ── Team Switcher (not for SUPER_ADMIN) ───────── */}
            {!isSuperAdmin && (
                <TeamSwitcher
                    collapsed={collapsed}
                    user={user}
                    teamName={teamName}
                    isPersonal={isPersonal}
                    showSwitcher={showSwitcher}
                    setShowSwitcher={setShowSwitcher}
                    switching={switching}
                    onSwitch={handleSwitch}
                    navigate={navigate}
                />
            )}

            {/* ── Sections ──────────────────────────────────── */}
            <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
                {recentItems.length >= 2 && (
                    <div className={cn(collapsed ? 'mb-2 pb-2 border-b border-border-subtle' : 'mb-3')}>
                        {!collapsed && (
                            <p className="text-[10px] font-bold uppercase tracking-widest
                                          text-text-disabled px-3 mb-1">
                                Recent
                            </p>
                        )}
                        <div className="space-y-0.5">
                            {recentItems.map((item) => (
                                <NavItem
                                    key={`recent-${item.to}`}
                                    item={item}
                                    collapsed={collapsed}
                                    accent={isSuperAdmin ? 'super-admin' : null}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {sections.map((section, i) => (
                    <div
                        key={section.id}
                        className={cn(
                            i > 0 && (collapsed
                                ? 'mt-2 pt-2 border-t border-border-subtle'
                                : 'mt-3'),
                        )}
                    >
                        {!collapsed && (
                            <p className="text-[10px] font-bold uppercase tracking-widest
                                          text-text-disabled px-3 mb-1">
                                {section.label}
                            </p>
                        )}
                        <div className="space-y-0.5">
                            {section.items.map((item) => (
                                <NavItem
                                    key={item.to}
                                    item={item}
                                    collapsed={collapsed}
                                    accent={
                                        section.adminAccent
                                            ? 'admin'
                                            : isSuperAdmin
                                                ? 'super-admin'
                                                : null
                                    }
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            {/* ── Collapse toggle + user footer ──────────────── */}
            <div className="border-t border-border-default px-2 py-2 space-y-1">
                <CollapseToggle collapsed={collapsed} onClick={toggleSidebar} />
                <UserFooter
                    user={user}
                    isSuperAdmin={isSuperAdmin}
                    collapsed={collapsed}
                />
            </div>
        </aside>
    )
}

function Logo({ collapsed }) {
    return (
        <div
            className={cn(
                'flex items-center gap-3 border-b border-border-default',
                collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-4',
            )}
        >
            <div
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-blue-500
                           flex items-center justify-center shrink-0"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                </svg>
            </div>
            {!collapsed && (
                <span
                    className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                               to-blue-400 bg-clip-text text-transparent"
                >
                    ProbSolver
                </span>
            )}
        </div>
    )
}

function SuperAdminBadge({ collapsed }) {
    return (
        <div className="px-2 py-2 border-b border-border-default">
            <div
                className={cn(
                    'group/navitem relative flex items-center rounded-xl bg-danger-soft border border-danger-line',
                    collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2.5',
                )}
                title={collapsed ? 'Platform Admin' : undefined}
            >
                <span className="text-lg">🛡️</span>
                {!collapsed && (
                    <div className="flex-1 text-left min-w-0">
                        <p className="text-xs font-bold text-text-primary">Platform Admin</p>
                        <p className="text-[10px] text-danger-fg">Super Administrator</p>
                    </div>
                )}
                {collapsed && <NavTooltip>Platform Admin</NavTooltip>}
            </div>
        </div>
    )
}

function TeamSwitcher({
    collapsed,
    user,
    teamName,
    isPersonal,
    showSwitcher,
    setShowSwitcher,
    switching,
    onSwitch,
    navigate,
}) {
    if (collapsed) {
        return (
            <div className="px-2 py-2 border-b border-border-default">
                <NavLink
                    to="/team"
                    className="group/navitem relative flex items-center justify-center px-2 py-2.5
                               rounded-xl bg-surface-2 border border-border-subtle
                               hover:border-brand-400/30 transition-all"
                    aria-label={`Team: ${teamName}`}
                >
                    <span className="text-lg">{isPersonal ? '🧠' : '👥'}</span>
                    <NavTooltip>{teamName}</NavTooltip>
                </NavLink>
            </div>
        )
    }

    return (
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
                        {isPersonal
                            ? 'Individual mode'
                            : user.teamRole === 'TEAM_ADMIN'
                                ? 'Admin'
                                : 'Member'}
                    </p>
                </div>
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-text-disabled"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            <AnimatePresence>
                {showSwitcher && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="mt-2 bg-surface-0 border border-border-default rounded-xl
                                   shadow-lg overflow-hidden"
                    >
                        {(user.memberships || []).map(({ team, role }) => {
                            const isCurrent = user.currentTeamId === team.id
                            if (isCurrent) return null

                            return (
                                <button
                                    key={team.id}
                                    onClick={() => onSwitch(team.id)}
                                    disabled={switching}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                                               hover:bg-surface-2 transition-colors"
                                >
                                    <span className="text-sm">
                                        {team.isPersonal ? '🧠' : '👥'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-text-secondary truncate">
                                            {team.isPersonal ? 'My Practice' : team.name}
                                        </p>
                                        <p className="text-[10px] text-text-disabled">
                                            {team.isPersonal
                                                ? 'Individual mode'
                                                : role === 'TEAM_ADMIN'
                                                    ? 'Admin'
                                                    : 'Member'}
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                        <button
                            onClick={() => {
                                setShowSwitcher(false)
                                navigate('/team')
                            }}
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
    )
}

function UserFooter({ user, isSuperAdmin, collapsed }) {
    const initial = user.name?.charAt(0).toUpperCase() || '?'
    return (
        <NavLink
            to={isSuperAdmin ? '/super-admin/settings' : '/settings'}
            className={cn(
                'group/navitem relative flex items-center rounded-xl hover:bg-surface-2 transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
            )}
            aria-label={`Account · ${user.name}`}
        >
            <div
                className="w-7 h-7 rounded-full bg-brand-soft flex items-center
                           justify-center text-xs font-bold text-brand-fg-soft shrink-0"
            >
                {initial}
            </div>
            {!collapsed && (
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-text-primary truncate">{user.name}</p>
                    <p className="text-[10px] text-text-disabled truncate">{user.email}</p>
                </div>
            )}
            {collapsed && <NavTooltip>{user.name}</NavTooltip>}
        </NavLink>
    )
}
