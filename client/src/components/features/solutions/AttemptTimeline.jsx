// ============================================================================
// AttemptTimeline — vertical list of SolutionAttempt rows, newest first
// ============================================================================
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'

const TRIGGER_CONFIG = {
    SUBMIT: { label: 'Submitted', icon: '📝', color: 'text-brand-fg-soft bg-brand-soft border-brand-line' },
    EDIT: { label: 'Edited', icon: '✏️', color: 'text-warning-fg bg-warning-soft border-warning-line' },
    DESIGN_BRIDGE: { label: 'Design Studio', icon: '🏗️', color: 'text-info-fg bg-info-soft border-info-line' },
}

function formatDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

export function AttemptTimeline({ attempts, selectedAId, selectedBId, onSelectA, onSelectB }) {
    if (!attempts || attempts.length === 0) {
        return (
            <div className="text-center text-xs text-text-disabled py-8">
                No attempts recorded yet.
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {attempts.map((a, i) => {
                const trig = TRIGGER_CONFIG[a.trigger] || TRIGGER_CONFIG.SUBMIT
                const isA = a.id === selectedAId
                const isB = a.id === selectedBId
                const aiScore = a.aiFeedbackSnapshot?.overallScore ?? null
                return (
                    <motion.div
                        key={a.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={cn(
                            'bg-surface-1 border rounded-xl p-4 transition-colors',
                            isA || isB ? 'border-brand-line ring-2 ring-brand-400/20' : 'border-border-default',
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-3 border border-border-default flex items-center justify-center text-xs font-bold text-text-primary">
                                #{a.attemptNumber}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className={cn('text-[10px] font-bold px-1.5 py-px rounded-full border flex items-center gap-1', trig.color)}>
                                        <span>{trig.icon}</span>
                                        {trig.label}
                                    </span>
                                    <span className="text-[10px] text-text-disabled">{formatDate(a.createdAt)}</span>
                                    {a.problemVersion != null && (
                                        <span className="text-[10px] text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-1.5 py-px">
                                            problem v{a.problemVersion}
                                        </span>
                                    )}
                                    <span className="text-[10px] font-semibold text-text-secondary">
                                        confidence {a.confidence}/5
                                    </span>
                                    {aiScore != null && (
                                        <span className="text-[10px] font-semibold text-brand-fg-soft bg-brand-soft border border-brand-line rounded-full px-1.5 py-px">
                                            AI {aiScore}/10
                                        </span>
                                    )}
                                </div>
                                {a.patterns?.length > 0 && (
                                    <p className="text-[11px] text-text-tertiary">
                                        {a.patterns.join(', ')}
                                    </p>
                                )}
                                {a.keyInsight && (
                                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                                        {a.keyInsight}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => onSelectA?.(a.id)}
                                    className={cn(
                                        'text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors',
                                        isA
                                            ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                                            : 'bg-surface-3 text-text-disabled border-border-default hover:border-brand-line',
                                    )}
                                >
                                    A
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onSelectB?.(a.id)}
                                    className={cn(
                                        'text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors',
                                        isB
                                            ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                                            : 'bg-surface-3 text-text-disabled border-border-default hover:border-brand-line',
                                    )}
                                >
                                    B
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}
