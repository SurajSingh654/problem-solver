import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useMyStats } from '@hooks/useReport'
import { useMySolutions } from '@hooks/useSolutions'
import { useAuthStore } from '@store/useAuthStore'
import { RadarChart } from '@components/charts/RadarChart'
import { ActivityHeatmap } from '@components/charts/ActivityHeatmap'
import { PatternCoverage } from '@components/features/PatternCoverage'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'
import { formatCountdown, formatShortDate } from '@utils/formatters'
import { DIMENSIONS, CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '@utils/constants'
import {
    generateActionItems,
    getOverallVerdict,
    getStrengthsAndWeaknesses,
} from '@utils/generateActions'

// ── Score ring ─────────────────────────────────────────
function ScoreRing({ score, size = 80, color = '#7c6ff7', label }) {
    const r = (size / 2) - 6
    const circumf = 2 * Math.PI * r
    const dashOffset = circumf - (score / 100) * circumf

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                        stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                    <motion.circle
                        cx={size / 2} cy={size / 2} r={r} fill="none"
                        stroke={color} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={circumf}
                        initial={{ strokeDashoffset: circumf }}
                        animate={{ strokeDashoffset: dashOffset }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-extrabold font-mono text-text-primary">
                        {score}
                    </span>
                </div>
            </div>
            {label && (
                <span className="text-[10px] font-semibold text-text-disabled uppercase tracking-wide">
                    {label}
                </span>
            )}
        </div>
    )
}

// ── Section card ───────────────────────────────────────
function SectionCard({ title, icon, children, className, action, onAction }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'bg-surface-1 border border-border-default rounded-2xl p-5',
                className
            )}
        >
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <span>{icon}</span>
                    {title}
                </h2>
                {action && (
                    <button
                        onClick={onAction}
                        className="text-xs text-brand-300 hover:text-brand-200
                       font-medium transition-colors flex items-center gap-1"
                    >
                        {action}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>
                )}
            </div>
            {children}
        </motion.div>
    )
}

// ── Action item card ───────────────────────────────────
function ActionCard({ action, index }) {
    const navigate = useNavigate()
    const colors = {
        warning: 'border-warning/25 bg-warning/5',
        danger: 'border-danger/25  bg-danger/5',
        brand: 'border-brand-400/25 bg-brand-400/5',
        info: 'border-info/25 bg-info/5',
        success: 'border-success/25 bg-success/5',
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 }}
            className={cn(
                'flex items-start gap-4 p-4 rounded-xl border transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-md',
                colors[action.color] || colors.brand
            )}
        >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center
                      text-xl flex-shrink-0 bg-surface-1 border border-border-default">
                {action.icon}
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-text-primary mb-0.5">
                    {action.title}
                </h3>
                <p className="text-xs text-text-tertiary leading-relaxed mb-2">
                    {action.desc}
                </p>
                <button
                    onClick={() => navigate(action.link)}
                    className="text-xs font-semibold text-brand-300 hover:text-brand-200
                     transition-colors flex items-center gap-1"
                >
                    {action.linkLabel}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                    </svg>
                </button>
            </div>
        </motion.div>
    )
}

// ── Strength / weakness card ───────────────────────────
function DimInsightCard({ dim, type }) {
    const isStrength = type === 'strength'
    return (
        <div className={cn(
            'flex items-start gap-3 p-3.5 rounded-xl border',
            isStrength
                ? 'border-success/20 bg-success/5'
                : 'border-warning/20 bg-warning/5'
        )}>
            <span className="text-xl flex-shrink-0 mt-0.5">{dim.icon}</span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-text-primary">{dim.label}</span>
                    <span className={cn(
                        'text-xs font-extrabold font-mono',
                        isStrength ? 'text-success' : 'text-warning'
                    )}>
                        {dim.score}/100
                    </span>
                </div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                    {dim.tip}
                </p>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ReportPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const { data: stats, isLoading } = useMyStats()
    const { data: solutions } = useMySolutions()

    const countdown = formatCountdown(stats?.targetDate)
    const dims = stats?.dimensions || {}

    // Generate insights
    const actionItems = useMemo(
        () => generateActionItems(stats, solutions),
        [stats, solutions]
    )
    const verdict = useMemo(
        () => getOverallVerdict(stats?.overallScore || 0, dims),
        [stats?.overallScore, dims]
    )
    const { strengths, weaknesses } = useMemo(
        () => getStrengthsAndWeaknesses(dims),
        [dims]
    )

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary animate-pulse">
                        Building your report…
                    </p>
                </div>
            </div>
        )
    }

    if (!stats || stats.totalSolved === 0) {
        return (
            <div className="p-6 max-w-[900px] mx-auto">
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
                    <div className="text-5xl">📊</div>
                    <h1 className="text-xl font-bold text-text-primary">No data yet</h1>
                    <p className="text-sm text-text-tertiary text-center max-w-sm">
                        Solve at least one problem to generate your intelligence report.
                    </p>
                    <Button variant="primary" size="md"
                        onClick={() => navigate('/problems')}>
                        Browse Problems
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[1100px] mx-auto">

            {/* ── Hero ────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-2xl overflow-hidden border border-border-default mb-6 p-6"
                style={{
                    background: 'linear-gradient(135deg, #16162a 0%, #111118 60%, #0e0a1e 100%)',
                }}
            >
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-60px] right-[-60px] w-[280px] h-[280px]
                          rounded-full bg-brand-400/8 blur-[80px]" />
                </div>

                <div className="relative z-10">
                    {/* Top row — avatar + score */}
                    <div className="flex items-center gap-5 mb-5 flex-wrap">
                        <Avatar name={user?.username} color={user?.avatarColor} size="xl" />
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-extrabold text-text-primary mb-1">
                                {user?.username}'s Report
                            </h1>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                    'text-sm font-bold',
                                    verdict.color
                                )}>
                                    {verdict.label}
                                </span>
                                <span className="text-xs text-text-disabled">·</span>
                                <span className="text-xs text-text-tertiary">
                                    {stats.totalSolved} solved · {stats.streak > 0 ? `${stats.streak} day streak 🔥` : 'No active streak'}
                                </span>
                            </div>
                        </div>
                        <ScoreRing score={stats.overallScore || 0} size={80} color="#7c6ff7" label="Overall" />
                    </div>

                    {/* Verdict summary */}
                    <p className="text-sm text-text-secondary leading-relaxed mb-4
                        bg-surface-2/30 rounded-xl px-4 py-3 border border-border-subtle">
                        {verdict.summary}
                    </p>

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Solved', value: stats.totalSolved, color: 'text-brand-300' },
                            { label: 'This week', value: stats.solvedThisWeek, color: 'text-success' },
                            {
                                label: 'Reviews due', value: stats.reviewsDue,
                                color: stats.reviewsDue > 0 ? 'text-warning' : 'text-success'
                            },
                            { label: 'Avg conf.', value: `${stats.avgConfidence}/5`, color: 'text-info' },
                        ].map(s => (
                            <div key={s.label} className="bg-surface-2/30 rounded-xl p-3 text-center
                                            border border-border-subtle">
                                <div className={cn('text-lg font-extrabold font-mono', s.color)}>
                                    {s.value}
                                </div>
                                <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                    {s.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Target countdown */}
                    {countdown && (
                        <div className="mt-4 pt-4 border-t border-white/6 flex items-center gap-2">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="#eab308" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span className="text-xs font-semibold text-warning">
                                {countdown} — {formatShortDate(stats.targetDate)}
                            </span>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* ── Action Items (most important section) ───── */}
            <SectionCard
                title="What To Do Next"
                icon="🎯"
                className="mb-6"
            >
                <div className="space-y-3">
                    {actionItems.map((action, i) => (
                        <ActionCard key={i} action={action} index={i} />
                    ))}
                </div>
            </SectionCard>

            {/* ── Radar + Strengths / Weaknesses ─────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Radar */}
                <SectionCard title="6D Intelligence" icon="🕸">
                    <div className="flex justify-center py-2">
                        <RadarChart dimensions={dims} size={280} />
                    </div>
                </SectionCard>

                {/* Strengths & Weaknesses */}
                <SectionCard title="Strengths & Weaknesses" icon="📊">
                    <div className="space-y-4">
                        {/* Strengths */}
                        {strengths.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-success uppercase tracking-widest mb-2">
                                    ✅ Your Strengths
                                </p>
                                <div className="space-y-2">
                                    {strengths.map(s => (
                                        <DimInsightCard key={s.id} dim={s} type="strength" />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Weaknesses */}
                        {weaknesses.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-warning uppercase tracking-widest mb-2">
                                    🔧 Areas to Improve
                                </p>
                                <div className="space-y-2">
                                    {weaknesses.map(w => (
                                        <DimInsightCard key={w.id} dim={w} type="weakness" />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* ── Difficulty + Pattern ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Difficulty */}
                <SectionCard title="Difficulty Breakdown" icon="🎯">
                    <div className="space-y-4">
                        {[
                            { label: 'Easy', count: stats.easy, color: 'text-success', bar: 'bg-success' },
                            { label: 'Medium', count: stats.medium, color: 'text-warning', bar: 'bg-warning' },
                            { label: 'Hard', count: stats.hard, color: 'text-danger', bar: 'bg-danger' },
                        ].map(d => {
                            const pct = stats.totalSolved
                                ? Math.round((d.count / stats.totalSolved) * 100)
                                : 0
                            return (
                                <div key={d.label}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={cn('text-sm font-bold', d.color)}>{d.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-text-disabled">{pct}%</span>
                                            <span className={cn('text-sm font-extrabold font-mono', d.color)}>
                                                {d.count}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.7, ease: 'easeOut' }}
                                            className={cn('h-full rounded-full', d.bar)}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Confidence breakdown — compact */}
                    <div className="mt-5 pt-4 border-t border-border-default">
                        <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                            Confidence Snapshot
                        </p>
                        <div className="flex items-center gap-3">
                            {CONFIDENCE_LEVELS.map(c => {
                                const count = stats.confidenceBreakdown?.find(
                                    b => b.level === c.value
                                )?.count || 0
                                return (
                                    <div key={c.value} className="flex flex-col items-center gap-1 flex-1">
                                        <span className="text-lg">{c.emoji}</span>
                                        <span className={cn('text-xs font-bold', c.color)}>{count}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </SectionCard>

                {/* Pattern coverage */}
                <SectionCard title="Pattern Coverage" icon="🗺️">
                    <PatternCoverage patternMap={stats.patternMap || {}} />
                </SectionCard>
            </div>

            {/* ── Activity ─────────────────────────────────── */}
            <SectionCard title="Solving Activity" icon="📅" className="mb-6">
                <ActivityHeatmap activity={stats.activity || {}} days={91} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4
                        border-t border-border-default">
                    {[
                        { label: 'This week', value: stats.solvedThisWeek, color: 'text-brand-300' },
                        { label: 'This month', value: stats.solvedThisMonth || 0, color: 'text-brand-300' },
                        { label: 'Best streak', value: stats.longestStreak, color: 'text-warning' },
                        {
                            label: 'Active days',
                            value: Object.keys(stats.activity || {}).length,
                            color: 'text-success'
                        },
                    ].map(s => (
                        <div key={s.label}
                            className="bg-surface-2 border border-border-default rounded-xl p-3 text-center">
                            <div className={cn('text-xl font-extrabold font-mono', s.color)}>
                                {s.value}
                            </div>
                            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                {s.label}
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            {/* ── Sim + Retention (compact row) ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Sim */}
                <SectionCard
                    title="Interview Simulation"
                    icon="⏱"
                    action="Practice"
                    onAction={() => navigate('/interview')}
                >
                    {stats.simCount === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <p className="text-sm text-text-tertiary">No simulations yet</p>
                            <Button variant="secondary" size="sm"
                                onClick={() => navigate('/interview')}>
                                Start Simulation
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Sessions', value: stats.simCount, color: 'text-text-primary' },
                                { label: 'Completed', value: stats.completedSims, color: 'text-success' },
                                {
                                    label: 'Avg Score', value: stats.avgSimScore > 0
                                        ? `${stats.avgSimScore}/5` : '—',
                                    color: 'text-brand-300'
                                },
                            ].map(s => (
                                <div key={s.label}
                                    className="bg-surface-2 border border-border-default
                                rounded-xl p-3 text-center">
                                    <div className={cn('text-lg font-extrabold font-mono', s.color)}>
                                        {s.value}
                                    </div>
                                    <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                        {s.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>

                {/* Retention */}
                <SectionCard
                    title="Knowledge Retention"
                    icon="🔁"
                    action="Review Queue"
                    onAction={() => navigate('/review')}
                >
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            {
                                label: 'Reviews Due',
                                value: stats.reviewsDue,
                                color: stats.reviewsDue > 0 ? 'text-warning' : 'text-success',
                            },
                            {
                                label: 'Avg Confidence',
                                value: `${stats.avgConfidence}/5`,
                                color: 'text-brand-300',
                            },
                            {
                                label: 'Retention',
                                value: `${dims.retention ?? 0}`,
                                color: 'text-success',
                            },
                        ].map(s => (
                            <div key={s.label}
                                className="bg-surface-2 border border-border-default
                              rounded-xl p-3 text-center">
                                <div className={cn('text-lg font-extrabold font-mono', s.color)}>
                                    {s.value}
                                </div>
                                <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                    {s.label}
                                </div>
                            </div>
                        ))}
                    </div>
                    {stats.reviewsDue > 0 && (
                        <div className="bg-warning/8 border border-warning/25 rounded-xl p-3.5
                            flex items-center gap-3 mt-4">
                            <span className="text-xl flex-shrink-0">⚠️</span>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-warning">
                                    {stats.reviewsDue} review{stats.reviewsDue !== 1 ? 's' : ''} overdue
                                </p>
                                <p className="text-[11px] text-text-tertiary mt-0.5">
                                    Complete reviews to maintain retention
                                </p>
                            </div>
                            <Button variant="secondary" size="sm"
                                onClick={() => navigate('/review')}>
                                Review
                            </Button>
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* ── CTA ──────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-3 flex-wrap"
            >
                <Button variant="primary" size="md"
                    onClick={() => navigate('/problems')}>
                    Solve More Problems
                </Button>
                {stats.reviewsDue > 0 && (
                    <Button variant="secondary" size="md"
                        onClick={() => navigate('/review')}>
                        🧠 Clear Review Queue ({stats.reviewsDue})
                    </Button>
                )}
            </motion.div>
        </div>
    )
}