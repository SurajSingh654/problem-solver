// ============================================================================
// ProbSolver v3.0 — Profile Page
// ============================================================================
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useUser } from '@hooks/useUsers'
import useAuthStore from '@store/useAuthStore'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    formatShortDate, formatRelativeDate,
} from '@utils/formatters'
import { CONFIDENCE_LEVELS } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Role badge helper ──────────────────────────────────
function RoleBadge({ globalRole, teamRole }) {
    if (globalRole === 'SUPER_ADMIN') {
        return <Badge variant="danger" size="xs">🛡️ Super Admin</Badge>
    }
    if (teamRole === 'TEAM_ADMIN') {
        return <Badge variant="warning" size="xs">👑 Team Admin</Badge>
    }
    return <Badge variant="brand" size="xs">👤 Member</Badge>
}

// ── Activity status badge ──────────────────────────────
function StatusBadge({ status }) {
    const config = {
        ACTIVE: 'text-success bg-success/10 border-success/25',
        INACTIVE: 'text-warning bg-warning/10 border-warning/25',
        DORMANT: 'text-danger bg-danger/10 border-danger/25',
    }
    return (
        <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            config[status] || config.ACTIVE
        )}>
            {status || 'ACTIVE'}
        </span>
    )
}

// ── Solution row ───────────────────────────────────────
function SolutionRow({ solution, index, onClick }) {
    const conf = CONFIDENCE_LEVELS.find(c => c.value === solution.confidence)

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={onClick}
            className="flex items-center gap-3 p-3.5 rounded-xl border
                 bg-surface-2 border-border-default
                 hover:border-brand-400/30 hover:bg-surface-3
                 cursor-pointer transition-all duration-150"
        >
            {/* Solved check */}
            <div className="w-5 h-5 rounded-full bg-success/15 border border-success/30
                      flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#22c55e" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate mb-0.5">
                    {solution.problem?.title || 'Untitled Problem'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                        variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'}
                        size="xs"
                    >
                        {solution.problem?.difficulty
                            ? solution.problem.difficulty.charAt(0) + solution.problem.difficulty.slice(1).toLowerCase()
                            : '—'}
                    </Badge>
                    {solution.problem?.category && (
                        <span className="text-[10px] text-text-disabled">
                            {solution.problem.category.replace('_', ' ')}
                        </span>
                    )}
                    {solution.pattern && (
                        <span className="text-[11px] text-brand-300 bg-brand-400/10
                             border border-brand-400/15 rounded-full px-2 py-px">
                            {solution.pattern}
                        </span>
                    )}
                </div>
            </div>

            {/* Right side */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {conf && (
                    <span className="text-base" title={conf.label}>{conf.emoji}</span>
                )}
                <span className="text-[11px] text-text-disabled font-mono">
                    {formatRelativeDate(solution.createdAt)}
                </span>
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ProfilePage() {
    const { userId } = useParams()
    const navigate = useNavigate()
    const { user: me } = useAuthStore()

    const isMeSuperAdmin = me?.globalRole === 'SUPER_ADMIN'

    // If no userId param, show own profile
    const targetId = userId || me?.id
    const isOwnProfile = !userId || userId === me?.id

    const { data: profile, isLoading, isError } = useUser(targetId)

    if (isLoading) return <PageSpinner />

    if (isError || !profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="text-5xl">😕</div>
                <h2 className="text-lg font-bold text-text-primary">User not found</h2>
                <Button
                    variant="secondary"
                    onClick={() => navigate(isMeSuperAdmin ? '/super-admin/users' : '/leaderboard')}
                >
                    {isMeSuperAdmin ? 'Back to Users' : 'Back to Leaderboard'}
                </Button>
            </div>
        )
    }

    // Limited profile — only id, name, avatarUrl returned (different team, non-admin)
    const isLimited = !profile.createdAt

    const solutions = profile.recentSolutions || []
    const easy = solutions.filter(s => s.problem?.difficulty === 'EASY').length
    const medium = solutions.filter(s => s.problem?.difficulty === 'MEDIUM').length
    const hard = solutions.filter(s => s.problem?.difficulty === 'HARD').length

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Back button */}
            {userId && (
                <button
                    onClick={() => navigate(isMeSuperAdmin ? '/super-admin/users' : '/leaderboard')}
                    className="flex items-center gap-1.5 text-sm text-text-tertiary
                     hover:text-text-primary transition-colors mb-6"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    {isMeSuperAdmin ? 'Back to Users' : 'Back'}
                </button>
            )}

            {/* ── Hero section ──────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-2xl overflow-hidden border border-border-default
                   p-6 mb-6 hero-gradient"
            >
                <div className="absolute top-[-60px] right-[-60px] w-[240px] h-[240px]
                        rounded-full bg-brand-400/8 blur-[80px] pointer-events-none" />

                <div className="relative z-10 flex items-start gap-5 flex-wrap">
                    <div className="relative">
                        <Avatar
                            name={profile.name}
                            color={profile.avatarUrl}
                            size="2xl"
                        />
                        {profile.streak > 0 && (
                            <div className="absolute -bottom-1 -right-1 bg-surface-2
                              border border-border-strong rounded-full
                              px-1.5 py-px text-[11px] font-bold text-warning">
                                🔥{profile.streak}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h1 className="text-xl font-extrabold text-text-primary">
                                {profile.name}
                            </h1>
                            <RoleBadge
                                globalRole={profile.globalRole}
                                teamRole={profile.teamRole}
                            />
                            {profile.activityStatus && (
                                <StatusBadge status={profile.activityStatus} />
                            )}
                        </div>

                        {/* Email — shown for own profile or SuperAdmin viewing */}
                        {profile.email && (
                            <p className="text-xs text-text-tertiary mb-2">
                                {profile.email}
                            </p>
                        )}

                        <p className="text-xs text-text-tertiary mb-3">
                            Joined {formatShortDate(profile.createdAt)}
                        </p>

                        {/* Target company */}
                        {profile.targetCompany && (
                            <span className="text-[10px] font-semibold text-warning
                                   bg-warning/10 border border-warning/20
                                   rounded-full px-2 py-px">
                                🏢 {profile.targetCompany}
                            </span>
                        )}

                        {/* Preferred language */}
                        {profile.preferredLanguage && (
                            <p className="text-xs text-text-tertiary mt-2">
                                Preferred language:{' '}
                                <span className="font-semibold text-text-secondary">
                                    {profile.preferredLanguage}
                                </span>
                            </p>
                        )}

                        {/* Interview date */}
                        {profile.interviewDate && (
                            <p className="text-xs text-text-tertiary mt-1">
                                Interview: {formatShortDate(profile.interviewDate)}
                            </p>
                        )}
                    </div>

                    {/* Edit button for own profile */}
                    {isOwnProfile && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate('/settings')}
                            className="flex-shrink-0"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit Profile
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* ── Limited profile message ────────────────── */}
            {isLimited && (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                    <div className="text-3xl mb-3">🔒</div>
                    <p className="text-sm font-semibold text-text-primary mb-1">
                        Limited profile
                    </p>
                    <p className="text-xs text-text-tertiary">
                        This user is not in your team. Only basic info is visible.
                    </p>
                </div>
            )}

            {/* ── Full profile sections (only when not limited) ── */}
            {!isLimited && (
                <>
                    {/* Stats grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        {[
                            { label: 'Solved', value: profile.solutionCount || 0, color: 'text-brand-300' },
                            { label: 'Streak', value: `${profile.streak || 0} 🔥`, color: 'text-warning' },
                            { label: 'Sim Sessions', value: profile.simCount || 0, color: 'text-info' },
                            { label: 'Interviews', value: profile.interviewCount || 0, color: 'text-success' },
                        ].map((s, i) => (
                            <motion.div
                                key={s.label}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-surface-1 border border-border-default rounded-xl p-4 text-center"
                            >
                                <div className={cn('text-2xl font-extrabold font-mono', s.color)}>
                                    {s.value}
                                </div>
                                <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                    {s.label}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Difficulty breakdown */}
                    {solutions.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                        >
                            <h2 className="text-sm font-bold text-text-primary mb-4">
                                Difficulty Breakdown
                            </h2>
                            <div className="flex items-center gap-4">
                                {[
                                    { label: 'Easy', count: easy, color: 'text-success', bar: 'bg-success' },
                                    { label: 'Medium', count: medium, color: 'text-warning', bar: 'bg-warning' },
                                    { label: 'Hard', count: hard, color: 'text-danger', bar: 'bg-danger' },
                                ].map(d => (
                                    <div key={d.label} className="flex-1 text-center">
                                        <div className={cn('text-2xl font-extrabold font-mono', d.color)}>
                                            {d.count}
                                        </div>
                                        <div className="text-[10px] text-text-disabled uppercase tracking-wider my-1">
                                            {d.label}
                                        </div>
                                        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{
                                                    width: solutions.length
                                                        ? `${(d.count / solutions.length) * 100}%`
                                                        : '0%'
                                                }}
                                                transition={{ duration: 0.7, ease: 'easeOut' }}
                                                className={cn('h-full rounded-full', d.bar)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Recent solutions */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                <span>✅</span> Recent Solutions
                                <Badge variant="brand" size="xs">{solutions.length}</Badge>
                            </h2>
                        </div>

                        {solutions.length === 0 ? (
                            <div className="bg-surface-1 border border-border-default rounded-2xl
                                  p-10 text-center">
                                <div className="text-3xl mb-3">🌱</div>
                                <p className="text-sm font-semibold text-text-primary mb-1">
                                    No solutions yet
                                </p>
                                <p className="text-xs text-text-tertiary">
                                    {isOwnProfile
                                        ? 'Start solving problems to build your profile!'
                                        : `${profile.name} hasn't solved any problems yet.`}
                                </p>
                                {isOwnProfile && !isMeSuperAdmin && (
                                    <Button
                                        variant="primary" size="sm"
                                        className="mt-4"
                                        onClick={() => navigate('/problems')}
                                    >
                                        Browse Problems
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {solutions.map((sol, i) => (
                                    <SolutionRow
                                        key={sol.id}
                                        solution={sol}
                                        index={i}
                                        onClick={() => navigate(`/problems/${sol.problem?.id}`)}
                                    />
                                ))}
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </div>
    )
}