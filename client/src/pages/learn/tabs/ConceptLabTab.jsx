// ============================================================================
// ConceptLabTab — minimal lab surface (W4.T7)
// ============================================================================
//
// This is intentionally a *shell* — the Monaco editor + submit flow lands
// in Week 5. For W4 the tab surfaces:
//
//   - The lab task markdown + timebox + language + expectedArtifacts
//   - A disabled "Open Lab (Week 5)" CTA (tooltip explains why)
//   - The user's latest attempt (id / attemptNumber / submittedAt / verdict)
//     — pulled from `concept.latestAttempt` on the concept detail payload.
//     No code body, no full history: those come with the Monaco flow in W5.
//   - A "Reveal reference solution" button gated by the same rules the
//     server enforces. The client can only pre-check the verdict — the
//     server also checks `codeReview.nextStep === READY_FOR_REFERENCE`,
//     which the concept-detail response does NOT expose. So the button
//     may be enabled and still hit a 403 REVEAL_BLOCKED_NEXT_STEP; the
//     toast surfaces the reason. This is fine — click-then-block is an
//     accepted trade for a smaller API surface here.
//
// On success the reveal call returns the referenceSolution string; we
// render it in an inline modal (framer AnimatePresence + backdrop click
// = close). Not extracted to a shared Modal component because this is
// the only reveal surface in the app.
// ============================================================================
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { Button } from '@components/ui/Button'
import { EmptyState } from '@components/ui/EmptyState'
import { VerdictBadge } from '@components/curriculum'
import { useRevealReference } from '@hooks/useCurriculumLearn'
import { cn } from '@utils/cn'

// Client-side gate for the reveal button. Mirrors part of the server
// contract in curriculum.controller.js#revealReference — we can check
// verdict + reviewStatus here, but NOT nextStep (server-only field).
//
// Returns { canReveal, message } — message is rendered next to the
// disabled button so the user understands why it's locked.
function computeRevealGate(attempt) {
    if (!attempt) {
        return {
            canReveal: false,
            message: 'Submit a lab attempt first — the reference is protected until you struggle with it.',
        }
    }
    if (attempt.reviewStatus !== 'COMPLETED') {
        return {
            canReveal: false,
            message: 'Waiting for review to complete…',
        }
    }
    const verdict = attempt.codeReviewVerdict
    if (verdict !== 'STRONG' && verdict !== 'ADEQUATE') {
        return {
            canReveal: false,
            message: `Iterate on your solution — current verdict is ${verdict ?? 'unknown'}.`,
        }
    }
    // Verdict is good. nextStep may still block server-side (client can't
    // see it in the concept detail payload); we let the user click and
    // rely on the server 403 + toast to explain.
    return { canReveal: true, message: null }
}

// Reference-solution modal — plain textual code block (no syntax high-
// lighting — this is a "here's the answer" reveal, not editable).
// AnimatePresence lives in the caller so exit animations run.
function ReferenceModal({ code, onClose }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
            onClick={onClose}
            role="presentation"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Reference solution"
                className="bg-surface-1 border border-border-default rounded-2xl w-full max-w-3xl shadow-2xl max-h-[80vh] flex flex-col"
            >
                <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-text-primary">
                            Reference solution
                        </h2>
                        <p className="text-xs text-text-tertiary mt-0.5">
                            One canonical answer — your own solution may look different and still be correct.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1 rounded hover:bg-surface-2 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto">
                    <pre className="bg-surface-2 p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap">
                        <code>{code}</code>
                    </pre>
                </div>
            </motion.div>
        </motion.div>
    )
}

export default function ConceptLabTab({ concept }) {
    const [referenceOpen, setReferenceOpen] = useState(false)
    const [reference, setReference] = useState(null)
    const reveal = useRevealReference(concept.lab?.id, concept.slug)

    if (!concept.lab) {
        return (
            <EmptyState
                icon="🧪"
                title="No lab attached to this concept"
                description="This concept doesn't have a lab yet — the primer + check-in flow still work, and a lab may be added by the author later."
            />
        )
    }

    const lab = concept.lab
    const attempt = concept.latestAttempt
    const gate = computeRevealGate(attempt)
    const alreadyRevealed = Boolean(attempt?.revealedReferenceAt)

    async function handleReveal() {
        try {
            const result = await reveal.mutateAsync()
            const code = result?.referenceSolution ?? ''
            setReference(code)
            setReferenceOpen(true)
        } catch {
            // useToastingMutation surfaces the error toast (with the
            // server's message). Nothing extra to do here.
        }
    }

    return (
        <div className="space-y-8">
            {/* Header — title + meta chips + open-editor CTA ─────── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <h2 className="text-xl font-bold text-text-primary">
                        {lab.title}
                    </h2>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                        {lab.timeboxMinutes != null && (
                            <span className="px-2 py-0.5 rounded-full border border-border-default bg-surface-2 text-text-secondary font-mono">
                                ~{lab.timeboxMinutes} min
                            </span>
                        )}
                        {lab.language && (
                            <span className="px-2 py-0.5 rounded-full border border-border-default bg-surface-2 text-text-secondary font-mono uppercase">
                                {lab.language}
                            </span>
                        )}
                        <VerdictBadge verdict={lab.status} />
                    </div>
                </div>
                <div className="shrink-0">
                    <Button
                        variant="primary"
                        size="md"
                        disabled
                        title="Monaco editor coming in Phase 1 Week 5"
                    >
                        Open Lab (Week 5)
                    </Button>
                </div>
            </div>

            {/* Task markdown ──────────────────────────────────────── */}
            <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Task
                </h3>
                <div className="bg-surface-1 border border-border-default rounded-xl p-4">
                    <MarkdownRenderer content={lab.taskMarkdown ?? ''} size="sm" />
                </div>
            </section>

            {/* Expected artifacts ─────────────────────────────────── */}
            {Array.isArray(lab.expectedArtifacts) && lab.expectedArtifacts.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        Expected artifacts
                    </h3>
                    <ul className="list-disc pl-5 text-sm text-text-secondary space-y-1">
                        {lab.expectedArtifacts.map((a, i) => (
                            <li key={i}>
                                {typeof a === 'string'
                                    ? a
                                    : a?.name ?? JSON.stringify(a)}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Attempt history (latest only for W4) ───────────────── */}
            <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Your attempts
                </h3>
                {attempt ? (
                    <div className="border border-border-default bg-surface-1 rounded-xl p-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-mono text-text-secondary">
                                Attempt #{attempt.attemptNumber}
                            </span>
                            <VerdictBadge verdict={attempt.reviewStatus} />
                            {attempt.codeReviewVerdict && (
                                <VerdictBadge verdict={attempt.codeReviewVerdict} />
                            )}
                            <span className="text-xs text-text-tertiary ml-auto">
                                {new Date(attempt.submittedAt).toLocaleString()}
                            </span>
                        </div>
                        {attempt.revealedReferenceAt && (
                            <p className="mt-2 text-xs text-text-tertiary">
                                Reference revealed on{' '}
                                {new Date(attempt.revealedReferenceAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="border border-border-default bg-surface-1 rounded-xl p-4 text-sm text-text-tertiary italic">
                        No attempts yet — once the Monaco editor ships in Week 5
                        you'll be able to submit here.
                    </div>
                )}
            </section>

            {/* Reveal-reference button + gate messaging ───────────── */}
            <section className="border-t border-border-default pt-6 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        variant="secondary"
                        size="md"
                        disabled={!gate.canReveal || reveal.isPending}
                        onClick={handleReveal}
                    >
                        {reveal.isPending
                            ? 'Unlocking…'
                            : alreadyRevealed
                                ? 'View reference solution'
                                : 'Reveal reference solution'}
                    </Button>
                    {!gate.canReveal && (
                        <span
                            className={cn(
                                'text-xs leading-relaxed text-text-secondary',
                                'flex items-center gap-1.5',
                            )}
                        >
                            <span aria-hidden="true">🔒</span>
                            {gate.message}
                        </span>
                    )}
                </div>
                <p className="text-[11px] text-text-tertiary max-w-lg leading-relaxed">
                    Struggle first, then compare. Revealing the reference is
                    logged — it's an honest signal, not a shortcut.
                </p>
            </section>

            {/* Reference modal ────────────────────────────────────── */}
            <AnimatePresence>
                {referenceOpen && (
                    <ReferenceModal
                        code={reference ?? ''}
                        onClose={() => setReferenceOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
