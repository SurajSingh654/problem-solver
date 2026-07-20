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
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, ArrowRight, RotateCcw, Columns, Rows, Bot, ChevronDown, Send, Trash2 } from 'lucide-react'
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
import WalkthroughPanel from '@components/curriculum/WalkthroughPanel'
import {
    useAttempt,
    useCurriculumReviewReady,
    useRevealReference,
    useRetryWalkthrough,
    useSubmitAttempt,
    useWalkthrough,
    useAssistLab,
} from '@hooks/useCurriculumLearn'
import { cn } from '@utils/cn'

// Feature-flag gate for the AI-narrated walkthrough. Server has a matching
// FEATURE_CURRICULUM_WALKTHROUGH; client uses the VITE_* mirror to decide
// whether to mount the useWalkthrough hook and swap the reveal modal body
// from raw-diff-first to walkthrough-first. Both flags default OFF for
// dark launch.
const WALKTHROUGH_ENABLED = import.meta.env.VITE_FEATURE_CURRICULUM_WALKTHROUGH === 'true'

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
function ReferenceDiffModal({
    language,
    userCode,
    referenceCode,
    onClose,
    onCloseAndEdit,
    walkthroughState = null,
    onWalkthroughRetry,
    walkthroughRetrying = false,
}) {
    const prefersReducedMotion = useReducedMotion()

    // Diff layout override — 'auto' uses the responsive matchMedia rule
    // inside ReferenceDiff; 'sideBySide' / 'inline' lock it. Local to the
    // modal so it resets on next open — this is a preference for THIS
    // reveal viewing, not a durable user setting.
    const [layout, setLayout] = useState('auto')

    // When the walkthrough is available, the diff is DEMOTED to an
    // opt-in toggle inside the modal (four-role review recommendation:
    // don't make the mechanical diff the primary artifact). Learners who
    // want the raw comparison can still get it — one click.
    const walkthroughAvailable = Boolean(walkthroughState)
    const [showRawDiff, setShowRawDiff] = useState(!walkthroughAvailable)
    useEffect(() => {
        // If the walkthrough state arrives after the modal opened (e.g.
        // fired on this reveal, still PENDING when modal mounted), collapse
        // the diff on first appearance so the walkthrough is the primary
        // artifact.
        if (walkthroughAvailable) setShowRawDiff(false)
    }, [walkthroughAvailable])

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
                <div className="p-5 border-b border-border-subtle flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-text-primary">
                            Reference solution
                        </h2>
                        <p className="text-xs text-text-tertiary mt-0.5">
                            Your submitted attempt on the left, one canonical
                            reference on the right. Different structure can still
                            be correct — read for insight, not conformance.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Layout toggle — Auto (responsive) is the default;
                            users on a wide viewport who prefer inline (or on
                            narrow who want to force side-by-side) can lock it.
                            State is modal-scoped so it resets on next open. */}
                        <div
                            role="radiogroup"
                            aria-label="Diff layout"
                            className="hidden sm:inline-flex items-center rounded-md border border-border-default bg-surface-2 p-0.5 text-[11px]"
                        >
                            {[
                                { key: 'auto', label: 'Auto' },
                                { key: 'sideBySide', label: 'Side-by-side', Icon: Columns },
                                { key: 'inline', label: 'Inline', Icon: Rows },
                            ].map((opt) => {
                                const active = layout === opt.key
                                const Icon = opt.Icon
                                return (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setLayout(opt.key)}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors',
                                            active
                                                ? 'bg-surface-1 text-text-primary shadow-sm'
                                                : 'text-text-tertiary hover:text-text-primary',
                                        )}
                                    >
                                        {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
                                        {opt.label}
                                    </button>
                                )
                            })}
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
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                    {walkthroughAvailable && (
                        <WalkthroughPanel
                            state={walkthroughState}
                            onRetry={onWalkthroughRetry}
                            retrying={walkthroughRetrying}
                            onOpenRawReference={
                                showRawDiff ? undefined : () => setShowRawDiff(true)
                            }
                        />
                    )}
                    {showRawDiff && (
                        <div>
                            {walkthroughAvailable && (
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest">
                                        Reference solution (raw)
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowRawDiff(false)}
                                        className="text-xs text-text-tertiary hover:text-text-primary underline underline-offset-2"
                                    >
                                        Hide raw diff
                                    </button>
                                </div>
                            )}
                            {/* Responsive height: on very short viewports (<600px, e.g.
                                mobile landscape) the fixed 520px diff would blow past
                                the viewport, hiding the modal footer. Clamp to
                                min(520px, 60vh) so the footer stays reachable. */}
                            <div className="h-[min(520px,60vh)]">
                                <ReferenceDiff
                                    language={language}
                                    userCode={userCode}
                                    referenceCode={referenceCode}
                                    layout={layout}
                                />
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-border-subtle flex items-center justify-end gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Close
                    </Button>
                    {onCloseAndEdit && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onCloseAndEdit}
                        >
                            Close and edit my solution
                        </Button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    )
}

// Animated phase strip for the PENDING state. The server exposes only
// two poll states (PENDING / REVIEWING / COMPLETED / ERROR), but the wait
// feels long without progress. Cycles three visual phases every ~1.6s so
// the learner sees SOMETHING happening. Purely cosmetic — the real state
// is the polled reviewStatus.
function ReviewProgressPhases({ status }) {
    const prefersReducedMotion = useReducedMotion()
    const [phase, setPhase] = useState(0)
    useEffect(() => {
        if (prefersReducedMotion) return
        const t = setInterval(() => setPhase((p) => (p + 1) % 3), 1600)
        return () => clearInterval(t)
    }, [prefersReducedMotion])

    const phases = [
        { label: 'Queued', hint: 'Your attempt is in the review queue.' },
        { label: 'Reviewing', hint: 'The AI reviewer is reading your code.' },
        { label: 'Finalizing', hint: 'Wrapping up the six-dimensional verdict.' },
    ]

    // If the server has flipped to REVIEWING, jump the animation past
    // "Queued". Doesn't force a full stop — the visual still cycles so
    // the learner sees motion.
    const anchored = status === 'REVIEWING' ? Math.max(phase, 1) : phase
    const current = phases[anchored]

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                {phases.map((p, i) => (
                    <div
                        key={p.label}
                        className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            i <= anchored ? 'bg-brand-500' : 'bg-surface-3',
                        )}
                        aria-hidden="true"
                    />
                ))}
            </div>
            <p className="text-xs text-text-secondary" aria-live="polite">
                <span className="font-semibold text-text-primary">{current.label}</span>
                {' — '}
                {current.hint}
            </p>
        </div>
    )
}

export default function ConceptLabTab({ concept, onGoToCheckIn }) {
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

    // Restore-on-refresh (2026-07-12): after submit, `clearDraft(labId)`
    // wipes the localStorage draft to avoid duplicate-submit ambiguity.
    // That means a page refresh lands with an empty editor even though
    // the submitted code exists on the server via `polledAttempt.code`.
    // Rehydrate the editor once per attempt id — fires exactly when the
    // polled attempt first loads for a given id. Guards:
    //   - Populate ONLY if the local draft is also empty. A non-empty
    //     draft means the user was mid-edit before refresh; we let their
    //     unsaved work win over the stale submitted snapshot.
    //   - Populate ONLY if the current editor state is empty. Prevents
    //     clobbering edits the user has already made post-restore.
    //   - Track the last populated id in a ref so a later user edit doesn't
    //     re-trigger population on the next poll tick.
    const populatedForAttemptRef = useRef(null)
    useEffect(() => {
        if (!polledAttempt?.id || !polledAttempt?.code) return
        if (populatedForAttemptRef.current === polledAttempt.id) return
        populatedForAttemptRef.current = polledAttempt.id
        const draftKey = `curriculum:lab:draft:${labId}`
        const hasDraft =
            typeof window !== 'undefined' &&
            Boolean(window.localStorage.getItem(draftKey))
        if (hasDraft) return
        setCode((prev) => (prev ? prev : polledAttempt.code))
    }, [polledAttempt?.id, polledAttempt?.code, labId])

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
    // `useRevealReference` invalidates conceptDetail (refreshes
    // concept.latestAttempt.revealedReferenceAt) but NOT the attempt
    // polling query — so polledAttempt.revealedReferenceAt lags one
    // reveal behind. Prefer whichever source has the stamp so the CTA
    // and meta strip flip immediately after handleReveal resolves.
    const revealedRefAt =
        polledAttempt?.revealedReferenceAt ??
        concept.latestAttempt?.revealedReferenceAt ??
        null
    const alreadyRevealed = Boolean(revealedRefAt)

    // Walkthrough plumbing (Phase R.1, feature-flagged). Enabled only when:
    //   - the client-side VITE flag is on,
    //   - we have an attempt id to key the query,
    //   - the attempt has already been revealed (nothing to fetch pre-reveal).
    // Mirrors the server's gate; the two must agree or we waste polls.
    const walkthroughEnabled = WALKTHROUGH_ENABLED && alreadyRevealed
    const walkthroughQuery = useWalkthrough(labId, attemptIdForPolling, {
        enabled: walkthroughEnabled,
    })
    const walkthroughState = walkthroughEnabled ? walkthroughQuery.data ?? null : null
    const retryWalkthrough = useRetryWalkthrough(labId, attemptIdForPolling)

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

    // ERROR-state resubmit: repopulate the editor with the failed
    // attempt's code so the learner doesn't lose their work when they
    // "try again". Clears the pending activeAttemptId so the next submit
    // creates a fresh attempt row.
    function handleResubmitFromError() {
        const failedCode = currentAttempt?.code ?? ''
        if (failedCode) {
            setCode(failedCode)
        }
        setActiveAttemptId(null)
    }

    // Close reveal modal AND scroll editor into view so the learner can
    // immediately try again with the reference fresh in mind. Doesn't wipe
    // the editor — their attempt.code is already there (or their post-
    // reveal edits).
    function handleCloseAndEdit() {
        setReferenceOpen(false)
        // Defer to next tick so the modal-exit animation starts before
        // we scroll; framer-motion needs one paint to begin the transition.
        requestAnimationFrame(() => {
            const editor = document.querySelector('[data-lab-editor-anchor]')
            editor?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
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

    const isCompleted = currentAttempt?.reviewStatus === 'COMPLETED'
    const isPendingReview =
        currentAttempt?.reviewStatus === 'PENDING' ||
        currentAttempt?.reviewStatus === 'REVIEWING'
    const isErrored = currentAttempt?.reviewStatus === 'ERROR'

    return (
        <div className="space-y-8">
            {/* Mastery framing banner — anchors the lab in the 5-step
                learn/teach loop. "Practice" (labs) is step 2 of 5;
                learners frequently miss that submit+reveal isn't the
                terminal step. Static, low-density, drops out on very
                narrow viewports if it competes with content. */}
            <div className="rounded-lg border border-brand-line bg-brand-soft px-4 py-2 flex items-center gap-2 text-xs text-brand-fg-soft">
                <span className="font-bold uppercase tracking-widest">Step 2 of 5</span>
                <span className="opacity-60">·</span>
                <span>Practice — apply the primer under a timebox, then get an AI review.</span>
            </div>

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
            <section className="space-y-3" data-lab-editor-anchor>
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

            {/* Lab Assistant ──────────────────────────────────────── */}
            <LabAssistant labId={labId} code={code} />

            {/* Attempt status / verdict — one section, three shapes:
                – no attempt yet           → empty prompt
                – PENDING / REVIEWING     → animated waiting card
                – ERROR                   → error card with resubmit
                – COMPLETED               → compact meta strip + full
                                            <CodeReviewResult> below
                Previously this was two stacked sections ("Latest attempt"
                + "Code review") with duplicated meta. Collapsed so the
                COMPLETED verdict is the visual centerpiece, not buried
                under a redundant summary card. */}
            {!currentAttempt && (
                <section className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        Review status
                    </h3>
                    <div className="border border-border-default bg-surface-1 rounded-xl p-4 text-sm text-text-tertiary italic">
                        No attempts yet — write some code above and submit
                        for review.
                    </div>
                </section>
            )}

            {isPendingReview && (
                <section className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        Review in progress
                    </h3>
                    <div className="border border-border-default bg-surface-1 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-mono text-text-secondary">
                                Attempt #{currentAttempt.attemptNumber}
                            </span>
                            <VerdictBadge verdict={currentAttempt.reviewStatus} />
                            <span className="text-xs text-text-tertiary ml-auto">
                                Submitted {new Date(currentAttempt.submittedAt).toLocaleTimeString()}
                            </span>
                        </div>
                        <ReviewProgressPhases status={currentAttempt.reviewStatus} />
                        <p className="text-[11px] text-text-tertiary">
                            You can navigate away — the review finishes in the background
                            and will be here when you come back.
                        </p>
                    </div>
                </section>
            )}

            {isErrored && (
                <section className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        Review failed
                    </h3>
                    <div className="border border-danger-line bg-danger-soft rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-mono text-danger-fg">
                                Attempt #{currentAttempt.attemptNumber}
                            </span>
                            <VerdictBadge verdict="ERROR" />
                            <span className="text-xs text-danger-fg opacity-70 ml-auto">
                                {new Date(currentAttempt.submittedAt).toLocaleTimeString()}
                            </span>
                        </div>
                        <p className="text-xs text-danger-fg leading-relaxed">
                            The AI reviewer didn&apos;t return a verdict — usually a transient
                            timeout. Your code is preserved. Restore it into the editor and
                            resubmit to get a fresh review.
                        </p>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleResubmitFromError}
                        >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            Restore code and try again
                        </Button>
                    </div>
                </section>
            )}

            {/* COMPLETED — compact meta strip + full CodeReviewResult ── */}
            {isCompleted && polledAttempt?.codeReview && (
                <section className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-text-tertiary">
                        <span className="font-mono">Attempt #{currentAttempt.attemptNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                            Reviewed{' '}
                            {new Date(currentAttempt.reviewedAt ?? currentAttempt.submittedAt).toLocaleString()}
                        </span>
                        {revealedRefAt && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>
                                    Reference revealed{' '}
                                    {new Date(revealedRefAt).toLocaleDateString()}
                                </span>
                            </>
                        )}
                    </div>
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

            {/* Ready-for-check-in CTA — surfaces the next mastery step once
                the reference is unlocked. Reveal is the ceremony that says
                "you've extracted the lab's lesson"; the check-in is where
                it becomes a mastery signal. Without this hop learners
                often think the tab is finished at reveal. */}
            {alreadyRevealed && onGoToCheckIn && (
                <section className="rounded-xl border border-success-line bg-success-soft p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-success-fg">
                            Ready for the check-in
                        </p>
                        <p className="text-xs text-success-fg opacity-90 leading-relaxed mt-0.5">
                            You&apos;ve seen the reference — the check-in is where this
                            becomes a mastery signal. Three short questions, then this
                            concept is done.
                        </p>
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onGoToCheckIn}
                    >
                        Go to check-in
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                </section>
            )}

            {/* Reference-diff modal ────────────────────────────────── */}
            <AnimatePresence>
                {referenceOpen && referenceSolution != null && (
                    <ReferenceDiffModal
                        language={language}
                        userCode={submittedUserCode}
                        referenceCode={referenceSolution}
                        onClose={() => setReferenceOpen(false)}
                        onCloseAndEdit={handleCloseAndEdit}
                        walkthroughState={walkthroughState}
                        onWalkthroughRetry={() => retryWalkthrough.mutate()}
                        walkthroughRetrying={retryWalkthrough.isPending}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// ============================================================================
// LabAssistant — Socratic AI chat panel
// ============================================================================
// Collapsible panel below the editor. Sends user message + current code to
// the server; AI responds with hints and questions — never the answer.
// History is ephemeral (no DB), capped at the last 6 exchanges.

const MAX_HISTORY = 12 // 6 user + 6 assistant turns

function LabAssistant({ labId, code }) {
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [history, setHistory] = useState([]) // [{role, content}]
    const bottomRef = useRef(null)
    const assist = useAssistLab(labId)

    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history, open])

    async function handleSend(e) {
        e?.preventDefault()
        const msg = input.trim()
        if (!msg) return

        const newHistory = [...history, { role: 'user', content: msg }]
        setHistory(newHistory)
        setInput('')

        const historyForServer = newHistory.slice(-MAX_HISTORY)

        try {
            const reply = await assist.mutateAsync({
                message: msg,
                code,
                history: historyForServer.slice(0, -1), // exclude the message we just added
            })
            setHistory((h) => [...h, { role: 'assistant', content: reply }])
        } catch {
            setHistory((h) => [
                ...h,
                { role: 'assistant', content: 'The assistant is temporarily unavailable. Try again shortly.' },
            ])
        }
    }

    return (
        <div className={cn(
            'rounded-2xl border transition-colors',
            open ? 'border-brand-line bg-surface-2' : 'border-border-subtle bg-surface-1',
        )}>
            {/* Toggle header */}
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
                <span className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-brand-500" />
                    Lab Assistant
                    <span className="text-xs font-normal text-text-tertiary">
                        — stuck? ask for a hint
                    </span>
                </span>
                <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
            </button>

            {/* Panel body */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="lab-assistant-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3">
                            {/* Disclaimer */}
                            {history.length === 0 && (
                                <p className="text-xs text-text-tertiary border border-border-subtle rounded-lg p-3 bg-surface-1">
                                    The assistant will ask guiding questions and point out what to think about —
                                    it will <strong>never</strong> write code or reveal the answer. Productive struggle is the point.
                                </p>
                            )}

                            {/* Message history */}
                            {history.length > 0 && (
                                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                    {history.map((turn, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                'flex gap-2 items-start',
                                                turn.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                                            )}
                                        >
                                            <div className={cn(
                                                'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-1',
                                                turn.role === 'user'
                                                    ? 'bg-brand-soft text-brand-fg-soft'
                                                    : 'bg-surface-3 text-text-tertiary',
                                            )}>
                                                {turn.role === 'user' ? 'You' : 'AI'}
                                            </div>
                                            <div className={cn(
                                                'rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words',
                                                turn.role === 'user'
                                                    ? 'bg-brand-soft text-brand-fg-soft'
                                                    : 'bg-surface-3 text-text-primary',
                                            )}>
                                                {turn.content}
                                            </div>
                                        </div>
                                    ))}
                                    {assist.isPending && (
                                        <div className="flex gap-2 items-center">
                                            <div className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-3 text-text-tertiary">AI</div>
                                            <div className="text-xs text-text-tertiary animate-pulse">Thinking…</div>
                                        </div>
                                    )}
                                    <div ref={bottomRef} />
                                </div>
                            )}

                            {/* Input */}
                            <form onSubmit={handleSend} className="flex gap-2 items-end">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSend()
                                        }
                                    }}
                                    placeholder="What are you stuck on? (Enter to send, Shift+Enter for newline)"
                                    rows={2}
                                    maxLength={2000}
                                    disabled={assist.isPending}
                                    className={cn(
                                        'flex-1 resize-none rounded-lg border border-border-default bg-surface-1',
                                        'px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary',
                                        'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
                                        'disabled:opacity-50',
                                    )}
                                />
                                <div className="flex flex-col gap-1">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="sm"
                                        disabled={!input.trim() || assist.isPending}
                                        className="shrink-0"
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                    {history.length > 0 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setHistory([])}
                                            title="Clear conversation"
                                            className="shrink-0 text-text-tertiary"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
