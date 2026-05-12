// ============================================================================
// Verdict Audit — SUPER_ADMIN-only view on the VerdictLog table
// ============================================================================
//
// Purpose: spot-check the AI readiness verdict endpoint. Two things the
// page makes easy:
//
//   1. At-a-glance fallback rate over the last 7 days. A spike here
//      means the LLM is tripping validation rules — symptom of a
//      prompt regression or a model change.
//   2. Drill into any single verdict to see the EXACT evidence the
//      model was given and the JSON it emitted. One clearly-wrong
//      verdict tells us which rule needs tightening.
//
// Not wired to calibration ground truth yet — that comes with the
// interview-pipeline-tracker feature (marked SOMEDAY in roadmap).
// ============================================================================
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@services/api'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'

function useVerdictAudit({ limit, offset, fallbackOnly }) {
    return useQuery({
        queryKey: ['superadmin', 'verdicts', { limit, offset, fallbackOnly }],
        queryFn: async () => {
            const res = await api.get('/platform/verdicts', {
                params: { limit, offset, fallbackOnly },
            })
            return res.data.data
        },
        staleTime: 1000 * 30,
    })
}

function StatCard({ label, value, tone = 'default', sub }) {
    const tones = {
        default: 'text-text-primary',
        success: 'text-success-fg',
        warning: 'text-warning-fg',
        danger: 'text-danger-fg',
    }
    return (
        <div className="bg-surface-1 border border-border-default rounded-xl p-4">
            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                {label}
            </p>
            <p className={cn('text-2xl font-extrabold font-mono', tones[tone])}>{value}</p>
            {sub && <p className="text-[10px] text-text-disabled mt-0.5">{sub}</p>}
        </div>
    )
}

function VerdictRow({ log }) {
    const [expanded, setExpanded] = useState(false)
    const verdict = log.verdictJson || {}
    const date = new Date(log.createdAt)

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-xl overflow-hidden"
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-start gap-3 p-4 hover:bg-surface-2/60 transition-colors text-left"
            >
                <div className="flex-shrink-0 mt-0.5">
                    {log.usedFallback ? (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-warning-soft text-warning-fg border border-warning-line">
                            FALLBACK
                        </span>
                    ) : (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-success-soft text-success-fg border border-success-line">
                            AI
                        </span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-xs font-bold text-text-primary truncate">
                            {log.user?.name || 'Unknown'}
                        </p>
                        <p className="text-[10px] text-text-disabled">
                            {log.user?.email}
                        </p>
                        <span className="text-[10px] text-text-disabled">·</span>
                        <p className="text-[10px] text-text-disabled">
                            {log.team?.name || '?'}
                            {log.team?.isPersonal ? ' (personal)' : ''}
                        </p>
                    </div>
                    <p className="text-[11px] text-text-secondary truncate">
                        {verdict.headline || <span className="italic text-text-disabled">No headline</span>}
                    </p>
                </div>
                <div className="flex-shrink-0 text-right">
                    <p className="text-[10px] text-text-disabled font-mono">
                        {date.toLocaleString()}
                    </p>
                    <p className="text-[9px] text-text-disabled font-mono">
                        {log.inputHash.slice(0, 8)}
                    </p>
                </div>
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border-subtle bg-surface-2"
                    >
                        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                    Input evidence (to LLM)
                                </p>
                                <pre className="text-[10px] text-text-secondary font-mono bg-surface-3 border border-border-default rounded p-2 overflow-x-auto max-h-96 leading-relaxed">
                                    {JSON.stringify(log.inputPayload, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                    Verdict output
                                </p>
                                <pre className="text-[10px] text-text-secondary font-mono bg-surface-3 border border-border-default rounded p-2 overflow-x-auto max-h-96 leading-relaxed">
                                    {JSON.stringify(log.verdictJson, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export default function VerdictsAuditPage() {
    const [fallbackOnly, setFallbackOnly] = useState(false)
    const [offset, setOffset] = useState(0)
    const limit = 25

    const { data, isLoading, isError } = useVerdictAudit({ limit, offset, fallbackOnly })

    const verdicts = data?.verdicts || []
    const pagination = data?.pagination || { total: 0, limit, offset: 0 }
    const stats = data?.stats

    const fallbackTone = stats
        ? stats.fallbackRatePct < 5
            ? 'success'
            : stats.fallbackRatePct < 15
                ? 'warning'
                : 'danger'
        : 'default'

    return (
        <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                    Verdict Audit
                </h1>
                <p className="text-sm text-text-secondary mt-1">
                    Spot-check the AI readiness verdict endpoint. Fallback rate = how often the
                    LLM tripped one of the 7 hard anti-hallucination rules and was replaced with
                    a deterministic template.
                </p>
            </motion.div>

            {/* Summary stats */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard
                        label="7-day verdicts"
                        value={stats.totalVerdicts}
                        sub="Total calls in the window"
                    />
                    <StatCard
                        label="7-day fallback"
                        value={stats.fallbackVerdicts}
                        tone={fallbackTone}
                        sub="LLM output rejected"
                    />
                    <StatCard
                        label="Fallback rate"
                        value={`${stats.fallbackRatePct}%`}
                        tone={fallbackTone}
                        sub="< 5% = healthy"
                    />
                    <StatCard
                        label="Total logged"
                        value={pagination.total}
                        sub={`of all verdicts${fallbackOnly ? ' (filtered)' : ''}`}
                    />
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => {
                        setFallbackOnly(false)
                        setOffset(0)
                    }}
                    className={cn(
                        'text-xs font-bold px-3 py-1.5 rounded-full border transition-colors',
                        !fallbackOnly
                            ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                            : 'bg-surface-1 text-text-tertiary border-border-default hover:bg-surface-2'
                    )}
                >
                    All verdicts
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setFallbackOnly(true)
                        setOffset(0)
                    }}
                    className={cn(
                        'text-xs font-bold px-3 py-1.5 rounded-full border transition-colors',
                        fallbackOnly
                            ? 'bg-warning-soft text-warning-fg border-warning-line'
                            : 'bg-surface-1 text-text-tertiary border-border-default hover:bg-surface-2'
                    )}
                >
                    Fallback only
                </button>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" />
                </div>
            ) : isError ? (
                <p className="text-sm text-danger-fg">Failed to load verdict audit.</p>
            ) : verdicts.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-12 text-center">
                    <p className="text-sm text-text-tertiary">
                        No verdicts {fallbackOnly ? 'have used the fallback' : 'logged yet'}.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {verdicts.map((log) => (
                        <VerdictRow key={log.id} log={log} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.total > limit && (
                <div className="flex items-center justify-between pt-4">
                    <p className="text-xs text-text-disabled">
                        Showing {offset + 1}–{Math.min(offset + limit, pagination.total)} of{' '}
                        {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-surface-1 text-text-secondary border-border-default hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ← Prev
                        </button>
                        <button
                            type="button"
                            disabled={offset + limit >= pagination.total}
                            onClick={() => setOffset(offset + limit)}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-surface-1 text-text-secondary border-border-default hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
