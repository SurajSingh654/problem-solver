import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTeamStats } from '@hooks/useReport'
import { useProblems } from '@hooks/useProblems'
import { useUsers } from '@hooks/useUsers'
import useAuthStore from '@store/useAuthStore'
import { ActivityFeed } from '@components/features/ActivityFeed'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES } from '@utils/constants'
import { formatRelativeDate } from '@utils/formatters'
import api from '@services/api'

// ── Stat card ──────────────────────────────────────────
function AdminStat({ icon, value, label, color, sub, onClick, delay = 0 }) {
    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            onClick={onClick}
            className={cn(
                'flex flex-col items-center gap-1 p-4 rounded-xl border',
                'transition-all duration-150',
                onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default',
                color || 'bg-surface-1 border-border-default'
            )}
        >
            <span className="text-xl">{icon}</span>
            <span className="text-2xl font-extrabold font-mono text-text-primary">
                {value ?? '—'}
            </span>
            <span className="text-[10px] text-text-disabled uppercase tracking-wider">
                {label}
            </span>
            {sub && <span className="text-[10px] text-text-tertiary">{sub}</span>}
        </motion.button>
    )
}

// ── Member health card ─────────────────────────────────
function MemberCard({ member, onClick }) {
    const lastActive = member.lastActiveDate
        ? formatRelativeDate(member.lastActiveDate)
        : 'Never'

    const isInactive = !member.lastActiveDate ||
        (Date.now() - new Date(member.lastActiveDate).getTime()) > 7 * 86400000

    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-3 p-3 rounded-xl border w-full text-left',
                'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm',
                isInactive
                    ? 'bg-warning/3 border-warning/20 hover:border-warning/40'
                    : 'bg-surface-1 border-border-default hover:border-brand-400/30'
            )}
        >
            <Avatar name={member.username} color={member.avatarColor} size="sm" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary truncate">
                        {member.username}
                    </span>
                    {member.streak > 0 && (
                        <span className="text-[10px] text-warning font-bold">
                            🔥{member.streak}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-disabled">
                        {member.solutionCount} solved
                    </span>
                    <span className="text-[10px] text-text-disabled">·</span>
                    <span className={cn(
                        'text-[10px]',
                        isInactive ? 'text-warning font-semibold' : 'text-text-disabled'
                    )}>
                        {isInactive ? '⚠ ' : ''}{lastActive}
                    </span>
                </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-text-disabled flex-shrink-0">
                <polyline points="9 18 15 12 9 6" />
            </svg>
        </button>
    )
}

// ── Content gap card ───────────────────────────────────
function ContentGap({ icon, label, count, total, color }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0
    return (
        <div className="flex items-center gap-3">
            <span className="text-base flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary">{label}</span>
                    <span className="text-xs font-bold text-text-primary">{count}</span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                        className={cn('h-full rounded-full transition-all', color)}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN ADMIN DASHBOARD
// ══════════════════════════════════════════════════════
export default function AdminDashboard() {
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const { data: teamStats, isLoading: teamLoading } = useTeamStats()
    const { data: problemsData } = useProblems({ limit: '200' })
    const { data: users, isLoading: usersLoading } = useUsers()

    const problems = problemsData?.problems || []
    const members = (users || []).filter(u => u.role !== 'ADMIN')

    // Category breakdown
    const categoryBreakdown = PROBLEM_CATEGORIES.map(cat => ({
        ...cat,
        count: problems.filter(p => p.category === cat.id).length,
    }))

    // Members needing attention
    const inactiveMembers = members.filter(m => {
        if (!m.joinedAt) return false
        const lastActive = m.lastActiveDate || m.joinedAt
        return (Date.now() - new Date(lastActive).getTime()) > 7 * 86400000
    })

    const newMembers = members.filter(m =>
        m.solutionCount === 0
    )

    // Problems with no solutions
    const unsolvedProblems = problems.filter(p =>
        (p.totalSolutions || p._count?.solutions || 0) === 0
    )

    return (
        <div className="p-6 max-w-[1100px] mx-auto">

            {/* ── Hero ────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
            >
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <Avatar name={user?.username} color={user?.avatarColor} size="lg" />
                        <div>
                            <p className="text-xs text-text-tertiary">Admin Dashboard</p>
                            <h1 className="text-xl font-extrabold text-text-primary tracking-tight">
                                {user?.username || '...'}
                            </h1>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="primary" size="sm"
                            onClick={() => navigate('/admin/problems/new')}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Add Problem
                        </Button>
                        <Button variant="secondary" size="sm"
                            onClick={() => navigate('/admin/showcase')}>
                            Showcase
                        </Button>
                    </div>
                </div>
            </motion.div>

            {/* ── Platform stats ──────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <AdminStat icon="👥" value={members.length} label="Members"
                    onClick={() => navigate('/admin')} delay={0} />
                <AdminStat icon="📋" value={problems.length} label="Problems"
                    onClick={() => navigate('/problems')} delay={0.04} />
                <AdminStat icon="✅" value={teamStats?.totalSolutions || 0} label="Solutions"
                    delay={0.08} />
                <AdminStat icon="🧠"
                    value={teamStats?.totalSolutions ? Math.round((teamStats.totalSolutions / Math.max(problems.length * members.length, 1)) * 100) + '%' : '0%'}
                    label="Coverage" delay={0.12} />
            </div>

            {/* ── Alerts / Action needed ──────────────────── */}
            {(inactiveMembers.length > 0 || newMembers.length > 0 || unsolvedProblems.length > 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 mb-6"
                >
                    {inactiveMembers.length > 0 && (
                        <div className="flex items-center gap-3 p-4 rounded-xl border
                            border-warning/25 bg-warning/5">
                            <span className="text-xl flex-shrink-0">⚠️</span>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-text-primary">
                                    {inactiveMembers.length} member{inactiveMembers.length !== 1 ? 's' : ''} inactive for 7+ days
                                </p>
                                <p className="text-xs text-text-tertiary">
                                    {inactiveMembers.map(m => m.username).join(', ')}
                                </p>
                            </div>
                            <Button variant="secondary" size="sm"
                                onClick={() => navigate('/admin')}>
                                View Members
                            </Button>
                        </div>
                    )}

                    {newMembers.length > 0 && (
                        <div className="flex items-center gap-3 p-4 rounded-xl border
                            border-info/25 bg-info/5">
                            <span className="text-xl flex-shrink-0">🆕</span>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-text-primary">
                                    {newMembers.length} member{newMembers.length !== 1 ? 's' : ''} haven't solved anything yet
                                </p>
                                <p className="text-xs text-text-tertiary">
                                    {newMembers.map(m => m.username).join(', ')}
                                </p>
                            </div>
                        </div>
                    )}

                    {unsolvedProblems.length > 0 && (
                        <div className="flex items-center gap-3 p-4 rounded-xl border
                            border-brand-400/25 bg-brand-400/5">
                            <span className="text-xl flex-shrink-0">📋</span>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-text-primary">
                                    {unsolvedProblems.length} problem{unsolvedProblems.length !== 1 ? 's' : ''} with no solutions
                                </p>
                                <p className="text-xs text-text-tertiary">
                                    Consider promoting these or reviewing their descriptions
                                </p>
                            </div>
                            <Button variant="secondary" size="sm"
                                onClick={() => navigate('/problems')}>
                                View Problems
                            </Button>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ── Two-column layout ───────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                {/* Left — 3/5 */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Content coverage */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-surface-1 border border-border-default rounded-xl p-5"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                <span>📊</span> Content Coverage
                            </h2>
                            <Button variant="ghost" size="sm"
                                onClick={() => navigate('/admin/problems/new')}>
                                + Add
                            </Button>
                        </div>
                        <div className="space-y-3">
                            {categoryBreakdown.map(cat => (
                                <ContentGap
                                    key={cat.id}
                                    icon={cat.icon}
                                    label={cat.label}
                                    count={cat.count}
                                    total={Math.max(...categoryBreakdown.map(c => c.count), 1)}
                                    color="bg-brand-400"
                                />
                            ))}
                        </div>
                    </motion.div>

                    {/* Team activity */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                <span>👥</span> Recent Team Activity
                            </h2>
                            <button
                                onClick={() => navigate('/leaderboard')}
                                className="text-xs text-brand-300 hover:text-brand-200
                           font-semibold transition-colors"
                            >
                                Leaderboard →
                            </button>
                        </div>
                        <div className="bg-surface-1 border border-border-default rounded-xl p-4">
                            <ActivityFeed
                                activities={teamStats?.recentActivity || []}
                                loading={teamLoading}
                            />
                        </div>
                    </motion.div>
                </div>

                {/* Right — 2/5 */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Quick actions */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="grid grid-cols-2 gap-2"
                    >
                        {[
                            {
                                icon: '📋', label: 'Problems', to: '/problems',
                                color: 'hover:border-brand-400/40 hover:bg-brand-400/5'
                            },
                            {
                                icon: '👥', label: 'Members', to: '/admin',
                                color: 'hover:border-info/40 hover:bg-info/5'
                            },
                            {
                                icon: '🏆', label: 'Leaderboard', to: '/leaderboard',
                                color: 'hover:border-warning/40 hover:bg-warning/5'
                            },
                            {
                                icon: '📖', label: 'Docs', to: '/docs/readme',
                                color: 'hover:border-success/40 hover:bg-success/5'
                            },
                        ].map((link, i) => (
                            <motion.button
                                key={link.to}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.12 + i * 0.04 }}
                                onClick={() => navigate(link.to)}
                                className={cn(
                                    'flex items-center gap-2.5 p-3.5 rounded-xl border',
                                    'bg-surface-1 border-border-default',
                                    'transition-all duration-150 text-left',
                                    'hover:-translate-y-0.5 hover:shadow-sm',
                                    link.color
                                )}
                            >
                                <span className="text-lg">{link.icon}</span>
                                <span className="text-xs font-semibold text-text-primary">
                                    {link.label}
                                </span>
                            </motion.button>
                        ))}
                    </motion.div>

                    {/* Member health */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                <span>🩺</span> Member Health
                            </h2>
                            <button
                                onClick={() => navigate('/admin')}
                                className="text-xs text-brand-300 hover:text-brand-200
                           font-semibold transition-colors"
                            >
                                Manage →
                            </button>
                        </div>
                        {usersLoading ? (
                            <div className="flex justify-center py-8">
                                <Spinner size="md" />
                            </div>
                        ) : members.length === 0 ? (
                            <div className="bg-surface-1 border border-border-default rounded-xl
                              p-6 text-center">
                                <p className="text-sm text-text-tertiary">No members yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {members.slice(0, 6).map(m => (
                                    <MemberCard
                                        key={m.id}
                                        member={m}
                                        onClick={() => navigate(`/profile/${m.username}`)}
                                    />
                                ))}
                                {members.length > 6 && (
                                    <button
                                        onClick={() => navigate('/admin')}
                                        className="w-full text-center text-xs text-brand-300
                               hover:text-brand-200 font-semibold py-2
                               transition-colors"
                                    >
                                        View all {members.length} members →
                                    </button>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    )
}