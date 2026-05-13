// ============================================================================
// TeachingFlagModal — flag a session for admin review
// ============================================================================
//
// Reason dropdown (predefined categories) + freeform textarea. The
// server doesn't enforce category-vs-text — it stores the full reason
// string. We prepend the category to the textarea on submit so admins
// see "[off-topic] {reason text}" in the queue.
// ============================================================================
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useFlagTeachingSession } from '@hooks/useTeaching'
import { useFocusTrap } from '@hooks/useFocusTrap'
import { Spinner } from '@components/ui/Spinner'

const CATEGORIES = [
    { id: 'off_topic', label: 'Off-topic — host taught something else' },
    { id: 'inappropriate', label: 'Inappropriate content / language' },
    { id: 'spam', label: 'Spam or duplicate session' },
    { id: 'low_quality', label: 'Low quality / no real teaching happened' },
    { id: 'other', label: 'Other (describe below)' },
]

export default function TeachingFlagModal({ sessionId, onClose }) {
    const [category, setCategory] = useState(CATEGORIES[0].id)
    const [reason, setReason] = useState('')
    const trapRef = useFocusTrap(true, onClose)
    const flag = useFlagTeachingSession()

    function onSubmit(e) {
        e.preventDefault()
        const trimmed = reason.trim()
        if (trimmed.length < 3) return
        const fullReason = `[${category}] ${trimmed}`.slice(0, 500)
        flag.mutate(
            { id: sessionId, data: { reason: fullReason } },
            { onSuccess: () => onClose() },
        )
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="flag-title"
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
                    <h2 id="flag-title" className="text-base font-bold text-text-primary">
                        Flag this session
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1">
                        Team admins review every flag. The host isn't notified directly
                        — admins can dismiss the flag or cancel the session.
                    </p>
                </header>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                            Category
                        </label>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full bg-surface-2 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-line"
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                            Details <span className="text-danger-fg">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={4}
                            minLength={3}
                            maxLength={500}
                            placeholder="What's wrong? Be specific — admins use this to decide."
                            className="w-full bg-surface-2 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line resize-y"
                            required
                        />
                        <p className="text-[10px] text-text-disabled mt-1">
                            {reason.length}/500
                        </p>
                    </div>

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
                            disabled={reason.trim().length < 3 || flag.isPending}
                            className="flex items-center gap-2 bg-warning-soft text-warning-fg border border-warning-line rounded-lg px-4 py-2 text-xs font-bold hover:bg-warning-soft/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {flag.isPending && <Spinner size="sm" />}
                            Submit flag
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    )
}
