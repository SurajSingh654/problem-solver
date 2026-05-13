// ============================================================================
// TeachingRatingForm — peer rating modal for COMPLETED sessions
// ============================================================================
//
// 1-5 star picker + optional comment + "I learned something" checkbox.
// Submitted ratings flow into the host's D7 (Teaching Contributions)
// dimension — see stats.controller.js::get6DReport.
//
// Server-side guards:
//   • Caller must have a TeachingAttendee row.
//   • Host cannot rate themselves.
//   • One rating per (session, rater) — duplicate returns 409.
// The component shows the appropriate error banner if any of these fire.
// ============================================================================
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useRateTeachingSession } from '@hooks/useTeaching'
import { useFocusTrap } from '@hooks/useFocusTrap'
import { Spinner } from '@components/ui/Spinner'

export default function TeachingRatingForm({ sessionId, onClose }) {
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')
    const [peerLearned, setPeerLearned] = useState(true)
    const trapRef = useFocusTrap(true, onClose)
    const rate = useRateTeachingSession()

    function onSubmit(e) {
        e.preventDefault()
        if (rating < 1) return
        rate.mutate(
            {
                id: sessionId,
                data: {
                    rating,
                    comment: comment.trim() || undefined,
                    peerLearned,
                },
            },
            { onSuccess: () => onClose() },
        )
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rate-title"
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                ref={trapRef}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface-1 border border-border-default rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl"
            >
                <header>
                    <h2 id="rate-title" className="text-base font-bold text-text-primary">
                        Rate this teaching session
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1">
                        Your rating feeds the host's Teaching Contributions on the
                        Intelligence Report. Be honest and specific.
                    </p>
                </header>

                <form onSubmit={onSubmit} className="space-y-4">
                    {/* Star picker */}
                    <div>
                        <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                            Rating <span className="text-danger-fg">*</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setRating(n)}
                                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                                    className={
                                        n <= rating
                                            ? 'text-3xl text-warning-fg'
                                            : 'text-3xl text-text-disabled hover:text-warning-fg/60 transition-colors'
                                    }
                                >
                                    {n <= rating ? '★' : '☆'}
                                </button>
                            ))}
                            <span className="ml-2 text-xs text-text-tertiary">
                                {rating > 0 ? `${rating}/5` : 'Pick a rating'}
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                            Comment <span className="text-text-disabled">(optional)</span>
                        </label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="What worked? What could the host improve?"
                            className="w-full bg-surface-2 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line resize-y"
                        />
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={peerLearned}
                            onChange={(e) => setPeerLearned(e.target.checked)}
                            className="mt-0.5 accent-brand-line"
                        />
                        <span className="text-xs text-text-secondary">
                            <span className="font-bold text-text-primary">
                                I learned something
                            </span>
                            <span className="block text-text-tertiary text-[11px]">
                                Boosts the host's Teaching Contributions score.
                            </span>
                        </span>
                    </label>

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs font-bold text-text-tertiary hover:text-text-primary px-3 py-2 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={rating < 1 || rate.isPending}
                            className="flex items-center gap-2 bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-4 py-2 text-xs font-bold hover:bg-brand-soft/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {rate.isPending && <Spinner size="sm" />}
                            Submit rating
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    )
}
