// ============================================================================
// RecallAnalyticsPanel — collapsible container for the Review Queue page.
// Holds the summary header, weekly trend chart, and per-pattern table in
// one card so the caller only slots one component.
// ============================================================================
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRecallAnalytics } from '@hooks/useRecallAnalytics'
import { RecallTrendChart } from './RecallTrendChart'
import { RecallByPatternTable } from './RecallByPatternTable'

function SummaryStat({ label, value, sub }) {
    return (
        <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">{label}</span>
            <span className="text-lg font-extrabold text-text-primary tabular-nums leading-tight">{value}</span>
            {sub && <span className="text-[10px] text-text-tertiary leading-tight">{sub}</span>}
        </div>
    )
}

export function RecallAnalyticsPanel() {
    const [expanded, setExpanded] = useState(false)
    const { data, isLoading } = useRecallAnalytics()

    if (isLoading || !data) return null
    const { overall, trend, byPattern } = data

    const empty = overall.totalAttempts === 0
    const recallPct = Math.round(overall.recallRate * 100)

    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2/60 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <div className="text-left">
                        <p className="text-sm font-bold text-text-primary">Your recall analytics</p>
                        <p className="text-[11px] text-text-tertiary">
                            {empty
                                ? 'Review a few problems to start seeing trends'
                                : `${overall.totalAttempts} reviews · ${recallPct}% recall · ${overall.avgConfidence.toFixed(1)}/5 avg confidence`}
                        </p>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-disabled"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>

            <AnimatePresence initial={false}>
                {expanded && !empty && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 border-t border-border-default pt-4 space-y-5">
                            {/* Summary strip */}
                            <div className="grid grid-cols-3 gap-4">
                                <SummaryStat
                                    label="Total reviews"
                                    value={overall.totalAttempts}
                                />
                                <SummaryStat
                                    label="Recall rate"
                                    value={`${recallPct}%`}
                                    sub="quality ≥ 3 / all reviews"
                                />
                                <SummaryStat
                                    label="Avg confidence"
                                    value={`${overall.avgConfidence.toFixed(1)}`}
                                    sub="self-rated, 1-5"
                                />
                            </div>

                            {/* Trend */}
                            {trend.length >= 2 ? (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                        Weekly trend (last 12 weeks)
                                    </p>
                                    <RecallTrendChart data={trend} />
                                </div>
                            ) : (
                                <p className="text-[11px] text-text-tertiary italic">
                                    Trend chart appears once you have reviews across at least two weeks.
                                </p>
                            )}

                            {/* By pattern */}
                            {byPattern.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                        By pattern (top {byPattern.length})
                                    </p>
                                    <RecallByPatternTable rows={byPattern} />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
