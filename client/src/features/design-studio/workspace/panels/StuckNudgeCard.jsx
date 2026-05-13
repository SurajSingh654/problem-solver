import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { getRubricBullets } from '../../constants/phaseRubric'

// ══════════════════════════════════════════════════════════════════════
// StuckNudgeCard — proactive hint when the user has gone idle for a phase
// ══════════════════════════════════════════════════════════════════════
//
// Shows ONLY when useStuckDetector has confirmed all four idle signals.
// Renders inside the right rail above the AI Coach panel (visually:
// before any active response). Two affordances:
//
//   • "Ask for a hint" — fires the existing `guide` coach call with a
//     `stuckContext` payload, so the LLM prioritises rubric items the
//     candidate hasn't touched.
//   • "Dismiss" — suppresses the nudge for the rest of the session on
//     this phase. Other phases nudge independently.
//
// The rubric bullets shown are the SAME ones the LLM uses to focus its
// `guide` response. Trusted teaching content; not user-generated.
// ══════════════════════════════════════════════════════════════════════
export default function StuckNudgeCard({
    designType,
    phaseId,
    phaseLabel,
    onAskForHint,
    onDismiss,
    isAsking,
}) {
    const bullets = getRubricBullets(designType, phaseId)
    if (!bullets.length) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="border-b border-border-subtle bg-warning-soft/40"
        >
            <div className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-2">
                    <span className="text-base flex-shrink-0">💡</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-warning-fg leading-snug">
                            Stuck on {phaseLabel || 'this phase'}?
                        </p>
                        <p className="text-[10px] text-text-tertiary leading-snug">
                            A strong answer here usually addresses:
                        </p>
                    </div>
                </div>
                <ul className="space-y-1 ml-6">
                    {bullets.slice(0, 3).map((b, i) => (
                        <li
                            key={i}
                            className="text-[11px] text-text-secondary flex items-start gap-1.5 leading-snug"
                        >
                            <span className="text-warning-fg flex-shrink-0 mt-px">·</span>
                            {b}
                        </li>
                    ))}
                </ul>
                <div className="flex items-center gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onAskForHint}
                        disabled={isAsking}
                        className={cn(
                            'text-[10px] font-bold px-2.5 py-1 rounded-md border',
                            'bg-warning-soft text-warning-fg border-warning-line',
                            'hover:bg-warning-soft transition-colors',
                            'disabled:opacity-50',
                        )}
                    >
                        {isAsking ? 'Thinking…' : 'Ask for a hint'}
                    </button>
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-md border bg-surface-3 text-text-tertiary border-border-default hover:border-brand-line transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </motion.div>
    )
}
