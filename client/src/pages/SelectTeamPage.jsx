// ============================================================================
// SelectTeamPage — SUPER_ADMIN team picker
// ============================================================================
//
// When SUPER_ADMIN navigates to a team-scoped route without a currentTeamId,
// ProtectedRoute redirects here with a ?redirect= param. Picking a team
// calls switchTeam (server-side extended to allow SUPER_ADMIN without a
// TeamMembership row — see auth.controller.js) which sets currentTeamId +
// teamRole in the user record, then navigates back to the original URL.
//
// Only reachable when user.globalRole === 'SUPER_ADMIN'. Regular users
// with team memberships use the sidebar team switcher instead.
// ============================================================================
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import { teamsApi } from '@services/teams.api'
import { Spinner } from '@components/ui/Spinner'

export default function SelectTeamPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, switchTeam } = useAuthStore()
    const [teams, setTeams] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [picking, setPicking] = useState(null)
    const [error, setError] = useState(null)

    const redirectTo = new URLSearchParams(location.search).get('redirect') || '/super-admin'

    useEffect(() => {
        if (user?.globalRole !== 'SUPER_ADMIN') {
            navigate('/dashboard', { replace: true })
            return
        }
        let cancelled = false
        async function load() {
            try {
                const res = await teamsApi.listAll({ limit: 100, status: 'ACTIVE' })
                if (!cancelled) setTeams(res.data.data.teams || [])
            } catch (err) {
                if (!cancelled) setError(err.response?.data?.error?.message || 'Failed to load teams.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [user, navigate])

    const filtered = useMemo(() => {
        if (!filter) return teams
        const q = filter.toLowerCase()
        return teams.filter(t => t.name.toLowerCase().includes(q))
    }, [teams, filter])

    const handlePick = async (team) => {
        setPicking(team.id)
        setError(null)
        const result = await switchTeam(team.id)
        setPicking(null)
        if (result.success) {
            navigate(redirectTo, { replace: true })
        } else {
            setError(result.error || 'Failed to switch team.')
        }
    }

    if (user?.globalRole !== 'SUPER_ADMIN') return null

    return (
        <div className="min-h-screen hero-gradient flex items-center justify-center px-4 py-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl bg-surface-1 border border-border-default rounded-2xl shadow-xl overflow-hidden"
            >
                <header className="px-6 py-5 border-b border-border-default">
                    <div className="text-[11px] font-bold text-brand-fg-soft uppercase tracking-widest mb-1">
                        SUPER_ADMIN · Team Picker
                    </div>
                    <h1 className="text-xl font-extrabold text-text-primary mb-1">
                        Pick a team to act as
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Team-scoped surfaces (Curriculum Admin, Templates, Sessions, Learning, Showcase,
                        Feedback triage) need a team context. Pick a team to enter — you can switch anytime
                        via the sidebar.
                    </p>
                </header>

                <div className="p-6">
                    <input
                        type="text"
                        placeholder="🔍  Filter by team name…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="w-full mb-4 px-4 py-2.5 text-sm rounded-lg border border-border-default
                                   bg-surface-2 text-text-primary placeholder:text-text-disabled
                                   focus:outline-none focus:border-brand-line"
                    />

                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-text-tertiary py-8 justify-center">
                            <Spinner size="sm" /> Loading teams…
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 rounded-lg border border-danger-line bg-danger-soft/40 text-xs text-danger-fg">
                            {error}
                        </div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <p className="text-sm text-text-tertiary italic text-center py-8">
                            No ACTIVE teams match your filter.
                        </p>
                    )}

                    {!loading && filtered.length > 0 && (
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                            {filtered.map(team => (
                                <button
                                    key={team.id}
                                    onClick={() => handlePick(team)}
                                    disabled={picking !== null}
                                    className="w-full text-left p-3.5 rounded-xl border border-border-default
                                               bg-surface-2 hover:border-brand-line hover:bg-surface-3
                                               transition-all disabled:opacity-40 disabled:cursor-not-allowed
                                               flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-bold text-text-primary">
                                            {team.name}
                                        </div>
                                        <div className="text-xs text-text-tertiary flex gap-2 mt-0.5">
                                            <span>{team.memberCount ?? '?'} members</span>
                                            {team.isPersonal && <span>· personal</span>}
                                            {team.currentTeamId === user?.currentTeamId && <span>· current</span>}
                                        </div>
                                    </div>
                                    {picking === team.id
                                        ? <Spinner size="sm" />
                                        : <span className="text-xs text-brand-fg-soft">Act as →</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <footer className="px-6 py-3 border-t border-border-default text-[11px] text-text-disabled">
                    Acting as a team gives you TEAM_ADMIN capabilities within it. Your SUPER_ADMIN role
                    is unchanged; the tenancy invariants still apply.
                </footer>
            </motion.div>
        </div>
    )
}
