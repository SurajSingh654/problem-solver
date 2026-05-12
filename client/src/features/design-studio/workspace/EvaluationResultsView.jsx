import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import BulletCard from './panels/BulletCard'
import {
    SD_DIMENSION_LABELS,
    LLD_DIMENSION_LABELS,
    scoreColor,
    formatTime,
} from '../constants/phases'

// ══════════════════════════════════════════════════════════════════════════
// DIMENSION BAR — single-use helper, kept inline with EvaluationResultsView.
// ══════════════════════════════════════════════════════════════════════════
function DimensionBar({ label, icon, score, index }) {
    const pct = Math.max(0, Math.min(100, (score / 10) * 100))
    const c = scoreColor(score)
    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-surface-1 border border-border-default rounded-xl p-3"
        >
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <span className="text-xs font-semibold text-text-primary">{label}</span>
                </div>
                <span className={cn('text-sm font-extrabold font-mono', c.text)}>
                    {typeof score === 'number' ? score.toFixed(1) : '—'}
                    <span className="text-text-disabled text-[10px] font-normal ml-0.5">/ 10</span>
                </span>
            </div>
            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: index * 0.04 + 0.1, duration: 0.6 }}
                    className={cn('h-full rounded-full', c.bar)}
                />
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// CHUNK 3: FINAL EVALUATION RESULTS VIEW
// ══════════════════════════════════════════════════════════════════════════
export default function EvaluationResultsView({ session }) {
    const ev = session?.evaluation
    if (!ev || typeof ev !== 'object') {
        return (
            <div className="p-6 max-w-[700px] mx-auto">
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                    <div className="text-4xl mb-3">📊</div>
                    <p className="text-sm font-semibold text-text-primary mb-1">Evaluation not available</p>
                    <p className="text-xs text-text-tertiary">
                        This session was completed without running the AI evaluation.
                        Future sessions: complete validation scenarios, then click &ldquo;Get Final Evaluation&rdquo; to generate a scored report.
                    </p>
                </div>
            </div>
        )
    }

    const isSD = session.designType === 'SYSTEM_DESIGN'
    const labelMap = isSD ? SD_DIMENSION_LABELS : LLD_DIMENSION_LABELS
    const dimensionKeys = Object.keys(labelMap)
    const dimensionEntries = dimensionKeys.map(k => ({
        key: k,
        label: labelMap[k].label,
        icon: labelMap[k].icon,
        score: typeof ev.dimensions?.[k] === 'number' ? ev.dimensions[k] : null,
    }))
    const overall = typeof ev.overallScore === 'number' ? ev.overallScore : null
    const overallColor = overall !== null ? scoreColor(overall) : null

    return (
        <div className="p-6 max-w-[900px] mx-auto space-y-6 pb-16">
            {/* ── Overall score banner ────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    'border rounded-2xl p-6 flex items-center gap-6',
                    overallColor ? cn(overallColor.bg, overallColor.border) : 'bg-surface-1 border-border-default'
                )}
            >
                <div className="flex-shrink-0 flex flex-col items-center">
                    <div className={cn('text-5xl font-extrabold font-mono leading-none', overallColor?.text || 'text-text-primary')}>
                        {overall !== null ? overall.toFixed(1) : '—'}
                    </div>
                    <div className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mt-1">Overall / 10</div>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-lg">{isSD ? '🏗️' : '🔧'}</span>
                        <h2 className="text-lg font-extrabold text-text-primary truncate">{session.title}</h2>
                        <span className="text-[10px] font-bold text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-2 py-px">
                            {session.difficulty}
                        </span>
                    </div>
                    {ev.readinessVerdict && (
                        <p className="text-xs text-text-secondary leading-relaxed mt-1">
                            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mr-1.5">Readiness:</span>
                            {ev.readinessVerdict}
                        </p>
                    )}
                </div>
            </motion.div>

            {/* ── Dimension scores ─────────────────────────────────────────── */}
            <section>
                <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">Dimension Scores</h3>
                <div className="grid md:grid-cols-2 gap-2.5">
                    {dimensionEntries.map((d, i) => (
                        <DimensionBar key={d.key} label={d.label} icon={d.icon} score={d.score ?? 0} index={i} />
                    ))}
                </div>
            </section>

            {/* ── Strengths / Gaps / Improvements ──────────────────────────── */}
            <section>
                <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">Review</h3>
                <div className="grid md:grid-cols-3 gap-3">
                    <BulletCard title="Strengths" color="success" icon="✅" items={ev.strengths} />
                    <BulletCard title="Critical Gaps" color="danger" icon="⚠️" items={ev.criticalGaps} />
                    <BulletCard title="Improvements" color="brand" icon="🔧" items={ev.improvements} />
                </div>
            </section>

            {/* ── Industry Comparison ──────────────────────────────────────── */}
            {ev.industryComparison && (
                <section className="bg-surface-1 border border-border-default rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">🏢</span>
                        <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">Industry Comparison</h3>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">{ev.industryComparison}</p>
                </section>
            )}

            {/* ── Time Analysis ────────────────────────────────────────────── */}
            {ev.timeAnalysis && (
                <section className="bg-surface-1 border border-border-default rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">⏱️</span>
                        <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">Time Analysis</h3>
                        <span className="text-[10px] text-text-disabled ml-auto">
                            {formatTime(session.totalTimeSpent || 0)} total
                        </span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">{ev.timeAnalysis}</p>
                </section>
            )}

            {/* ── Suggested Next Steps ─────────────────────────────────────── */}
            {Array.isArray(ev.suggestedNextSteps) && ev.suggestedNextSteps.length > 0 && (
                <section className="bg-brand-soft border border-brand-line rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">🚀</span>
                        <h3 className="text-xs font-bold text-brand-fg-soft uppercase tracking-widest">Next Steps</h3>
                    </div>
                    <ol className="space-y-2">
                        {ev.suggestedNextSteps.map((step, i) => (
                            <li key={i} className="text-sm text-text-secondary leading-relaxed flex items-start gap-3">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-soft text-brand-fg-soft text-[10px] font-bold flex items-center justify-center mt-0.5">
                                    {i + 1}
                                </span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </div>
    )
}
