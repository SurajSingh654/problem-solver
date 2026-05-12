// ============================================================================
// RecallDiff — word-level diff of the user's recall attempt vs their notes
// ============================================================================
//
// The gap between recall and original is the actual learning signal
// (Karpicke & Roediger 2008). Rendering it as a diff instead of two
// separate text blocks makes that gap visible at a glance — matching
// words fade into neutral, words the user invented show in yellow (they
// recalled something not in the notes), words they forgot show in red
// (in notes but not in recall).
//
// Uses diffWordsWithSpace from `diff`. Case-insensitive comparison,
// punctuation ignored for the match check but preserved in the rendered
// output — so "O(n)" in recall still matches "O(n)" in notes, but
// "hash" vs "hashing" correctly diverges at word granularity.
// ============================================================================

import { diffWordsWithSpace } from 'diff'

/**
 * Build one reference text blob from the solution's stored fields so the
 * recall text has something to compare against. Only includes fields that
 * actually have content so the diff isn't drowned in labels.
 */
function buildReferenceText(solution) {
    const parts = []
    if (solution.patterns?.length) parts.push(solution.patterns.join(' '))
    if (solution.keyInsight) parts.push(solution.keyInsight)
    if (solution.timeComplexity) parts.push(`time ${solution.timeComplexity}`)
    if (solution.spaceComplexity) parts.push(`space ${solution.spaceComplexity}`)
    if (solution.optimizedApproach) parts.push(solution.optimizedApproach)
    if (solution.feynmanExplanation) parts.push(solution.feynmanExplanation)
    return parts.join('\n')
}

function stripHtml(html) {
    if (!html) return ''
    return html.replace(/<[^>]*>/g, '').trim()
}

export function RecallDiff({ recallText, solution }) {
    const reference = stripHtml(buildReferenceText(solution))
    const recall = (recallText || '').trim()

    if (!recall && !reference) {
        return (
            <p className="text-xs text-text-disabled italic">
                Nothing to diff — no recall text and no stored notes.
            </p>
        )
    }
    if (!recall) {
        return (
            <p className="text-xs text-text-disabled italic">
                You didn't type anything this round. Try writing even one line next review — seeing the diff is the point.
            </p>
        )
    }
    if (!reference) {
        return (
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                {recall}
                <span className="block mt-2 text-[11px] text-text-disabled italic">
                    No stored notes to compare against.
                </span>
            </p>
        )
    }

    // Case-insensitive diff so "O(n)" vs "o(n)" doesn't spuriously diverge.
    // `ignoreCase: true` is supported by diffWordsWithSpace.
    const parts = diffWordsWithSpace(reference, recall, { ignoreCase: true })

    // Stats: fraction of reference words present in recall (i.e. "kept")
    // vs missing (= forgotten). `removed` from the diff means in reference
    // but not in recall.
    let kept = 0
    let missing = 0
    let invented = 0
    for (const p of parts) {
        const words = p.value.trim().split(/\s+/).filter(Boolean).length
        if (p.added) invented += words
        else if (p.removed) missing += words
        else kept += words
    }
    const total = kept + missing
    const coverage = total === 0 ? 0 : Math.round((kept / total) * 100)

    return (
        <div className="space-y-3">
            {/* Summary strip */}
            <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm bg-success-soft border border-success-line" />
                    <span className="text-text-secondary tabular-nums">{kept} recalled</span>
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm bg-danger-soft border border-danger-line" />
                    <span className="text-text-secondary tabular-nums">{missing} missed</span>
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm bg-warning-soft border border-warning-line" />
                    <span className="text-text-secondary tabular-nums">{invented} new</span>
                </span>
                <span className="ml-auto text-text-disabled">
                    coverage <span className="font-bold text-text-primary tabular-nums">{coverage}%</span>
                </span>
            </div>

            {/* Diff output — each word colored by whether it was recalled,
                missed (in notes only), or invented (in recall only) */}
            <div className="bg-surface-2 border border-border-default rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap">
                {parts.map((p, i) => (
                    <span
                        key={i}
                        className={
                            p.added
                                ? 'bg-warning-soft text-warning-fg rounded px-0.5'
                                : p.removed
                                    ? 'bg-danger-soft text-danger-fg line-through rounded px-0.5'
                                    : 'text-success-fg'
                        }
                    >
                        {p.value}
                    </span>
                ))}
            </div>

            <p className="text-[10px] text-text-disabled italic">
                Green = you recalled it. Red = in your notes, you missed it. Yellow = you said it but it wasn't in your notes (possibly newly remembered).
            </p>
        </div>
    )
}
