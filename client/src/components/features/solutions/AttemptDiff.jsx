// ============================================================================
// AttemptDiff — side-by-side diff between two SolutionAttempt snapshots
// ============================================================================
//
// Uses the `diff` npm package (already transitively installed via Tiptap).
// Prose fields use character-level diff (diffWordsWithSpace for readability);
// code uses line-level (diffLines). Other fields (confidence, patterns,
// problemVersion, AI overallScore) render as compact delta rows rather than
// free-text diffs.
// ============================================================================

import { diffWordsWithSpace, diffLines } from 'diff'
import { cn } from '@utils/cn'

const PROSE_FIELDS = [
    { key: 'approach', label: 'Approach' },
    { key: 'keyInsight', label: 'Key Insight' },
    { key: 'feynmanExplanation', label: 'Feynman Explanation' },
    { key: 'realWorldConnection', label: 'Real-World Connection' },
    { key: 'bruteForce', label: 'Brute Force' },
    { key: 'optimizedApproach', label: 'Optimized Approach' },
    { key: 'timeComplexity', label: 'Time Complexity' },
    { key: 'spaceComplexity', label: 'Space Complexity' },
]

function ProseDiff({ before, after }) {
    // Normalize null/undefined to empty string so diff doesn't blow up.
    const a = before ?? ''
    const b = after ?? ''
    if (a === b && a === '') return <span className="text-text-disabled text-xs italic">— empty in both —</span>
    if (a === b) {
        return <span className="text-text-secondary whitespace-pre-wrap">{a}</span>
    }
    const parts = diffWordsWithSpace(a, b)
    return (
        <div className="whitespace-pre-wrap text-xs leading-relaxed">
            {parts.map((p, i) => (
                <span
                    key={i}
                    className={cn(
                        p.added && 'bg-success-soft text-success-fg',
                        p.removed && 'bg-danger-soft text-danger-fg line-through',
                        !p.added && !p.removed && 'text-text-secondary',
                    )}
                >
                    {p.value}
                </span>
            ))}
        </div>
    )
}

function CodeDiff({ before, after }) {
    const a = before ?? ''
    const b = after ?? ''
    if (a === b && a === '') return <span className="text-text-disabled text-xs italic">— no code in either attempt —</span>
    if (a === b) {
        return (
            <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap bg-surface-2 rounded-lg p-3 overflow-x-auto">
                {a}
            </pre>
        )
    }
    const parts = diffLines(a, b)
    return (
        <pre className="text-[11px] font-mono whitespace-pre-wrap bg-surface-2 rounded-lg p-3 overflow-x-auto">
            {parts.map((p, i) => {
                const prefix = p.added ? '+ ' : p.removed ? '- ' : '  '
                return (
                    <span
                        key={i}
                        className={cn(
                            p.added && 'text-success-fg bg-success-soft block',
                            p.removed && 'text-danger-fg bg-danger-soft block',
                            !p.added && !p.removed && 'text-text-tertiary block',
                        )}
                    >
                        {p.value
                            .split('\n')
                            .slice(0, -1)
                            .map((line, j) => (
                                <span key={j} className="block">
                                    {prefix}
                                    {line}
                                </span>
                            ))}
                    </span>
                )
            })}
        </pre>
    )
}

function DeltaRow({ label, before, after, render }) {
    const changed = JSON.stringify(before) !== JSON.stringify(after)
    return (
        <div className="flex items-center gap-3 py-2 border-b border-border-subtle text-xs">
            <span className="w-40 text-text-disabled font-bold uppercase tracking-wider text-[10px] flex-shrink-0">
                {label}
            </span>
            <span className="flex-1 text-text-secondary">{render ? render(before) : String(before ?? '—')}</span>
            <span className={cn('flex-shrink-0 w-4 text-center text-[10px]', changed ? 'text-warning-fg' : 'text-text-disabled')}>
                {changed ? '→' : '='}
            </span>
            <span className="flex-1 text-text-primary font-semibold">{render ? render(after) : String(after ?? '—')}</span>
        </div>
    )
}

export function AttemptDiff({ before, after }) {
    if (!before || !after) {
        return (
            <div className="bg-surface-1 border border-border-default rounded-xl p-8 text-center text-xs text-text-disabled">
                Pick two attempts to compare.
            </div>
        )
    }
    if (before.id === after.id) {
        return (
            <div className="bg-surface-1 border border-border-default rounded-xl p-8 text-center text-xs text-text-disabled">
                Pick two <em>different</em> attempts to compare.
            </div>
        )
    }

    const [olderAttempt, newerAttempt] =
        before.attemptNumber < after.attemptNumber ? [before, after] : [after, before]

    return (
        <div className="space-y-4">
            {/* Scalar delta rows */}
            <div className="bg-surface-1 border border-border-default rounded-xl px-5 py-3">
                <div className="flex items-center gap-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                    <span className="w-40 flex-shrink-0">Field</span>
                    <span className="flex-1">Attempt #{olderAttempt.attemptNumber}</span>
                    <span className="w-4" />
                    <span className="flex-1">Attempt #{newerAttempt.attemptNumber}</span>
                </div>
                <DeltaRow label="Confidence" before={olderAttempt.confidence} after={newerAttempt.confidence} render={v => `${v}/5`} />
                <DeltaRow label="Patterns" before={olderAttempt.patterns} after={newerAttempt.patterns} render={v => (Array.isArray(v) && v.length > 0 ? v.join(', ') : '—')} />
                <DeltaRow label="Language" before={olderAttempt.language} after={newerAttempt.language} />
                <DeltaRow label="Trigger" before={olderAttempt.trigger} after={newerAttempt.trigger} />
                <DeltaRow label="Problem version" before={olderAttempt.problemVersion} after={newerAttempt.problemVersion} />
                <DeltaRow
                    label="AI score"
                    before={olderAttempt.aiFeedbackSnapshot?.overallScore ?? null}
                    after={newerAttempt.aiFeedbackSnapshot?.overallScore ?? null}
                    render={v => (v == null ? '—' : `${v}/10`)}
                />
            </div>

            {/* Prose diffs */}
            {PROSE_FIELDS.map(({ key, label }) => {
                const a = olderAttempt[key]
                const b = newerAttempt[key]
                if (!a && !b) return null
                return (
                    <div key={key} className="bg-surface-1 border border-border-default rounded-xl p-5">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                            {label}
                        </p>
                        <ProseDiff before={a} after={b} />
                    </div>
                )
            })}

            {/* Code diff */}
            {(olderAttempt.code || newerAttempt.code) && (
                <div className="bg-surface-1 border border-border-default rounded-xl p-5">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Code
                    </p>
                    <CodeDiff before={olderAttempt.code} after={newerAttempt.code} />
                </div>
            )}
        </div>
    )
}
