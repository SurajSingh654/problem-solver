import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useUser } from '@hooks/useUsers'
import { useAuthStore } from '@store/useAuthStore'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    formatShortDate, formatRelativeDate,
    formatDuration,
} from '@utils/formatters'
import {
    CONFIDENCE_LEVELS, LANGUAGE_LABELS,
} from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const SOURCE_LABELS = {
    LEETCODE: 'LeetCode', GFG: 'GFG', CODECHEF: 'CodeChef',
    INTERVIEWBIT: 'InterviewBit', HACKERRANK: 'HackerRank',
    CODEFORCES: 'Codeforces', OTHER: 'Other',
}

function LevelBadge({ level }) {
    const config = {
        BEGINNER: { label: 'Beginner', color: 'text-text-secondary bg-surface-3 border-border-default' },
        INTERMEDIATE: { label: 'Intermediate', color: 'text-info bg-info/10 border-info/25' },
        ADVANCED: { label: 'Advanced', color: 'text-warning bg-warning/10 border-warning/25' },
    }
    const c = config[level] || config.BEGINNER
    return (
        <span className={cn(
            'text-xs font-bold px-2.5 py-1 rounded-full border',
            c.color
        )}>
            {c.label}
        </span>
    )
}

// ── Solved problem row ─────────────────────────────────
function SolutionRow({ solution, index, onClick }) {
    const conf = CONFIDENCE_LEVELS.find(
        c => c.value === solution.confidenceLevel
    )

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

            {/* Title */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate mb-0.5">
                    {solution.problem?.title}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                        variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'}
                        size="xs"
                    >
                        {solution.problem?.difficulty?.charAt(0) +
                            solution.problem?.difficulty?.slice(1).toLowerCase()}
                    </Badge>
                    {solution.patternIdentified && (
                        <span className="text-[11px] text-brand-300 bg-brand-400/10
                             border border-brand-400/15 rounded-full px-2 py-px">
                            {solution.patternIdentified}
                        </span>
                    )}
                    <span className="text-[11px] text-text-disabled font-mono">
                        {LANGUAGE_LABELS[solution.language] || solution.language}
                    </span>
                </div>
            </div>

            {/* Right side */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {conf && (
                    <span className="text-base" title={conf.label}>{conf.emoji}</span>
                )}
                <span className="text-[11px] text-text-disabled font-mono">
                    {formatRelativeDate(solution.solvedAt)}
                </span>
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ProfilePage() {
    const { username } = useParams()
    const navigate = useNavigate()
    const { user: me } = useAuthStore()

    // If no username param, show own profile
    const targetUsername = username || me?.username
    const isOwnProfile = !username || username === me?.username

    const { data: profile, isLoading, isError } = useUser(targetUsername)

    if (isLoading) return <PageSpinner />

    if (isError || !profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="text-5xl">😕</div>
                <h2 className="text-lg font-bold text-text-primary">User not found</h2>
                <Button variant="secondary" onClick={() => navigate('/leaderboard')}>
                    Back to Leaderboard
                </Button>
            </div>
        )
    }

    const solutions = profile.solutions || []
    const easy = solutions.filter(s => s.problem?.difficulty === 'EASY').length
    const medium = solutions.filter(s => s.problem?.difficulty === 'MEDIUM').length
    const hard = solutions.filter(s => s.problem?.difficulty === 'HARD').length

    // Language breakdown
    const langMap = {}
    solutions.forEach(s => {
        if (s.language) langMap[s.language] = (langMap[s.language] || 0) + 1
    })
    const topLang = Object.entries(langMap).sort(([, a], [, b]) => b - a)[0]

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Back */}
            {username && (
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-1.5 text-sm text-text-tertiary
                     hover:text-text-primary transition-colors mb-6"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back
                </button>
            )}

            {/* Hero */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-2xl overflow-hidden border border-border-default
                   p-6 mb-6 hero-gradient"
            >
                {/* Background orb */}
                <div className="absolute top-[-60px] right-[-60px] w-[240px] h-[240px]
                        rounded-full bg-brand-400/8 blur-[80px] pointer-events-none" />

                <div className="relative z-10 flex items-start gap-5 flex-wrap">
                    {/* Avatar */}
                    <div className="relative">
                        <Avatar
                            name={profile.username}
                            color={profile.avatarColor}
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h1 className="text-xl font-extrabold text-text-primary">
                                {profile.username}
                            </h1>
                            {profile.role === 'ADMIN' && (
                                <span className="text-xs font-bold px-2 py-px rounded-full
                                 bg-warning/12 text-warning border border-warning/25">
                                    ⚡ Admin
                                </span>
                            )}
                            <LevelBadge level={profile.currentLevel} />
                        </div>

                        <p className="text-xs text-text-tertiary mb-3">
                            Joined {formatShortDate(profile.joinedAt)}
                        </p>

                        {/* Target companies */}
                        {profile.targetCompanies?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {profile.targetCompanies.map(c => (
                                    <span key={c}
                                        className="text-[10px] font-semibold text-warning
                                   bg-warning/10 border border-warning/20
                                   rounded-full px-2 py-px">
                                        🏢 {c}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Top language */}
                        {topLang && (
                            <p className="text-xs text-text-tertiary">
                                Primarily codes in{' '}
                                <span className="font-semibold text-text-secondary">
                                    {LANGUAGE_LABELS[topLang[0]] || topLang[0]}
                                </span>
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

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                    { label: 'Solved', value: profile.solutionCount, color: 'text-brand-300' },
                    { label: 'Streak', value: `${profile.streak} 🔥`, color: 'text-warning' },
                    { label: 'Best Streak', value: profile.longestStreak, color: 'text-warning' },
                    { label: 'Sim Sessions', value: profile.simCount, color: 'text-info' },
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
            {profile.solutionCount > 0 && (
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
                                            width: profile.solutionCount
                                                ? `${(d.count / profile.solutionCount) * 100}%`
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

            {/* Solutions list */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>✅</span> Solved Problems
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
                                : `${profile.username} hasn't solved any problems yet.`}
                        </p>
                        {isOwnProfile && (
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
                                onClick={() => navigate(`/problems/${sol.problemId}`)}
                            />
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    )
}