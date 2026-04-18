import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAIReviewSolution } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'

// ── Score badge ────────────────────────────────────────
function ScoreBadge({ score }) {
    const color =
        score >= 8 ? 'text-success bg-success/12 border-success/25' :
            score >= 6 ? 'text-brand-300 bg-brand-400/12 border-brand-400/25' :
                score >= 4 ? 'text-warning bg-warning/12 border-warning/25' :
                    'text-danger bg-danger/12 border-danger/25'

    const label =
        score >= 8 ? 'Excellent' :
            score >= 6 ? 'Good' :
                score >= 4 ? 'Fair' : 'Needs Work'

    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full border',
            'text-sm font-bold', color
        )}>
            <span className="text-lg font-extrabold font-mono">{score}</span>
            <span className="text-xs">/10 · {label}</span>
        </div>
    )
}

// ── Feedback section ───────────────────────────────────
function FeedbackList({ icon, title, items, color }) {
    if (!items?.length) return null
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span>{icon}</span>
                <span className={cn('text-xs font-bold uppercase tracking-widest', color)}>
                    {title}
                </span>
            </div>
            <div className="space-y-1.5">
                {items.map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-start gap-2 text-sm text-text-secondary leading-relaxed"
                    >
                        <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', {
                            'bg-success': color === 'text-success',
                            'bg-warning': color === 'text-warning',
                            'bg-danger': color === 'text-danger',
                            'bg-brand-400': color === 'text-brand-300',
                        })} />
                        <span>{item}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

// ── Main component ─────────────────────────────────────
export function AIReviewCard({ solutionId, existingReview }) {
    const [review, setReview] = useState(existingReview || null)
    const [expanded, setExpanded] = useState(!!existingReview)
    const aiReview = useAIReviewSolution()

    async function handleReview() {
        const res = await aiReview.mutateAsync({ solutionId })
        setReview(res.data.data)
        setExpanded(true)
    }

    // Parse existing review if it's a string
    const parsed = typeof review === 'string' ? JSON.parse(review) : review

    if (!parsed) {
        return (
            <div className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-400/15 flex items-center
                            justify-center text-lg flex-shrink-0">
                            🤖
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-text-primary">AI Review</h3>
                            <p className="text-xs text-text-tertiary">
                                Get instant feedback on your solution from AI
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={aiReview.isPending}
                        onClick={handleReview}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        {aiReview.isPending ? 'Analyzing...' : 'Get AI Review'}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-brand-400/5 border border-brand-400/20 rounded-2xl overflow-hidden"
        >
            {/* Header */}
            <div
                className="flex items-center justify-between p-5 cursor-pointer
                   hover:bg-brand-400/8 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-400/15 flex items-center
                          justify-center text-lg flex-shrink-0">
                        🤖
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary">AI Review</h3>
                        {/* In the header after "AI Review" title */}
                        <p className="text-xs text-text-tertiary">
                            {parsed.ragUsed
                                ? `Compared with ${parsed.teammateCount} teammate solution${parsed.teammateCount !== 1 ? 's' : ''}`
                                : 'Powered by GPT-4o-mini'
                            }
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <ScoreBadge score={parsed.overallScore} />
                    <motion.div
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-text-tertiary"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </motion.div>
                </div>
            </div>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 space-y-5 border-t border-brand-400/15">

                            {/* Strengths */}
                            <div className="pt-4">
                                <FeedbackList
                                    icon="✅"
                                    title="Strengths"
                                    items={parsed.strengths}
                                    color="text-success"
                                />
                            </div>

                            {/* Gaps */}
                            <FeedbackList
                                icon="⚠️"
                                title="Gaps"
                                items={parsed.gaps}
                                color="text-warning"
                            />

                            {/* Improvement */}
                            {parsed.improvement && (
                                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span>💡</span>
                                        <span className="text-xs font-bold text-brand-300 uppercase tracking-widest">
                                            Key Improvement
                                        </span>
                                    </div>
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                        {parsed.improvement}
                                    </p>
                                </div>
                            )}

                            {/* Interview tip */}
                            {parsed.interviewTip && (
                                <div className="bg-info/5 border border-info/20 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span>🎯</span>
                                        <span className="text-xs font-bold text-info uppercase tracking-widest">
                                            Interview Tip
                                        </span>
                                    </div>
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                        {parsed.interviewTip}
                                    </p>
                                </div>
                            )}

                            {/* Complexity check */}
                            {parsed.complexityCheck && (
                                <div className="flex gap-3">
                                    {[
                                        {
                                            label: 'Time',
                                            correct: parsed.complexityCheck.timeCorrect,
                                            note: parsed.complexityCheck.timeNote,
                                        },
                                        {
                                            label: 'Space',
                                            correct: parsed.complexityCheck.spaceCorrect,
                                            note: parsed.complexityCheck.spaceNote,
                                        },
                                    ].map(c => (
                                        <div key={c.label}
                                            className={cn(
                                                'flex-1 rounded-xl p-3 border',
                                                c.correct
                                                    ? 'bg-success/5 border-success/20'
                                                    : 'bg-danger/5 border-danger/20'
                                            )}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm">
                                                    {c.correct ? '✅' : '❌'}
                                                </span>
                                                <span className="text-xs font-bold text-text-primary">
                                                    {c.label} Complexity
                                                </span>
                                            </div>
                                            {c.note && (
                                                <p className="text-xs text-text-tertiary">{c.note}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Re-review button */}
                            <div className="flex justify-end pt-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    loading={aiReview.isPending}
                                    onClick={handleReview}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                                    </svg>
                                    Re-analyze
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}