// ============================================================================
// ProbSolver v3.0 — Team Management Page
// ============================================================================
//
// Shows different UI based on context:
// - Personal mode: "Join or create a team" prompt
// - Team member: Team info + member list (read-only)
// - Team admin: Full management (invite, roles, settings, code)
// - Super admin: Links to platform admin
//
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTeamContext } from '@hooks/useTeamContext'
import useAuthStore from '@store/useAuthStore'
import { teamsApi } from '@services/teams.api'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Avatar } from '@components/ui/Avatar'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'

export default function TeamManagePage() {
    const navigate = useNavigate()
    const { teamId, teamName, isPersonalMode, isTeamAdmin, isSuperAdmin } = useTeamContext()
    const { switchTeam, user } = useAuthStore()

    const [team, setTeam] = useState(null)
    const [members, setMembers] = useState([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(null)

    // ── Invite state ─────────────────────────────────────
    const [showInvite, setShowInvite] = useState(false)
    const [inviteEmails, setInviteEmails] = useState('')
    const [inviteResult, setInviteResult] = useState(null)

    // ── Join state ───────────────────────────────────────
    const [showJoin, setShowJoin] = useState(false)
    const [joinCode, setJoinCode] = useState('')
    const [joinError, setJoinError] = useState('')

    // ── Create state ─────────────────────────────────────
    const [showCreate, setShowCreate] = useState(false)
    const [createName, setCreateName] = useState('')
    const [createDesc, setCreateDesc] = useState('')
    const [createResult, setCreateResult] = useState(null)

    // ── Code visibility ──────────────────────────────────
    const [showCode, setShowCode] = useState(false)

    useEffect(() => {
        useAuthStore.getState().refreshUser()
    }, [])

    useEffect(() => {
        loadTeamData()
    }, [teamId])

    async function loadTeamData() {
        if (!teamId || isPersonalMode) {
            setLoading(false)
            return
        }

        try {
            const [teamRes, membersRes] = await Promise.all([
                teamsApi.getCurrent(),
                teamsApi.getMembers(),
            ])
            setTeam(teamRes.data.team)
            setMembers(membersRes.data.members)
        } catch (err) {
            console.error('Load team error:', err)
        } finally {
            setLoading(false)
        }
    }

    // ── Actions ────────────────────────────────────────────

    async function handleJoin() {
        if (!joinCode.trim()) return
        setJoinError('')
        setActionLoading('join')
        try {
            const res = await teamsApi.join(joinCode.trim())
            const { token, user: updatedUser } = res.data
            useAuthStore.getState().setAuth(token, updatedUser)
            navigate('/', { replace: true })
        } catch (err) {
            setJoinError(err.response?.data?.error || 'Failed to join team.')
        } finally {
            setActionLoading(null)
        }
    }

    async function handleCreate() {
        if (!createName.trim()) return
        setCreateResult(null)
        setActionLoading('create')
        try {
            const res = await teamsApi.create({
                name: createName.trim(),
                description: createDesc.trim() || undefined,
            })
            setCreateResult({ success: true, message: res.data.message })
            setCreateName('')
            setCreateDesc('')
        } catch (err) {
            setCreateResult({ success: false, message: err.response?.data?.error || 'Failed to create team.' })
        } finally {
            setActionLoading(null)
        }
    }

    async function handleInvite() {
        const emails = inviteEmails
            .split(/[,\n]/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0)

        if (emails.length === 0) return
        setInviteResult(null)
        setActionLoading('invite')
        try {
            const res = await teamsApi.inviteMembers(emails)
            setInviteResult(res.data.results)
            setInviteEmails('')
        } catch (err) {
            setInviteResult({ error: err.response?.data?.error || 'Failed to send invitations.' })
        } finally {
            setActionLoading(null)
        }
    }

    async function handleRoleChange(memberId, newRole) {
        setActionLoading(memberId)
        try {
            await teamsApi.changeMemberRole(memberId, newRole)
            await loadTeamData()
        } catch (err) {
            console.error('Role change error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    async function handleRemoveMember(memberId, memberName) {
        if (!confirm(`Remove ${memberName} from the team?`)) return
        setActionLoading(memberId)
        try {
            await teamsApi.removeMember(memberId)
            setMembers((prev) => prev.filter((m) => m.id !== memberId))
        } catch (err) {
            console.error('Remove member error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    async function handleLeave() {
        if (!confirm('Are you sure you want to leave this team? You will be switched to individual mode.')) return
        setActionLoading('leave')
        try {
            const res = await teamsApi.leave()
            const { token, user: updatedUser } = res.data
            useAuthStore.getState().setAuth(token, updatedUser)
            navigate('/', { replace: true })
        } catch (err) {
            console.error('Leave error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    async function handleRegenerateCode() {
        if (!confirm('Regenerate the join code? The old code will stop working.')) return
        setActionLoading('regen')
        try {
            const res = await teamsApi.regenerateCode()
            setTeam((prev) => ({ ...prev, joinCode: res.data.joinCode }))
        } catch (err) {
            console.error('Regenerate code error:', err)
        } finally {
            setActionLoading(null)
        }
    }

    async function handleSwitchToPersonal() {
        if (!user?.personalTeamId) return
        const result = await switchTeam(user.personalTeamId)
        if (result.success) navigate('/', { replace: true })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Spinner size="lg" />
            </div>
        )
    }

    // ============================================================================
    // SUPER_ADMIN — redirect to platform management
    // ============================================================================
    if (isSuperAdmin) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-8">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">Team Management</h1>
                <p className="text-sm text-text-secondary mb-8">
                    As a platform administrator, you manage teams from the Platform Dashboard.
                </p>
                <div className="bg-surface-1 border border-border-default rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">🛡️</span>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-text-primary">Platform Admin</p>
                            <p className="text-xs text-text-tertiary">
                                Approve, reject, and monitor teams from your dashboard.
                            </p>
                        </div>
                        <Button variant="primary" size="sm" onClick={() => navigate('/super-admin')}>
                            Go to Dashboard
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    // ============================================================================
    // PERSONAL MODE — show join/create options
    // ============================================================================

    if (isPersonalMode) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-8">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">Teams</h1>
                <p className="text-sm text-text-secondary mb-8">
                    You're in individual mode. Join a team or create one.
                </p>

                <div className="space-y-4">
                    {/* ── Join a team ──────────────────────────────── */}
                    <div className="bg-surface-1 border border-border-default rounded-xl p-5">
                        <button
                            onClick={() => { setShowJoin(!showJoin); setShowCreate(false) }}
                            className="w-full flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">👥</span>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-text-primary">Join a Team</p>
                                    <p className="text-xs text-text-tertiary">Enter a join code from your team admin</p>
                                </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" className={cn(
                                    'text-text-disabled transition-transform',
                                    showJoin && 'rotate-180'
                                )}>
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        <AnimatePresence>
                            {showJoin && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-4 flex gap-3">
                                        <Input
                                            placeholder="e.g. PROB-X7K2"
                                            value={joinCode}
                                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                            className="font-mono tracking-wider flex-1"
                                        />
                                        <Button
                                            variant="primary"
                                            onClick={handleJoin}
                                            disabled={actionLoading === 'join'}
                                        >
                                            {actionLoading === 'join' ? 'Joining...' : 'Join'}
                                        </Button>
                                    </div>
                                    {joinError && (
                                        <p className="text-xs text-danger mt-2">{joinError}</p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Create a team ───────────────────────────── */}
                    <div className="bg-surface-1 border border-border-default rounded-xl p-5">
                        <button
                            onClick={() => { setShowCreate(!showCreate); setShowJoin(false) }}
                            className="w-full flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">🚀</span>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-text-primary">Create a Team</p>
                                    <p className="text-xs text-text-tertiary">Start a new team (requires admin approval)</p>
                                </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" className={cn(
                                    'text-text-disabled transition-transform',
                                    showCreate && 'rotate-180'
                                )}>
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        <AnimatePresence>
                            {showCreate && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-4 space-y-3">
                                        <Input
                                            label="Team Name"
                                            placeholder="e.g. Google Prep Squad"
                                            value={createName}
                                            onChange={(e) => setCreateName(e.target.value)}
                                        />
                                        <Input
                                            label="Description (optional)"
                                            placeholder="What's your team preparing for?"
                                            value={createDesc}
                                            onChange={(e) => setCreateDesc(e.target.value)}
                                        />
                                        <Button
                                            variant="primary"
                                            className="w-full"
                                            onClick={handleCreate}
                                            disabled={actionLoading === 'create'}
                                        >
                                            {actionLoading === 'create' ? 'Creating...' : 'Create Team'}
                                        </Button>
                                        {createResult && (
                                            <p className={cn(
                                                'text-xs',
                                                createResult.success ? 'text-success' : 'text-danger'
                                            )}>
                                                {createResult.message}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        )
    }

    // ============================================================================
    // TEAM MODE — show team info, members, admin controls
    // ============================================================================

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary">{team?.name || teamName}</h1>
                    {team?.description && (
                        <p className="text-sm text-text-secondary mt-1">{team.description}</p>
                    )}
                    <p className="text-xs text-text-disabled mt-2">
                        {team?._count?.currentMembers || members.length} member{members.length !== 1 ? 's' : ''}
                        {' · '}{team?._count?.problems || 0} problems
                        {' · '}{team?._count?.solutions || 0} solutions
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={handleSwitchToPersonal}>
                        Switch to Individual
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleLeave}
                        disabled={actionLoading === 'leave'}
                        className="text-danger hover:text-danger"
                    >
                        Leave
                    </Button>
                </div>
            </div>

            {/* ── Join Code (admin only) ──────────────────────── */}
            {isTeamAdmin && team?.joinCode && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-5 mb-6"
                >
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-text-disabled uppercase tracking-widest">
                            Join Code
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowCode(!showCode)}
                                className="text-xs text-brand-300 hover:text-brand-200"
                            >
                                {showCode ? 'Hide' : 'Show'}
                            </button>
                            <button
                                onClick={() => { navigator.clipboard.writeText(team.joinCode); }}
                                className="text-xs text-brand-300 hover:text-brand-200"
                            >
                                Copy
                            </button>
                            <button
                                onClick={handleRegenerateCode}
                                disabled={actionLoading === 'regen'}
                                className="text-xs text-text-disabled hover:text-text-secondary"
                            >
                                Regenerate
                            </button>
                        </div>
                    </div>
                    <p className="font-mono text-2xl font-extrabold tracking-[0.3em] text-brand-300">
                        {showCode ? team.joinCode : '••••••••'}
                    </p>
                    <p className="text-xs text-text-disabled mt-2">
                        Share this code with people you want to join your team.
                    </p>
                </motion.div>
            )}

            {/* ── Invite Members (admin only) ─────────────────── */}
            {isTeamAdmin && (
                <div className="mb-6">
                    <button
                        onClick={() => setShowInvite(!showInvite)}
                        className="flex items-center gap-2 text-sm font-bold text-brand-300
                       hover:text-brand-200 transition-colors mb-3"
                    >
                        <span>✉️</span> Invite Members by Email
                    </button>

                    <AnimatePresence>
                        {showInvite && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="bg-surface-1 border border-border-default rounded-xl p-4">
                                    <textarea
                                        value={inviteEmails}
                                        onChange={(e) => setInviteEmails(e.target.value)}
                                        placeholder="Enter email addresses (comma or newline separated)"
                                        rows={3}
                                        className="w-full bg-surface-0 text-sm text-text-primary rounded-lg
                               px-3 py-2 border border-border-default resize-none
                               placeholder:text-text-disabled outline-none
                               focus:border-brand-400/40"
                                    />
                                    <div className="flex items-center justify-between mt-3">
                                        <p className="text-xs text-text-disabled">Max 10 per batch</p>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={handleInvite}
                                            disabled={actionLoading === 'invite'}
                                        >
                                            {actionLoading === 'invite' ? 'Sending...' : 'Send Invites'}
                                        </Button>
                                    </div>
                                    {inviteResult && !inviteResult.error && (
                                        <div className="mt-3 space-y-1">
                                            {inviteResult.sent?.map((s) => (
                                                <p key={s.email} className="text-xs text-success">✓ {s.email} — invited</p>
                                            ))}
                                            {inviteResult.skipped?.map((s) => (
                                                <p key={s.email} className="text-xs text-text-disabled">⊘ {s.email} — {s.reason}</p>
                                            ))}
                                        </div>
                                    )}
                                    {inviteResult?.error && (
                                        <p className="text-xs text-danger mt-2">{inviteResult.error}</p>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Members List ────────────────────────────────── */}
            <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                <span>👥</span> Members ({members.length})
            </h2>

            <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
                {members.map((member, i) => (
                    <motion.div
                        key={member.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className={cn(
                            'flex items-center gap-4 px-5 py-3.5',
                            i < members.length - 1 && 'border-b border-border-subtle',
                            member.id === user?.id && 'bg-brand-400/3'
                        )}
                    >
                        <Avatar name={member.name} url={member.avatarUrl} size="sm" />

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-text-primary truncate">
                                    {member.name}
                                    {member.id === user?.id && (
                                        <span className="text-[9px] text-brand-300 ml-1.5">(you)</span>
                                    )}
                                </p>
                                <span className={cn(
                                    'text-[9px] font-bold px-1.5 py-px rounded-full border',
                                    member.teamRole === 'TEAM_ADMIN'
                                        ? 'bg-warning/10 text-warning border-warning/20'
                                        : 'bg-surface-2 text-text-disabled border-border-subtle'
                                )}>
                                    {member.teamRole === 'TEAM_ADMIN' ? 'Admin' : 'Member'}
                                </span>
                                {member.activityStatus === 'INACTIVE' && (
                                    <span className="text-[9px] text-text-disabled">Inactive</span>
                                )}
                            </div>
                            <p className="text-[10px] text-text-disabled truncate">{member.email}</p>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-text-disabled">
                            <span className="font-mono">{member.streak}d streak</span>
                        </div>

                        {/* Admin actions (not on self) */}
                        {isTeamAdmin && member.id !== user?.id && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => handleRoleChange(
                                        member.id,
                                        member.teamRole === 'TEAM_ADMIN' ? 'MEMBER' : 'TEAM_ADMIN'
                                    )}
                                    disabled={actionLoading === member.id}
                                    className="text-[10px] font-bold text-text-tertiary
                             hover:text-brand-300 transition-colors px-2 py-1"
                                >
                                    {member.teamRole === 'TEAM_ADMIN' ? 'Demote' : 'Promote'}
                                </button>
                                <button
                                    onClick={() => handleRemoveMember(member.id, member.name)}
                                    disabled={actionLoading === member.id}
                                    className="text-[10px] font-bold text-text-disabled
                             hover:text-danger transition-colors px-2 py-1"
                                >
                                    Remove
                                </button>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    )
}