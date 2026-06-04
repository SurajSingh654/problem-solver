// ============================================================================
// AttemptDiff — side-by-side diff between two SolutionAttempt snapshots
// ============================================================================
//
// Prose fields are HTML (TipTap RichTextEditor saves HTML to the DB columns).
// We render them sanitized on each side via DOMPurify. Word-by-word diff
// doesn't work cleanly with HTML strings — comparing `<p>foo</p>` vs.
// `<p>bar</p>` highlighted character-by-character is unreadable noise.
// Instead we show both rendered, side-by-side, with a "changed" badge.
// Code field keeps line-level diff (still useful for line-aligned source).
// ============================================================================

import { diffLines } from 'diff'
import DOMPurify from 'dompurify'
import { cn } from '@utils/cn'

const PROSE_FIELDS = [
    { key: 'approach', label: 'Approach' },
    { key: 'keyInsight', label: 'Key Insight' },
    { key: 'feynmanExplanation', label: 'Feynman Explanation' },
    { key: 'realWorldConnection', label: 'What was Challenging' },
    { key: 'bruteForce', label: 'Brute Force' },
    { key: 'optimizedApproach', label: 'Optimized Approach' },
    { key: 'timeComplexity', label: 'Time Complexity' },
    { key: 'spaceComplexity', label: 'Space Complexity' },
]

// Same shape used in MarkdownRenderer — keeps standard markup, blocks
// XSS vectors (event handlers, scripts, styles, iframes).
const PURIFY_CONFIG = {
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'align', 'colspan', 'rowspan', 'checked', 'disabled', 'type'],
    FORBID_TAGS: ['iframe', 'object', 'embed', 'form', 'input', 'button', 'script', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
}

function looksLikeHtml(s) {
    if (typeof s !== 'string') return false
    return /<[a-z][\s\S]*>/i.test(s)
}

function ProseBlock({ value }) {
    if (value == null || value === '') {
        return <span className="text-text-disabled text-xs italic">— empty —</span>
    }
    if (looksLikeHtml(value)) {
        const safe = DOMPurify.sanitize(value, PURIFY_CONFIG)
        return (
            <div
                className="prose prose-invert prose-app prose-sm max-w-none text-xs leading-relaxed"
                dangerouslySetInnerHTML={{ __html: safe }}
            />
        )
    }
    // Plain-text legacy field — keep as pre-wrap so newlines survive.
    return (
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
            {value}
        </div>
    )
}

function ProseDiff({ before, after }) {
    const a = before ?? ''
    const b = after ?? ''
    if (a === b && a === '') return <span className="text-text-disabled text-xs italic">— empty in both —</span>
    if (a === b) {
        // Identical — render once, no badge
        return <ProseBlock value={a} />
    }
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <div className="bg-surface-2/40 border border-border-subtle rounded-lg p-3 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-disabled mb-1.5">
                    Before
                </p>
                <ProseBlock value={a} />
            </div>
            <div className="bg-success-soft/30 border border-success-line/40 rounded-lg p-3 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-success-fg mb-1.5">
                    After ✱ changed
                </p>
                <ProseBlock value={b} />
            </div>
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
