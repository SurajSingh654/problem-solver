// ============================================================================
// ProbSolver v3.0 — Super Admin Dashboard
// ============================================================================

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { teamsApi } from '@services/teams.api'
import api from '@services/api'

import { useNavigate } from 'react-router-dom'



export default function SuperAdminDashboard() {
    const [pendingTeams, setPendingTeams] = useState([])
    const [platformStats, setPlatformStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(null)

    // Inside the component:
    const navigate = useNavigate()
    const apiDocsUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '/api-docs')

    useEffect(() => {
        async function load() {
            try {
                const [pending, stats] = await Promise.all([
                    teamsApi.listPending(),
                    api.get('/stats/platform'),
                ])
                setPendingTeams(pending.data.data.teams || [])
                setPlatformStats(stats.data.data.platform || null)
            } catch (err) {
                console.error('Dashboard load error:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    async function handleReview(teamId, action, rejectionReason) {
        setActionLoading(teamId)
        try {
            await teamsApi.review(teamId, { action, rejectionReason })
            setPendingTeams((prev) => prev.filter((t) => t.id !== teamId))
        } catch (err) {
            console.error('Review error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Spinner size="lg" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            <h1 className="text-2xl font-extrabold text-text-primary mb-1">Platform Admin</h1>
            <p className="text-sm text-text-secondary mb-8">
                Manage teams, monitor platform health, and review pending requests.
            </p>

            {/* ── Platform Stats ────────────────────────────────── */}
            {platformStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
                    {[
                        { label: 'Total Users', value: platformStats.totalUsers, icon: '👥' },
                        { label: 'Active Teams', value: platformStats.activeTeams, icon: '🏢' },
                        { label: 'Pending Teams', value: platformStats.pendingTeams, icon: '⏳' },
                        { label: 'Total Problems', value: platformStats.totalProblems, icon: '📋' },
                        { label: 'Total Solutions', value: platformStats.totalSolutions, icon: '✅' },
                        { label: 'Quizzes', value: platformStats.totalQuizzes, icon: '🧩' },
                        { label: 'Interviews', value: platformStats.totalInterviews, icon: '💬' },
                        { label: 'Active Users', value: platformStats.usersByActivity?.active || 0, icon: '🟢' },
                    ].map((stat) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-surface-1 border border-border-default rounded-xl p-4 text-center"
                        >
                            <span className="text-xl">{stat.icon}</span>
                            <p className="text-xl font-extrabold font-mono text-text-primary mt-1">{stat.value}</p>
                            <p className="text-[10px] text-text-disabled uppercase tracking-wider">{stat.label}</p>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Quick Links */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
                {[
                    { icon: '🏢', label: 'All Teams', to: '/super-admin/teams', desc: `${platformStats?.activeTeams || 0} active` },
                    { icon: '👥', label: 'All Users', to: '/super-admin/users', desc: `${platformStats?.totalUsers || 0} total` },
                    { icon: '📊', label: 'Analytics', to: '/super-admin/analytics', desc: 'Platform health' },
                    { icon: '📖', label: 'API Docs', to: apiDocsUrl, external: true, desc: 'Swagger UI' },
                ].map(link => (
                    link.external ? (
                        <a key={link.label} href={link.to} target="_blank" rel="noopener noreferrer"
                            className="bg-surface-1 border border-border-default rounded-xl p-4
                         hover:border-brand-400/30 transition-all cursor-pointer">
                            <span className="text-xl">{link.icon}</span>
                            <p className="text-sm font-bold text-text-primary mt-2">{link.label}</p>
                            <p className="text-[10px] text-text-disabled">{link.desc}</p>
                        </a>
                    ) : (
                        <div key={link.label}
                            onClick={() => navigate(link.to)}
                            className="bg-surface-1 border border-border-default rounded-xl p-4
                         hover:border-brand-400/30 transition-all cursor-pointer">
                            <span className="text-xl">{link.icon}</span>
                            <p className="text-sm font-bold text-text-primary mt-2">{link.label}</p>
                            <p className="text-[10px] text-text-disabled">{link.desc}</p>
                        </div>
                    )
                ))}
            </div>

            {/* ── Pending Teams ─────────────────────────────────── */}
            <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <span>⏳</span> Pending Team Requests
                {pendingTeams.length > 0 && (
                    <span className="text-xs bg-warning/15 text-warning px-2 py-0.5 rounded-full font-bold">
                        {pendingTeams.length}
                    </span>
                )}
            </h2>

            {pendingTeams.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-xl p-8 text-center">
                    <p className="text-sm text-text-tertiary">No pending team requests.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {pendingTeams.map((team) => (
                        <motion.div
                            key={team.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-surface-1 border border-border-default rounded-xl p-5"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-text-primary">{team.name}</h3>
                                    {team.description && (
                                        <p className="text-xs text-text-tertiary mt-1">{team.description}</p>
                                    )}
                                    <p className="text-xs text-text-disabled mt-2">
                                        Created by <span className="text-text-secondary font-medium">
                                            {team.createdBy.name}
                                        </span> ({team.createdBy.email})
                                        · Max {team.maxMembers} members
                                        · {new Date(team.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => handleReview(team.id, 'approve')}
                                        disabled={actionLoading === team.id}
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            const reason = prompt('Rejection reason:')
                                            if (reason) handleReview(team.id, 'reject', reason)
                                        }}
                                        disabled={actionLoading === team.id}
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    )
}