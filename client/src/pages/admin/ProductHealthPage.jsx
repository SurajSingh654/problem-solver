import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { Badge } from '@components/ui/Badge'
import { cn } from '@utils/cn'
import api from '@services/api'

const aiConfig = { timeout: 120000 }

// ── Health score ring ──────────────────────────────────
function HealthRing({ score }) {
    const r = 44
    const circumf = 2 * Math.PI * r
    const dashOffset = circumf - (score / 100) * circumf
    const color =
        score >= 70 ? '#22c55e' :
            score >= 40 ? '#eab308' : '#ef4444'

    return (
        <div className="relative w-[100px] h-[100px]">
            <svg width="100" height="100" className="-rotate-90">
                <circle cx="50" cy="50" r={r} fill="none"
                    stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <motion.circle
                    cx="50" cy="50" r={r} fill="none"
                    stroke={color} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={circumf}
                    initial={{ strokeDashoffset: circumf }}
                    animate={{ strokeDashoffset: dashOffset }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold font-mono text-text-primary">
                    {score}
                </span>
                <span className="text-[9px] text-text-disabled uppercase tracking-wider">
                    health
                </span>
            </div>
        </div>
    )
}

// ── Trend indicator ────────────────────────────────────
function TrendBadge({ trend }) {
    const config = {
        growing: { label: 'Growing', color: 'bg-success/12 text-success border-success/25', icon: '↑' },
        stable: { label: 'Stable', color: 'bg-info/12 text-info border-info/25', icon: '→' },
        declining: { label: 'Declining', color: 'bg-danger/12 text-danger border-danger/25', icon: '↓' },
    }
    const c = config[trend] || config.stable
    return (
        <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1',
            c.color
        )}>
            {c.icon} {c.label}
        </span>
    )
}

// ── Insight card ───────────────────────────────────────
function InsightCard({ insight, index }) {
    const typeConfig = {
        positive: { icon: '✅', border: 'border-success/20', bg: 'bg-success/3' },
        warning: { icon: '⚠️', border: 'border-warning/20', bg: 'bg-warning/3' },
        critical: { icon: '🚨', border: 'border-danger/20', bg: 'bg-danger/3' },
        opportunity: { icon: '💡', border: 'border-brand-400/20', bg: 'bg-brand-400/3' },
    }
    const c = typeConfig[insight.type] || typeConfig.opportunity

    return (
        <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            className={cn(
                'p-4 rounded-xl border',
                c.border, c.bg
            )}
        >
            <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-text-primary mb-0.5">
                        {insight.title}
                    </h4>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-2">
                        {insight.detail}
                    </p>
                    {insight.action && (
                        <p className="text-xs font-semibold text-brand-300">
                            → {insight.action}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

// ── Recommendation card ────────────────────────────────
function RecommendationCard({ rec, index }) {
    const priorityColor = {
        1: 'border-danger/25 bg-danger/3',
        2: 'border-warning/25 bg-warning/3',
        3: 'border-info/25 bg-info/3',
    }
    const effortBadge = {
        low: 'bg-success/12 text-success border-success/25',
        medium: 'bg-warning/12 text-warning border-warning/25',
        high: 'bg-danger/12 text-danger border-danger/25',
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className={cn(
                'p-4 rounded-xl border',
                priorityColor[rec.priority] || priorityColor[3]
            )}
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <h4 className="text-sm font-bold text-text-primary">{rec.title}</h4>
                <span className={cn(
                    'text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0',
                    effortBadge[rec.effort] || effortBadge.medium
                )}>
                    {rec.effort} effort
                </span>
            </div>
            <p className="text-xs text-text-tertiary leading-relaxed">{rec.reason}</p>
        </motion.div>
    )
}

// ── Risk card ──────────────────────────────────────────
function RiskCard({ risk, index }) {
    const severityConfig = {
        high: { icon: '🔴', border: 'border-danger/25 bg-danger/3' },
        medium: { icon: '🟡', border: 'border-warning/25 bg-warning/3' },
        low: { icon: '🟢', border: 'border-success/25 bg-success/3' },
    }
    const c = severityConfig[risk.severity] || severityConfig.medium

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className={cn('p-4 rounded-xl border', c.border)}
        >
            <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{c.icon}</span>
                <div>
                    <h4 className="text-sm font-bold text-text-primary mb-0.5">{risk.title}</h4>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-1">{risk.detail}</p>
                    <p className="text-xs text-brand-300 font-semibold">
                        Mitigation: {risk.mitigation}
                    </p>
                </div>
            </div>
        </motion.div>
    )
}

// ── Spark line (mini trend) ────────────────────────────
function SparkLine({ data, color = 'bg-brand-400' }) {
    const max = Math.max(...data, 1)
    return (
        <div className="flex items-end gap-px h-6">
            {data.map((val, i) => (
                <div
                    key={i}
                    className={cn('w-2 rounded-t-sm transition-all', color)}
                    style={{ height: `${Math.max((val / max) * 100, 4)}%`, opacity: 0.4 + (i / data.length) * 0.6 }}
                />
            ))}
        </div>
    )
}

// ── Metric card ────────────────────────────────────────
function MetricCard({ icon, value, label, sub, color }) {
    return (
        <div className="bg-surface-1 border border-border-default rounded-xl p-4 text-center">
            <span className="text-xl">{icon}</span>
            <div className={cn('text-xl font-extrabold font-mono mt-1', color || 'text-text-primary')}>
                {value}
            </div>
            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                {label}
            </div>
            {sub && <div className="text-[10px] text-text-tertiary mt-0.5">{sub}</div>}
        </div>
    )
}

// ── Funnel step ────────────────────────────────────────
function FunnelStep({ label, value, total, index }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            className="flex items-center gap-3"
        >
            <div className="w-24 text-right">
                <span className="text-xs text-text-tertiary">{label}</span>
            </div>
            <div className="flex-1 h-6 bg-surface-3 rounded-full overflow-hidden relative">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: index * 0.1 }}
                    className="h-full bg-brand-400 rounded-full"
                />
                <span className="absolute inset-0 flex items-center justify-center
                         text-[10px] font-bold text-text-primary">
                    {value} ({pct}%)
                </span>
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ProductHealthPage() {
    const [metrics, setMetrics] = useState(null)
    const [analysis, setAnalysis] = useState(null)
    const [loading, setLoading] = useState(true)
    const [analyzing, setAnalyzing] = useState(false)
    const [period, setPeriod] = useState(30)

    // Fetch metrics
    useEffect(() => {
        async function fetchMetrics() {
            setLoading(true)
            try {
                const res = await api.get(`/admin/product-health?period=${period}`)
                setMetrics(res.data.data)
            } catch (err) {
                console.error('Failed to load metrics:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchMetrics()
    }, [period])

    // Trigger AI analysis
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary">Collecting platform data...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[1100px] mx-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Product Health
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        AI-powered platform analytics — understand how your product is performing
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Period selector */}
                    <div className="flex bg-surface-2 border border-border-default rounded-lg p-0.5">
                        {[7, 30, 90].map(d => (
                            <button
                                key={d}
                                onClick={() => { setPeriod(d); setAnalysis(null) }}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                                    period === d
                                        ? 'bg-brand-400/15 text-brand-300'
                                        : 'text-text-tertiary hover:text-text-primary'
                                )}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                    {/* Analyze button */}
                    <Button
                        variant="primary"
                        size="sm"
                        loading={analyzing}
                        onClick={handleAnalyze}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        {analyzing ? 'Analyzing...' : analysis ? 'Re-analyze' : 'AI Analysis'}
                    </Button>
                </div>
            </div>

            {/* AI Analysis Report — shows when available */}
            {analysis && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    {/* Executive summary + health score */}
                    <div className="bg-surface-1 border border-brand-400/20 rounded-2xl p-6 mb-4">
                        <div className="flex items-start gap-5 flex-wrap">
                            <HealthRing score={analysis.healthScore || 50} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <h2 className="text-base font-bold text-text-primary">Executive Summary</h2>
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full
                                   bg-brand-400/12 text-brand-300 border border-brand-400/25">
                                        AI Generated
                                    </span>
                                </div>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                    {analysis.executiveSummary}
                                </p>
                                {/* Trends */}
                                {analysis.trends && (
                                    <div className="flex flex-wrap gap-3 mt-4">
                                        {Object.entries(analysis.trends).map(([key, trend]) => (
                                            <div key={key} className="flex items-center gap-2">
                                                <span className="text-[10px] text-text-disabled capitalize">
                                                    {key.replace(/([A-Z])/g, ' $1').trim()}:
                                                </span>
                                                <TrendBadge trend={trend} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Insights */}
                    {analysis.insights?.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                <span>🔍</span> Key Insights
                            </h3>
                            <div className="space-y-2">
                                {analysis.insights.map((insight, i) => (
                                    <InsightCard key={i} insight={insight} index={i} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recommendations + Risks side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {analysis.recommendations?.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                    <span>🎯</span> Recommendations
                                </h3>
                                <div className="space-y-2">
                                    {analysis.recommendations.map((rec, i) => (
                                        <RecommendationCard key={i} rec={rec} index={i} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {analysis.risks?.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                    <span>⚠️</span> Risks
                                </h3>
                                <div className="space-y-2">
                                    {analysis.risks.map((risk, i) => (
                                        <RiskCard key={i} risk={risk} index={i} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Raw Metrics — always visible */}
            {metrics && (
                <>
                    {/* Key metrics grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        <MetricCard icon="👥" value={metrics.users.total} label="Members"
                            sub={metrics.users.new > 0 ? `+${metrics.users.new} new` : undefined}
                            color="text-brand-300" />
                        <MetricCard icon="✅" value={metrics.solutions.total} label="Solutions"
                            sub={metrics.solutions.inPeriod > 0 ? `+${metrics.solutions.inPeriod} this period` : undefined}
                            color="text-success" />
                        <MetricCard icon="📋" value={metrics.problems.total} label="Problems"
                            sub={`${metrics.problems.unsolved.length} unsolved`}
                            color="text-info" />
                        <MetricCard icon="🤖" value={`${metrics.solutions.aiReviewRate}%`} label="AI Adoption"
                            sub="solutions reviewed by AI"
                            color="text-brand-300" />
                    </div>

                    {/* Two column — Funnel + Trends */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                        {/* Engagement funnel */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>📊</span> Engagement Funnel
                            </h3>
                            <div className="space-y-2.5">
                                {[
                                    { label: 'Registered', value: metrics.funnel.registered },
                                    { label: 'Solved 1+', value: metrics.funnel.solvedOne },
                                    { label: 'Solved 3+', value: metrics.funnel.solvedThree },
                                    { label: 'Used Quiz', value: metrics.funnel.usedQuiz },
                                    { label: 'Used Sim', value: metrics.funnel.usedSim },
                                    { label: 'Active (7d)', value: metrics.funnel.activeWeekly },
                                ].map((step, i) => (
                                    <FunnelStep
                                        key={step.label}
                                        label={step.label}
                                        value={step.value}
                                        total={metrics.funnel.registered}
                                        index={i}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Solutions trend */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>📈</span> Solutions Per Week (last 8 weeks)
                            </h3>
                            <div className="flex items-end gap-2 h-32 mb-3">
                                {metrics.solutions.perWeekTrend.map((val, i) => {
                                    const max = Math.max(...metrics.solutions.perWeekTrend, 1)
                                    const heightPct = Math.max((val / max) * 100, 4)
                                    return (
                                        <motion.div
                                            key={i}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${heightPct}%` }}
                                            transition={{ duration: 0.5, delay: i * 0.06 }}
                                            className="flex-1 bg-brand-400 rounded-t-lg relative group"
                                        >
                                            <div className="absolute -top-5 left-1/2 -translate-x-1/2
                                      text-[10px] font-bold text-text-primary
                                      opacity-0 group-hover:opacity-100 transition-opacity">
                                                {val}
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                            <div className="flex justify-between text-[9px] text-text-disabled">
                                <span>8 weeks ago</span>
                                <span>This week</span>
                            </div>

                            {/* Growth indicators */}
                            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border-default">
                                {[
                                    { label: 'Members', value: `${metrics.growth.memberGrowth > 0 ? '+' : ''}${metrics.growth.memberGrowth}%` },
                                    { label: 'Solutions', value: `${metrics.growth.solutionGrowth > 0 ? '+' : ''}${metrics.growth.solutionGrowth}%` },
                                    { label: 'Active', value: `${metrics.growth.activeGrowth > 0 ? '+' : ''}${metrics.growth.activeGrowth}%` },
                                ].map(g => (
                                    <div key={g.label} className="text-center">
                                        <div className={cn(
                                            'text-sm font-extrabold font-mono',
                                            g.value.startsWith('+') ? 'text-success' :
                                                g.value.startsWith('-') ? 'text-danger' : 'text-text-primary'
                                        )}>
                                            {g.value}
                                        </div>
                                        <div className="text-[9px] text-text-disabled uppercase tracking-wider">
                                            {g.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Feature adoption + Content gaps */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                        {/* Feature adoption */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>🧩</span> Feature Adoption
                            </h3>
                            <div className="space-y-3">
                                {[
                                    { label: 'Quiz', rate: metrics.quizzes.adoptionRate, icon: '🧠' },
                                    { label: 'Simulation', rate: metrics.simulations.adoptionRate, icon: '⏱' },
                                    { label: 'AI Review', rate: metrics.solutions.aiReviewRate, icon: '🤖' },
                                    { label: 'Reviews', rate: metrics.reviews.engagementRate, icon: '🔁' },
                                ].map(feature => (
                                    <div key={feature.label} className="flex items-center gap-3">
                                        <span className="text-base flex-shrink-0">{feature.icon}</span>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-text-secondary">{feature.label}</span>
                                                <span className="text-xs font-bold text-text-primary">{feature.rate}%</span>
                                            </div>
                                            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${feature.rate}%` }}
                                                    transition={{ duration: 0.7 }}
                                                    className={cn(
                                                        'h-full rounded-full',
                                                        feature.rate >= 60 ? 'bg-success' :
                                                            feature.rate >= 30 ? 'bg-warning' : 'bg-danger'
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Content coverage */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>📋</span> Content Coverage
                            </h3>
                            <div className="space-y-2.5">
                                {Object.entries(metrics.problems.categoryDistribution).map(([cat, count]) => (
                                    <div key={cat} className="flex items-center gap-3">
                                        <span className="text-xs text-text-secondary w-28 truncate capitalize">
                                            {cat.replace('_', ' ').toLowerCase()}
                                        </span>
                                        <div className="flex-1 h-4 bg-surface-3 rounded-full overflow-hidden relative">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(count / Math.max(metrics.problems.total, 1)) * 100}%` }}
                                                transition={{ duration: 0.7 }}
                                                className="h-full bg-brand-400 rounded-full"
                                            />
                                            <span className="absolute inset-0 flex items-center justify-center
                                       text-[9px] font-bold text-text-primary">
                                                {count}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Difficulty split */}
                            <div className="mt-4 pt-4 border-t border-border-default">
                                <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-2">
                                    Difficulty
                                </p>
                                <div className="flex gap-3">
                                    {Object.entries(metrics.problems.difficultyDistribution).map(([diff, count]) => (
                                        <div key={diff} className="flex-1 text-center bg-surface-2 rounded-xl p-2">
                                            <span className={cn(
                                                'text-sm font-extrabold font-mono',
                                                diff === 'EASY' ? 'text-success' :
                                                    diff === 'MEDIUM' ? 'text-warning' : 'text-danger'
                                            )}>
                                                {count}
                                            </span>
                                            <p className="text-[9px] text-text-disabled uppercase">{diff}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* At risk members + Unsolved problems */}
                    {(metrics.users.atRisk.length > 0 || metrics.problems.unsolved.length > 0) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            {metrics.users.atRisk.length > 0 && (
                                <div className="bg-warning/3 border border-warning/20 rounded-2xl p-5">
                                    <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                        <span>⚠️</span> Members at Risk
                                    </h3>
                                    <div className="space-y-2">
                                        {metrics.users.atRisk.map((m, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs
                                              bg-surface-1 rounded-lg p-2.5 border border-border-default">
                                                <span className="font-semibold text-text-primary">{m.username}</span>
                                                <span className="text-text-disabled">
                                                    {m.solutionCount} solved · inactive
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {metrics.problems.unsolved.length > 0 && (
                                <div className="bg-brand-400/3 border border-brand-400/20 rounded-2xl p-5">
                                    <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                        <span>📋</span> Unsolved Problems ({metrics.problems.unsolved.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {metrics.problems.unsolved.slice(0, 5).map((p, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs
                                              bg-surface-1 rounded-lg p-2.5 border border-border-default">
                                                <span className="font-semibold text-text-primary truncate flex-1 mr-2">
                                                    {p.title}
                                                </span>
                                                <Badge
                                                    variant={p.difficulty === 'EASY' ? 'easy' :
                                                        p.difficulty === 'HARD' ? 'hard' : 'medium'}
                                                    size="xs"
                                                >
                                                    {p.difficulty}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Solution quality */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>✍️</span> Solution Quality
                            <span className="text-xs font-normal text-text-disabled">
                                (% of solutions with each field filled)
                            </span>
                        </h3>
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
                                        q.value >= 60 ? 'text-success' :
                                            q.value >= 30 ? 'text-warning' : 'text-danger'
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
                </>
            )}
        </div>
    )
}