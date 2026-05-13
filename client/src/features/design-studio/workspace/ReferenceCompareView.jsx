// ══════════════════════════════════════════════════════════════════════
// ReferenceCompareView — side-by-side learner attempt vs reference
// ══════════════════════════════════════════════════════════════════════
//
// Gated access: the wrapping DesignWorkspace only renders this view when
// the learner has filled ≥ 4 phases OR the session has reached
// validating/evaluated/completed-no-eval. Sweller's worked-example
// principle: exemplars help AFTER retrieval, not before. Exposing the
// reference too early turns the exercise into transcription.
//
// Plan-A diff (no new dep): for each phase pair, build a sets of
// lower-cased word tokens and `<mark>`-highlight tokens that appear in
// one side but not the other. Good enough to show "where the reference
// covers ideas I didn't" and vice-versa.
// ══════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useDesignReferences, useDesignReference } from '@hooks/useDesignReferences'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import ReferenceTradeoffCard from './panels/ReferenceTradeoffCard'

// Word tokens that are never worth highlighting as "unique" — filler.
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at',
    'for', 'with', 'as', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can',
    'could', 'should', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
    'it', 'its', 'we', 'you', 'they', 'he', 'she', 'i', 'my', 'our', 'their',
    'not', 'no', 'so', 'then', 'when', 'where', 'which', 'who', 'what', 'how',
    'there', 'here', 'about', 'also', 'than', 'more', 'most', 'some', 'any',
    'each', 'all', 'one', 'two', 'into', 'out', 'up', 'down', 'just', 'very',
])

function tokenize(text) {
    if (!text) return []
    // Preserve short technical tokens (O(n), QPS, RPC) by matching word chars + a few extras.
    const raw = String(text).toLowerCase().match(/[a-z0-9][a-z0-9_]*/g) || []
    return raw.filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

// Given text A and text B, returns A rendered as tokens with "unique to A"
// words wrapped in <mark>. Punctuation/whitespace is preserved.
function highlightUnique(text, otherSet) {
    if (!text) return null
    const parts = String(text).split(/(\s+)/) // keep whitespace chunks
    return parts.map((chunk, i) => {
        // Skip whitespace
        if (!chunk.trim()) return chunk
        const token = chunk.toLowerCase().replace(/[^a-z0-9_]/g, '')
        const isUnique = token.length >= 3 && !STOPWORDS.has(token) && !otherSet.has(token)
        if (isUnique) {
            return (
                <mark
                    key={i}
                    className="bg-brand-soft text-brand-fg-soft rounded px-0.5"
                >
                    {chunk}
                </mark>
            )
        }
        return <span key={i}>{chunk}</span>
    })
}

export default function ReferenceCompareView({
    session,
    phases: phaseList,
    phaseContent,
    onBack,
    viewProblemButton,
}) {
    const problemId = session.problemId
    const { data: problem } = useProblem(problemId)

    // Pull all references for this problem, filtered to the session's
    // design type (SD sessions shouldn't see LLD refs and vice-versa).
    const { data: refs = [], isLoading: refsLoading, isError: refsError } = useDesignReferences({
        problemId,
        designType: session.designType,
    })

    const [selectedId, setSelectedId] = useState(null)
    const effectiveId = selectedId || refs[0]?.id || null

    // Fetch full payload only for the selected variant — the list
    // endpoint returns summary-only for fast paging.
    const { data: reference, isLoading: refLoading } = useDesignReference(effectiveId)

    // Build per-phase token sets for diff highlighting. Runs in a memo
    // so switching variants / phase tabs is cheap.
    const phaseTokenSets = useMemo(() => {
        const result = {}
        const refPhases = reference?.phases || {}
        for (const p of phaseList) {
            result[p.id] = {
                mine: new Set(tokenize(phaseContent[p.id])),
                ref: new Set(tokenize(refPhases[p.id])),
            }
        }
        return result
    }, [reference, phaseList, phaseContent])

    if (!problemId) {
        return (
            <EmptyState
                title="No reference available"
                hint="Freeform sessions aren't linked to a specific problem. Link this session to a problem to access curated reference architectures."
                onBack={onBack}
                viewProblemButton={viewProblemButton}
            />
        )
    }
    if (refsLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Spinner size="lg" />
            </div>
        )
    }
    if (refsError) {
        return (
            <EmptyState
                title="Could not load references"
                hint="Something went wrong loading reference architectures. Retry or head back."
                onBack={onBack}
                viewProblemButton={viewProblemButton}
            />
        )
    }
    if (!refs.length) {
        return (
            <EmptyState
                title="No reference authored yet"
                hint={`No curated reference architecture has been published for "${problem?.title || 'this problem'}" yet. Check back later — admins add references over time.`}
                onBack={onBack}
                viewProblemButton={viewProblemButton}
            />
        )
    }

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onBack}
                        className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-text-primary truncate">
                            {session.title}
                        </h2>
                        <p className="text-[10px] text-text-disabled">
                            Reference Architecture
                        </p>
                    </div>
                </div>
                {viewProblemButton}
            </div>

            {/* Variant tabs (only if multiple references exist) */}
            {refs.length > 1 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-surface-2/40 overflow-x-auto flex-shrink-0">
                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest flex-shrink-0">
                        Variant:
                    </span>
                    {refs.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => setSelectedId(r.id)}
                            className={cn(
                                'text-[11px] font-bold px-3 py-1 rounded-lg border transition-colors flex-shrink-0',
                                effectiveId === r.id
                                    ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                                    : 'bg-surface-3 text-text-tertiary border-border-default hover:border-brand-line',
                            )}
                            title={r.summary}
                        >
                            {r.title}
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
                {refLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : !reference ? null : (
                    <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
                        {/* Summary card */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <div className="flex items-start gap-3 flex-wrap mb-2">
                                <span className="text-2xl flex-shrink-0">🧭</span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-extrabold text-text-primary">
                                        {reference.title}
                                    </h3>
                                    <p className="text-[10px] text-text-disabled mt-0.5">
                                        {reference.designType === 'SYSTEM_DESIGN' ? 'System Design' : 'Low-Level Design'} · {reference.difficulty}
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                {reference.summary}
                            </p>
                        </motion.div>

                        {/* Per-phase side-by-side */}
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-sm font-bold text-text-primary mb-1">
                                    Phase-by-phase comparison
                                </h3>
                                <p className="text-[11px] text-text-tertiary leading-relaxed">
                                    <mark className="bg-brand-soft text-brand-fg-soft rounded px-0.5">Highlighted words</mark>{' '}
                                    appear on only one side. Use it to spot ideas the reference covers that you didn&apos;t (or vice-versa).
                                </p>
                            </div>

                            {phaseList.map((phase) => {
                                const sets = phaseTokenSets[phase.id] || { mine: new Set(), ref: new Set() }
                                const mine = phaseContent[phase.id] || ''
                                const refText = reference.phases?.[phase.id] || ''
                                if (!mine && !refText) return null
                                return (
                                    <motion.div
                                        key={phase.id}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
                                    >
                                        <div className="px-4 py-2.5 border-b border-border-subtle flex items-center gap-2">
                                            <span className="text-base">{phase.icon}</span>
                                            <h4 className="text-xs font-bold text-text-primary">
                                                {phase.label}
                                            </h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-subtle">
                                            <div className="p-4 space-y-1.5">
                                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                                    Your design
                                                </p>
                                                {mine ? (
                                                    <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                                                        {highlightUnique(mine, sets.ref)}
                                                    </p>
                                                ) : (
                                                    <p className="text-[11px] text-text-disabled italic">
                                                        (empty — you didn&apos;t fill this phase)
                                                    </p>
                                                )}
                                            </div>
                                            <div className="p-4 space-y-1.5 bg-surface-2/40">
                                                <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest">
                                                    Reference
                                                </p>
                                                {refText ? (
                                                    <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                                                        {highlightUnique(refText, sets.mine)}
                                                    </p>
                                                ) : (
                                                    <p className="text-[11px] text-text-disabled italic">
                                                        (reference didn&apos;t cover this phase)
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </div>

                        {/* Trade-offs */}
                        {Array.isArray(reference.tradeoffs) && reference.tradeoffs.length > 0 && (
                            <motion.section
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-3"
                            >
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary">
                                        Named trade-offs
                                    </h3>
                                    <p className="text-[11px] text-text-tertiary leading-relaxed">
                                        Each decision this reference made has a viable alternative. Compare the reasons against your own choices — there&apos;s rarely one right answer.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {reference.tradeoffs.map((t, i) => (
                                        <ReferenceTradeoffCard key={i} tradeoff={t} index={i} />
                                    ))}
                                </div>
                            </motion.section>
                        )}

                        {/* Sources */}
                        {Array.isArray(reference.sources) && reference.sources.length > 0 && (
                            <motion.section
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-surface-1 border border-border-default rounded-2xl p-5"
                            >
                                <h3 className="text-sm font-bold text-text-primary mb-2">
                                    Further reading
                                </h3>
                                <ul className="space-y-1">
                                    {reference.sources.map((s, i) => (
                                        <li key={i} className="text-xs">
                                            {s.url ? (
                                                <a
                                                    href={s.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-brand-fg-soft hover:underline"
                                                >
                                                    {s.label || s.url}
                                                </a>
                                            ) : (
                                                <span className="text-text-secondary">
                                                    {s.label}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </motion.section>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function EmptyState({ title, hint, onBack, viewProblemButton }) {
    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    </button>
                    <p className="text-sm font-bold text-text-primary">Reference Architecture</p>
                </div>
                {viewProblemButton}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
                <div className="text-4xl" aria-hidden>🧭</div>
                <p className="text-base font-bold text-text-primary">{title}</p>
                <p className="text-sm text-text-tertiary max-w-md leading-relaxed">{hint}</p>
            </div>
        </div>
    )
}
