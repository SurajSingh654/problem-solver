// ============================================================================
// ConceptLabTab — Monaco lab surface (W5.T4)
// ============================================================================
//
// Rewired from the W4 shell to the full attempt loop:
//
//   - Task markdown + timebox + language chips (unchanged from W4)
//   - MonacoLabEditor bound to a local `code` state, seeded from the
//     autosave draft in localStorage on mount (falls back to "" — the
//     concept detail payload deliberately withholds `starterCode` behind
//     the same reveal gate that protects `referenceSolution`, so we have
//     nothing scaffold-like to show pre-reveal). Draft is cleared on
//     successful submit.
//   - Submit → useSubmitAttempt → 202 { attemptId }. We track the id and
//     mount useAttempt(labId, attemptId) which polls every 3s until the
//     server flips reviewStatus to COMPLETED / ERROR. In parallel we open
//     a WS via useCurriculumReviewReady — either channel invalidates the
//     attempt query so the poll's next tick pulls the fresh row.
//   - When reviewStatus === "COMPLETED" and attempt.codeReview is present
//     we render <CodeReviewResult review={attempt.codeReview} />.
//   - The reveal button remains but now handleReveal stashes the returned
//     referenceSolution into local state. When BOTH revealedReferenceAt
//     is stamped AND we have the reference string in memory, we render
//     <ReferenceDiff> in a modal. On a page refresh after reveal, the
//     revealedReferenceAt persists but the reference string does NOT (it's
//     only returned by the reveal endpoint). The button then acts as
//     "View reference solution" and re-calls the idempotent endpoint.
//
// CRITICAL invariant (from the four-role PO review of the T4 plan):
// <ReferenceDiff userCode={...}> MUST bind to the SUBMITTED attempt.code,
// not the live editor `code` state. If a user edits the editor after
// submitting and then reveals, they should see their submitted snapshot
// diffed against the reference — not their in-progress edits. The polled
// getAttempt endpoint returns `attempt.code`; concept.latestAttempt does
// NOT include it, so `useAttempt` is the only source of truth here.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { Button } from '@components/ui/Button'
import { EmptyState } from '@components/ui/EmptyState'
import { VerdictBadge } from '@components/curriculum'
import MonacoLabEditor, {
    loadDraft,
    clearDraft,
} from '@components/curriculum/MonacoLabEditor'
import CodeReviewResult from '@components/curriculum/CodeReviewResult'
import ReferenceDiff from '@components/curriculum/ReferenceDiff'
import {
    useAttempt,
    useCurriculumReviewReady,
    useRevealReference,
    useSubmitAttempt,
} from '@hooks/useCurriculumLearn'
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
    // Client mirrors the second server-side gate on `nextStep` so the
    // learner doesn't hit the enabled-looking Reveal button only to get a
    // 403 REVEAL_BLOCKED_NEXT_STEP. The polled `getAttempt` returns the
    // full `codeReview` JSON with `nextStep` since Phase A.
    const nextStep = attempt.codeReview?.nextStep
    if (nextStep && nextStep !== 'READY_FOR_REFERENCE') {
        return {
            canReveal: false,
            message: `Reviewer's next step is ${nextStep} — follow that before revealing.`,
        }
    }
    return { canReveal: true, message: null }
}

// Reference-diff modal — hosts the Monaco DiffEditor so the user sees
// their SUBMITTED code (attempt.code, NOT the live editor state) side-by-
// side with the reference. AnimatePresence lives in the caller so exit
// animations run.
function ReferenceDiffModal({ language, userCode, referenceCode, onClose }) {
    const prefersReducedMotion = useReducedMotion()

    // ESC-to-close + return-focus-on-close. Captures the element that had
    // focus before the modal opened and restores it on unmount so the
    // keyboard user lands back on the "Reveal reference" trigger button
    // instead of on `<body>`. Effect runs once because this component
    // only mounts when the modal is open.
    useEffect(() => {
        const previouslyFocused = document.activeElement
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose?.()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus()
            }
        }
    }, [onClose])

    // Reduced-motion strips the scale+translate variants and shortens the
    // fade to zero. framer-motion doesn't respect the media query by
    // default. Vestibular-sensitive users get a snap-in modal.
    const innerInitial = prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: 0.96, y: 8 }
    const innerAnimate = prefersReducedMotion
        ? { opacity: 1 }
        : { opacity: 1, scale: 1, y: 0 }
    const innerExit = prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: 0.96, y: 8 }
    const innerTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.15 }

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
                initial={innerInitial}
                animate={innerAnimate}
                exit={innerExit}
                transition={innerTransition}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Reference solution diff"
                className="bg-surface-1 border border-border-default rounded-2xl w-full max-w-6xl shadow-2xl max-h-[90vh] flex flex-col"
            >
                <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-text-primary">
                            Reference solution
                        </h2>
                        <p className="text-xs text-text-tertiary mt-0.5">
                            Your submitted attempt on the left, one canonical
                            reference on the right. Different structure can still
                            be correct — read for insight, not conformance.
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
                <div className="flex-1 overflow-auto p-4">
                    <ReferenceDiff
                        language={language}
                        userCode={userCode}
                        referenceCode={referenceCode}
                    />
                </div>
            </motion.div>
        </motion.div>
    )
}

export default function ConceptLabTab({ concept }) {
    const lab = concept.lab
    const labId = lab?.id
    const language = lab?.language ?? 'JAVA'
    const conceptSlug = concept.slug

    // Latest attempt id — either the one we just submitted this session
    // (activeAttemptId) or, on cold-refresh, the id embedded in
    // concept.latestAttempt. If the persisted one is already terminal the
    // useAttempt hook fires once and stops polling.
    const [activeAttemptId, setActiveAttemptId] = useState(null)
    const latestAttemptId = concept.latestAttempt?.id ?? null
    const attemptIdForPolling = activeAttemptId ?? latestAttemptId

    // Editor state — seed from localStorage draft. starterCode is not on
    // the learner concept payload (see file header) so the fallback is "".
    // Using an initializer function keeps this a single mount-time read;
    // subsequent labId changes are rare (route-level remount) but if they
    // happen we still want to reload the right draft — see the effect
    // below.
    const [code, setCode] = useState(() => loadDraft(labId) ?? '')

    // If the user navigates between concepts (labId changes without a full
    // page remount — e.g. via TopicDetailPage links), reload the draft for
    // the new lab. This is idempotent when labId is stable.
    useEffect(() => {
        setCode(loadDraft(labId) ?? '')
    }, [labId])

    // Reveal-reference plumbing.
    const [referenceOpen, setReferenceOpen] = useState(false)
    const [referenceSolution, setReferenceSolution] = useState(null)
    const reveal = useRevealReference(labId, conceptSlug)

    // Submit + poll + WS.
    const submit = useSubmitAttempt(labId)
    const attemptQuery = useAttempt(labId, attemptIdForPolling)
    const polledAttempt = attemptQuery.data ?? null

    // Subscribe to curriculum:review_ready ONLY while we have a non-
    // terminal attempt in flight. The hook internally no-ops on a null
    // attemptId, so this guard is a small optimisation — it stops us from
    // opening a socket for already-COMPLETED historical attempts on
    // page load.
    const wsAttemptId =
        polledAttempt && polledAttempt.reviewStatus !== 'COMPLETED' &&
            polledAttempt.reviewStatus !== 'ERROR'
            ? attemptIdForPolling
            : null
    useCurriculumReviewReady(wsAttemptId, { conceptSlug, labId })

    // The "current attempt" surface uses the polled row when we have one
    // (has code + codeReview) and falls back to the concept-detail summary
    // otherwise (fresh page load, before the first getAttempt tick).
    const currentAttempt = polledAttempt ?? concept.latestAttempt ?? null
    const gate = computeRevealGate(currentAttempt)
    const alreadyRevealed = Boolean(currentAttempt?.revealedReferenceAt)

    const canSubmit = useMemo(
        () => code.trim().length > 0 && !submit.isPending,
        [code, submit.isPending],
    )

    async function handleSubmit() {
        try {
            const result = await submit.mutateAsync({
                code,
                conceptSlug,
            })
            // Clear the draft unconditionally on a 2xx response. Previous
            // logic was gated on `attemptId` presence — a partial or
            // malformed 2xx (network truncation, server hiccup) would leave
            // the draft in localStorage while the submit had succeeded,
            // producing duplicate submissions on next edit.
            clearDraft(labId)
            const nextId = result?.attemptId
            if (nextId) {
                setActiveAttemptId(nextId)
            }
        } catch {
            // useToastingMutation surfaces the error toast.
        }
    }

    async function handleReveal() {
        try {
            const result = await reveal.mutateAsync()
            const refCode = result?.referenceSolution ?? ''
            setReferenceSolution(refCode)
            setReferenceOpen(true)
        } catch {
            // useToastingMutation surfaces the error toast.
        }
    }

    if (!lab) {
        return (
            <EmptyState
                icon="🧪"
                title="No lab attached to this concept"
                description="This concept doesn't have a lab yet — the primer + check-in flow still work, and a lab may be added by the author later."
            />
        )
    }

    // The submitted snapshot fed to ReferenceDiff. MUST be attempt.code
    // (the persisted snapshot), NOT the live editor state — see the file
    // header for the reasoning.
    const submittedUserCode = polledAttempt?.code ?? ''

    return (
        <div className="space-y-8">
            {/* Header — title + meta chips ─────────────────────────── */}
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

            {/* Monaco editor + submit ─────────────────────────────── */}
            <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Your solution
                </h3>
                <MonacoLabEditor
                    labId={labId}
                    language={language}
                    starterCode=""
                    value={code}
                    onChange={setCode}
                    disabled={submit.isPending}
                />
                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleSubmit}
                        loading={submit.isPending}
                        disabled={!canSubmit}
                    >
                        Submit for review
                    </Button>
                    {code.trim().length === 0 && (
                        <span className="text-xs text-text-tertiary">
                            Write some code first.
                        </span>
                    )}
                </div>
            </section>

            {/* Current attempt summary ─────────────────────────────── */}
            <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Latest attempt
                </h3>
                {currentAttempt ? (
                    <div className="border border-border-default bg-surface-1 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-mono text-text-secondary">
                                Attempt #{currentAttempt.attemptNumber}
                            </span>
                            <VerdictBadge verdict={currentAttempt.reviewStatus} />
                            {currentAttempt.codeReviewVerdict && (
                                <VerdictBadge
                                    verdict={currentAttempt.codeReviewVerdict}
                                />
                            )}
                            <span className="text-xs text-text-tertiary ml-auto">
                                {new Date(currentAttempt.submittedAt).toLocaleString()}
                            </span>
                        </div>
                        {currentAttempt.reviewStatus === 'PENDING' && (
                            <p className="text-xs text-text-tertiary">
                                Waiting for AI review — this normally takes a
                                few seconds. You can navigate away; the review
                                will finish in the background.
                            </p>
                        )}
                        {currentAttempt.reviewStatus === 'ERROR' && (
                            <p className="text-xs text-danger-fg">
                                Review failed to complete. Try resubmitting.
                            </p>
                        )}
                        {currentAttempt.reviewedAt && (
                            <p className="text-[11px] text-text-tertiary">
                                Reviewed on{' '}
                                {new Date(currentAttempt.reviewedAt).toLocaleString()}
                            </p>
                        )}
                        {currentAttempt.revealedReferenceAt && (
                            <p className="text-[11px] text-text-tertiary">
                                Reference revealed on{' '}
                                {new Date(currentAttempt.revealedReferenceAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="border border-border-default bg-surface-1 rounded-xl p-4 text-sm text-text-tertiary italic">
                        No attempts yet — write some code above and submit
                        for review.
                    </div>
                )}
            </section>

            {/* Structured code-review result ──────────────────────── */}
            {polledAttempt?.reviewStatus === 'COMPLETED' &&
                polledAttempt.codeReview && (
                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                            Code review
                        </h3>
                        <CodeReviewResult
                            review={polledAttempt.codeReview}
                            usedFallback={polledAttempt.usedFallback === true}
                        />
                    </section>
                )}

            {/* Reveal-reference button + gate messaging ───────────── */}
            <section className="border-t border-border-default pt-6 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <Button
                        variant="secondary"
                        size="md"
                        disabled={!gate.canReveal || reveal.isPending}
                        onClick={handleReveal}
                        aria-describedby={!gate.canReveal ? 'reveal-gate-msg' : undefined}
                    >
                        {reveal.isPending
                            ? 'Unlocking…'
                            : alreadyRevealed
                                ? 'View reference solution'
                                : 'Reveal reference solution'}
                    </Button>
                    {!gate.canReveal && (
                        <span
                            id="reveal-gate-msg"
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
                    logged — it&apos;s an honest signal, not a shortcut.
                </p>
            </section>

            {/* Reference-diff modal ────────────────────────────────── */}
            <AnimatePresence>
                {referenceOpen && referenceSolution != null && (
                    <ReferenceDiffModal
                        language={language}
                        userCode={submittedUserCode}
                        referenceCode={referenceSolution}
                        onClose={() => setReferenceOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
