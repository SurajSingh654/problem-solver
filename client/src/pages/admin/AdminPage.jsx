import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblems, useDeleteProblem, useUpdateProblem } from '@hooks/useProblems'
import { useUsers, useDeleteUser, useUpdateUserRole } from '@hooks/useUsers'
import { useAuthStore } from '@store/useAuthStore'
import { useTeamStats } from '@hooks/useReport'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatShortDate, formatRelativeDate } from '@utils/formatters'
import { SOURCE_LABELS } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }


// ── Stat card ──────────────────────────────────────────
function AdminStat({ icon, label, value, color }) {
    return (
        <div className={cn(
            'rounded-xl border p-4 text-center',
            color
        )}>
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-3xl font-extrabold font-mono text-text-primary">
                {value}
            </div>
            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                {label}
            </div>
        </div>
    )
}

// ── Delete confirm modal ───────────────────────────────
function DeleteModal({ problem, onConfirm, onCancel, isDeleting }) {
    return (
        <>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-overlay bg-black/65 backdrop-blur-sm"
                onClick={onCancel}
            />
            <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-surface-2 border border-border-strong rounded-2xl p-6
                     w-full max-w-sm shadow-xl"
                >
                    <div className="text-3xl mb-3 text-center">🗑️</div>
                    <h3 className="text-base font-bold text-text-primary text-center mb-2">
                        Delete problem?
                    </h3>
                    <p className="text-sm text-text-tertiary text-center mb-1">
                        <span className="font-semibold text-text-primary">
                            "{problem.title}"
                        </span>
                    </p>
                    <p className="text-xs text-text-tertiary text-center mb-5">
                        This will also delete all solutions submitted for this problem.
                        This cannot be undone.
                    </p>
                    <div className="flex gap-3">
                        <Button variant="ghost" size="md" fullWidth onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button variant="danger" size="md" fullWidth
                            loading={isDeleting} onClick={onConfirm}>
                            Delete
                        </Button>
                    </div>
                </motion.div>
            </div>
        </>
    )
}

// ── Problems table ─────────────────────────────────────
function ProblemsTable({ problems, onEdit, onDelete, onTogglePin, onToggleActive }) {
    if (!problems.length) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="text-4xl">📭</div>
                <p className="text-sm font-semibold text-text-primary">No problems yet</p>
                <p className="text-xs text-text-tertiary">Add the first problem to get started</p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
                <thead>
                    <tr className="border-b border-border-default">
                        {['Problem', 'Difficulty', 'Source', 'Solutions', 'Added', 'Status', ''].map(h => (
                            <th key={h} className="py-3 px-4 text-left">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    {h}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {problems.map((p, i) => (
                        <motion.tr
                            key={p.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="hover:bg-surface-2 transition-colors group"
                        >
                            {/* Title */}
                            <td className="py-3 px-4 max-w-[260px]">
                                <div className="flex items-center gap-2">
                                    {p.isPinned && <span className="text-warning text-sm">📌</span>}
                                    {p.isBlindChallenge && <span className="text-brand-300 text-sm">🎯</span>}
                                    <span
                                        onClick={() => onEdit(p.id)}
                                        className="text-sm font-semibold text-text-primary truncate
                               cursor-pointer hover:text-brand-300 transition-colors"
                                    >
                                        {p.title}
                                    </span>
                                </div>
                                {p.tags?.slice(0, 2).map(t => (
                                    <span key={t}
                                        className="inline-block mr-1 mt-0.5 text-[10px] text-text-disabled
                                   bg-surface-3 border border-border-subtle rounded px-1 py-px">
                                        {t}
                                    </span>
                                ))}
                            </td>

                            {/* Difficulty */}
                            <td className="py-3 px-4">
                                <Badge variant={DIFF_VARIANT[p.difficulty] || 'brand'} size="xs">
                                    {p.difficulty.charAt(0) + p.difficulty.slice(1).toLowerCase()}
                                </Badge>
                            </td>

                            {/* Source */}
                            <td className="py-3 px-4">
                                <span className="text-xs text-text-tertiary">
                                    {SOURCE_LABELS[p.source] || p.source}
                                </span>
                            </td>

                            {/* Solutions */}
                            <td className="py-3 px-4 text-center">
                                <span className="text-sm font-bold font-mono text-text-primary">
                                    {p.totalSolutions ?? p._count?.solutions ?? 0}
                                </span>
                            </td>

                            {/* Added */}
                            <td className="py-3 px-4">
                                <span className="text-xs text-text-tertiary font-mono">
                                    {formatShortDate(p.addedAt)}
                                </span>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">
                                <button
                                    onClick={() => onToggleActive(p)}
                                    className={cn(
                                        'text-[10px] font-bold px-2 py-1 rounded-full border transition-all',
                                        p.isActive
                                            ? 'bg-success/10 border-success/25 text-success hover:bg-success/20'
                                            : 'bg-surface-3 border-border-default text-text-disabled hover:border-border-strong'
                                    )}
                                >
                                    {p.isActive ? 'Active' : 'Hidden'}
                                </button>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4">
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100
                                transition-opacity">
                                    {/* Pin toggle */}
                                    <button
                                        onClick={() => onTogglePin(p)}
                                        title={p.isPinned ? 'Unpin' : 'Pin'}
                                        className="p-1.5 rounded-lg hover:bg-surface-3 transition-colors
                               text-text-tertiary hover:text-warning"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                            <circle cx="12" cy="10" r="3" />
                                        </svg>
                                    </button>

                                    {/* Edit */}
                                    <button
                                        onClick={() => onEdit(p.id)}
                                        title="Edit"
                                        className="p-1.5 rounded-lg hover:bg-surface-3 transition-colors
                               text-text-tertiary hover:text-brand-300"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>

                                    {/* Delete */}
                                    <button
                                        onClick={() => onDelete(p)}
                                        title="Delete"
                                        className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors
                               text-text-tertiary hover:text-danger"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        </svg>
                                    </button>
                                </div>
                            </td>
                        </motion.tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── Members table ──────────────────────────────────────
function MembersTable({ users, currentUserId }) {
    const navigate = useNavigate()
    const deleteUser = useDeleteUser()
    const updateRole = useUpdateUserRole()
    const [confirmDelete, setConfirmDelete] = useState(null)
    

    if (!users?.length) return null

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                    <thead>
                        <tr className="border-b border-border-default">
                            {['Member', 'Role', 'Solved', 'Streak', 'Sims', 'Joined', ''].map(h => (
                                <th key={h} className="py-3 px-4 text-left">
                                    <span className="text-[10px] font-bold text-text-disabled
                                   uppercase tracking-widest">
                                        {h}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {users.map((u, i) => {
                            const isYou = u.id === currentUserId
                            const isAdmin = u.role === 'ADMIN'
                            return (
                                <motion.tr
                                    key={u.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.03 }}
                                    className="hover:bg-surface-2 transition-colors group"
                                >
                                    {/* Member */}
                                    <td className="py-3 px-4 cursor-pointer"
                                        onClick={() => navigate(`/profile/${u.username}`)}>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={u.username} color={u.avatarColor} size="sm" />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-text-primary">
                                                        {u.username}
                                                    </span>
                                                    {isYou && (
                                                        <span className="text-[10px] px-1.5 py-px rounded-full
                                             bg-brand-400/15 text-brand-300
                                             border border-brand-400/25">
                                                            you
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-text-disabled">{u.email}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Role */}
                                    <td className="py-3 px-4">
                                        <span className={cn(
                                            'text-[10px] font-bold px-2 py-px rounded-full border',
                                            isAdmin
                                                ? 'bg-warning/12 text-warning border-warning/25'
                                                : 'bg-surface-3 text-text-secondary border-border-default'
                                        )}>
                                            {isAdmin ? '⚡ Admin' : 'Member'}
                                        </span>
                                    </td>

                                    {/* Solved */}
                                    <td className="py-3 px-4">
                                        <span className="text-sm font-bold font-mono text-text-primary">
                                            {u.solutionCount}
                                        </span>
                                    </td>

                                    {/* Streak */}
                                    <td className="py-3 px-4">
                                        <span className={cn(
                                            'text-sm font-bold',
                                            u.streak > 0 ? 'text-warning' : 'text-text-disabled'
                                        )}>
                                            {u.streak > 0 ? `${u.streak} 🔥` : '—'}
                                        </span>
                                    </td>

                                    {/* Sims */}
                                    <td className="py-3 px-4">
                                        <span className="text-sm text-text-tertiary">{u.simCount}</span>
                                    </td>

                                    {/* Joined */}
                                    <td className="py-3 px-4">
                                        <span className="text-xs text-text-tertiary font-mono">
                                            {formatShortDate(u.joinedAt)}
                                        </span>
                                    </td>

                                    {/* Actions */}
                                    <td className="py-3 px-4">
                                        {!isYou && (
                                            <div className="flex items-center gap-1
                                      opacity-0 group-hover:opacity-100 transition-opacity">
                                                {/* Promote / Demote */}
                                                <button
                                                    onClick={() => updateRole.mutate({
                                                        id: u.id,
                                                        role: isAdmin ? 'MEMBER' : 'ADMIN',
                                                    })}
                                                    title={isAdmin ? 'Demote to Member' : 'Promote to Admin'}
                                                    className={cn(
                                                        'px-2 py-1 rounded-lg text-[10px] font-bold border transition-all',
                                                        isAdmin
                                                            ? 'text-text-tertiary border-border-default hover:border-danger/40 hover:text-danger hover:bg-danger/8'
                                                            : 'text-text-tertiary border-border-default hover:border-warning/40 hover:text-warning hover:bg-warning/8'
                                                    )}
                                                >
                                                    {isAdmin ? 'Demote' : 'Promote'}
                                                </button>

                                                {/* Delete */}
                                                {!isAdmin && (
                                                    <button
                                                        onClick={() => setConfirmDelete(u)}
                                                        title="Remove member"
                                                        className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors
                                       text-text-disabled hover:text-danger"
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                                            stroke="currentColor" strokeWidth="2"
                                                            strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6" />
                                                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                            <path d="M10 11v6M14 11v6" />
                                                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </motion.tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Delete confirm modal */}
            <AnimatePresence>
                {confirmDelete && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-overlay bg-black/65 backdrop-blur-sm"
                            onClick={() => setConfirmDelete(null)}
                        />
                        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-surface-2 border border-border-strong rounded-2xl p-6
                           w-full max-w-sm shadow-xl"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <Avatar
                                        name={confirmDelete.username}
                                        color={confirmDelete.avatarColor}
                                        size="md"
                                    />
                                    <div>
                                        <p className="text-sm font-bold text-text-primary">
                                            {confirmDelete.username}
                                        </p>
                                        <p className="text-xs text-text-tertiary">
                                            {confirmDelete.solutionCount} solutions · joined {formatShortDate(confirmDelete.joinedAt)}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-text-secondary mb-2">
                                    Remove this member from ProbSolver?
                                </p>
                                <p className="text-xs text-text-tertiary mb-5">
                                    This permanently deletes their account, all solutions, sim sessions,
                                    and clarity ratings. This cannot be undone.
                                </p>
                                <div className="flex gap-3">
                                    <Button variant="ghost" size="md" fullWidth
                                        onClick={() => setConfirmDelete(null)}>
                                        Cancel
                                    </Button>
                                    <Button variant="danger" size="md" fullWidth
                                        loading={deleteUser.isPending}
                                        onClick={async () => {
                                            await deleteUser.mutateAsync(confirmDelete.id)
                                            setConfirmDelete(null)
                                        }}>
                                        Remove Member
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}
// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function AdminPage() {
    const navigate = useNavigate()
    const [tab, setTab] = useState('problems') // 'problems' | 'members'
    const [deleting, setDeleting] = useState(null)
    const [search, setSearch] = useState('')
    const { user: currentUser } = useAuthStore()  // ← called outside a component!

    const { data: problemsData, isLoading: problemsLoading } =
        useProblems({ limit: '200' })
    const { data: users, isLoading: usersLoading } = useUsers()
    const { data: stats } = useTeamStats()

    const deleteProblem = useDeleteProblem()
    const updateProblem = useUpdateProblem()

    const problems = problemsData?.problems || []

    const filtered = search
        ? problems.filter(p =>
            p.title.toLowerCase().includes(search.toLowerCase())
        )
        : problems

    function handleEdit(id) {
        navigate(`/admin/problems/${id}/edit`)
    }

    function handleDelete(problem) {
        setDeleting(problem)
    }

    async function confirmDelete() {
        if (!deleting) return
        await deleteProblem.mutateAsync(deleting.id)
        setDeleting(null)
    }

    async function handleTogglePin(problem) {
        await updateProblem.mutateAsync({
            id: problem.id,
            data: { isPinned: !problem.isPinned },
        })
    }

    async function handleToggleActive(problem) {
        await updateProblem.mutateAsync({
            id: problem.id,
            data: { isActive: !problem.isActive },
        })
    }

    return (
        <div className="p-6 max-w-[1100px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Admin Panel
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Manage problems and members
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="md"
                    onClick={() => navigate('/admin/problems/new')}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Problem
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                    {
                        icon: '📋',
                        label: 'Problems',
                        value: stats?.totalProblems || problems.length,
                        color: 'bg-brand-400/10 border-brand-400/20',
                    },
                    {
                        icon: '👥',
                        label: 'Members',
                        value: stats?.totalMembers || users?.length || 0,
                        color: 'bg-info/10 border-info/20',
                    },
                    {
                        icon: '✅',
                        label: 'Solutions',
                        value: stats?.totalSolutions || 0,
                        color: 'bg-success/10 border-success/20',
                    },
                    {
                        icon: '📌',
                        label: 'Pinned',
                        value: problems.filter(p => p.isPinned).length,
                        color: 'bg-warning/10 border-warning/20',
                    },
                ].map((s, i) => (
                    <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                    >
                        <AdminStat {...s} />
                    </motion.div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface-2 border border-border-default
                      rounded-xl p-1 mb-5 w-fit">
                {[
                    { id: 'problems', label: `Problems (${problems.length})` },
                    { id: 'members', label: `Members (${users?.length || 0})` },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                            tab === t.id
                                ? 'bg-surface-4 text-text-primary shadow-sm'
                                : 'text-text-tertiary hover:text-text-primary'
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
                {tab === 'problems' && (
                    <>
                        {/* Search */}
                        <div className="p-4 border-b border-border-default">
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search problems…"
                                className="w-full sm:w-80 bg-surface-3 border border-border-strong
                           rounded-xl text-sm text-text-primary placeholder:text-text-tertiary
                           px-3.5 py-2 outline-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                        </div>

                        {problemsLoading ? (
                            <div className="flex justify-center py-16">
                                <Spinner size="lg" />
                            </div>
                        ) : (
                            <ProblemsTable
                                problems={filtered}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onTogglePin={handleTogglePin}
                                onToggleActive={handleToggleActive}
                            />
                        )}
                    </>
                )}

                {tab === 'members' && (
                    <>
                        {usersLoading ? (
                            <div className="flex justify-center py-16">
                                <Spinner size="lg" />
                            </div>
                        ) : (
                            <MembersTable users={users} currentUserId={currentUser?.id} />
                        )}
                    </>
                )}
            </div>

            {/* Delete modal */}
            <AnimatePresence>
                {deleting && (
                    <DeleteModal
                        problem={deleting}
                        onConfirm={confirmDelete}
                        onCancel={() => setDeleting(null)}
                        isDeleting={deleteProblem.isPending}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}