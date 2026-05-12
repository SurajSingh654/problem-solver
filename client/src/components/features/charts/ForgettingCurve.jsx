// ============================================================================
// ForgettingCurve — tiny per-row SVG sparkline of Ebbinghaus retention decay
// ============================================================================
//
// Purpose: next to each due review item, show an at-a-glance curve of how
// much of this solution the user has forgotten since their last review —
// plus a short dashed projection of how much more they'd forget if they
// skipped another ~interval days. The cost of skipping becomes visible.
//
// Why SVG and not recharts: we render one of these per due item. Recharts
// carries a ResponsiveContainer + layout pass per instance; at 20+ items
// that's unnecessary weight. A flat inline SVG is ~3kb, zero runtime cost.
//
// Math: Ebbinghaus/SM-2 retention model.
//   stability = ef * (reps + 1)^0.7
//   R(t) = exp(-t / (stability * 10))
// (Matches server/src/utils/sm2.js::estimateRetention — kept in sync here
// to avoid a round-trip just to render a curve.)
// ============================================================================

import { cn } from '@utils/cn'

function retentionAt(days, ef, reps) {
    const stability = Math.max(1, ef * Math.pow(reps + 1, 0.7))
    return Math.max(0, Math.min(1, Math.exp(-days / (stability * 10))))
}

function toneForRetention(pct) {
    // 0-100 → color bucket. Mirrors the rate-pill palette in
    // RecallByPatternTable so the two surfaces share one visual grammar.
    if (pct >= 70) return { stroke: '#22c55e', fill: 'rgba(34,197,94,0.15)', text: 'text-success-fg' }
    if (pct >= 40) return { stroke: '#eab308', fill: 'rgba(234,179,8,0.15)', text: 'text-warning-fg' }
    return { stroke: '#ef4444', fill: 'rgba(239,68,68,0.15)', text: 'text-danger-fg' }
}

export function ForgettingCurve({
    ef = 2.5,
    reps = 0,
    daysSinceReview = 0,
    // Show projected decay this many additional days into the future
    // (dashed) so the user sees the cost of skipping.
    projectionDays = null,
    width = 80,
    height = 28,
}) {
    const now = Math.max(0.01, daysSinceReview)
    // X-axis spans past review → now → optional projection.
    const projDays = projectionDays ?? Math.min(now, 14) // default = another "now" into the future, capped at 2 weeks
    const totalDays = now + projDays

    // Sample 12 points from t=0 to t=now (past curve), 6 more for projection.
    const PAST_SAMPLES = 12
    const FUTURE_SAMPLES = 6

    const scaleX = (t) => (t / totalDays) * (width - 2) + 1
    const scaleY = (r) => height - 1 - r * (height - 2)

    const past = []
    for (let i = 0; i <= PAST_SAMPLES; i++) {
        const t = (now * i) / PAST_SAMPLES
        past.push({ t, r: retentionAt(t, ef, reps) })
    }
    const future = []
    for (let i = 1; i <= FUTURE_SAMPLES; i++) {
        const t = now + (projDays * i) / FUTURE_SAMPLES
        future.push({ t, r: retentionAt(t, ef, reps) })
    }

    const currentR = past[past.length - 1].r
    const currentPct = Math.round(currentR * 100)
    const tone = toneForRetention(currentPct)

    // Path for the past curve + a filled area beneath it.
    const pastPath = past
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t).toFixed(2)} ${scaleY(p.r).toFixed(2)}`)
        .join(' ')
    const pastArea = `${pastPath} L ${scaleX(now).toFixed(2)} ${height - 1} L 1 ${height - 1} Z`

    // Projection path — dashed, no fill.
    const projPath = [
        `M ${scaleX(now).toFixed(2)} ${scaleY(currentR).toFixed(2)}`,
        ...future.map((p) => `L ${scaleX(p.t).toFixed(2)} ${scaleY(p.r).toFixed(2)}`),
    ].join(' ')

    const nowX = scaleX(now).toFixed(2)
    const nowY = scaleY(currentR).toFixed(2)

    return (
        <div className="flex items-center gap-2">
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={`${currentPct}% estimated retention`}
                className="flex-shrink-0"
            >
                {/* Filled area under the past curve */}
                <path d={pastArea} fill={tone.fill} />
                {/* Past curve — solid */}
                <path d={pastPath} stroke={tone.stroke} strokeWidth="1.5" fill="none" />
                {/* Projection — dashed */}
                {projDays > 0 && (
                    <path
                        d={projPath}
                        stroke={tone.stroke}
                        strokeWidth="1"
                        fill="none"
                        strokeDasharray="2 2"
                        opacity="0.6"
                    />
                )}
                {/* "Now" marker */}
                <circle cx={nowX} cy={nowY} r="2.2" fill={tone.stroke} stroke="rgb(var(--surface-1))" strokeWidth="1" />
            </svg>
            <span className={cn('text-[10px] font-bold tabular-nums', tone.text)}>
                {currentPct}%
            </span>
        </div>
    )
}
