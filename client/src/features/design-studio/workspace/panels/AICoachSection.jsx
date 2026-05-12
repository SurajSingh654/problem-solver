import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { useAICoach } from '@hooks/useDesignStudio'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import {
    useCoachingHistory,
    interactionPreview,
    interactionTimeLabel,
} from '../../hooks/useCoachingHistory'

// ══════════════════════════════════════════════════════════════════════════
// AI COACH SECTION — rail variant, Coach + History tabs
// ══════════════════════════════════════════════════════════════════════════
// The right-rail home for everything AI-coach related. Two tabs:
//
//   • Coach — the default. Ask buttons + currently-pinned response.
//   • History — the persisted aiInteractions log, filterable by phase.
//     Clicking "Show in Coach" on a history row pins that past response
//     back into the Coach tab (with a "from HH:MM" subtitle) so users
//     can compare against their current work. Retrieval practice needs
//     users to re-engage with feedback, not lose it on dismiss.
//
// The persisted history is capped server-side at 50 entries per session.
// ══════════════════════════════════════════════════════════════════════════
export default function AICoachSection({
    sessionId,
    phaseId,
    phases = [],
    aiInteractions = [],
    response,
    onResponse,
    onDismiss,
    isReadOnly = false,
}) {
    const askCoach = useAICoach()
    const [teachQuery, setTeachQuery] = useState('')
    const [showTeachInput, setShowTeachInput] = useState(false)
    const [tab, setTab] = useState('coach') // 'coach' | 'history'
    // 'current' = filter to phaseId, 'all' = show every interaction
    const [historyFilter, setHistoryFilter] = useState('current')

    const phaseById = useMemo(() => {
        const m = {}
        for (const p of phases) m[p.id] = p
        return m
    }, [phases])

    const { items: historyItems, total: historyTotal, countsByPhase } = useCoachingHistory(
        aiInteractions,
        { phaseFilter: historyFilter === 'current' ? phaseId : null },
    )

    async function handleAsk(mode) {
        if (mode === 'teach' && !teachQuery.trim()) {
            toast.error('Type what you want to learn')
            return
        }
        try {
            const res = await askCoach.mutateAsync({
                sessionId,
                mode,
                phaseId,
                userQuery: mode === 'teach' ? teachQuery.trim() : '',
            })
            onResponse(res.data.data.coaching)
            if (mode === 'teach') {
                setTeachQuery('')
                setShowTeachInput(false)
            }
        } catch {
            /* handled by hook */
        }
    }

    function handlePinFromHistory(item) {
        const base = item.response || {
            // Fallback for legacy entries that pre-date the `response`
            // field — reconstruct enough to render in the same slots.
            response: item.aiResponse,
            guidingQuestions: item.guidingQuestions,
            conceptExplanation: item.conceptExplanation,
        }
        onResponse({ ...base, __pinnedAt: item.timestamp })
        setTab('coach')
    }

    const verdictConfig = {
        on_track: { label: 'On Track', color: 'text-success-fg bg-success-soft border-success-line' },
        strong: { label: 'Strong', color: 'text-success-fg bg-success-soft border-success-line' },
        needs_work: { label: 'Needs Work', color: 'text-warning-fg bg-warning-soft border-warning-line' },
    }
    const verdictInfo = response?.verdict ? verdictConfig[response.verdict] : null

    return (
        <section className="flex flex-col min-h-0">
            {/* ── Section header + tabs ─────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-2/40 gap-2">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-base">🤖</span>
                    <h3 className="text-[10px] font-bold text-text-primary uppercase tracking-widest">
                        AI Coach
                    </h3>
                </div>
                <div className="inline-flex rounded-lg border border-border-default bg-surface-3 p-0.5">
                    <button
                        type="button"
                        onClick={() => setTab('coach')}
                        className={cn(
                            'text-[10px] font-bold px-2 py-1 rounded-md transition-all',
                            tab === 'coach'
                                ? 'bg-brand-400 text-white'
                                : 'text-text-tertiary hover:text-text-primary'
                        )}
                    >
                        Coach
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('history')}
                        className={cn(
                            'text-[10px] font-bold px-2 py-1 rounded-md transition-all',
                            tab === 'history'
                                ? 'bg-brand-400 text-white'
                                : 'text-text-tertiary hover:text-text-primary'
                        )}
                    >
                        History
                        {historyTotal > 0 && (
                            <span className="ml-1 opacity-80">({historyTotal})</span>
                        )}
                    </button>
                </div>
                {tab === 'coach' && askCoach.isPending && <Spinner size="sm" />}
            </div>

            {tab === 'coach' ? (
                <CoachTab
                    isReadOnly={isReadOnly}
                    askCoach={askCoach}
                    response={response}
                    verdictInfo={verdictInfo}
                    teachQuery={teachQuery}
                    setTeachQuery={setTeachQuery}
                    showTeachInput={showTeachInput}
                    setShowTeachInput={setShowTeachInput}
                    handleAsk={handleAsk}
                    onDismiss={onDismiss}
                />
            ) : (
                <HistoryTab
                    items={historyItems}
                    total={historyTotal}
                    historyFilter={historyFilter}
                    setHistoryFilter={setHistoryFilter}
                    currentPhaseCount={countsByPhase[phaseId] || 0}
                    phaseById={phaseById}
                    onPin={handlePinFromHistory}
                />
            )}
        </section>
    )
}

// ── Coach tab ────────────────────────────────────────────────────────
function CoachTab({
    isReadOnly,
    askCoach,
    response,
    verdictInfo,
    teachQuery,
    setTeachQuery,
    showTeachInput,
    setShowTeachInput,
    handleAsk,
    onDismiss,
}) {
    return (
        <>
            {/* Button stack */}
            {!isReadOnly && (
                <div className="p-3 space-y-2 border-b border-border-subtle">
                    <button
                        type="button"
                        onClick={() => handleAsk('validate')}
                        disabled={askCoach.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-success-soft border-success-line text-success-fg hover:bg-success-soft transition-colors disabled:opacity-50 text-left"
                    >
                        <span className="text-sm">✓</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-tight">Am I on track?</p>
                            <p className="text-[10px] text-text-tertiary leading-tight">
                                Validate this phase
                            </p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAsk('guide')}
                        disabled={askCoach.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-warning-soft border-warning-line text-warning-fg hover:bg-warning-soft transition-colors disabled:opacity-50 text-left"
                    >
                        <span className="text-sm">?</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-tight">I&apos;m stuck</p>
                            <p className="text-[10px] text-text-tertiary leading-tight">
                                Get guiding questions
                            </p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowTeachInput((v) => !v)}
                        disabled={askCoach.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-info-soft border-info-line text-info-fg hover:bg-info-soft transition-colors disabled:opacity-50 text-left"
                    >
                        <span className="text-sm">📚</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold leading-tight">Teach me…</p>
                            <p className="text-[10px] text-text-tertiary leading-tight">
                                Explain a concept
                            </p>
                        </div>
                    </button>

                    <AnimatePresence>
                        {showTeachInput && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="flex gap-1.5 pt-1">
                                    <input
                                        type="text"
                                        value={teachQuery}
                                        onChange={(e) => setTeachQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAsk('teach')
                                        }}
                                        placeholder="e.g. consistent hashing"
                                        className="flex-1 bg-surface-3 border border-border-strong rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-400"
                                    />
                                    <Button size="sm" variant="primary" onClick={() => handleAsk('teach')}>
                                        Ask
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Response area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {!response ? (
                    <div className="text-center py-6 px-2">
                        <div className="text-3xl mb-2 opacity-60">💬</div>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {isReadOnly
                                ? 'This session is read-only. The coach is unavailable.'
                                : 'Click a button above to get feedback on this phase, a hint when stuck, or a concept explained.'}
                        </p>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                {verdictInfo && (
                                    <span
                                        className={cn(
                                            'text-[10px] font-bold px-2 py-px rounded-full border',
                                            verdictInfo.color
                                        )}
                                    >
                                        {verdictInfo.label}
                                    </span>
                                )}
                                {response.__pinnedAt && (
                                    <span className="text-[9px] text-text-disabled italic">
                                        📌 from {new Date(response.__pinnedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={onDismiss}
                                className="text-text-disabled hover:text-text-primary flex-shrink-0"
                                aria-label="Dismiss AI response"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {response.response && (
                            <p className="text-xs text-text-secondary leading-relaxed">
                                {response.response}
                            </p>
                        )}

                        {response.specificStrength && (
                            <div className="bg-success-soft border border-success-line rounded-lg p-2.5">
                                <p className="text-[10px] font-bold text-success-fg uppercase tracking-widest mb-1">
                                    Strength
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.specificStrength}
                                </p>
                            </div>
                        )}
                        {response.specificGap && (
                            <div className="bg-warning-soft border border-warning-line rounded-lg p-2.5">
                                <p className="text-[10px] font-bold text-warning-fg uppercase tracking-widest mb-1">
                                    Gap
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.specificGap}
                                </p>
                            </div>
                        )}

                        {response.guidingQuestions?.length > 0 && (
                            <div className="space-y-1.5">
                                {response.guidingQuestions.map((q, i) => (
                                    <p
                                        key={i}
                                        className="text-xs text-text-secondary flex items-start gap-2 leading-relaxed"
                                    >
                                        <span className="text-brand-fg-soft flex-shrink-0 font-bold">→</span>
                                        {q}
                                    </p>
                                ))}
                            </div>
                        )}
                        {response.thinkAbout && (
                            <p className="text-[11px] text-text-tertiary leading-relaxed italic border-t border-border-subtle pt-2">
                                Think about: {response.thinkAbout}
                            </p>
                        )}

                        {response.conceptExplanation && (
                            <div className="bg-info-soft border border-info-line rounded-lg p-2.5">
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.conceptExplanation}
                                </p>
                            </div>
                        )}
                        {response.exampleInContext && (
                            <p className="text-[11px] text-text-tertiary leading-relaxed italic">
                                In your design: {response.exampleInContext}
                            </p>
                        )}
                        {response.relatedDecision && (
                            <div className="border-t border-border-subtle pt-2">
                                <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest mb-1">
                                    This helps you decide
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    {response.relatedDecision}
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </>
    )
}

// ── History tab ──────────────────────────────────────────────────────
const MODE_META = {
    validate: { label: 'Validate', color: 'text-success-fg bg-success-soft border-success-line' },
    guide: { label: 'Guide', color: 'text-warning-fg bg-warning-soft border-warning-line' },
    teach: { label: 'Teach', color: 'text-info-fg bg-info-soft border-info-line' },
}

function HistoryTab({ items, total, historyFilter, setHistoryFilter, currentPhaseCount, phaseById, onPin }) {
    const [expandedId, setExpandedId] = useState(null)
    return (
        <>
            {/* Filter chip row */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
                <button
                    type="button"
                    onClick={() => setHistoryFilter('current')}
                    className={cn(
                        'text-[10px] font-bold px-2 py-1 rounded-md border transition-colors',
                        historyFilter === 'current'
                            ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                            : 'bg-surface-3 text-text-tertiary border-border-default hover:border-brand-line',
                    )}
                >
                    This phase
                    {currentPhaseCount > 0 && (
                        <span className="ml-1 opacity-80">({currentPhaseCount})</span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    className={cn(
                        'text-[10px] font-bold px-2 py-1 rounded-md border transition-colors',
                        historyFilter === 'all'
                            ? 'bg-brand-soft text-brand-fg-soft border-brand-line'
                            : 'bg-surface-3 text-text-tertiary border-border-default hover:border-brand-line',
                    )}
                >
                    All phases
                    {total > 0 && <span className="ml-1 opacity-80">({total})</span>}
                </button>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {items.length === 0 ? (
                    <div className="text-center py-6 px-2">
                        <div className="text-2xl mb-2 opacity-60">📜</div>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {historyFilter === 'current'
                                ? 'No coach interactions on this phase yet.'
                                : 'No coach interactions yet.'}
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-1.5">
                        {items.map((item, idx) => {
                            const id = `${item.timestamp || ''}-${idx}`
                            const isOpen = expandedId === id
                            const modeInfo = MODE_META[item.mode] || { label: item.mode || '?', color: 'text-text-tertiary bg-surface-3 border-border-default' }
                            const phaseLabel = phaseById[item.phase]?.label || item.phase || '—'
                            return (
                                <li key={id} className="bg-surface-2 border border-border-subtle rounded-lg overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(isOpen ? null : id)}
                                        className="w-full text-left px-2.5 py-2 hover:bg-surface-3/60 transition-colors"
                                    >
                                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                            <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', modeInfo.color)}>
                                                {modeInfo.label}
                                            </span>
                                            <span className="text-[9px] text-text-disabled">
                                                {phaseLabel}
                                            </span>
                                            <span className="text-[9px] text-text-disabled ml-auto font-mono">
                                                {interactionTimeLabel(item)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-text-secondary leading-snug line-clamp-2">
                                            {interactionPreview(item)}
                                        </p>
                                    </button>

                                    <AnimatePresence>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden border-t border-border-subtle bg-surface-1"
                                            >
                                                <div className="p-2.5 space-y-2">
                                                    {item.userQuery && (
                                                        <div>
                                                            <p className="text-[9px] font-bold text-text-disabled uppercase tracking-widest mb-0.5">
                                                                You asked
                                                            </p>
                                                            <p className="text-[11px] text-text-secondary italic leading-snug">
                                                                {item.userQuery}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {(item.aiResponse || item.response?.response) && (
                                                        <p className="text-[11px] text-text-secondary leading-snug">
                                                            {item.aiResponse || item.response?.response}
                                                        </p>
                                                    )}
                                                    {(item.guidingQuestions?.length || item.response?.guidingQuestions?.length) > 0 && (
                                                        <div className="space-y-1">
                                                            {(item.guidingQuestions || item.response?.guidingQuestions || []).map((q, j) => (
                                                                <p key={j} className="text-[11px] text-text-secondary flex items-start gap-1.5">
                                                                    <span className="text-brand-fg-soft flex-shrink-0 font-bold">→</span>
                                                                    {q}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => onPin(item)}
                                                            className="text-[10px] font-bold text-brand-fg-soft bg-brand-soft border border-brand-line rounded-md px-2 py-1 hover:bg-brand-soft transition-colors"
                                                        >
                                                            📌 Show in Coach
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </>
    )
}
