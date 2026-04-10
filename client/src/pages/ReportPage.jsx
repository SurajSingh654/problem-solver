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
import {
    formatCountdown, formatShortDate,
    formatRelativeDate,
} from '@utils/formatters'
import {
    DIMENSIONS, CONFIDENCE_LEVELS,
    LANGUAGE_LABELS, LEVEL,
} from '@utils/constants'

// ── Small helpers ──────────────────────────────────────
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

function StatRow({ label, value, sub, color = 'text-text-primary', bar, barColor }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary truncate">{label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {sub && <span className="text-[11px] text-text-disabled">{sub}</span>}
                        <span className={cn('text-xs font-bold', color)}>{value}</span>
                    </div>
                </div>
                {bar !== undefined && (
                    <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(bar, 100)}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            className={cn('h-full rounded-full', barColor || 'bg-brand-400')}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Level badge ────────────────────────────────────────
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

// ── Score ring ─────────────────────────────────────────
function ScoreRing({ score, size = 80, color = '#7c6ff7', label }) {
    const r = (size / 2) - 6
    const circumf = 2 * Math.PI * r
    const dashOffset = circumf - (score / 100) * circumf

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle
                        cx={size / 2} cy={size / 2} r={r}
                        fill="none" stroke="rgba(255,255,255,0.06)"
                        strokeWidth="5"
                    />
                    <motion.circle
                        cx={size / 2} cy={size / 2} r={r}
                        fill="none" stroke={color}
                        strokeWidth="5" strokeLinecap="round"
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

// ── Dimension detail row ───────────────────────────────
function DimensionRow({ dim, score, index }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-4"
        >
            {/* Score ring (small) */}
            <ScoreRing score={score} size={52} color={dim.color} />

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text-primary">
                        {dim.label}
                    </span>
                    <span className="text-xs font-bold font-mono"
                        style={{ color: dim.color }}>
                        {score}/100
                    </span>
                </div>
                <p className="text-xs text-text-tertiary leading-relaxed mb-1.5">
                    {dim.desc}
                </p>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${score}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + index * 0.05 }}
                        className="h-full rounded-full"
                        style={{ background: dim.color }}
                    />
                </div>
            </div>
        </motion.div>
    )
}

// ── Confidence breakdown ───────────────────────────────
function ConfidenceBreakdown({ breakdown = [], total }) {
    return (
        <div className="space-y-2.5">
            {CONFIDENCE_LEVELS.map(level => {
                const entry = breakdown.find(b => b.level === level.value)
                const count = entry?.count || 0
                const pct = total ? Math.round((count / total) * 100) : 0
                return (
                    <div key={level.value} className="flex items-center gap-3">
                        <span className="text-base flex-shrink-0">{level.emoji}</span>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-text-secondary">{level.label}</span>
                                <span className={cn('text-xs font-bold', level.color)}>
                                    {count} ({pct}%)
                                </span>
                            </div>
                            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.7, ease: 'easeOut', delay: level.value * 0.07 }}
                                    className={cn(
                                        'h-full rounded-full',
                                        level.value >= 4 ? 'bg-success' :
                                            level.value === 3 ? 'bg-brand-400' :
                                                level.value === 2 ? 'bg-warning' : 'bg-danger'
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Language breakdown ─────────────────────────────────
function LanguageBreakdown({ languageMap = {}, total }) {
    const sorted = Object.entries(languageMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)

    const colors = [
        '#7c6ff7', '#22c55e', '#3b82f6', '#eab308', '#ef4444', '#a855f7',
    ]

    if (!sorted.length) {
        return (
            <p className="text-xs text-text-tertiary text-center py-4">
                No language data yet
            </p>
        )
    }

    return (
        <div className="space-y-2.5">
            {sorted.map(([lang, count], i) => {
                const pct = total ? Math.round((count / total) * 100) : 0
                return (
                    <StatRow
                        key={lang}
                        label={LANGUAGE_LABELS[lang] || lang}
                        value={`${count}`}
                        sub={`${pct}%`}
                        bar={pct}
                        barColor=""
                        color="text-text-secondary"
                    />
                )
            })}
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

    // Completion quality signals
    const qualitySignals = useMemo(() => {
        if (!stats) return []
        const total = stats.totalSolved || 1
        return [
            {
                label: 'Pattern identified',
                count: stats.withPattern || 0,
                total,
                color: 'bg-brand-400',
            },
            {
                label: 'Brute force written',
                count: stats.withBruteForce || 0,
                total,
                color: 'bg-info',
            },
            {
                label: 'Optimized approach',
                count: stats.withOptimized || 0,
                total,
                color: 'bg-success',
            },
            {
                label: 'Key insight noted',
                count: stats.withKeyInsight || 0,
                total,
                color: 'bg-warning',
            },
            {
                label: 'Feynman explanation',
                count: stats.withFeynman || 0,
                total,
                color: 'bg-brand-400',
            },
            {
                label: 'Real world connection',
                count: stats.withRealWorld || 0,
                total,
                color: 'bg-success',
            },
        ]
    }, [stats])

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
                    <h1 className="text-xl font-bold text-text-primary">
                        No data yet
                    </h1>
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

    const dims = stats.dimensions || {}

    return (
        <div className="p-6 max-w-[1100px] mx-auto">
            {/* ── Hero ──────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-2xl overflow-hidden border border-border-default mb-6 p-6"
                style={{
                    background: 'linear-gradient(135deg, #16162a 0%, #111118 60%, #0e0a1e 100%)',
                }}
            >
                {/* Background orbs */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-60px] right-[-60px] w-[280px] h-[280px]
                          rounded-full bg-brand-400/8 blur-[80px]" />
                    <div className="absolute bottom-[-40px] left-[20%] w-[180px] h-[180px]
                          rounded-full bg-blue-500/6 blur-[60px]" />
                </div>

                <div className="relative z-10 flex items-center gap-6 flex-wrap">
                    {/* Avatar + info */}
                    <div className="flex items-center gap-4">
                        <Avatar
                            name={user?.username}
                            color={user?.avatarColor}
                            size="xl"
                        />
                        <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h1 className="text-xl font-extrabold text-text-primary">
                                    {user?.username}
                                </h1>
                                <LevelBadge level={stats.currentLevel} />
                            </div>
                            <p className="text-xs text-text-tertiary mb-2">
                                Intelligence Report · Last updated now
                            </p>
                            {stats.targetCompanies?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {stats.targetCompanies.slice(0, 3).map(c => (
                                        <span key={c}
                                            className="text-[10px] font-semibold text-warning
                                     bg-warning/10 border border-warning/20
                                     rounded-full px-2 py-px">
                                            🏢 {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick stats */}
                    <div className="flex items-center gap-6 flex-wrap ml-auto">
                        {[
                            { label: 'Solved', value: stats.totalSolved, color: 'text-brand-300' },
                            { label: 'Streak', value: `${stats.streak}🔥`, color: 'text-warning' },
                            { label: 'This week', value: stats.solvedThisWeek, color: 'text-success' },
                            { label: 'Avg conf.', value: `${stats.avgConfidence}/5`, color: 'text-info' },
                        ].map(s => (
                            <div key={s.label} className="text-center">
                                <div className={cn('text-2xl font-extrabold font-mono', s.color)}>
                                    {s.value}
                                </div>
                                <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                    {s.label}
                                </div>
                            </div>
                        ))}

                        {/* Overall score ring */}
                        <div className="flex flex-col items-center">
                            <ScoreRing
                                score={stats.overallScore || 0}
                                size={72}
                                color="#7c6ff7"
                            />
                            <span className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                Overall
                            </span>
                        </div>
                    </div>
                </div>

                {/* Target countdown */}
                {countdown && (
                    <div className="relative z-10 mt-4 pt-4 border-t border-white/6 flex items-center gap-2">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="#eab308" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span className="text-xs font-semibold text-warning">
                            {countdown} until your target date —{' '}
                            {formatShortDate(stats.targetDate)}
                        </span>
                    </div>
                )}
            </motion.div>

            {/* ── 6D Radar + Dimensions ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Radar */}
                <SectionCard title="6D Intelligence" icon="🕸">
                    <div className="flex justify-center py-2">
                        <RadarChart dimensions={dims} size={300} />
                    </div>
                    <p className="text-xs text-text-tertiary text-center mt-2">
                        Scores are computed from your solving behaviour across all 6 dimensions
                    </p>
                </SectionCard>

                {/* Dimension breakdown */}
                <SectionCard title="Dimension Breakdown" icon="📐">
                    <div className="space-y-5">
                        {DIMENSIONS.map((dim, i) => (
                            <DimensionRow
                                key={dim.id}
                                dim={dim}
                                score={dims[dim.id] ?? 0}
                                index={i}
                            />
                        ))}
                    </div>
                </SectionCard>
            </div>

            {/* ── Difficulty + Pattern ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Difficulty breakdown */}
                <SectionCard title="Difficulty Breakdown" icon="🎯">
                    <div className="space-y-4 mb-5">
                        {[
                            {
                                label: 'Easy',
                                count: stats.easy,
                                color: 'text-success',
                                bar: 'bg-success',
                            },
                            {
                                label: 'Medium',
                                count: stats.medium,
                                color: 'text-warning',
                                bar: 'bg-warning',
                            },
                            {
                                label: 'Hard',
                                count: stats.hard,
                                color: 'text-danger',
                                bar: 'bg-danger',
                            },
                        ].map(d => {
                            const pct = stats.totalSolved
                                ? Math.round((d.count / stats.totalSolved) * 100)
                                : 0
                            return (
                                <div key={d.label}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className={cn('text-sm font-bold', d.color)}>
                                            {d.label}
                                        </span>
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

                    {/* Confidence distribution */}
                    <div className="border-t border-border-default pt-4">
                        <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                            Confidence Distribution
                        </p>
                        <ConfidenceBreakdown
                            breakdown={stats.confidenceBreakdown}
                            total={stats.totalSolved}
                        />
                    </div>
                </SectionCard>

                {/* Pattern coverage */}
                <SectionCard title="Pattern Coverage" icon="🗺️">
                    <PatternCoverage patternMap={stats.patternMap || {}} />
                </SectionCard>
            </div>

            {/* ── Activity Heatmap ───────────────────────────── */}
            <SectionCard title="Solving Activity" icon="📅" className="mb-6">
                <ActivityHeatmap activity={stats.activity || {}} days={91} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4
                        border-t border-border-default">
                    {[
                        { label: 'This week', value: stats.solvedThisWeek, color: 'text-brand-300' },
                        { label: 'This month', value: stats.solvedThisMonth, color: 'text-brand-300' },
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

            {/* ── Quality + Languages ───────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Solution quality */}
                <SectionCard title="Solution Quality" icon="✍️">
                    <p className="text-xs text-text-tertiary mb-4">
                        How thoroughly you document your solutions
                    </p>
                    <div className="space-y-3">
                        {qualitySignals.map((sig, i) => {
                            const pct = Math.round((sig.count / sig.total) * 100)
                            return (
                                <motion.div
                                    key={sig.label}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-text-secondary">{sig.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-text-disabled">
                                                {sig.count}/{sig.total}
                                            </span>
                                            <span className="text-xs font-bold text-text-primary">
                                                {pct}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 + i * 0.05 }}
                                            className={cn('h-full rounded-full', sig.color)}
                                        />
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </SectionCard>

                {/* Languages */}
                <SectionCard title="Languages Used" icon="💻">
                    <LanguageBreakdown
                        languageMap={stats.languageMap || {}}
                        total={stats.totalSolved}
                    />
                    {stats.hintsUsedCount > 0 && (
                        <div className="mt-4 pt-4 border-t border-border-default">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-tertiary">
                                    💡 Solutions with hints used
                                </span>
                                <span className="text-xs font-bold text-warning">
                                    {stats.hintsUsedCount} / {stats.totalSolved}
                                </span>
                            </div>
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* ── Sim Performance + Retention ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Sim performance */}
                <SectionCard
                    title="Interview Simulation"
                    icon="⏱"
                    action="Practice"
                    onAction={() => navigate('/interview')}
                >
                    {stats.simCount === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <div className="text-3xl">⏱</div>
                            <p className="text-sm font-semibold text-text-primary">
                                No simulations yet
                            </p>
                            <p className="text-xs text-text-tertiary mb-2">
                                Practice under real interview conditions to build pressure performance
                            </p>
                            <Button variant="secondary" size="sm"
                                onClick={() => navigate('/interview')}>
                                Start Simulation
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Sessions', value: stats.simCount, color: 'text-text-primary' },
                                    { label: 'Completed', value: stats.completedSims, color: 'text-success' },
                                    {
                                        label: 'Avg Score', value: stats.avgSimScore > 0 ? `${stats.avgSimScore}/5` : '—',
                                        color: 'text-brand-300'
                                    },
                                ].map(s => (
                                    <div key={s.label}
                                        className="bg-surface-2 border border-border-default
                                  rounded-xl p-3 text-center">
                                        <div className={cn('text-xl font-extrabold font-mono', s.color)}>
                                            {s.value}
                                        </div>
                                        <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                            {s.label}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {stats.completedSims > 0 && (
                                <div className="space-y-3">
                                    <StatRow
                                        label="Approach Quality"
                                        value={`${stats.avgSimApproach}/5`}
                                        bar={(stats.avgSimApproach / 5) * 100}
                                        barColor="bg-brand-400"
                                        color="text-brand-300"
                                    />
                                    <StatRow
                                        label="Communication"
                                        value={`${stats.avgSimComms}/5`}
                                        bar={(stats.avgSimComms / 5) * 100}
                                        barColor="bg-info"
                                        color="text-info"
                                    />
                                </div>
                            )}
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
                    <div className="space-y-4">
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
                                    label: 'Retention Score',
                                    value: `${dims.retention ?? 0}`,
                                    color: 'text-success',
                                },
                            ].map(s => (
                                <div key={s.label}
                                    className="bg-surface-2 border border-border-default
                                rounded-xl p-3 text-center">
                                    <div className={cn('text-xl font-extrabold font-mono', s.color)}>
                                        {s.value}
                                    </div>
                                    <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                        {s.label}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <StatRow
                                label="Retention score"
                                value={`${dims.retention ?? 0}/100`}
                                bar={dims.retention ?? 0}
                                barColor="bg-success"
                                color="text-success"
                            />
                            <StatRow
                                label="Avg confidence across all solutions"
                                value={`${stats.avgConfidence}/5`}
                                bar={(stats.avgConfidence / 5) * 100}
                                barColor="bg-brand-400"
                                color="text-brand-300"
                            />
                        </div>

                        {stats.reviewsDue > 0 && (
                            <div className="bg-warning/8 border border-warning/25 rounded-xl p-3.5
                              flex items-center gap-3">
                                <span className="text-xl flex-shrink-0">⚠️</span>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-warning">
                                        {stats.reviewsDue} review{stats.reviewsDue !== 1 ? 's' : ''} overdue
                                    </p>
                                    <p className="text-[11px] text-text-tertiary mt-0.5">
                                        Complete your reviews to maintain your retention score
                                    </p>
                                </div>
                                <Button variant="secondary" size="sm"
                                    onClick={() => navigate('/review')}>
                                    Review
                                </Button>
                            </div>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* ── Peer Rating ───────────────────────────────── */}
            {(stats.clarityCount > 0 || stats.avgClarity > 0) && (
                <SectionCard title="Peer Ratings" icon="⭐" className="mb-6">
                    <div className="flex items-center gap-6 flex-wrap">
                        <div className="text-center">
                            <div className="text-4xl font-extrabold font-mono text-brand-300 mb-1">
                                {stats.avgClarity || '—'}
                            </div>
                            <div className="text-xs text-text-disabled uppercase tracking-wider">
                                Avg clarity / 5
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-4xl font-extrabold font-mono text-text-primary mb-1">
                                {stats.clarityCount}
                            </div>
                            <div className="text-xs text-text-disabled uppercase tracking-wider">
                                Total ratings received
                            </div>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <div className="h-3 bg-surface-3 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${((stats.avgClarity || 0) / 5) * 100}%` }}
                                    transition={{ duration: 0.9, ease: 'easeOut' }}
                                    className="h-full rounded-full bg-brand-400"
                                />
                            </div>
                            <p className="text-xs text-text-tertiary mt-2">
                                Based on how clearly teammates can understand your explanations
                            </p>
                        </div>
                    </div>
                </SectionCard>
            )}

            {/* ── CTA row ───────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-3 flex-wrap"
            >
                <Button variant="primary" size="md"
                    onClick={() => navigate('/problems')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Solve More Problems
                </Button>
                {stats.reviewsDue > 0 && (
                    <Button variant="secondary" size="md"
                        onClick={() => navigate('/review')}>
                        🧠 Clear Review Queue ({stats.reviewsDue})
                    </Button>
                )}
                {stats.simCount === 0 && (
                    <Button variant="secondary" size="md"
                        onClick={() => navigate('/interview')}>
                        ⏱ Try Interview Sim
                    </Button>
                )}
            </motion.div>
        </div>
    )
}