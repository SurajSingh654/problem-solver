// ============================================================================
// ProbSolver v3.0 — All Users Page (SUPER_ADMIN)
// ============================================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'
import api from '@services/api'

export default function AllUsersPage() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [actionLoading, setActionLoading] = useState(null)

    const navigate = useNavigate()

    useEffect(() => {
        loadUsers()
    }, [])

    async function loadUsers() {
        try {
            const res = await api.get('/users')
            setUsers(res.data.users || [])
        } catch (err) {
            console.error('Failed to load users:', err)
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete(userId, userName) {
        if (!confirm(`Delete "${userName}"? This cannot be undone.`)) return
        setActionLoading(userId)
        try {
            await api.delete(`/users/${userId}`)
            setUsers(prev => prev.filter(u => u.id !== userId))
        } catch (err) {
            console.error('Delete error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    const filtered = search
        ? users.filter(u =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
        )
        : users

    const statusColor = {
        ACTIVE: 'text-success',
        INACTIVE: 'text-warning',
        DORMANT: 'text-danger',
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-extrabold text-text-primary mb-1">All Users</h1>
            <p className="text-sm text-text-secondary mb-6">
                {users.length} users on the platform
            </p>

            {/* Search */}
            <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full sm:w-80 bg-surface-2 border border-border-default rounded-xl
                           text-sm text-text-primary placeholder:text-text-tertiary
                           px-3.5 py-2.5 mb-6 outline-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
            />

            {loading ? (
                <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : (
                <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border-default">
                                {['User', 'Role', 'Team', 'Solved', 'Status', 'Joined', ''].map(h => (
                                    <th key={h} className="py-3 px-4 text-left">
                                        <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">{h}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {filtered.map((u, i) => (
                                <motion.tr
                                    key={u.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.02 }}
                                    onClick={() => navigate(`/super-admin/profile/${u.id}`)}
                                    className="hover:bg-surface-2 transition-colors group cursor-pointer"
                                >
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-full bg-brand-400/20 flex items-center
                                                         justify-center text-xs font-bold text-brand-300">
                                                {u.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-text-primary">{u.name}</p>
                                                <p className="text-[10px] text-text-disabled">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={cn(
                                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                            u.globalRole === 'SUPER_ADMIN'
                                                ? 'bg-danger/10 text-danger border-danger/25'
                                                : u.teamRole === 'TEAM_ADMIN'
                                                    ? 'bg-warning/10 text-warning border-warning/25'
                                                    : 'bg-surface-3 text-text-disabled border-border-default'
                                        )}>
                                            {u.globalRole === 'SUPER_ADMIN' ? '🛡️ Super Admin'
                                                : u.teamRole === 'TEAM_ADMIN' ? '👑 Admin'
                                                    : 'Member'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="text-xs text-text-tertiary">
                                            {u.targetCompany || '—'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="text-sm font-bold font-mono text-text-primary">
                                            {u.solutionCount || 0}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={cn(
                                            'text-[10px] font-bold',
                                            statusColor[u.activityStatus] || 'text-text-disabled'
                                        )}>
                                            {u.activityStatus || '—'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className="text-xs text-text-tertiary font-mono">
                                            {formatShortDate(u.createdAt)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        {u.globalRole !== 'SUPER_ADMIN' && (
                                            <button
                                                onClick={() => handleDelete(u.id, u.name)}
                                                disabled={actionLoading === u.id}
                                                className="text-xs font-bold text-text-disabled
                                                           hover:text-danger transition-colors
                                                           px-2 py-1 rounded-lg hover:bg-danger/10"
                                            >
                                                {actionLoading === u.id ? '...' : 'Delete'}
                                            </button>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}