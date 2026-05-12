import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { useAICoach } from '@hooks/useDesignStudio'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'

// ══════════════════════════════════════════════════════════════════════════
// AI COACH SECTION — rail variant
// ══════════════════════════════════════════════════════════════════════════
// Replaces the old hidden-below-the-fold AICoachingBar + AIResponsePanel
// pair. In the new right-rail layout this section is pinned at the top of
// the rail and is ALWAYS visible — the single most important discovery fix
// of the rebuild.
//
// Structure (top to bottom):
//   1. Section header (labeled clearly so users know what this is)
//   2. Three mode buttons, full-width stacked: Validate / Stuck / Teach
//   3. Teach free-text input (appears only when Teach is clicked)
//   4. AI response area — scrollable, dismissible. Shows an empty-state
//      prompt when nothing has been asked yet so the feature is
//      self-documenting.
// ══════════════════════════════════════════════════════════════════════════
export default function AICoachSection({
    sessionId,
    phaseId,
    response,
    onResponse,
    onDismiss,
    isReadOnly = false,
}) {
    const askCoach = useAICoach()
    const [teachQuery, setTeachQuery] = useState('')
    const [showTeachInput, setShowTeachInput] = useState(false)

    async function handleAsk(mode) {
        if (mode === 'teach' && !teachQuery.trim()) {
            toast.error('Type what you want to learn')
            return
        }
        try {
            const res = await askCoach.mutateAsync({
                sessionId,
                mode,
                phaseId,
                userQuery: mode === 'teach' ? teachQuery.trim() : '',
            })
            onResponse(res.data.data.coaching)
            if (mode === 'teach') {
                setTeachQuery('')
                setShowTeachInput(false)
            }
        } catch {
            /* handled by hook */
        }
    }

    const verdictConfig = {
        on_track: { label: 'On Track', color: 'text-success-fg bg-success-soft border-success-line' },
        strong: { label: 'Strong', color: 'text-success-fg bg-success-soft border-success-line' },
        needs_work: { label: 'Needs Work', color: 'text-warning-fg bg-warning-soft border-warning-line' },
    }
    const verdictInfo = response?.verdict ? verdictConfig[response.verdict] : null

    return (
        <section className="flex flex-col min-h-0">
            {/* ── Section header ───────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-surface-2/40">
                <div className="flex items-center gap-2">
                    <span className="text-base">🤖</span>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">
                        AI Coach
                    </h3>
                </div>
                {askCoach.isPending && <Spinner size="sm" />}
            </div>

            {/* ── Button stack (full-width, vertical) ──────────────────── */}
            {!isReadOnly && (
                <div className="p-3 space-y-2 border-b border-border-subtle">
                    <button
                        type="button"
                        onClick={() => handleAsk('validate')}
                        disabled={askCoach.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-success-soft border-success-line text-success-fg hover:bg-success-soft transition-colors disabled:opacity-50 text-left"
                    >
                        <span className="text-sm">✓</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-tight">Am I on track?</p>
                            <p className="text-[10px] text-text-tertiary leading-tight">
                                Validate this phase
                            </p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAsk('guide')}
                        disabled={askCoach.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-warning-soft border-warning-line text-warning-fg hover:bg-warning-soft transition-colors disabled:opacity-50 text-left"
                    >
                        <span className="text-sm">?</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-tight">I&apos;m stuck</p>
                            <p className="text-[10px] text-text-tertiary leading-tight">
                                Get guiding questions
                            </p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowTeachInput((v) => !v)}
                        disabled={askCoach.isPending}
                        className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 text-left',
                            showTeachInput
                                ? 'bg-info-soft border-info-line text-info-fg'
                                : 'bg-info-soft border-info-line text-info-fg hover:bg-info-soft'
                        )}
                    >
                        <span className="text-sm">📚</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-tight">Teach me…</p>
                            <p className="text-[10px] text-text-tertiary leading-tight">
                                Explain a concept
                            </p>
                        </div>
                    </button>

                    <AnimatePresence>
                        {showTeachInput && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="flex gap-1.5 pt-1">
                                    <input
                                        type="text"
                                        value={teachQuery}
                                        onChange={(e) => setTeachQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAsk('teach')
                                        }}
                                        placeholder="e.g. consistent hashing"
                                        className="flex-1 bg-surface-3 border border-border-strong rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-400"
                                    />
                                    <Button size="sm" variant="primary" onClick={() => handleAsk('teach')}>
                                        Ask
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Response area (scrollable) ───────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {!response ? (
                    <div className="text-center py-6 px-2">
                        <div className="text-3xl mb-2 opacity-60">💬</div>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {isReadOnly
                                ? 'This session is read-only. The coach is unavailable.'
                                : 'Click a button above to get feedback on this phase, a hint when stuck, or a concept explained.'}
                        </p>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        {/* Verdict pill + dismiss */}
                        <div className="flex items-start justify-between gap-2">
                            {verdictInfo ? (
                                <span
                                    className={cn(
                                        'text-[10px] font-bold px-2 py-px rounded-full border',
                                        verdictInfo.color
                                    )}
                                >
                                    {verdictInfo.label}
                                </span>
                            ) : (
                                <span />
                            )}
                            <button
                                type="button"
                                onClick={onDismiss}
                                className="text-text-disabled hover:text-text-primary flex-shrink-0"
                                aria-label="Dismiss AI response"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* Main response text */}
                        {response.response && (
                            <p className="text-xs text-text-secondary leading-relaxed">
                                {response.response}
                            </p>
                        )}

                        {/* validate mode */}
                        {response.specificStrength && (
                            <div className="bg-success-soft border border-success-line rounded-lg p-2.5">
                                <p className="text-[10px] font-bold text-success-fg uppercase tracking-widest mb-1">
                                    Strength
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.specificStrength}
                                </p>
                            </div>
                        )}
                        {response.specificGap && (
                            <div className="bg-warning-soft border border-warning-line rounded-lg p-2.5">
                                <p className="text-[10px] font-bold text-warning-fg uppercase tracking-widest mb-1">
                                    Gap
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.specificGap}
                                </p>
                            </div>
                        )}

                        {/* guide mode */}
                        {response.guidingQuestions?.length > 0 && (
                            <div className="space-y-1.5">
                                {response.guidingQuestions.map((q, i) => (
                                    <p
                                        key={i}
                                        className="text-xs text-text-secondary flex items-start gap-2 leading-relaxed"
                                    >
                                        <span className="text-brand-fg-soft flex-shrink-0 font-bold">
                                            →
                                        </span>
                                        {q}
                                    </p>
                                ))}
                            </div>
                        )}
                        {response.thinkAbout && (
                            <p className="text-[11px] text-text-tertiary leading-relaxed italic border-t border-border-subtle pt-2">
                                Think about: {response.thinkAbout}
                            </p>
                        )}

                        {/* teach mode */}
                        {response.conceptExplanation && (
                            <div className="bg-info-soft border border-info-line rounded-lg p-2.5">
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.conceptExplanation}
                                </p>
                            </div>
                        )}
                        {response.exampleInContext && (
                            <p className="text-[11px] text-text-tertiary leading-relaxed italic">
                                In your design: {response.exampleInContext}
                            </p>
                        )}
                        {response.relatedDecision && (
                            <div className="border-t border-border-subtle pt-2">
                                <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest mb-1">
                                    This helps you decide
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.relatedDecision}
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </section>
    )
}
