// ============================================================================
// PatternMasteryCard — Coding Pattern Mastery v2
// ============================================================================
//
// Replaces the legacy PatternCoverageCard ("3 of 25 patterns") with a
// per-pattern mastery matrix grouped by state:
//
//   UNTOUCHED → TOUCHED → WORKING → SOLID → OWNED
//
// Driven by `analytics.patternMastery` from /stats/report (server-computed
// in patternMastery.js). Renders only when the server returns the matrix —
// when the server flag is OFF, this component is not mounted.
// ============================================================================
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'

// State → color tokens. Five distinct semantic colors; no greyscale ramp,
// because users need to instantly tell mastery levels apart.
const STATE_STYLES = {
    OWNED:     { label: 'Owned',     pill: 'bg-success-soft text-success-fg border-success-line',         dot: 'bg-success' },
    SOLID:     { label: 'Solid',     pill: 'bg-brand-soft   text-brand-fg-soft border-brand-line',         dot: 'bg-brand-400' },
    WORKING:   { label: 'Working',   pill: 'bg-info-soft    text-info-fg border-info-line',                dot: 'bg-info' },
    TOUCHED:   { label: 'Touched',   pill: 'bg-warning-soft text-warning-fg border-warning-line',          dot: 'bg-warning' },
    UNTOUCHED: { label: 'Untouched', pill: 'bg-surface-3    text-text-disabled border-border-default',     dot: 'bg-surface-3' },
}

// Sort order: gaps first (UNTOUCHED top), mastery last. Within a state,
// FAANG-core patterns surface above non-core so the user fixes the
// interview-critical gaps first.
const STATE_SORT_INDEX = {
    UNTOUCHED: 0, TOUCHED: 1, WORKING: 2, SOLID: 3, OWNED: 4,
}

const FILTERS = [
    { id: 'all',       label: 'All' },
    { id: 'core',      label: 'FAANG-core 15' },
    { id: 'gaps',      label: 'Gaps (Untouched / Touched)' },
    { id: 'progress',  label: 'In progress (Working+)' },
]

function DifficultyChips({ difficulties }) {
    if (!difficulties || difficulties.length === 0) return null
    const order = ['EASY', 'MEDIUM', 'HARD']
    return (
        <div className="flex gap-0.5">
            {order.map(d => {
                const has = difficulties.includes(d)
                return (
                    <span
                        key={d}
                        className={cn(
                            'text-[8px] font-bold w-4 h-4 inline-flex items-center justify-center rounded',
                            has
                                ? 'bg-surface-3 text-text-secondary border border-border-default'
                                : 'bg-transparent text-text-disabled',
                        )}
                        title={`${d.toLowerCase()} ${has ? 'covered' : 'not covered'}`}
                    >
                        {d[0]}
                    </span>
                )
            })}
        </div>
    )
}

function MasteryRow({ row, idx }) {
    const style = STATE_STYLES[row.state] || STATE_STYLES.UNTOUCHED
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: Math.min(idx * 0.015, 0.4) }}
            className="flex items-center gap-3 py-2 px-3 rounded-xl bg-surface-2 border border-border-subtle"
        >
            {/* Pattern + core badge */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                        'text-xs font-semibold truncate',
                        row.state === 'UNTOUCHED' ? 'text-text-tertiary' : 'text-text-primary',
                    )}>
                        {row.pattern}
                    </span>
                    {row.isCore && (
                        <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded bg-brand-soft/60 text-brand-fg-soft border border-brand-line">
                            FAANG
                        </span>
                    )}
                    {row.hasWrongFlag && (
                        <span
                            className="text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded bg-danger-soft text-danger-fg border border-danger-line"
                            title="AI flagged at least one solution as a wrong-pattern claim — blocks WORKING transition."
                        >
                            wrong-tag
                        </span>
                    )}
                </div>
                {row.solves > 0 && (
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-disabled font-mono">
                            {row.solves} solve{row.solves === 1 ? '' : 's'}
                            {row.coldSolves !== row.solves && (
                                <span className="ml-1">({row.coldSolves} cold)</span>
                            )}
                        </span>
                        <DifficultyChips difficulties={row.difficulties} />
                        {row.retained && (
                            <span
                                className="text-[10px] text-success-fg font-semibold"
                                title="Successfully recalled in spaced-repetition reviews."
                            >
                                ✓ retained
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* State pill */}
            <span className={cn(
                'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border',
                style.pill,
            )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                {style.label}
            </span>
        </motion.div>
    )
}

export function PatternMasteryCard({ patternMastery }) {
    const [filter, setFilter] = useState('all')

    const counts = patternMastery?.counts || null

    const filtered = useMemo(() => {
        const matrix = patternMastery?.matrix
        if (!Array.isArray(matrix)) return []
        let rows = matrix.slice()
        if (filter === 'core') rows = rows.filter(r => r.isCore)
        else if (filter === 'gaps') rows = rows.filter(r => r.state === 'UNTOUCHED' || r.state === 'TOUCHED')
        else if (filter === 'progress') rows = rows.filter(r => r.state === 'WORKING' || r.state === 'SOLID' || r.state === 'OWNED')

        // Sort: state asc (gaps first), then core first within state, then alphabetical.
        rows.sort((a, b) => {
            const stateDiff = STATE_SORT_INDEX[a.state] - STATE_SORT_INDEX[b.state]
            if (stateDiff !== 0) return stateDiff
            if (a.isCore !== b.isCore) return a.isCore ? -1 : 1
            return a.pattern.localeCompare(b.pattern)
        })
        return rows
    }, [patternMastery, filter])

    if (!patternMastery || !counts) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                <div>
                    <h3 className="text-sm font-bold text-text-primary">Coding Pattern Mastery</h3>
                    <p className="text-xs text-text-tertiary mt-0.5">
                        Per-pattern progression. A pattern is <em>Owned</em> when you've cold-solved
                        it across difficulties and recalled it under spaced repetition — not just tagged it once.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-text-disabled uppercase tracking-widest">FAANG-core SOLID+</p>
                    <p className={cn(
                        'text-xl font-extrabold font-mono',
                        counts.coreSolidOrAbove >= 10 ? 'text-success-fg'
                            : counts.coreSolidOrAbove >= 5 ? 'text-warning-fg'
                                : 'text-danger-fg',
                    )}>
                        {counts.coreSolidOrAbove}/{counts.totalCore}
                    </p>
                </div>
            </div>

            {/* Summary strip — counts per state */}
            <div className="grid grid-cols-5 gap-1.5 mb-4">
                {[
                    { state: 'OWNED',     value: counts.owned     },
                    { state: 'SOLID',     value: counts.solid     },
                    { state: 'WORKING',   value: counts.working   },
                    { state: 'TOUCHED',   value: counts.touched   },
                    { state: 'UNTOUCHED', value: counts.untouched },
                ].map(({ state, value }) => {
                    const style = STATE_STYLES[state]
                    return (
                        <div key={state} className={cn(
                            'rounded-lg border px-2 py-1.5 text-center',
                            style.pill,
                        )}>
                            <p className="text-base font-extrabold font-mono leading-none">{value}</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider mt-1 leading-tight">{style.label}</p>
                        </div>
                    )
                })}
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 flex-wrap mb-3">
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilter(f.id)}
                        className={cn(
                            'text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors',
                            filter === f.id
                                ? 'bg-brand-soft border-brand-line text-brand-fg-soft'
                                : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong',
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Pattern rows */}
            <div className="space-y-1.5">
                {filtered.length === 0 ? (
                    <p className="text-xs text-text-disabled text-center py-4">
                        No patterns match this filter.
                    </p>
                ) : (
                    filtered.map((row, i) => (
                        <MasteryRow key={row.pattern} row={row} idx={i} />
                    ))
                )}
            </div>

            {/* Legend / what these states mean */}
            <div className="mt-4 pt-3 border-t border-border-subtle">
                <p className="text-[10px] text-text-disabled leading-relaxed">
                    <strong className="text-text-tertiary">How states are earned:</strong>{' '}
                    <span className="text-success-fg font-semibold">Owned</span> = recalled under spaced repetition;{' '}
                    <span className="text-brand-fg-soft font-semibold">Solid</span> = cold-solved across ≥2 difficulty levels with high AI accuracy;{' '}
                    <span className="text-info-fg font-semibold">Working</span> = ≥2 cold solves with strong AI accuracy and no wrong-pattern flags;{' '}
                    <span className="text-warning-fg font-semibold">Touched</span> = at least one solve. Looking up the answer (SAW_APPROACH) keeps a pattern at Touched.
                </p>
            </div>
        </motion.div>
    )
}
