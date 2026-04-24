// ============================================================================
// ProbSolver v3.0 — Super Admin Platform Analytics
// ============================================================================
//
// Platform-level health dashboard for SUPER_ADMIN.
// Sections: Overview, User Funnel, Engagement, Team Health,
//           Feature Adoption, AI Usage, AI Analysis (persistent)
//
// ============================================================================
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatShortDate, formatRelativeDate } from '@utils/formatters'
import api from '@services/api'

const AI_TIMEOUT = { timeout: 120000 }

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

// ── Trend badge ────────────────────────────────────────
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

// ── Growth indicator ───────────────────────────────────
function GrowthValue({ value, suffix = '%' }) {
    const formatted = value > 0 ? `+${value}` : `${value}`
    return (
        <span className={cn(
            'text-sm font-extrabold font-mono',
            value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-primary'
        )}>
            {formatted}{suffix}
        </span>
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
            <div className="w-28 text-right">
                <span className="text-xs text-text-tertiary">{label}</span>
            </div>
            <div className="flex-1 h-6 bg-surface-3 rounded-full overflow-hidden relative">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: index * 0.1 }}
                    className={cn(
                        'h-full rounded-full',
                        pct >= 60 ? 'bg-success' : pct >= 30 ? 'bg-brand-400' : 'bg-warning'
                    )}
                />
                <span className="absolute inset-0 flex items-center justify-center
                         text-[10px] font-bold text-text-primary">
                    {value} ({pct}%)
                </span>
            </div>
        </motion.div>
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
            className={cn('p-4 rounded-xl border', c.border, c.bg)}
        >
            <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-text-primary mb-0.5">{insight.title}</h4>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-2">{insight.detail}</p>
                    {insight.action && (
                        <p className="text-xs font-semibold text-brand-300">→ {insight.action}</p>
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
            className={cn('p-4 rounded-xl border', priorityColor[rec.priority] || priorityColor[3])}
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
            <p className="text-xs text-text-tertiary leading-relaxed mb-1">{rec.reason}</p>
            {rec.impact && (
                <p className="text-xs text-success font-semibold">Expected: {rec.impact}</p>
            )}
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
                    <p className="text-xs text-brand-300 font-semibold">Mitigation: {risk.mitigation}</p>
                </div>
            </div>
        </motion.div>
    )
}

// ── Operational action card ────────────────────────────
function ActionCard({ action, index }) {
    const urgencyConfig = {
        immediate: { label: 'NOW', color: 'bg-danger/12 text-danger border-danger/25' },
        this_week: { label: 'This Week', color: 'bg-warning/12 text-warning border-warning/25' },
        this_month: { label: 'This Month', color: 'bg-info/12 text-info border-info/25' },
    }
    const c = urgencyConfig[action.urgency] || urgencyConfig.this_week
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border-default"
        >
            <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 mt-0.5',
                c.color
            )}>
                {c.label}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary">{action.action}</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">{action.reason}</p>
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function SuperAdminAnalyticsPage() {
    const [metrics, setMetrics] = useState(null)
    const [analysis, setAnalysis] = useState(null)
    const [loading, setLoading] = useState(true)
    const [analyzing, setAnalyzing] = useState(false)
    const [loadingAnalysis, setLoadingAnalysis] = useState(true)
    const [period, setPeriod] = useState(30)

    // Fetch metrics
    useEffect(() => {
        async function fetchMetrics() {
            setLoading(true)
            try {
                const res = await api.get(`/platform/health?period=${period}`)
                setMetrics(res.data.data)
            } catch (err) {
                console.error('Failed to load platform metrics:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchMetrics()
    }, [period])

    // Fetch latest saved analysis on mount
    useEffect(() => {
        async function fetchAnalysis() {
            try {
                const res = await api.get('/platform/health/analysis')
                if (res.data.data.analysis) {
                    setAnalysis(res.data.data.analysis)
                }
            } catch (err) {
                console.error('Failed to load saved analysis:', err)
            } finally {
                setLoadingAnalysis(false)
            }
        }
        fetchAnalysis()
    }, [])

    // Generate new AI analysis
    async function handleAnalyze() {
        if (!metrics) return
        setAnalyzing(true)
        try {
            const res = await api.post('/platform/health/analyze', { metrics }, AI_TIMEOUT)
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

    const m = metrics

    return (
        <div className="p-6 max-w-[1100px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Platform Analytics
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Platform-wide health, growth, and engagement metrics
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-surface-2 border border-border-default rounded-lg p-0.5">
                        {[7, 30, 90].map(d => (
                            <button
                                key={d}
                                onClick={() => setPeriod(d)}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                                    period === d
                                        ? 'bg-danger/15 text-danger'
                                        : 'text-text-tertiary hover:text-text-primary'
                                )}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
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

            {/* ══════════════════════════════════════════════ */}
            {/* AI ANALYSIS (persistent — loaded from DB)     */}
            {/* ══════════════════════════════════════════════ */}
            {!loadingAnalysis && analysis && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6"
                >
                    {/* Executive summary + health score */}
                    <div className="bg-surface-1 border border-danger/20 rounded-2xl p-6 mb-4">
                        <div className="flex items-start gap-5 flex-wrap">
                            <HealthRing score={analysis.healthScore || 50} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <h2 className="text-base font-bold text-text-primary">
                                        Executive Summary
                                    </h2>
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full
                                           bg-danger/12 text-danger border border-danger/25">
                                        AI Generated
                                    </span>
                                    {analysis.generatedAt && (
                                        <span className="text-[10px] text-text-disabled">
                                            {formatRelativeDate(analysis.generatedAt)}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                    {analysis.executiveSummary}
                                </p>
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

                    {/* Operational actions (most actionable — show first) */}
                    {analysis.operationalActions?.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                                <span>⚡</span> Operational Actions
                            </h3>
                            <div className="space-y-2">
                                {analysis.operationalActions.map((action, i) => (
                                    <ActionCard key={i} action={action} index={i} />
                                ))}
                            </div>
                        </div>
                    )}

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

                    {/* Recommendations + Risks */}
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

            {/* ══════════════════════════════════════════════ */}
            {/* DASHBOARD METRICS                             */}
            {/* ══════════════════════════════════════════════ */}
            {m && (
                <>
                    {/* Section 1 — Platform Overview */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                        <MetricCard icon="👥" value={m.overview.totalUsers} label="Total Users"
                            sub={m.engagement.newUsers > 0 ? `+${m.engagement.newUsers} new` : undefined}
                            color="text-brand-300" />
                        <MetricCard icon="🟢" value={m.overview.activeUsers} label="Active"
                            color="text-success" />
                        <MetricCard icon="🏢" value={m.overview.totalTeams} label="Teams"
                            color="text-info" />
                        <MetricCard icon="📋" value={m.overview.totalProblems} label="Problems"
                            color="text-warning" />
                        <MetricCard icon="✅" value={m.overview.totalSolutions} label="Solutions"
                            color="text-success" />
                        <MetricCard icon="🤖" value={m.overview.totalAICalls} label="AI Calls"
                            color="text-brand-300" />
                    </div>

                    {/* Growth indicators */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>📈</span> Growth ({period}d vs prev {period}d)
                        </h3>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="text-center">
                                <GrowthValue value={m.growth.users} />
                                <p className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                    User Growth
                                </p>
                            </div>
                            <div className="text-center">
                                <GrowthValue value={m.growth.solutions} />
                                <p className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                    Solution Growth
                                </p>
                            </div>
                            <div className="text-center">
                                <GrowthValue value={m.growth.activeUsers} />
                                <p className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                    Active User Growth
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section 2 — User Funnel + Trends (side by side) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* User funnel */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>📊</span> User Funnel
                            </h3>
                            <div className="space-y-2.5">
                                {[
                                    { label: 'Registered', value: m.funnel.registered },
                                    { label: 'Verified', value: m.funnel.verified },
                                    { label: 'Onboarded', value: m.funnel.onboarded },
                                    { label: 'Solved 1+', value: m.funnel.solvedOne },
                                    { label: 'Used Quiz', value: m.funnel.usedQuiz },
                                    { label: 'Used Interview', value: m.funnel.usedInterview },
                                    { label: 'Active (7d)', value: m.funnel.weeklyActive },
                                ].map((step, i) => (
                                    <FunnelStep
                                        key={step.label}
                                        label={step.label}
                                        value={step.value}
                                        total={m.funnel.registered}
                                        index={i}
                                    />
                                ))}
                            </div>
                            {/* Funnel issues */}
                            {(m.funnel.unverified > 0 || m.funnel.stuckInOnboarding?.length > 0) && (
                                <div className="mt-4 pt-4 border-t border-border-default space-y-2">
                                    {m.funnel.unverified > 0 && (
                                        <p className="text-xs text-warning">
                                            ⚠️ {m.funnel.unverified} users registered but never verified email
                                        </p>
                                    )}
                                    {m.funnel.stuckInOnboarding?.length > 0 && (
                                        <p className="text-xs text-warning">
                                            ⚠️ {m.funnel.stuckInOnboarding.length} users stuck in onboarding (&gt;3 days)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Trends — registrations + solutions per week */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>📈</span> Weekly Trends (last 8 weeks)
                            </h3>
                            {/* Solutions trend */}
                            <p className="text-xs text-text-tertiary mb-2">Solutions per week</p>
                            <div className="flex items-end gap-2 h-24 mb-4">
                                {(m.engagement.solutionsPerWeek || []).map((val, i) => {
                                    const max = Math.max(...(m.engagement.solutionsPerWeek || [1]), 1)
                                    const heightPct = Math.max((val / max) * 100, 4)
                                    return (
                                        <motion.div
                                            key={`sol-${i}`}
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
                            {/* Registrations trend */}
                            <p className="text-xs text-text-tertiary mb-2">Registrations per week</p>
                            <div className="flex items-end gap-2 h-24">
                                {(m.engagement.registrationsPerWeek || []).map((val, i) => {
                                    const max = Math.max(...(m.engagement.registrationsPerWeek || [1]), 1)
                                    const heightPct = Math.max((val / max) * 100, 4)
                                    return (
                                        <motion.div
                                            key={`reg-${i}`}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${heightPct}%` }}
                                            transition={{ duration: 0.5, delay: i * 0.06 }}
                                            className="flex-1 bg-success rounded-t-lg relative group"
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
                            <div className="flex justify-between text-[9px] text-text-disabled mt-1">
                                <span>8 weeks ago</span>
                                <span>This week</span>
                            </div>
                        </div>
                    </div>

                    {/* Section 3 — Engagement + Team Health */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Engagement */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>🎯</span> Engagement
                            </h3>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className="text-lg font-extrabold font-mono text-success">
                                        {m.overview.activeUsers}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase">Active</p>
                                </div>
                                <div className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className="text-lg font-extrabold font-mono text-warning">
                                        {m.overview.inactiveUsers}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase">Inactive</p>
                                </div>
                                <div className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className="text-lg font-extrabold font-mono text-danger">
                                        {m.overview.dormantUsers}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase">Dormant</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-text-tertiary">Active in period</span>
                                    <span className="font-bold text-text-primary">{m.engagement.activeInPeriod}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-text-tertiary">Avg streak</span>
                                    <span className="font-bold text-text-primary">{m.engagement.avgStreak} days</span>
                                </div>
                            </div>
                        </div>

                        {/* Team health */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>🏢</span> Team Health
                            </h3>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className="text-lg font-extrabold font-mono text-success">
                                        {m.teams.active}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase">Active</p>
                                </div>
                                <div className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className="text-lg font-extrabold font-mono text-warning">
                                        {m.teams.pending}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase">Pending</p>
                                </div>
                                <div className="text-center bg-surface-2 rounded-xl p-3">
                                    <div className="text-lg font-extrabold font-mono text-text-secondary">
                                        {m.teams.avgSize}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase">Avg Size</p>
                                </div>
                            </div>
                            {/* Pending approvals */}
                            {m.teams.pendingApprovals?.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-xs font-bold text-warning mb-2">
                                        ⏳ Pending Approvals
                                    </p>
                                    <div className="space-y-1.5">
                                        {m.teams.pendingApprovals.map((t, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs
                                                  bg-warning/5 rounded-lg p-2 border border-warning/15">
                                                <span className="font-semibold text-text-primary">{t.name}</span>
                                                <span className="text-text-disabled">
                                                    {t.daysPending}d waiting
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* At-risk teams */}
                            {m.teams.atRisk?.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-danger mb-2">
                                        🚨 At-Risk Teams (no activity in {period}d)
                                    </p>
                                    <div className="space-y-1.5">
                                        {m.teams.atRisk.map((t, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs
                                                  bg-danger/5 rounded-lg p-2 border border-danger/15">
                                                <span className="font-semibold text-text-primary">{t.name}</span>
                                                <span className="text-text-disabled">
                                                    {t.members} members · {t.problems} problems
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 4 — Feature Adoption + AI Usage */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Feature adoption */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>🧩</span> Feature Adoption (% of all users)
                            </h3>
                            <div className="space-y-3">
                                {Object.values(m.featureAdoption).map(feature => (
                                    <div key={feature.label} className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-text-secondary">{feature.label}</span>
                                                <span className="text-xs font-bold text-text-primary">
                                                    {feature.rate}%
                                                    {feature.users !== undefined && (
                                                        <span className="text-text-disabled font-normal ml-1">
                                                            ({feature.users})
                                                        </span>
                                                    )}
                                                </span>
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

                        {/* AI usage + cost */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                <span>🤖</span> AI Usage & Cost
                            </h3>
                            <div className="space-y-2.5 mb-4">
                                {[
                                    { label: 'Solution Reviews', value: m.aiUsage.reviews },
                                    { label: 'AI Quizzes', value: m.aiUsage.quizzes },
                                    { label: 'Mock Interviews', value: m.aiUsage.interviews },
                                    { label: 'Quiz Analyses', value: m.aiUsage.quizAnalyses },
                                ].map(item => (
                                    <div key={item.label} className="flex items-center justify-between text-xs
                                          bg-surface-2 rounded-lg p-2.5 border border-border-subtle">
                                        <span className="text-text-tertiary">{item.label}</span>
                                        <span className="font-bold font-mono text-text-primary">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-border-default pt-4">
                                <div className="flex items-center justify-between text-xs mb-2">
                                    <span className="text-text-tertiary">Total AI Calls</span>
                                    <span className="font-bold font-mono text-brand-300">
                                        {m.aiUsage.totalCalls}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs mb-2">
                                    <span className="text-text-tertiary">Est. Tokens Used</span>
                                    <span className="font-bold font-mono text-text-primary">
                                        {(m.aiUsage.estimatedTokens / 1000).toFixed(0)}K
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-text-tertiary">Est. Cost (gpt-4o-mini)</span>
                                    <span className="font-bold font-mono text-warning">
                                        ${m.aiUsage.estimatedCost}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 5 — Content Volume */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>📦</span> Content Volume (platform-wide)
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {[
                                { label: 'Problems', value: m.content.totalProblems, new: m.content.newProblemsInPeriod, icon: '📋' },
                                { label: 'Solutions', value: m.content.totalSolutions, new: m.content.newSolutionsInPeriod, icon: '✅' },
                                { label: 'Quizzes', value: m.content.totalQuizzes, icon: '🧩' },
                                { label: 'Interviews', value: m.content.totalInterviews, icon: '💬' },
                                { label: 'Simulations', value: m.content.totalSims, icon: '⏱' },
                            ].map(item => (
                                <div key={item.label} className="text-center bg-surface-2 rounded-xl p-3">
                                    <span className="text-lg">{item.icon}</span>
                                    <div className="text-lg font-extrabold font-mono text-text-primary mt-1">
                                        {item.value}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase tracking-wider">
                                        {item.label}
                                    </p>
                                    {item.new > 0 && (
                                        <p className="text-[10px] text-success mt-0.5">+{item.new} new</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}