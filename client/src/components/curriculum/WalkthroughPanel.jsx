// ============================================================================
// WalkthroughPanel — AI-narrated per-dimension reveal walkthrough
// ============================================================================
//
// Renders the CODE_WALKTHROUGH validator payload (see server/src/services/
// ai.schemas.js::codeWalkthroughSchema). Replaces the Monaco DiffEditor as
// the PRIMARY reveal artifact — the raw diff is kept behind an opt-in
// toggle inside the modal.
//
// State machine (fed from useWalkthrough hook):
//   PENDING     → dimension-label skeleton + shimmer + ~20s expectation
//   COMPLETED   → top-3 dims + "Show all N" expander + approachSummary +
//                 keyTakeaway
//   ERROR       → retry button that calls useRetryWalkthrough
//   NOT_STARTED → nothing (pre-reveal; parent won't mount this)
//
// Accessibility:
//   - aria-live="polite" on the status wrapper so screen-readers announce
//     the PENDING → COMPLETED transition.
//   - useReducedMotion strips the shimmer animation for vestibular-
//     sensitive users.
//   - The "Show all N" expander is a real <button>, not a div-onClick.
// ============================================================================
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, RotateCcw, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Button } from '@components/ui/Button'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

const DIM_LABELS = {
    correctness: 'Correctness',
    conceptApplication: 'Concept application',
    designQuality: 'Design quality',
    idiomaticStyle: 'Idiomatic style',
    robustness: 'Robustness',
    testing: 'Testing',
}

// Which dims render first when the AI returns more than 3. Priority order
// picked to match the review's own reading order — correctness first
// (nothing else matters if it's wrong), then concept/design (the biggest
// tradeoff surface), then style/robustness/testing.
const DIM_PRIORITY = [
    'correctness',
    'conceptApplication',
    'designQuality',
    'idiomaticStyle',
    'robustness',
    'testing',
]

function pickTopDims(dimensions, count = 3) {
    const byPriority = [...dimensions].sort((a, b) => {
        const ai = DIM_PRIORITY.indexOf(a.dim)
        const bi = DIM_PRIORITY.indexOf(b.dim)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return byPriority.slice(0, count)
}

function DimBlock({ block }) {
    return (
        <div className="rounded-lg border border-border-default bg-surface-1 p-4 space-y-3">
            <h4 className="text-sm font-bold text-text-primary">
                {DIM_LABELS[block.dim] ?? block.dim}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ApproachBlock
                    heading="Your approach"
                    prose={block.yourApproach}
                    lineRef={block.yourApproachLineRef}
                    tone="user"
                />
                <ApproachBlock
                    heading="Reference approach"
                    prose={block.referenceApproach}
                    lineRef={block.referenceApproachLineRef}
                    tone="reference"
                />
            </div>
            <div className="rounded-md border border-brand-line bg-brand-soft p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-fg-soft mb-1">
                    Tradeoff
                </p>
                <p className="text-sm text-text-primary leading-relaxed">
                    {block.tradeoff}
                </p>
            </div>
            {(block.whenReferenceIsBetter || block.whenYoursIsBetter) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {block.whenYoursIsBetter && (
                        <div className="rounded border border-border-default bg-surface-2 p-2">
                            <span className="font-semibold text-text-primary">When yours wins:</span>{' '}
                            <span className="text-text-secondary">{block.whenYoursIsBetter}</span>
                        </div>
                    )}
                    {block.whenReferenceIsBetter && (
                        <div className="rounded border border-border-default bg-surface-2 p-2">
                            <span className="font-semibold text-text-primary">When the reference wins:</span>{' '}
                            <span className="text-text-secondary">{block.whenReferenceIsBetter}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ApproachBlock({ heading, prose, lineRef, tone }) {
    return (
        <div
            className={cn(
                'rounded-md border p-3',
                tone === 'user'
                    ? 'border-border-default bg-surface-2'
                    : 'border-border-default bg-surface-1',
            )}
        >
            <div className="flex items-baseline gap-2 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                    {heading}
                </p>
                {lineRef && (
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
                        {lineRef}
                    </span>
                )}
            </div>
            <p className="text-sm text-text-primary leading-relaxed">{prose}</p>
        </div>
    )
}

function PendingSkeleton() {
    const prefersReducedMotion = useReducedMotion()
    const shimmer = prefersReducedMotion
        ? {}
        : {
              animate: { opacity: [0.55, 0.95, 0.55] },
              transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
          }
    // Three placeholder blocks so the panel has the same visual weight as
    // the COMPLETED render — prevents the modal from jumping in size when
    // the walkthrough lands.
    return (
        <div className="space-y-4" aria-live="polite" aria-busy="true">
            <div className="rounded-lg border border-brand-line bg-brand-soft p-4 flex items-start gap-3">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-brand-fg-soft" aria-hidden="true" />
                <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-brand-fg-soft">
                        Generating walkthrough…
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-0.5">
                        The AI is reading your code alongside the reference to
                        surface the real tradeoffs. Usually takes ~20 seconds.
                        You can leave this open or come back later — the
                        walkthrough will be here when it's ready.
                    </p>
                </div>
            </div>
            {['correctness', 'conceptApplication', 'designQuality'].map((dim) => (
                <motion.div
                    key={dim}
                    {...shimmer}
                    className="rounded-lg border border-border-default bg-surface-1 p-4 space-y-3"
                >
                    <div className="h-4 w-40 rounded bg-surface-3" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-md border border-border-default bg-surface-2 p-3 space-y-1.5">
                            <div className="h-2.5 w-20 rounded bg-surface-3" />
                            <div className="h-3 w-full rounded bg-surface-3" />
                            <div className="h-3 w-5/6 rounded bg-surface-3" />
                        </div>
                        <div className="rounded-md border border-border-default bg-surface-1 p-3 space-y-1.5">
                            <div className="h-2.5 w-24 rounded bg-surface-3" />
                            <div className="h-3 w-full rounded bg-surface-3" />
                            <div className="h-3 w-5/6 rounded bg-surface-3" />
                        </div>
                    </div>
                    <div className="rounded-md border border-brand-line bg-brand-soft p-3 space-y-1.5">
                        <div className="h-2.5 w-16 rounded bg-brand-line" />
                        <div className="h-3 w-full rounded bg-brand-line" />
                    </div>
                </motion.div>
            ))}
        </div>
    )
}

function ErrorState({ onRetry, retrying }) {
    return (
        <div
            aria-live="polite"
            className="rounded-lg border border-danger-line bg-danger-soft p-4 flex flex-col gap-3"
        >
            <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-danger-fg" aria-hidden="true" />
                <div className="flex-1">
                    <p className="text-sm font-semibold text-danger-fg">
                        Walkthrough failed to generate
                    </p>
                    <p className="text-xs text-danger-fg opacity-90 leading-relaxed mt-0.5">
                        The AI reviewer didn&apos;t return a comparison — usually a
                        transient issue. Your reveal is preserved. Retry to get
                        a fresh walkthrough.
                    </p>
                </div>
            </div>
            {onRetry && (
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onRetry}
                    loading={retrying}
                    disabled={retrying}
                    className="self-start"
                >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Try again
                </Button>
            )}
        </div>
    )
}

const OVERALL_STYLES = {
    STRONG: 'border-success-line bg-success-soft text-success-fg',
    ADEQUATE: 'border-warning-line bg-warning-soft text-warning-fg',
    WEAK: 'border-danger-line bg-danger-soft text-danger-fg',
}

/**
 * Main entry point.
 *
 * Props:
 *  - state: { status, walkthrough, usedFallback, generatedAt, inputStale }
 *  - onRetry: () => void  (called from ERROR state)
 *  - retrying: boolean
 *  - onOpenRawReference: () => void  (opens the collapsible raw reference toggle)
 */
export default function WalkthroughPanel({
    state,
    onRetry,
    retrying = false,
    onOpenRawReference,
}) {
    const [showAll, setShowAll] = useState(false)

    if (!state) return null
    if (state.status === 'PENDING') return <PendingSkeleton />
    if (state.status === 'ERROR') {
        return <ErrorState onRetry={onRetry} retrying={retrying} />
    }
    if (state.status !== 'COMPLETED' || !state.walkthrough) {
        // NOT_STARTED covers pre-dispatch — parent generally won't mount
        // the panel in this state, but we defensively render nothing so
        // the modal doesn't flash empty content.
        return null
    }

    const w = state.walkthrough
    const dims = Array.isArray(w.dimensions) ? w.dimensions : []
    const visibleDims = showAll ? dims : pickTopDims(dims, 3)
    const overallStyle = OVERALL_STYLES[w.overall] ?? OVERALL_STYLES.ADEQUATE

    return (
        <div className="space-y-5" aria-live="polite">
            {/* Fallback + stale-input banners — hidden when clean */}
            {state.usedFallback && (
                <div className="rounded-lg border border-warning-line bg-warning-soft p-3 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-warning-fg" aria-hidden="true" />
                    <div className="flex-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-warning-fg">
                            Walkthrough was a fallback
                        </p>
                        <p className="text-xs text-warning-fg leading-relaxed mt-0.5">
                            The AI didn&apos;t return a usable comparison, so
                            this is a neutral placeholder. Retry for a real
                            per-dimension walkthrough.
                        </p>
                        {onRetry && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onRetry}
                                loading={retrying}
                                disabled={retrying}
                                className="mt-2"
                            >
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                Regenerate
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {state.inputStale && (
                <div className="rounded-lg border border-border-default bg-surface-2 p-3 flex items-start gap-2 text-xs text-text-secondary">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-text-tertiary" aria-hidden="true" />
                    <div className="flex-1">
                        <span className="font-semibold text-text-primary">
                            Based on an earlier version of this lab.
                        </span>{' '}
                        The task text or reference solution has been edited
                        since this walkthrough was generated. Retry to refresh.
                    </div>
                </div>
            )}

            {/* Overall verdict mirror (NOT a re-grade — echoes codeReview.overall) */}
            <div className={cn('rounded-lg border p-4 flex items-start gap-3', overallStyle)}>
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        Verdict mirror · {w.overall}
                    </p>
                    <p className="text-sm leading-relaxed">
                        {w.approachSummary}
                    </p>
                </div>
            </div>

            {/* Dimensions */}
            <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        {showAll ? `Dimensions (${dims.length})` : `Top ${visibleDims.length} dimensions`}
                    </h3>
                    {dims.length > visibleDims.length && !showAll && (
                        <button
                            type="button"
                            onClick={() => setShowAll(true)}
                            className="text-xs text-brand-fg-soft hover:text-brand-500 font-medium"
                        >
                            Show all {dims.length}
                        </button>
                    )}
                    {showAll && dims.length > 3 && (
                        <button
                            type="button"
                            onClick={() => setShowAll(false)}
                            className="text-xs text-text-tertiary hover:text-text-primary font-medium"
                        >
                            Show top 3
                        </button>
                    )}
                </div>
                {visibleDims.map((d) => (
                    <DimBlock key={d.dim} block={d} />
                ))}
            </div>

            {/* Key takeaway */}
            <div className="rounded-lg border border-border-default bg-surface-1 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">
                    Key takeaway
                </p>
                <MarkdownRenderer content={w.keyTakeaway} size="sm" />
            </div>

            {/* Opt-in raw reference — the diff is no longer the primary
                artifact but stays accessible for learners who explicitly
                want to see the reference code side-by-side. */}
            {onOpenRawReference && (
                <div className="border-t border-border-default pt-4">
                    <button
                        type="button"
                        onClick={onOpenRawReference}
                        className="text-xs text-text-tertiary hover:text-text-primary underline underline-offset-2"
                    >
                        View reference solution code (raw diff)
                    </button>
                </div>
            )}
        </div>
    )
}
