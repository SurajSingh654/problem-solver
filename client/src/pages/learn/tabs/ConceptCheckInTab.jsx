// ============================================================================
// ConceptCheckInTab — 3-question grader with calibration surface (W4.T7)
// ============================================================================
//
// The check-in is the concept's "did you internalize it" gate. Server rules
// (see curriculum.controller.js#submitCheckIn):
//   - Requires a completed lab attempt with codeReviewVerdict IN
//     (STRONG, ADEQUATE) — otherwise 403 CHECKIN_LOCKED.
//   - Runs the CHECK_IN validator (AI_MODEL_FAST) and persists a
//     ConceptCheckIn row. Falls back to a deterministic "PARTIAL" verdict
//     on AI timeout (server sets usedFallback: true).
//
// Client mirrors the eligibility rule locally — if the user isn't eligible
// we render a locked state with a tab-switch to Lab; no reason to let the
// user type answers we'll reject.
//
// After a successful submission we hold the FRESH response in local state
// (verdict + perQuestion feedback + calibrationDelta + encouragement + the
// usedFallback flag). Persisted history isn't in the concept detail response
// today — the mastery.signals array carries the LAST checkin's summary
// (source: "checkin", evidence: { aiVerdict, calibrationDelta }), which we
// use as a fallback on tab remount so the user isn't staring at a blank form
// after a page refresh.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { VerdictBadge } from '@components/curriculum'
import { useSubmitCheckIn } from '@hooks/useCurriculumLearn'
import { cn } from '@utils/cn'

// ── Check-in draft persistence ─────────────────────────────────────
// Parallel to MonacoLabEditor.jsx's `loadDraft` / `clearDraft` for the
// Lab tab. The Check-in form has four fields (recall / apply / build
// answers + preConfidence) that were previously lost on page refresh —
// user types 3 answers, refreshes accidentally, work is gone. Now we
// autosave on every change to localStorage, hydrate on mount, clear on
// successful submit, and clear-all on logout (shared-workstation
// defense — same pattern as lab drafts).
//
// Shape v1: `{ recallAnswer, applyAnswer, buildAnswer, preConfidence }`.
// Key: `curriculum:checkin:draft:${slug}`.
const CHECKIN_DRAFT_KEY_PREFIX = 'curriculum:checkin:draft:'
const draftKeyFor = (slug) => `${CHECKIN_DRAFT_KEY_PREFIX}${slug}`

function loadCheckInDraft(slug) {
    if (typeof window === 'undefined' || !slug) return null
    try {
        const raw = window.localStorage.getItem(draftKeyFor(slug))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        // Defensive shape check — a partial write or a schema change
        // would land here as a malformed blob. Return null so mount
        // falls back to defaults rather than crashing.
        if (!parsed || typeof parsed !== 'object') return null
        return parsed
    } catch {
        return null
    }
}

function saveCheckInDraft(slug, draft) {
    if (typeof window === 'undefined' || !slug) return
    try {
        window.localStorage.setItem(draftKeyFor(slug), JSON.stringify(draft))
    } catch {
        // Storage quota — silent drop, drafts are not source of truth.
    }
}

function clearCheckInDraft(slug) {
    if (typeof window === 'undefined' || !slug) return
    try {
        window.localStorage.removeItem(draftKeyFor(slug))
    } catch {
        /* no-op */
    }
}

// Called from useAuthStore's logout handler. Prevents a
// shared-workstation draft leak where the next user opens the same
// concept URL and sees the prior user's in-progress check-in answers.
// eslint-disable-next-line react-refresh/only-export-components
export function clearAllCheckInDrafts() {
    if (typeof window === 'undefined') return
    try {
        const doomed = []
        for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i)
            if (key?.startsWith(CHECKIN_DRAFT_KEY_PREFIX)) doomed.push(key)
        }
        doomed.forEach((k) => window.localStorage.removeItem(k))
    } catch {
        /* no-op */
    }
}

// Eligibility mirrors submitCheckIn's server-side gate. Client rejects
// early so the user doesn't type 3 answers only to see a 403 toast.
function isCheckInEligible(attempt) {
    if (!attempt) return false
    if (attempt.reviewStatus !== 'COMPLETED') return false
    const v = attempt.codeReviewVerdict
    return v === 'STRONG' || v === 'ADEQUATE'
}

// Pull the last "checkin" source entry off the mastery signals array. Shape
// is `{ source, value, evidence: { aiVerdict, calibrationDelta, checkInId }, at }`.
// Returns null if the signals array is missing or has no checkin entry —
// which is the common case for first-time submitters.
function lastCheckInSignal(mastery) {
    const signals = Array.isArray(mastery?.signals) ? mastery.signals : []
    // Signals are appended chronologically; walk backwards for the newest.
    for (let i = signals.length - 1; i >= 0; i -= 1) {
        const s = signals[i]
        if (s && s.source === 'checkin') return s
    }
    return null
}

// 1-5 preConfidence radio. Deliberately a segmented control rather than a
// slider — sliders lie about precision on the mobile touch target, and the
// scale is 5 discrete choices anyway.
function ConfidencePicker({ value, onChange }) {
    return (
        <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Pre-answer confidence
            </label>
            <p className="text-[11px] text-text-tertiary leading-relaxed max-w-lg">
                Before you look at your answers below — how confident are you they'll
                land? The gap between this and the AI verdict is your calibration
                delta.
            </p>
            <div
                role="radiogroup"
                aria-label="Confidence 1 to 5"
                className="flex gap-1"
            >
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={value === n}
                        onClick={() => onChange(n)}
                        className={cn(
                            'flex-1 max-w-[64px] py-2 rounded-lg text-sm font-bold border transition-colors',
                            value === n
                                ? 'bg-brand-soft text-brand-fg-soft border-brand-500'
                                : 'bg-surface-2 text-text-secondary border-border-default hover:bg-surface-3',
                        )}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <div className="flex justify-between text-[10px] text-text-tertiary font-mono">
                <span>1 — total guess</span>
                <span>5 — nailed it</span>
            </div>
        </div>
    )
}

// Bar visualization for calibrationDelta ∈ [0, 1]. 0 = perfect calibration,
// 1 = maximally miscalibrated. Colored bands mirror D10 Verification's
// tolerance tiers (green ≤ 0.20, amber ≤ 0.40, red > 0.40).
function CalibrationBar({ delta }) {
    if (typeof delta !== 'number' || !Number.isFinite(delta)) return null
    const clamped = Math.max(0, Math.min(1, delta))
    const pct = Math.round(clamped * 100)
    const band =
        clamped <= 0.20 ? 'success'
        : clamped <= 0.40 ? 'warning'
        : 'danger'
    const fill =
        band === 'success' ? 'bg-success-fg'
        : band === 'warning' ? 'bg-warning-fg'
        : 'bg-danger-fg'
    const label =
        band === 'success' ? 'Well-calibrated'
        : band === 'warning' ? 'Some drift — worth noticing'
        : 'Miscalibrated — check your self-model'
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                <span className="font-mono">Calibration delta</span>
                <span className="font-mono">{clamped.toFixed(2)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-3 overflow-hidden">
                <div
                    className={cn('absolute inset-y-0 left-0 rounded-full transition-all', fill)}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <p className="text-[11px] text-text-secondary">{label}</p>
        </div>
    )
}

// Renders per-question AI feedback if the fresh response provided it. Falls
// back to nothing when we only have the mastery-signals stub (that only
// carries overallVerdict + calibrationDelta, no per-Q text).
function PerQuestionFeedback({ perQuestion }) {
    if (!perQuestion) return null
    const rows = [
        { key: 'recall', label: 'Recall', row: perQuestion.recall },
        { key: 'apply',  label: 'Apply',  row: perQuestion.apply  },
        { key: 'build',  label: 'Build',  row: perQuestion.build  },
    ]
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {rows.map(({ key, label, row }) => (
                <div
                    key={key}
                    className="bg-surface-1 border border-border-default rounded-xl p-3 space-y-2"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                            {label}
                        </span>
                        <VerdictBadge verdict={row?.verdict ?? 'UNKNOWN'} />
                    </div>
                    {row?.feedback && (
                        <p className="text-xs text-text-secondary leading-relaxed">
                            {row.feedback}
                        </p>
                    )}
                </div>
            ))}
        </div>
    )
}

export default function ConceptCheckInTab({ concept, onGoToLab }) {
    const submit = useSubmitCheckIn(concept.slug)
    const eligible = isCheckInEligible(concept.latestAttempt)

    // Fresh submission result — sits on top of the persisted signal fallback.
    // Shape: { checkIn: { aiVerdict, aiFeedback, calibrationDelta }, usedFallback }.
    const [freshResult, setFreshResult] = useState(null)

    // Persisted-signal fallback so a page reload still shows the last verdict
    // + delta. Falls back to null when no checkin signal exists yet.
    const persisted = useMemo(() => lastCheckInSignal(concept.mastery), [concept.mastery])

    // Prefer fresh (just submitted) over persisted (last signal).
    const displayVerdict =
        freshResult?.checkIn?.aiVerdict
        ?? persisted?.evidence?.aiVerdict
        ?? null
    const displayDelta =
        freshResult?.checkIn?.calibrationDelta
        ?? persisted?.evidence?.calibrationDelta
        ?? null
    const displayPerQuestion = freshResult?.checkIn?.aiFeedback?.perQuestion ?? null
    const displayEncouragement = freshResult?.checkIn?.aiFeedback?.encouragement ?? null

    // Form state — hydrated from localStorage on mount so a page refresh
    // mid-answer doesn't wipe the user's work. See draft helpers above.
    // Initializer function keeps this a single mount-time read; the
    // effect below picks up subsequent slug changes (rare — route-level
    // remount typically re-mounts the whole component).
    const conceptSlug = concept.slug
    const [recallAnswer, setRecallAnswer] = useState(
        () => loadCheckInDraft(conceptSlug)?.recallAnswer ?? '',
    )
    const [applyAnswer,  setApplyAnswer]  = useState(
        () => loadCheckInDraft(conceptSlug)?.applyAnswer ?? '',
    )
    const [buildAnswer,  setBuildAnswer]  = useState(
        () => loadCheckInDraft(conceptSlug)?.buildAnswer ?? '',
    )
    const [preConfidence, setPreConfidence] = useState(
        () => loadCheckInDraft(conceptSlug)?.preConfidence ?? 3,
    )

    // If the caller navigates between concepts without a full remount
    // (e.g. via TopicDetailPage links), reload the draft for the new
    // slug. Idempotent when conceptSlug is stable.
    useEffect(() => {
        const draft = loadCheckInDraft(conceptSlug)
        setRecallAnswer(draft?.recallAnswer ?? '')
        setApplyAnswer(draft?.applyAnswer ?? '')
        setBuildAnswer(draft?.buildAnswer ?? '')
        setPreConfidence(draft?.preConfidence ?? 3)
    }, [conceptSlug])

    // Autosave on every change. No debounce — the fields are small and
    // low-frequency (user typing prose, not code); a single localStorage
    // write per keystroke is cheap. Cleared on successful submit below.
    useEffect(() => {
        saveCheckInDraft(conceptSlug, {
            recallAnswer,
            applyAnswer,
            buildAnswer,
            preConfidence,
        })
    }, [conceptSlug, recallAnswer, applyAnswer, buildAnswer, preConfidence])

    const canSubmit =
        eligible &&
        recallAnswer.trim().length >= 1 &&
        applyAnswer.trim().length >= 1 &&
        buildAnswer.trim().length >= 1 &&
        !submit.isPending

    async function handleSubmit(e) {
        e.preventDefault()
        if (!canSubmit) return
        try {
            const result = await submit.mutateAsync({
                recallAnswer: recallAnswer.trim(),
                applyAnswer:  applyAnswer.trim(),
                buildAnswer:  buildAnswer.trim(),
                preConfidence,
            })
            setFreshResult(result)
            // Clear form so re-submitting isn't a click-away from an accidental
            // dupe. Confidence resets to neutral 3.
            setRecallAnswer('')
            setApplyAnswer('')
            setBuildAnswer('')
            setPreConfidence(3)
            // Wipe the localStorage draft so a refresh after submit doesn't
            // repopulate the fields — the just-cleared form is the intended
            // post-submit state.
            clearCheckInDraft(conceptSlug)
        } catch {
            // useToastingMutation surfaces the error with the server message.
        }
    }

    // Not eligible — render locked state + tab-switch CTA to Lab.
    if (!eligible) {
        return (
            <div className="max-w-2xl mx-auto py-10 space-y-5 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-2 border border-border-default flex items-center justify-center text-3xl">
                    🔒
                </div>
                <div className="space-y-1.5">
                    <h2 className="text-lg font-bold text-text-primary">
                        Check-in locked
                    </h2>
                    <p className="text-sm text-text-tertiary leading-relaxed max-w-md mx-auto">
                        Complete the lab first — the check-in unlocks once your lab
                        attempt lands at STRONG or ADEQUATE. The order matters:
                        recall lands harder after you've written the code.
                    </p>
                </div>
                <Button variant="primary" size="md" onClick={onGoToLab}>
                    Go to lab →
                </Button>
            </div>
        )
    }

    // Labels from concept.expectedQuestions[0..2], with generic fallbacks.
    const expected = Array.isArray(concept.expectedQuestions)
        ? concept.expectedQuestions
        : []
    const qLabel = (i, fallback) =>
        (typeof expected[i] === 'string' && expected[i].trim().length > 0)
            ? expected[i]
            : fallback

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
            {/* ── Form column ─────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1.5">
                    <h2 className="text-xl font-bold text-text-primary">
                        3-question check-in
                    </h2>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        Three prompts — recall (state it), apply (use it on a scenario),
                        build (explain a variant from scratch). Answer without looking
                        back at the primer.
                    </p>
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="checkin-recall"
                        className="block text-xs font-bold text-text-primary"
                    >
                        Q1 — Recall
                    </label>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        {qLabel(0, 'State the concept in your own words.')}
                    </p>
                    <textarea
                        id="checkin-recall"
                        value={recallAnswer}
                        onChange={(e) => setRecallAnswer(e.target.value)}
                        maxLength={10_000}
                        rows={4}
                        className="w-full bg-surface-1 border border-border-default rounded-lg p-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-500 focus:outline-none transition-colors font-sans leading-relaxed"
                        placeholder="Answer without re-reading the primer…"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="checkin-apply"
                        className="block text-xs font-bold text-text-primary"
                    >
                        Q2 — Apply
                    </label>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        {qLabel(1, 'Apply the concept to a concrete scenario.')}
                    </p>
                    <textarea
                        id="checkin-apply"
                        value={applyAnswer}
                        onChange={(e) => setApplyAnswer(e.target.value)}
                        maxLength={10_000}
                        rows={4}
                        className="w-full bg-surface-1 border border-border-default rounded-lg p-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-500 focus:outline-none transition-colors font-sans leading-relaxed"
                        placeholder="Walk through your reasoning…"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="checkin-build"
                        className="block text-xs font-bold text-text-primary"
                    >
                        Q3 — Build
                    </label>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        {qLabel(2, 'Build a small extension or variant from scratch.')}
                    </p>
                    <textarea
                        id="checkin-build"
                        value={buildAnswer}
                        onChange={(e) => setBuildAnswer(e.target.value)}
                        maxLength={10_000}
                        rows={5}
                        className="w-full bg-surface-1 border border-border-default rounded-lg p-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-500 focus:outline-none transition-colors font-mono leading-relaxed"
                        placeholder="Code snippet, pseudocode, or narrative explanation…"
                    />
                </div>

                <ConfidencePicker value={preConfidence} onChange={setPreConfidence} />

                <div className="pt-2 flex items-center gap-3 flex-wrap">
                    <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={!canSubmit}
                    >
                        {submit.isPending ? 'Grading…' : 'Submit check-in'}
                    </Button>
                    <p className="text-[11px] text-text-tertiary leading-relaxed max-w-sm">
                        The AI grades each answer separately then combines them. Times
                        out at ~2s — a conservative "PARTIAL" fallback is used if the
                        model is slow.
                    </p>
                </div>
            </form>

            {/* ── Result column ───────────────────────────────────── */}
            <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Latest verdict
                </h3>

                {displayVerdict ? (
                    <motion.div
                        key={(freshResult?.checkIn?.id ?? persisted?.at ?? 'result')}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4"
                    >
                        <div className="bg-surface-1 border border-border-default rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <VerdictBadge verdict={displayVerdict} />
                                {freshResult?.usedFallback && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-warning-soft text-warning-fg border-warning-line">
                                        AI fallback
                                    </span>
                                )}
                            </div>
                            {displayEncouragement && (
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {displayEncouragement}
                                </p>
                            )}
                            {typeof displayDelta === 'number' && (
                                <CalibrationBar delta={displayDelta} />
                            )}
                        </div>

                        {displayPerQuestion && (
                            <PerQuestionFeedback perQuestion={displayPerQuestion} />
                        )}

                        {!freshResult && persisted && (
                            <p className="text-[11px] text-text-tertiary leading-relaxed">
                                Showing your most recent submission. Submit again to get
                                fresh per-question feedback.
                            </p>
                        )}
                    </motion.div>
                ) : (
                    <div className="bg-surface-1 border border-border-default rounded-xl p-4 text-sm text-text-tertiary italic">
                        No check-in submissions yet — your verdict + calibration
                        will show up here after you submit.
                    </div>
                )}
            </aside>
        </div>
    )
}
