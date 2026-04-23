// ============================================================================
// ProbSolver v3.0 — All Teams Page (SUPER_ADMIN)
// ============================================================================
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { teamsApi } from '@services/teams.api'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'

export default function AllTeamsPage() {
    const [teams, setTeams] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [expandedTeam, setExpandedTeam] = useState(null)
    const [teamDetail, setTeamDetail] = useState(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [actionLoading, setActionLoading] = useState(null)

    useEffect(() => {
        loadTeams()
    }, [filter])

    async function loadTeams() {
        setLoading(true)
        try {
            const params = { limit: 100 }
            if (filter) params.status = filter
            const res = await teamsApi.listAll(params)
            setTeams(res.data.teams || [])
        } catch (err) {
            console.error('Failed to load teams:', err)
        } finally {
            setLoading(false)
        }
    }

    async function loadTeamDetail(teamId) {
        if (expandedTeam === teamId) {
            setExpandedTeam(null)
            setTeamDetail(null)
            return
        }
        setExpandedTeam(teamId)
        setDetailLoading(true)
        try {
            const res = await teamsApi.getDetails(teamId)
            setTeamDetail(res.data)
        } catch (err) {
            console.error('Failed to load team detail:', err)
        } finally {
            setDetailLoading(false)
        }
    }

    async function handleApprove(teamId) {
        setActionLoading(teamId)
        try {
            await teamsApi.review(teamId, { action: 'approve' })
            await loadTeams()
        } catch (err) {
            console.error('Approve error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    async function handleReject(teamId) {
        const reason = prompt('Rejection reason:')
        if (!reason) return
        setActionLoading(teamId)
        try {
            await teamsApi.review(teamId, { action: 'reject', rejectionReason: reason })
            await loadTeams()
        } catch (err) {
            console.error('Reject error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    async function handleDelete(teamId, teamName) {
        if (!confirm(`Delete team "${teamName}"? All members will be moved to individual mode.`)) return
        setActionLoading(teamId)
        try {
            await teamsApi.deleteTeam(teamId)
            setTeams(prev => prev.filter(t => t.id !== teamId))
            if (expandedTeam === teamId) {
                setExpandedTeam(null)
                setTeamDetail(null)
            }
        } catch (err) {
            console.error('Delete error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    const statusConfig = {
        ACTIVE: { color: 'bg-success/10 text-success border-success/25', label: 'Active' },
        PENDING: { color: 'bg-warning/10 text-warning border-warning/25', label: 'Pending' },
        REJECTED: { color: 'bg-danger/10 text-danger border-danger/25', label: 'Rejected' },
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-extrabold text-text-primary mb-1">All Teams</h1>
            <p className="text-sm text-text-secondary mb-6">Manage all teams on the platform</p>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1 mb-6 w-fit">
                {[
                    { id: '', label: 'All' },
                    { id: 'ACTIVE', label: 'Active' },
                    { id: 'PENDING', label: 'Pending' },
                    { id: 'REJECTED', label: 'Rejected' },
                ].map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                            filter === f.id
                                ? 'bg-surface-4 text-text-primary shadow-sm'
                                : 'text-text-tertiary hover:text-text-primary'
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : teams.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-xl p-12 text-center">
                    <p className="text-sm text-text-tertiary">No teams found.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {teams.map(team => (
                        <div key={team.id}>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="bg-surface-1 border border-border-default rounded-xl p-5"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div
                                        className="flex-1 cursor-pointer"
                                        onClick={() => loadTeamDetail(team.id)}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-bold text-text-primary">{team.name}</h3>
                                            <span className={cn(
                                                'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                                statusConfig[team.status]?.color
                                            )}>
                                                {statusConfig[team.status]?.label}
                                            </span>
                                        </div>
                                        {team.description && (
                                            <p className="text-xs text-text-tertiary mb-1">{team.description}</p>
                                        )}
                                        <p className="text-xs text-text-disabled">
                                            Created by {team.createdBy?.name} ({team.createdBy?.email})
                                            · {team._count?.currentMembers || 0} members
                                            · {team._count?.problems || 0} problems
                                            · {formatShortDate(team.createdAt)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {team.status === 'PENDING' && (
                                            <>
                                                <Button variant="primary" size="sm"
                                                    onClick={() => handleApprove(team.id)}
                                                    disabled={actionLoading === team.id}>
                                                    Approve
                                                </Button>
                                                <Button variant="secondary" size="sm"
                                                    onClick={() => handleReject(team.id)}
                                                    disabled={actionLoading === team.id}>
                                                    Reject
                                                </Button>
                                            </>
                                        )}
                                        {team.status === 'ACTIVE' && (
                                            <Button variant="secondary" size="sm"
                                                onClick={() => handleDelete(team.id, team.name)}
                                                disabled={actionLoading === team.id}
                                                className="text-danger hover:text-danger">
                                                Delete
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded team detail */}
                                <AnimatePresence>
                                    {expandedTeam === team.id && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="mt-4 pt-4 border-t border-border-subtle">
                                                {detailLoading ? (
                                                    <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                                                ) : teamDetail?.members ? (
                                                    <div>
                                                        <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                                                            Members ({teamDetail.members.length})
                                                        </p>
                                                        {teamDetail.members.length === 0 ? (
                                                            <p className="text-xs text-text-tertiary">No members</p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {teamDetail.members.map(m => (
                                                                    <div key={m.id}
                                                                        className="flex items-center justify-between p-3 bg-surface-2 rounded-lg">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-7 h-7 rounded-full bg-brand-400/20 flex items-center
                                                                                         justify-center text-xs font-bold text-brand-300">
                                                                                {m.name?.charAt(0).toUpperCase()}
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-xs font-bold text-text-primary">{m.name}</p>
                                                                                <p className="text-[10px] text-text-disabled">{m.email}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-3">
                                                                            <span className={cn(
                                                                                'text-[9px] font-bold px-1.5 py-px rounded-full border',
                                                                                m.teamRole === 'TEAM_ADMIN'
                                                                                    ? 'bg-warning/10 text-warning border-warning/20'
                                                                                    : 'bg-surface-3 text-text-disabled border-border-subtle'
                                                                            )}>
                                                                                {m.teamRole === 'TEAM_ADMIN' ? 'Admin' : 'Member'}
                                                                            </span>
                                                                            <span className="text-[10px] text-text-disabled">
                                                                                {m.solutionCount || 0} solved
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {team.joinCode && (
                                                            <div className="mt-3 p-3 bg-brand-400/5 border border-brand-400/20 rounded-lg">
                                                                <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-1">Join Code</p>
                                                                <p className="font-mono text-sm font-bold text-brand-300">{team.joinCode}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}