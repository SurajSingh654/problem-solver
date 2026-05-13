// ============================================================================
// AI Usage — SUPER_ADMIN-only telemetry view
// ============================================================================
//
// Reads the UsageTracking table (populated server-side by ai.usageWriter,
// which subscribes to ai.service's emit hook). Three things this page makes
// easy:
//
//   1. Per-surface fallback rate. A spike on a single surface points to a
//      prompt regression for that one prompt.
//   2. Per-surface latency p50/p95/p99. Slow tail = model slowness or a
//      backed-up prompt that should be moved to a faster tier.
//   3. Per-team token spend. Foundation for cost attribution + future
//      pricing/billing.
//
// Mirrors VerdictsAuditPage in layout — same StatCard / table styling so
// the two super-admin pages look consistent.
// ============================================================================
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import api from '@services/api'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'

function useAIUsage({ limit, offset, surface, fallbackOnly, errorOnly }) {
    return useQuery({
        queryKey: [
            'superadmin',
            'ai-usage',
            { limit, offset, surface, fallbackOnly, errorOnly },
        ],
        queryFn: async () => {
            const res = await api.get('/platform/ai-usage', {
                params: { limit, offset, surface, fallbackOnly, errorOnly },
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
            <p className={cn('text-2xl font-extrabold font-mono', tones[tone])}>
                {value}
            </p>
            {sub && <p className="text-[10px] text-text-disabled mt-0.5">{sub}</p>}
        </div>
    )
}

// Fallback-rate tone matches the verdict page convention: < 5% green,
// < 15% yellow, anything higher red.
function rateTone(pct) {
    if (pct == null) return 'default'
    if (pct < 5) return 'success'
    if (pct < 15) return 'warning'
    return 'danger'
}

function SurfaceTable({ surfaces, latency, onSelectSurface, selectedSurface }) {
    const latencyBySurface = new Map(latency.map((l) => [l.surface, l]))

    if (!surfaces || surfaces.length === 0) {
        return (
            <div className="bg-surface-1 border border-border-default rounded-xl p-6 text-center">
                <p className="text-xs text-text-tertiary">No AI calls in the last 7 days yet.</p>
            </div>
        )
    }

    return (
        <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-2 border-b border-border-default text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                <div className="col-span-3">Surface</div>
                <div className="col-span-1 text-right">Calls 7d</div>
                <div className="col-span-1 text-right">Calls 30d</div>
                <div className="col-span-2 text-right">Fallback %</div>
                <div className="col-span-1 text-right">p50 ms</div>
                <div className="col-span-1 text-right">p95 ms</div>
                <div className="col-span-1 text-right">p99 ms</div>
                <div className="col-span-2 text-right">Tokens 7d</div>
            </div>
            {surfaces.map((s) => {
                const lat = latencyBySurface.get(s.surface)
                const tone = rateTone(s.fallbackRatePct)
                const isSelected = selectedSurface === s.surface
                return (
                    <button
                        key={s.surface}
                        type="button"
                        onClick={() =>
                            onSelectSurface(isSelected ? null : s.surface)
                        }
                        className={cn(
                            'w-full grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-mono border-b border-border-default last:border-0 transition-colors text-left',
                            isSelected
                                ? 'bg-brand-soft/40'
                                : 'hover:bg-surface-2/60'
                        )}
                    >
                        <div className="col-span-3 truncate text-text-primary font-bold">
                            {s.surface}
                        </div>
                        <div className="col-span-1 text-right text-text-secondary">
                            {s.calls7d}
                        </div>
                        <div className="col-span-1 text-right text-text-tertiary">
                            {s.calls30d}
                        </div>
                        <div
                            className={cn(
                                'col-span-2 text-right font-bold',
                                tone === 'success' && 'text-success-fg',
                                tone === 'warning' && 'text-warning-fg',
                                tone === 'danger' && 'text-danger-fg',
                                tone === 'default' && 'text-text-tertiary'
                            )}
                        >
                            {s.fallbackRatePct}%
                        </div>
                        <div className="col-span-1 text-right text-text-secondary">
                            {lat?.p50Ms ?? '—'}
                        </div>
                        <div className="col-span-1 text-right text-text-secondary">
                            {lat?.p95Ms ?? '—'}
                        </div>
                        <div className="col-span-1 text-right text-text-secondary">
                            {lat?.p99Ms ?? '—'}
                        </div>
                        <div className="col-span-2 text-right text-text-tertiary">
                            {Number(s.totalTokens7d || 0).toLocaleString()}
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

function PerTeamTable({ perTeam }) {
    if (!perTeam || perTeam.length === 0) {
        return (
            <div className="bg-surface-1 border border-border-default rounded-xl p-6 text-center">
                <p className="text-xs text-text-tertiary">
                    No team-scoped AI calls in the last 7 days.
                </p>
            </div>
        )
    }
    return (
        <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-2 border-b border-border-default text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                <div className="col-span-5">Team</div>
                <div className="col-span-1 text-right">Calls</div>
                <div className="col-span-2 text-right">Prompt tok</div>
                <div className="col-span-2 text-right">Completion tok</div>
                <div className="col-span-2 text-right">Total tok</div>
            </div>
            {perTeam.map((t) => (
                <div
                    key={t.teamId}
                    className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-mono border-b border-border-default last:border-0"
                >
                    <div className="col-span-5 truncate text-text-primary font-bold">
                        {t.teamName}
                        {t.isPersonal && (
                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-px rounded-full bg-info-soft text-info-fg border border-info-line">
                                personal
                            </span>
                        )}
                    </div>
                    <div className="col-span-1 text-right text-text-secondary">
                        {t.calls}
                    </div>
                    <div className="col-span-2 text-right text-text-tertiary">
                        {Number(t.promptTokens).toLocaleString()}
                    </div>
                    <div className="col-span-2 text-right text-text-tertiary">
                        {Number(t.completionTokens).toLocaleString()}
                    </div>
                    <div className="col-span-2 text-right text-text-primary font-bold">
                        {Number(t.totalTokens).toLocaleString()}
                    </div>
                </div>
            ))}
        </div>
    )
}

function UsageRow({ row }) {
    const date = new Date(row.createdAt)
    return (
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs font-mono border-b border-border-default last:border-0">
            <div className="col-span-2 truncate">
                <span className="text-text-primary font-bold">{row.surface}</span>
            </div>
            <div className="col-span-2 truncate text-text-tertiary">
                {row.user?.email || '—'}
            </div>
            <div className="col-span-2 truncate text-text-tertiary">
                {row.team?.name || '—'}
            </div>
            <div className="col-span-1 text-right text-text-secondary">
                {row.totalTokens || 0}
            </div>
            <div className="col-span-1 text-right text-text-secondary">
                {row.latencyMs}ms
            </div>
            <div className="col-span-1 text-center">
                {row.usedFallback && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-warning-soft text-warning-fg border border-warning-line">
                        FB
                    </span>
                )}
                {row.errorCode && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-danger-soft text-danger-fg border border-danger-line ml-1">
                        ERR
                    </span>
                )}
                {row.streamCall && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-info-soft text-info-fg border border-info-line ml-1">
                        STR
                    </span>
                )}
            </div>
            <div className="col-span-3 text-right text-text-disabled">
                {date.toLocaleString()}
            </div>
        </div>
    )
}

export default function AIUsagePage() {
    const [limit] = useState(25)
    const [offset, setOffset] = useState(0)
    const [selectedSurface, setSelectedSurface] = useState(null)
    const [fallbackOnly, setFallbackOnly] = useState(false)
    const [errorOnly, setErrorOnly] = useState(false)

    const { data, isLoading, isError } = useAIUsage({
        limit,
        offset,
        surface: selectedSurface,
        fallbackOnly,
        errorOnly,
    })

    const headline = data?.headline
    const surfaces = data?.surfaces || []
    const latency = data?.latency || []
    const perTeam = data?.perTeam || []
    const rows = data?.rows || []
    const pagination = data?.pagination || { total: 0 }

    return (
        <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                    AI Usage
                </h1>
                <p className="text-sm text-text-secondary mt-1">
                    Per-surface fallback rate, latency p99, and per-team token spend over the
                    last 7 days. Populated by every aiComplete / aiStream call. Rows older than
                    90 days are pruned daily.
                </p>
            </motion.div>

            {/* Headline stats */}
            {headline && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard
                        label="7-day calls"
                        value={Number(headline.totalCalls).toLocaleString()}
                        sub="All surfaces combined"
                    />
                    <StatCard
                        label="Fallback calls"
                        value={Number(headline.fallbackCalls).toLocaleString()}
                        tone={rateTone(headline.fallbackRatePct)}
                        sub="LLM output rejected by validator"
                    />
                    <StatCard
                        label="Fallback rate"
                        value={`${headline.fallbackRatePct}%`}
                        tone={rateTone(headline.fallbackRatePct)}
                        sub="< 5% = healthy"
                    />
                    <StatCard
                        label="Error rate"
                        value={`${headline.errorRatePct}%`}
                        tone={rateTone(headline.errorRatePct)}
                        sub={`${headline.errorCalls} hard failures`}
                    />
                </div>
            )}

            {/* Per-surface table */}
            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest">
                        Per surface (7-day)
                    </h2>
                    {selectedSurface && (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedSurface(null)
                                setOffset(0)
                            }}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-soft text-brand-fg-soft border border-brand-line"
                        >
                            ✕ {selectedSurface}
                        </button>
                    )}
                </div>
                {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <Spinner size="lg" />
                    </div>
                ) : isError ? (
                    <p className="text-sm text-danger-fg">Failed to load AI usage stats.</p>
                ) : (
                    <SurfaceTable
                        surfaces={surfaces}
                        latency={latency}
                        onSelectSurface={(s) => {
                            setSelectedSurface(s)
                            setOffset(0)
                        }}
                        selectedSurface={selectedSurface}
                    />
                )}
            </section>

            {/* Per-team spend */}
            <section className="space-y-2">
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest">
                    Per team (top 10, 7-day token spend)
                </h2>
                <PerTeamTable perTeam={perTeam} />
            </section>

            {/* Recent rows */}
            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest">
                        Recent calls
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setFallbackOnly((v) => !v)
                                setOffset(0)
                            }}
                            className={cn(
                                'text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors',
                                fallbackOnly
                                    ? 'bg-warning-soft text-warning-fg border-warning-line'
                                    : 'bg-surface-1 text-text-tertiary border-border-default hover:bg-surface-2'
                            )}
                        >
                            Fallback only
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setErrorOnly((v) => !v)
                                setOffset(0)
                            }}
                            className={cn(
                                'text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors',
                                errorOnly
                                    ? 'bg-danger-soft text-danger-fg border-danger-line'
                                    : 'bg-surface-1 text-text-tertiary border-border-default hover:bg-surface-2'
                            )}
                        >
                            Errors only
                        </button>
                    </div>
                </div>

                {isLoading ? null : isError ? null : rows.length === 0 ? (
                    <div className="bg-surface-1 border border-border-default rounded-xl p-6 text-center">
                        <p className="text-xs text-text-tertiary">No calls match this filter.</p>
                    </div>
                ) : (
                    <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
                        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-2 border-b border-border-default text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                            <div className="col-span-2">Surface</div>
                            <div className="col-span-2">User</div>
                            <div className="col-span-2">Team</div>
                            <div className="col-span-1 text-right">Tokens</div>
                            <div className="col-span-1 text-right">Latency</div>
                            <div className="col-span-1 text-center">Flags</div>
                            <div className="col-span-3 text-right">When</div>
                        </div>
                        {rows.map((row) => (
                            <UsageRow key={row.id} row={row} />
                        ))}
                    </div>
                )}

                {pagination.total > limit && (
                    <div className="flex items-center justify-between pt-2">
                        <p className="text-xs text-text-disabled">
                            Showing {offset + 1}–{Math.min(offset + limit, pagination.total)}{' '}
                            of {pagination.total}
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
            </section>
        </div>
    )
}
