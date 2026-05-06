// ============================================================================
// ProbSolver v3.0 — Team Analytics Page
// ============================================================================
//
// This page is for TEAM_ADMIN — not SUPER_ADMIN.
// SUPER_ADMIN has their own analytics at /super-admin/analytics.
//
// The backend /api/admin/product-health endpoint is already scoped
// to the current team when called by a TEAM_ADMIN (req.teamId filter).
// The leaderboard endpoint provides per-member composite scores.
//
// Three questions this page answers:
//   1. HOW IS MY TEAM PREPARING? — velocity, engagement, feature adoption
//   2. HOW ARE INDIVIDUAL MEMBERS PERFORMING? — leaderboard, 6D per member
//   3. WHAT SHOULD I DO AS TEAM ADMIN? — coaching signals, content gaps
//
// Design principles [1]:
//   - Growth indicators matter as much as snapshot scores
//   - Honest data even when unflattering
//   - Behavioral signals, not vanity metrics
//
// ============================================================================
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamAnalytics, useLeaderboard } from '@hooks/useReport'
import { useTeamContext } from '@hooks/useTeamContext'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES, DIMENSIONS } from '@utils/constants'
import api from '@services/api'

const aiConfig = { timeout: 120000 }

// ── Reusable sub-components ────────────────────────────

function SectionHeader({ icon, title, subtitle }) {
    return (
        <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{icon}</span>
            <div>
                <p className="text-sm font-bold text-text-primary">{title}</p>
                {subtitle && <p className="text-[11px] text-text-disabled">{subtitle}</p>}
            </div>
        </div>
    )
}

function StatTile({ icon, value, label, sub, color, onClick }) {
    return (
        <motion.div
            whileTap={onClick ? { scale: 0.97 } : undefined}
            onClick={onClick}
            className={cn(
                'relative bg-surface-1 border border-border-default rounded-xl p-4 text-center overflow-hidden',
                onClick && 'cursor-pointer hover:border-brand-400/30 transition-colors'
            )}
        >
            <div className={cn('absolute top-0 left-0 right-0 h-0.5', color || 'bg-brand-400')} />
            <span className="text-xl">{icon}</span>
            <div className="text-2xl font-extrabold font-mono text-text-primary mt-1 leading-none">
                {value ?? '—'}
            </div>
            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">{label}</div>
            {sub && <div className="text-[10px] text-text-tertiary mt-0.5">{sub}</div>}
        </motion.div>
    )
}

// ── Engagement funnel ──────────────────────────────────
function FunnelBar({ label, value, total, color = 'bg-brand-400' }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    return (
        <div className="flex items-center gap-3">
            <span className="text-[11px] text-text-secondary w-24 text-right flex-shrink-0">{label}</span>
            <div className="flex-1 h-5 bg-surface-3 rounded-full overflow-hidden relative">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7 }}
                    className={cn('h-full rounded-full', color)}
                />
                <span className="absolute inset-0 flex items-center justify-center
                                 text-[10px] font-bold text-text-primary">
                    {value} ({pct}%)
                </span>
            </div>
        </div>
    )
}

// ── Weekly bar chart ───────────────────────────────────
function WeeklyBars({ data, label }) {
    if (!data?.length) return null
    const max = Math.max(...data, 1)
    return (
        <div>
            <div className="flex items-end gap-1.5 h-24 mb-2">
                {data.map((val, i) => {
                    const heightPct = Math.max((val / max) * 100, 4)
                    const isLatest = i === data.length - 1
                    return (
                        <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPct}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            className={cn(
                                'flex-1 rounded-t-lg relative group transition-opacity',
                                isLatest ? 'bg-brand-400' : 'bg-brand-400/35'
                            )}
                        >
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2
                                            text-[9px] font-bold text-text-primary
                                            opacity-0 group-hover:opacity-100 transition-opacity
                                            whitespace-nowrap">
                                {val}
                            </div>
                        </motion.div>
                    )
                })}
            </div>
            <div className="flex justify-between text-[9px] text-text-disabled">
                <span>8w ago</span>
                <span>This week</span>
            </div>
        </div>
    )
}

// ── Feature adoption bar ───────────────────────────────
function AdoptionBar({ icon, label, rate }) {
    return (
        <div className="flex items-center gap-3">
            <span className="text-base flex-shrink-0">{icon}</span>
            <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary">{label}</span>
                    <span className="text-xs font-bold text-text-primary">{rate}%</span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${rate}%` }}
                        transition={{ duration: 0.7 }}
                        className={cn(
                            'h-full rounded-full',
                            rate >= 60 ? 'bg-success' : rate >= 30 ? 'bg-warning' : 'bg-danger'
                        )}
                    />
                </div>
            </div>
        </div>
    )
}

// ── Member row in leaderboard ──────────────────────────
function MemberRow({ member, rank, index, currentUserId }) {
    const isYou = member.id === currentUserId
    const score = member.compositeScore || 0
    const scoreColor = score >= 70 ? 'text-success' : score >= 45 ? 'text-warning' : 'text-danger'

    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-all',
                isYou
                    ? 'bg-brand-400/5 border-brand-400/25'
                    : 'bg-surface-2 border-border-default hover:border-border-strong'
            )}
        >
            {/* Rank */}
            <div className="w-8 text-center flex-shrink-0">
                {rankIcon ? (
                    <span className="text-base">{rankIcon}</span>
                ) : (
                    <span className="text-xs font-bold text-text-disabled">#{rank}</span>
                )}
            </div>

            {/* Avatar + name */}
            <Avatar name={member.name} color={member.avatarUrl} size="sm" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-text-primary truncate">{member.name}</span>
                    {isYou && (
                        <span className="text-[9px] px-1 py-px rounded-full
                                         bg-brand-400/15 text-brand-300 border border-brand-400/20 flex-shrink-0">
                            you
                        </span>
                    )}
                    {member.teamRole === 'TEAM_ADMIN' && (
                        <span className="text-[9px] text-warning flex-shrink-0">👑</span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-disabled">
                        {member.totalSolved || 0} solved
                    </span>
                    {(member.streak || 0) > 0 && (
                        <span className="text-[10px] text-warning">
                            {member.streak}🔥
                        </span>
                    )}
                </div>
            </div>

            {/* Score breakdown mini-bars */}
            <div className="hidden sm:flex gap-1 flex-shrink-0">
                {Object.entries(member.scoreBreakdown || {}).slice(0, 4).map(([key, val]) => {
                    const dim = DIMENSIONS.find(d => {
                        const keyMap = {
                            solutionQuality: 'solutionDepth',
                            difficultyDistribution: 'optimization',
                            consistency: 'pressurePerformance',
                            retention: 'retention',
                        }
                        return d.id === (keyMap[key] || key)
                    })
                    return (
                        <div key={key} className="flex flex-col items-center gap-0.5" title={key}>
                            <div className="w-1.5 h-8 bg-surface-3 rounded-full overflow-hidden">
                                <div
                                    className="w-full rounded-full transition-all"
                                    style={{
                                        height: `${val}%`,
                                        backgroundColor: dim?.color || '#7c6ff7',
                                        marginTop: `${100 - val}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Composite score */}
            <div className="flex-shrink-0 text-right">
                <div className={cn('text-lg font-extrabold font-mono', scoreColor)}>
                    {score}
                </div>
                <div className="text-[9px] text-text-disabled">score</div>
            </div>
        </motion.div>
    )
}

// ── AI analysis components (reused from ProductHealthPage) ──
function HealthRing({ score }) {
    const r = 36
    const circumf = 2 * Math.PI * r
    const dashOffset = circumf - (score / 100) * circumf
    const color = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#ef4444'
    return (
        <div className="relative w-[80px] h-[80px]">
            <svg width="80" height="80" className="-rotate-90">
                <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                <motion.circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
                    strokeLinecap="round" strokeDasharray={circumf}
                    initial={{ strokeDashoffset: circumf }}
                    animate={{ strokeDashoffset: dashOffset }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold font-mono text-text-primary">{score}</span>
                <span className="text-[8px] text-text-disabled uppercase tracking-wider">health</span>
            </div>
        </div>
    )
}

function InsightCard({ insight, index }) {
    const typeConfig = {
        positive: { icon: '✅', border: 'border-success/20', bg: 'bg-success/3' },
        warning: { icon: '⚠️', border: 'border-warning/20', bg: 'bg-warning/3' },
        critical: { icon: '🚨', border: 'border-danger/20', bg: 'bg-danger/3' },
        opportunity: { icon: '💡', border: 'border-brand-400/20', bg: 'bg-brand-400/3' },
    }
    const c = typeConfig[insight.type] || typeConfig.opportunity
    return (
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}
            className={cn('p-4 rounded-xl border', c.border, c.bg)}>
            <div className="flex items-start gap-3">
                <span className="text-base flex-shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-text-primary mb-0.5">{insight.title}</h4>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-1.5">{insight.detail}</p>
                    {insight.action && (
                        <p className="text-xs font-semibold text-brand-300">→ {insight.action}</p>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

function RecommendationCard({ rec, index }) {
    const priorityColor = { 1: 'border-danger/25 bg-danger/3', 2: 'border-warning/25 bg-warning/3', 3: 'border-info/25 bg-info/3' }
    const effortBadge = {
        low: 'bg-success/12 text-success border-success/25',
        medium: 'bg-warning/12 text-warning border-warning/25',
        high: 'bg-danger/12 text-danger border-danger/25',
    }
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
            className={cn('p-4 rounded-xl border', priorityColor[rec.priority] || priorityColor[3])}>
            <div className="flex items-start justify-between gap-3 mb-1.5">
                <h4 className="text-sm font-bold text-text-primary">{rec.title}</h4>
                <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0', effortBadge[rec.effort] || effortBadge.medium)}>
                    {rec.effort} effort
                </span>
            </div>
            <p className="text-xs text-text-tertiary leading-relaxed">{rec.reason}</p>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function TeamAnalyticsPage() {
    const navigate = useNavigate()
    const { teamName, user } = useTeamContext()
    const [period, setPeriod] = useState(30)
    const [activeTab, setActiveTab] = useState('overview')
    const [analysis, setAnalysis] = useState(null)
    const [analyzing, setAnalyzing] = useState(false)

    const { data: metrics, isLoading: metricsLoading } = useTeamAnalytics(period)
    const { data: leaderboard, isLoading: leaderboardLoading } = useLeaderboard()

    const isLoading = metricsLoading || leaderboardLoading

    // Derived leaderboard stats
    const teamStats = useMemo(() => {
        if (!leaderboard?.length) return null
        const scores = leaderboard.map(m => m.compositeScore || 0)
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        const topScore = Math.max(...scores)
        const atRisk = leaderboard.filter(m => (m.compositeScore || 0) < 30).length
        const inactive = leaderboard.filter(m => m.activityStatus !== 'ACTIVE').length
        return { avgScore, topScore, atRisk, inactive, total: leaderboard.length }
    }, [leaderboard])

    async function handleAnalyze() {
        if (!metrics) return
        setAnalyzing(true)
        try {
            const res = await api.post('/admin/product-health/analyze', { metrics }, aiConfig)
            setAnalysis(res.data.data)
        } catch (err) {
            console.error('Analysis failed:', err)
        } finally {
            setAnalyzing(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary">Loading team analytics...</p>
                </div>
            </div>
        )
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'members', label: 'Members', icon: '👥' },
        { id: 'content', label: 'Content', icon: '📋' },
        { id: 'ai', label: 'AI Insights', icon: '🤖' },
    ]

    return (
        <div className="p-6 max-w-[1100px] mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-0.5">
                        Team Analytics
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        {teamName} — preparation health and member performance
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Period selector */}
                    <div className="flex bg-surface-2 border border-border-default rounded-lg p-0.5">
                        {[7, 30, 90].map(d => (
                            <button key={d} onClick={() => { setPeriod(d); setAnalysis(null) }}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                                    period === d ? 'bg-brand-400/15 text-brand-300' : 'text-text-tertiary hover:text-text-primary'
                                )}>
                                {d}d
                            </button>
                        ))}
                    </div>
                    {/* AI Insights button */}
                    <Button variant="primary" size="sm" loading={analyzing} onClick={handleAnalyze}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        {analyzing ? 'Analyzing...' : analysis ? 'Re-analyze' : 'AI Insights'}
                    </Button>
                </div>
            </div>

            {/* ── KEY METRICS ROW ─────────────────────────── */}
            {metrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <StatTile icon="👥" value={metrics.users.total} label="Members"
                        sub={metrics.users.active > 0 ? `${metrics.users.active} active` : undefined}
                        color="bg-brand-400" />
                    <StatTile icon="✅" value={metrics.solutions.total} label="Solutions"
                        sub={metrics.solutions.inPeriod > 0 ? `+${metrics.solutions.inPeriod} this period` : undefined}
                        color="bg-success" />
                    <StatTile icon="🤖" value={`${metrics.solutions.aiReviewRate}%`} label="AI Review Rate"
                        sub="solutions with AI feedback"
                        color="bg-brand-400" />
                    <StatTile icon="⚠️"
                        value={metrics.users.atRisk?.length || 0}
                        label="Members at Risk"
                        sub="inactive 7-30 days"
                        color="bg-warning" />
                </div>
            )}

            {/* ── TABS ────────────────────────────────────── */}
            <div className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1 mb-6 overflow-x-auto">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={cn(
                            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                            activeTab === t.id
                                ? 'bg-brand-400/15 text-brand-300'
                                : 'text-text-tertiary hover:text-text-primary'
                        )}>
                        <span>{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ══ TAB: OVERVIEW ══════════════════════════════ */}
            {activeTab === 'overview' && metrics && (
                <div className="space-y-5">
                    {/* AI Analysis — shown when available */}
                    <AnimatePresence>
                        {analysis && (
                            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="bg-surface-1 border border-brand-400/20 rounded-2xl p-5">
                                <div className="flex items-start gap-4 flex-wrap">
                                    <HealthRing score={analysis.healthScore || 50} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <p className="text-sm font-bold text-text-primary">Team Health Summary</p>
                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full
                                                             bg-brand-400/12 text-brand-300 border border-brand-400/25">
                                                AI Generated
                                            </span>
                                        </div>
                                        <p className="text-sm text-text-secondary leading-relaxed">
                                            {analysis.executiveSummary}
                                        </p>
                                        {analysis.trends && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {Object.entries(analysis.trends).map(([key, trend]) => {
                                                    const trendConfig = {
                                                        growing: 'bg-success/12 text-success border-success/25',
                                                        stable: 'bg-info/12 text-info border-info/25',
                                                        declining: 'bg-danger/12 text-danger border-danger/25',
                                                    }
                                                    return (
                                                        <span key={key} className={cn(
                                                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                                            trendConfig[trend] || trendConfig.stable
                                                        )}>
                                                            {key.replace(/([A-Z])/g, ' $1').trim()}: {trend}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Two-column: Engagement + Velocity */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Engagement funnel */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <SectionHeader icon="📊" title="Engagement Funnel"
                                subtitle="How many members are using each feature" />
                            <div className="space-y-2.5">
                                {[
                                    { label: 'Members', value: metrics.funnel.registered, color: 'bg-brand-400' },
                                    { label: 'Solved 1+', value: metrics.funnel.solvedOne, color: 'bg-brand-400' },
                                    { label: 'Solved 3+', value: metrics.funnel.solvedThree, color: 'bg-info' },
                                    { label: 'Used Quiz', value: metrics.funnel.usedQuiz, color: 'bg-warning' },
                                    { label: 'Mock Interview', value: metrics.funnel.usedSim, color: 'bg-success' },
                                    { label: 'Active 7d', value: metrics.funnel.activeWeekly, color: 'bg-success' },
                                ].map(step => (
                                    <FunnelBar key={step.label} label={step.label} value={step.value}
                                        total={metrics.funnel.registered} color={step.color} />
                                ))}
                            </div>
                        </div>

                        {/* Solution velocity */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <SectionHeader icon="📈" title="Solutions Per Week"
                                subtitle="Team output over the last 8 weeks" />
                            <WeeklyBars data={metrics.solutions.perWeekTrend} />
                            {/* Growth indicators */}
                            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border-default">
                                {[
                                    { label: 'Members', value: metrics.growth.memberGrowth },
                                    { label: 'Solutions', value: metrics.growth.solutionGrowth },
                                    { label: 'Active', value: metrics.growth.activeGrowth },
                                ].map(g => (
                                    <div key={g.label} className="text-center">
                                        <div className={cn(
                                            'text-sm font-extrabold font-mono',
                                            g.value > 0 ? 'text-success' : g.value < 0 ? 'text-danger' : 'text-text-primary'
                                        )}>
                                            {g.value > 0 ? '+' : ''}{g.value}%
                                        </div>
                                        <div className="text-[9px] text-text-disabled uppercase tracking-wider">{g.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Feature adoption */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                        <SectionHeader icon="🧩" title="Feature Adoption"
                            subtitle="% of members using each feature" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                { icon: '🧠', label: 'AI Quiz', rate: metrics.quizzes.adoptionRate },
                                { icon: '⏱️', label: 'Interview Sim', rate: metrics.simulations.adoptionRate },
                                { icon: '🤖', label: 'AI Review', rate: metrics.solutions.aiReviewRate },
                                { icon: '🔁', label: 'Spaced Review', rate: metrics.reviews.engagementRate },
                            ].map(f => (
                                <AdoptionBar key={f.label} icon={f.icon} label={f.label} rate={f.rate} />
                            ))}
                        </div>
                        {/* Coaching nudge */}
                        {metrics.solutions.aiReviewRate < 40 && (
                            <div className="mt-4 pt-4 border-t border-border-default">
                                <p className="text-[11px] text-warning flex items-start gap-2">
                                    <span className="flex-shrink-0">⚠️</span>
                                    <span>
                                        Only {metrics.solutions.aiReviewRate}% of solutions have AI review.
                                        Encourage members to request AI feedback — it drives the 6D readiness score.
                                    </span>
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Solution quality */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                        <SectionHeader icon="✍️" title="Solution Quality"
                            subtitle="% of solutions with each reflection field completed" />
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {[
                                { label: 'Pattern', value: metrics.solutions.quality.withPattern },
                                { label: 'Key Insight', value: metrics.solutions.quality.withInsight },
                                { label: 'Explanation', value: metrics.solutions.quality.withExplanation },
                                { label: 'Code', value: metrics.solutions.quality.withCode },
                                { label: 'Both Approaches', value: metrics.solutions.quality.withBothApproaches },
                            ].map(q => (
                                <div key={q.label} className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className={cn(
                                        'text-lg font-extrabold font-mono',
                                        q.value >= 60 ? 'text-success' : q.value >= 30 ? 'text-warning' : 'text-danger'
                                    )}>
                                        {q.value}%
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase tracking-wider mt-0.5">
                                        {q.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ══ TAB: MEMBERS ═══════════════════════════════ */}
            {activeTab === 'members' && (
                <div className="space-y-5">
                    {/* Team summary stats */}
                    {teamStats && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatTile icon="🏆" value={teamStats.avgScore} label="Avg Score"
                                sub="composite readiness" color="bg-brand-400" />
                            <StatTile icon="⭐" value={teamStats.topScore} label="Top Score"
                                sub="highest in team" color="bg-success" />
                            <StatTile icon="⚠️" value={teamStats.atRisk} label="Need Help"
                                sub="score below 30" color="bg-warning" />
                            <StatTile icon="😴" value={teamStats.inactive} label="Inactive"
                                sub="not ACTIVE status" color="bg-danger" />
                        </div>
                    )}

                    {/* Leaderboard */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <SectionHeader icon="👥" title="Member Performance"
                                subtitle="Composite readiness score — not gameable" />
                            <button onClick={() => navigate('/leaderboard')}
                                className="text-xs font-bold text-brand-300 hover:text-brand-200 transition-colors">
                                Full Leaderboard →
                            </button>
                        </div>

                        {leaderboardLoading ? (
                            <div className="flex justify-center py-8"><Spinner size="md" /></div>
                        ) : !leaderboard?.length ? (
                            <div className="flex flex-col items-center py-10 text-center">
                                <span className="text-3xl mb-2">👥</span>
                                <p className="text-sm font-semibold text-text-primary mb-1">No member data yet</p>
                                <p className="text-xs text-text-tertiary">Members need to submit solutions to appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {leaderboard.map((member, i) => (
                                    <MemberRow
                                        key={member.id}
                                        member={member}
                                        rank={member.rank || i + 1}
                                        index={i}
                                        currentUserId={user?.id}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Score dimension legend */}
                        {leaderboard?.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border-default">
                                <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-2">
                                    Score components
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { label: 'Solution Quality', weight: '40%', color: '#7c6ff7' },
                                        { label: 'Difficulty Mix', weight: '25%', color: '#eab308' },
                                        { label: 'Consistency', weight: '20%', color: '#22c55e' },
                                        { label: 'Retention', weight: '10%', color: '#a855f7' },
                                        { label: 'Pattern Breadth', weight: '5%', color: '#3b82f6' },
                                    ].map(c => (
                                        <div key={c.label} className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: c.color }} />
                                            <span className="text-[10px] text-text-disabled">{c.label} ({c.weight})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* At-risk members */}
                    {metrics?.users?.atRisk?.length > 0 && (
                        <div className="bg-warning/3 border border-warning/20 rounded-2xl p-5">
                            <SectionHeader icon="⚠️" title="Members at Risk"
                                subtitle="Active before but haven't practiced in 7-30 days" />
                            <div className="space-y-2">
                                {metrics.users.atRisk.map((m, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="flex items-center justify-between p-3 rounded-xl
                                                   bg-surface-1 border border-border-default"
                                    >
                                        <div>
                                            <span className="text-sm font-semibold text-text-primary">
                                                {m.name}
                                            </span>
                                            <span className="text-[11px] text-text-disabled ml-2">
                                                {m.solutionCount} solved total
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-warning bg-warning/10 border border-warning/20
                                                         px-2 py-0.5 rounded-full font-bold">
                                            Needs nudge
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                            <p className="text-[11px] text-text-disabled mt-3">
                                Consider reaching out — these members have shown engagement before and are likely to re-engage with a direct message.
                            </p>
                        </div>
                    )}

                    {/* Zero activity */}
                    {metrics?.users?.zeroActivity?.length > 0 && (
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <SectionHeader icon="💤" title="Never Practiced"
                                subtitle="Registered but have not submitted any solution" />
                            <div className="flex flex-wrap gap-2">
                                {metrics.users.zeroActivity.map((u, i) => (
                                    <span key={i}
                                        className="text-xs bg-surface-3 border border-border-default
                                                   rounded-full px-3 py-1 text-text-secondary">
                                        {u.name}
                                    </span>
                                ))}
                            </div>
                            <p className="text-[11px] text-text-disabled mt-3">
                                These members joined but never started. A problem recommendation or team challenge might help them take the first step.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ══ TAB: CONTENT ═══════════════════════════════ */}
            {activeTab === 'content' && metrics && (
                <div className="space-y-5">
                    {/* Content overview */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatTile icon="📋" value={metrics.problems.total} label="Problems"
                            color="bg-brand-400" />
                        <StatTile icon="📭" value={metrics.problems.unsolved?.length || 0} label="Unsolved"
                            sub="no solutions yet" color="bg-warning" />
                        <StatTile icon="🧠" value={metrics.quizzes.total} label="Quizzes Taken"
                            sub={`avg ${metrics.quizzes.avgScore}%`} color="bg-info" />
                        <StatTile icon="💬" value={metrics.interviews.total} label="Mock Interviews"
                            sub={`${metrics.interviews.completed} completed`} color="bg-success" />
                    </div>

                    {/* Category distribution */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                        <SectionHeader icon="📚" title="Problem Category Distribution"
                            subtitle="How your problem bank covers interview round types" />
                        <div className="space-y-2.5">
                            {Object.entries(metrics.problems.categoryDistribution)
                                .sort(([, a], [, b]) => b - a)
                                .map(([cat, count]) => {
                                    const catConfig = PROBLEM_CATEGORIES.find(c => c.id === cat)
                                    const pct = Math.round((count / Math.max(metrics.problems.total, 1)) * 100)
                                    return (
                                        <div key={cat} className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                                                <span className="text-sm">{catConfig?.icon || '📋'}</span>
                                                <span className="text-[11px] text-text-secondary truncate">
                                                    {catConfig?.label || cat.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="flex-1 h-5 bg-surface-3 rounded-full overflow-hidden relative">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 0.7 }}
                                                    className="h-full rounded-full bg-brand-400"
                                                />
                                                <span className="absolute inset-0 flex items-center justify-center
                                                                 text-[10px] font-bold text-text-primary">
                                                    {count}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                        {/* Gap detection */}
                        {(() => {
                            const coveredCats = new Set(Object.keys(metrics.problems.categoryDistribution).filter(k => metrics.problems.categoryDistribution[k] > 0))
                            const missingCats = PROBLEM_CATEGORIES.filter(c => !coveredCats.has(c.id))
                            if (!missingCats.length) return null
                            return (
                                <div className="mt-4 pt-4 border-t border-border-default">
                                    <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-2">Missing categories</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {missingCats.map(c => (
                                            <span key={c.id}
                                                className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', c.bg)}>
                                                {c.icon} {c.label}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-text-disabled mt-2">
                                        Add problems in missing categories to give members complete interview coverage.
                                    </p>
                                </div>
                            )
                        })()}
                    </div>

                    {/* Difficulty distribution */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                        <SectionHeader icon="⚡" title="Difficulty Distribution"
                            subtitle="Balance of Easy / Medium / Hard in your problem bank" />
                        <div className="flex gap-4">
                            {Object.entries(metrics.problems.difficultyDistribution).map(([diff, count]) => {
                                const total = metrics.problems.total
                                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                                const color = diff === 'EASY' ? 'text-success' : diff === 'MEDIUM' ? 'text-warning' : 'text-danger'
                                const bg = diff === 'EASY' ? 'bg-success' : diff === 'MEDIUM' ? 'bg-warning' : 'bg-danger'
                                return (
                                    <div key={diff} className="flex-1 bg-surface-2 rounded-2xl p-4 text-center">
                                        <div className={cn('text-2xl font-extrabold font-mono', color)}>{count}</div>
                                        <div className="text-[10px] text-text-disabled uppercase mt-0.5">{diff}</div>
                                        <div className="h-1 bg-surface-3 rounded-full overflow-hidden mt-2">
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }}
                                                className={cn('h-full rounded-full', bg)} />
                                        </div>
                                        <div className="text-[10px] text-text-disabled mt-1">{pct}%</div>
                                    </div>
                                )
                            })}
                        </div>
                        {/* Coaching nudge */}
                        {(() => {
                            const total = metrics.problems.total
                            const hardPct = total > 0 ? metrics.problems.difficultyDistribution.HARD / total : 0
                            if (hardPct < 0.15 && total > 5) {
                                return (
                                    <p className="text-[11px] text-warning mt-3 flex items-start gap-2">
                                        <span>⚠️</span>
                                        <span>Only {Math.round(hardPct * 100)}% of problems are Hard. FAANG candidates need more Hard problems — aim for at least 20-25%.</span>
                                    </p>
                                )
                            }
                            return null
                        })()}
                    </div>

                    {/* Most solved problems */}
                    {metrics.problems.mostSolved?.length > 0 && (
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <SectionHeader icon="🔥" title="Most Solved Problems"
                                subtitle="Problems getting the most team engagement" />
                            <div className="space-y-2">
                                {metrics.problems.mostSolved.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border-subtle">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <span className="text-[10px] font-bold text-text-disabled w-5 flex-shrink-0">#{i + 1}</span>
                                            <span className="text-sm font-semibold text-text-primary truncate">{p.title}</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <Badge variant={p.difficulty === 'EASY' ? 'easy' : p.difficulty === 'HARD' ? 'hard' : 'medium'} size="xs">
                                                {p.difficulty}
                                            </Badge>
                                            <span className="text-xs font-bold font-mono text-brand-300">{p.solutions}✓</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unsolved problems */}
                    {metrics.problems.unsolved?.length > 0 && (
                        <div className="bg-brand-400/3 border border-brand-400/20 rounded-2xl p-5">
                            <SectionHeader icon="📭" title={`Unsolved Problems (${metrics.problems.unsolved.length})`}
                                subtitle="Added to the team but no one has attempted them yet" />
                            <div className="space-y-2">
                                {metrics.problems.unsolved.slice(0, 8).map((p, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-1 border border-border-default">
                                        <span className="text-xs font-semibold text-text-primary truncate flex-1 mr-2">{p.title}</span>
                                        <Badge variant={p.difficulty === 'EASY' ? 'easy' : p.difficulty === 'HARD' ? 'hard' : 'medium'} size="xs">
                                            {p.difficulty}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/problems')}
                                className="text-xs font-bold text-brand-300 hover:text-brand-200 transition-colors mt-3 flex items-center gap-1">
                                View all problems →
                            </button>
                        </div>
                    )}

                    {/* Top quiz subjects */}
                    {metrics.quizzes.topSubjects?.length > 0 && (
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <SectionHeader icon="🧠" title="Top Quiz Subjects"
                                subtitle="What your team is quizzing on most" />
                            <div className="space-y-2">
                                {metrics.quizzes.topSubjects.map((s, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-[11px] font-bold text-text-disabled w-5 flex-shrink-0">#{i + 1}</span>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-xs text-text-secondary">{s.subject}</span>
                                                <span className="text-[10px] font-bold text-text-primary">{s.count}</span>
                                            </div>
                                            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                                <motion.div initial={{ width: 0 }}
                                                    animate={{ width: `${(s.count / metrics.quizzes.topSubjects[0].count) * 100}%` }}
                                                    transition={{ duration: 0.5, delay: i * 0.05 }}
                                                    className="h-full bg-warning rounded-full" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ TAB: AI INSIGHTS ════════════════════════════ */}
            {activeTab === 'ai' && (
                <div className="space-y-5">
                    {!analysis ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <span className="text-4xl mb-4">🤖</span>
                            <p className="text-sm font-bold text-text-primary mb-2">
                                AI Team Analysis
                            </p>
                            <p className="text-xs text-text-tertiary max-w-sm leading-relaxed mb-6">
                                Get actionable insights on your team's preparation health — what's working,
                                what's not, and exactly what to do about it. Powered by GPT-4o.
                            </p>
                            <Button variant="primary" size="md" loading={analyzing} onClick={handleAnalyze}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                                {analyzing ? 'Analyzing your team...' : 'Generate AI Analysis'}
                            </Button>
                            {analyzing && (
                                <p className="text-[11px] text-text-disabled mt-3">
                                    This takes 10-30 seconds — analyzing all team metrics...
                                </p>
                            )}
                        </div>
                    ) : (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                            {/* Health score + summary */}
                            <div className="bg-surface-1 border border-brand-400/20 rounded-2xl p-5">
                                <div className="flex items-start gap-5 flex-wrap">
                                    <HealthRing score={analysis.healthScore || 50} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <p className="text-sm font-bold text-text-primary">Executive Summary</p>
                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full
                                                             bg-brand-400/12 text-brand-300 border border-brand-400/25">
                                                AI Generated
                                            </span>
                                        </div>
                                        <p className="text-sm text-text-secondary leading-relaxed">
                                            {analysis.executiveSummary}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end mt-3">
                                    <Button variant="secondary" size="sm" loading={analyzing} onClick={handleAnalyze}>
                                        Re-analyze
                                    </Button>
                                </div>
                            </div>

                            {/* Insights */}
                            {analysis.insights?.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-text-primary mb-3 flex items-center gap-2">
                                        <span>🔍</span> Key Insights
                                    </p>
                                    <div className="space-y-2">
                                        {analysis.insights.map((insight, i) => (
                                            <InsightCard key={i} insight={insight} index={i} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommendations + Risks */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                {analysis.recommendations?.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-text-primary mb-3 flex items-center gap-2">
                                            <span>🎯</span> Recommendations
                                        </p>
                                        <div className="space-y-2">
                                            {analysis.recommendations.map((rec, i) => (
                                                <RecommendationCard key={i} rec={rec} index={i} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {analysis.risks?.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-text-primary mb-3 flex items-center gap-2">
                                            <span>⚠️</span> Risks
                                        </p>
                                        <div className="space-y-2">
                                            {analysis.risks.map((risk, i) => {
                                                const severityConfig = {
                                                    high: { icon: '🔴', border: 'border-danger/25 bg-danger/3' },
                                                    medium: { icon: '🟡', border: 'border-warning/25 bg-warning/3' },
                                                    low: { icon: '🟢', border: 'border-success/25 bg-success/3' },
                                                }
                                                const c = severityConfig[risk.severity] || severityConfig.medium
                                                return (
                                                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.06 }}
                                                        className={cn('p-4 rounded-xl border', c.border)}>
                                                        <div className="flex items-start gap-3">
                                                            <span className="text-base flex-shrink-0">{c.icon}</span>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-text-primary mb-0.5">{risk.title}</h4>
                                                                <p className="text-xs text-text-tertiary leading-relaxed mb-1">{risk.detail}</p>
                                                                <p className="text-xs text-brand-300 font-semibold">Mitigation: {risk.mitigation}</p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    )
}