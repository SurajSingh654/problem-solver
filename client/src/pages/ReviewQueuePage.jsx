import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useReviewQueue, useSubmitReview } from '@hooks/useSolutions'
import { useReviewHints } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatRelativeDate, formatShortDate } from '@utils/formatters'
import { CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '@utils/constants'
import { RecallAnalyticsPanel } from '@components/features/charts/RecallAnalyticsPanel'
import { ForgettingCurve } from '@components/features/charts/ForgettingCurve'
import { RecallDiff } from '@components/features/solutions/RecallDiff'
import FlashcardReviewSection from '@components/flashcards/FlashcardReviewSection'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── SM-2 client-side preview calculator ───────────────
// Used ONLY for the "next review in X days" preview in the rate phase.
// The authoritative SM-2 calculation always happens server-side.
// This preview uses the same algorithm so the displayed value matches
// what the server will compute after save.
function previewNextInterval(confidence, ef, interval, reps) {
    const qualityMap = { 1: 0, 2: 2, 3: 3, 4: 4, 5: 5 }
    const q = qualityMap[confidence] ?? 3
    if (q < 3) return 1
    const newReps = reps + 1
    if (newReps === 1) return 1
    if (newReps === 2) return 6
    return Math.min(Math.round(interval * ef), 180)
}

// ── Strip HTML ─────────────────────────────────────────
function stripHtml(html) {
    if (!html) return ''
    return html.replace(/<[^>]*>/g, '').trim()
}

// ── Confidence picker ──────────────────────────────────
function ConfidencePicker({ value, onChange }) {
    return (
        <div className="flex gap-2 flex-wrap">
            {CONFIDENCE_LEVELS.map(c => (
                <button
                    key={c.value}
                    onClick={() => onChange(c.value)}
                    className={cn(
                        'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border',
                        'transition-all duration-150 min-w-[68px]',
                        value === c.value
                            ? 'bg-brand-soft border-brand-line scale-105'
                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                    )}
                >
                    <span className="text-xl">{c.emoji}</span>
                    <span className={cn(
                        'text-[10px] font-bold text-center leading-tight',
                        value === c.value ? c.color : 'text-text-disabled'
                    )}>
                        {c.label}
                    </span>
                </button>
            ))}
        </div>
    )
}

// ── Recall timer ───────────────────────────────────────
function RecallTimer({ seconds, onExpire }) {
    const [remaining, setRemaining] = useState(seconds)

    useEffect(() => {
        if (remaining <= 0) { onExpire?.(); return }
        const t = setTimeout(() => setRemaining(r => r - 1), 1000)
        return () => clearTimeout(t)
    }, [remaining])

    const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
    const secs = (remaining % 60).toString().padStart(2, '0')
    const isLow = remaining <= 20
    const pct = (remaining / seconds) * 100

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-6 h-6">
                <svg width="24" height="24" className="-rotate-90">
                    <circle cx="12" cy="12" r="10" fill="none"
                        stroke="rgba(128,128,128,0.2)" strokeWidth="2" />
                    <circle cx="12" cy="12" r="10" fill="none"
                        stroke={isLow ? '#ef4444' : '#7c6ff7'} strokeWidth="2"
                        strokeDasharray={2 * Math.PI * 10}
                        strokeDashoffset={2 * Math.PI * 10 * (1 - pct / 100)}
                        strokeLinecap="round"
                    />
                </svg>
            </div>
            <span className={cn(
                'text-xs font-mono font-bold',
                isLow ? 'text-danger-fg animate-pulse' : 'text-text-tertiary'
            )}>
                {mins}:{secs}
            </span>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// REVIEW MODAL — Three-phase active recall
// ══════════════════════════════════════════════════════
function ReviewModal({ solution, onClose, onSave, isSaving }) {
    const navigate = useNavigate()
    const reviewHints = useReviewHints()

    // Phase: 'recall' | 'reveal' | 'rate'
    const [phase, setPhase] = useState('recall')
    const [recallText, setRecallText] = useState('')
    // null = unset. Server's submitReview endpoint rejects anything outside 1-5.
    const [confidence, setConfidence] = useState(solution.confidence || null)
    const [timerExpired, setTimerExpired] = useState(false)
    const [aiQuestions, setAiQuestions] = useState(null)
    const [showAiHints, setShowAiHints] = useState(false)
    // 'side-by-side' (default, legacy view) vs 'diff' (word-level recall
    // vs stored-notes comparison). The diff view surfaces the gap that
    // is literally the learning signal for retrieval practice, but users
    // who just want to re-read their notes can keep the default.
    const [revealView, setRevealView] = useState('side-by-side')
    const textareaRef = useRef(null)

    // Focus textarea on recall phase mount
    useEffect(() => {
        if (phase === 'recall') {
            setTimeout(() => textareaRef.current?.focus(), 200)
        }
    }, [phase])

    // Fetch AI hints when revealing — fire-and-forget, non-blocking.
    // Pass the recall attempt so the AI can ask targeted follow-ups instead
    // of generic per-problem questions.
    async function handleReveal() {
        setPhase('reveal')
        try {
            const res = await reviewHints.mutateAsync({
                solutionId: solution.id,
                recallText: recallText?.trim() || undefined,
            })
            setAiQuestions(res.data.data)
        } catch {
            // Silent — AI hints are enhancement, not critical path
        }
    }

    // SM-2 preview — uses same algorithm as server for consistent display
    // sm2EasinessFactor, sm2Interval, sm2Repetitions come from server queue data
    const nextDays = confidence > 0
        ? previewNextInterval(
            confidence,
            solution.sm2EasinessFactor ?? 2.5,
            solution.sm2Interval ?? 1,
            solution.sm2Repetitions ?? 0
        )
        : 0

    const nextDate = confidence > 0
        ? (() => {
            const d = new Date()
            d.setDate(d.getDate() + nextDays)
            return formatShortDate(d)
        })()
        : null

    const hasNotes = solution.keyInsight || solution.optimizedApproach ||
        stripHtml(solution.feynmanExplanation) || solution.timeComplexity

    // Whether this confidence rating is a "pass" (quality >= 3) or "reset" (quality < 3)
    // quality 1 → 0, quality 2 → 2, quality 3+ → 3+
    const isRecallPass = confidence >= 3

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-overlay bg-black/70 backdrop-blur-sm"
                onClick={phase === 'recall' ? undefined : onClose}
            />
            <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -16 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    className="w-full max-w-xl bg-surface-1 border border-border-strong
                               rounded-2xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
                >
                    {/* ── Header ──────────────────────────────── */}
                    <div className="flex items-start justify-between gap-4 p-5 border-b border-border-default flex-shrink-0">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'} size="xs">
                                    {solution.problem?.difficulty?.charAt(0) +
                                        solution.problem?.difficulty?.slice(1).toLowerCase()}
                                </Badge>
                                {solution.problem?.category && (
                                    <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                                   border border-border-default rounded-full px-2 py-px">
                                        {solution.problem.category.replace('_', ' ')}
                                    </span>
                                )}
                                {/* SM-2 state indicator */}
                                {solution.sm2Repetitions > 0 && (
                                    <span className="text-[9px] font-bold px-2 py-px rounded-full border
                                                   bg-brand-soft text-brand-fg-soft border-brand-line">
                                        EF {(solution.sm2EasinessFactor ?? 2.5).toFixed(1)}
                                    </span>
                                )}
                                {/* Phase indicator */}
                                <span className={cn(
                                    'text-[9px] font-bold px-2 py-px rounded-full border ml-auto',
                                    phase === 'recall' ? 'bg-warning-soft text-warning-fg border-warning-line'
                                        : phase === 'reveal' ? 'bg-info-soft text-info-fg border-info-line'
                                            : 'bg-success-soft text-success-fg border-success-line'
                                )}>
                                    {phase === 'recall' ? '① Recall' : phase === 'reveal' ? '② Review' : '③ Rate'}
                                </span>
                            </div>
                            <h2 className="text-base font-bold text-text-primary leading-snug">
                                {solution.problem?.title}
                            </h2>
                            <p className="text-xs text-text-disabled mt-0.5">
                                Review #{(solution.reviewCount || 0) + 1}
                                {solution.sm2Repetitions > 0 && ` · ${solution.sm2Repetitions} successful streak`}
                                {' · '}Solved {formatRelativeDate(solution.createdAt)}
                            </p>
                        </div>
                        {phase !== 'recall' && (
                            <button
                                onClick={onClose}
                                className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* ── Scrollable body ──────────────────────── */}
                    <div className="flex-1 overflow-y-auto">

                        {/* ════════════════════════════════════════
                            PHASE 1 — ACTIVE RECALL
                            ════════════════════════════════════════ */}
                        {phase === 'recall' && (
                            <div className="p-5 space-y-4">
                                <div className="bg-brand-soft border border-brand-line rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-bold text-text-primary">
                                            🧠 Before looking at your notes...
                                        </p>
                                        {!timerExpired ? (
                                            <RecallTimer seconds={90} onExpire={() => setTimerExpired(true)} />
                                        ) : (
                                            <span className="text-[10px] font-bold text-text-disabled">
                                                Time's up — take your time
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-text-tertiary leading-relaxed">
                                        Try to recall from memory. What pattern does this use? What's the key insight?
                                        What's the time complexity? You can type notes or just think it through.
                                    </p>
                                </div>

                                {/* Recall prompt cards */}
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { icon: '🧩', label: 'Pattern', q: 'What algorithm pattern?' },
                                        { icon: '💡', label: 'Key Insight', q: "What's the \"aha\" moment?" },
                                        { icon: '⏱', label: 'Complexity', q: 'Time & space complexity?' },
                                    ].map(p => (
                                        <div
                                            key={p.label}
                                            className="bg-surface-2 border border-border-default rounded-xl p-3 text-center"
                                        >
                                            <span className="text-lg">{p.icon}</span>
                                            <p className="text-[10px] font-bold text-text-primary mt-1">{p.label}</p>
                                            <p className="text-[10px] text-text-disabled mt-0.5 leading-tight">{p.q}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Recall textarea */}
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                        Your recall (optional — typing strengthens memory encoding)
                                    </label>
                                    <textarea
                                        ref={textareaRef}
                                        value={recallText}
                                        onChange={e => setRecallText(e.target.value)}
                                        placeholder="Write what you remember... pattern, approach, key insight, complexity..."
                                        rows={4}
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                                   text-sm text-text-primary placeholder:text-text-disabled
                                                   px-3.5 py-2.5 outline-none resize-none
                                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                                                   transition-all"
                                    />
                                    <p className="text-[10px] text-text-disabled mt-1">
                                        Roediger & Butler (2011): retrieval practice produces stronger long-term retention than re-reading.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ════════════════════════════════════════
                            PHASE 2 — REVEAL + COMPARE
                            ════════════════════════════════════════ */}
                        {phase === 'reveal' && (
                            <div className="p-5 space-y-4">
                                {/* View toggle: side-by-side vs diff.
                                    Diff is disabled if there's no recall text
                                    to compare (nothing to diff against). */}
                                <div className="flex items-center gap-1 bg-surface-2 border border-border-default rounded-lg p-1 w-fit">
                                    <button
                                        type="button"
                                        onClick={() => setRevealView('side-by-side')}
                                        className={cn(
                                            'text-[11px] font-semibold px-3 py-1 rounded-md transition-colors',
                                            revealView === 'side-by-side'
                                                ? 'bg-surface-4 text-text-primary'
                                                : 'text-text-tertiary hover:text-text-primary',
                                        )}
                                    >
                                        Side-by-side
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRevealView('diff')}
                                        disabled={!recallText.trim()}
                                        className={cn(
                                            'text-[11px] font-semibold px-3 py-1 rounded-md transition-colors',
                                            revealView === 'diff'
                                                ? 'bg-surface-4 text-text-primary'
                                                : 'text-text-tertiary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed',
                                        )}
                                        title={
                                            recallText.trim()
                                                ? 'Word-level diff — see exactly what you forgot'
                                                : 'Type a recall next time to unlock the diff view'
                                        }
                                    >
                                        Diff
                                    </button>
                                </div>

                                {revealView === 'diff' ? (
                                    <RecallDiff recallText={recallText} solution={solution} />
                                ) : (
                                <>
                                {/* Comparison grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* What you recalled */}
                                    <div className="rounded-xl border border-border-default bg-surface-2 p-4">
                                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                            What you recalled
                                        </p>
                                        {recallText.trim() ? (
                                            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                                                {recallText}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-text-disabled italic">
                                                Nothing written — that's okay. Did you think it through?
                                            </p>
                                        )}
                                    </div>

                                    {/* Original notes */}
                                    <div className="rounded-xl border border-brand-line bg-brand-soft p-4">
                                        <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest mb-2">
                                            Your original notes
                                        </p>
                                        {hasNotes ? (
                                            <div className="space-y-2">
                                                {solution.patterns?.length > 0 && (
                                                    <div>
                                                        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
                                                        <p className="text-xs font-semibold text-brand-fg-soft">{solution.patterns.join(', ')}</p>
                                                    </div>
                                                )}
                                                {solution.keyInsight && (
                                                    <div>
                                                        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Key Insight</p>
                                                        <p className="text-xs text-text-secondary leading-relaxed">{solution.keyInsight}</p>
                                                    </div>
                                                )}
                                                {(solution.timeComplexity || solution.spaceComplexity) && (
                                                    <div>
                                                        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Complexity</p>
                                                        <p className="text-xs font-mono text-text-secondary">
                                                            {solution.timeComplexity && `T: ${solution.timeComplexity}`}
                                                            {solution.timeComplexity && solution.spaceComplexity && ' · '}
                                                            {solution.spaceComplexity && `S: ${solution.spaceComplexity}`}
                                                        </p>
                                                    </div>
                                                )}
                                                {solution.optimizedApproach && (
                                                    <div>
                                                        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Optimized Approach</p>
                                                        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                                                            {solution.optimizedApproach}
                                                        </p>
                                                    </div>
                                                )}
                                                {stripHtml(solution.feynmanExplanation).length > 10 && (
                                                    <div>
                                                        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Feynman</p>
                                                        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                                                            {stripHtml(solution.feynmanExplanation)}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-text-disabled italic">
                                                No notes recorded. Consider adding key insight and complexity next time.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                </>
                                )}

                                {/* AI Recall Questions — shown in both views */}
                                {reviewHints.isPending && (
                                    <div className="flex items-center gap-2 text-xs text-text-disabled py-2">
                                        <div className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                                        Generating targeted review questions...
                                    </div>
                                )}
                                {aiQuestions && aiQuestions.questions?.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-surface-1 border border-border-default rounded-xl p-4"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                                                <span>🤖</span> AI Recall Check
                                            </p>
                                            <button
                                                onClick={() => setShowAiHints(v => !v)}
                                                className="text-[10px] text-brand-fg-soft hover:text-brand-200 transition-colors"
                                            >
                                                {showAiHints ? 'Hide' : 'Show questions'}
                                            </button>
                                        </div>
                                        {showAiHints && (
                                            <div className="space-y-2.5">
                                                {aiQuestions.questions.map((q, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ opacity: 0, x: -8 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.08 }}
                                                        className="flex items-start gap-2.5 bg-surface-2 rounded-lg p-3"
                                                    >
                                                        <span className="text-[10px] font-bold text-brand-fg-soft flex-shrink-0 mt-0.5">
                                                            Q{i + 1}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-text-primary leading-relaxed">
                                                                {q.question}
                                                            </p>
                                                            <span className={cn(
                                                                'text-[9px] font-bold mt-1 inline-block',
                                                                q.focus === 'pattern' ? 'text-brand-fg-soft'
                                                                    : q.focus === 'complexity' ? 'text-warning-fg'
                                                                        : q.focus === 'edge_case' ? 'text-danger-fg'
                                                                            : 'text-text-disabled'
                                                            )}>
                                                                {q.focus?.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                                {aiQuestions.hint && (
                                                    <p className="text-[11px] text-text-disabled italic px-1">
                                                        💡 {aiQuestions.hint}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        {!showAiHints && (
                                            <p className="text-[11px] text-text-disabled">
                                                {aiQuestions.questions.length} targeted question{aiQuestions.questions.length !== 1 ? 's' : ''} based on your previous weak areas.
                                            </p>
                                        )}
                                    </motion.div>
                                )}

                                {/* Self-assessment prompt */}
                                <div className="bg-surface-2 border border-border-default rounded-xl p-3">
                                    <p className="text-xs font-semibold text-text-primary mb-1">
                                        Compare your recall to your notes honestly.
                                    </p>
                                    <p className="text-xs text-text-tertiary">
                                        If you missed the pattern, key insight, or complexity — rate yourself lower.
                                        SM-2 will adjust the interval and bring it back sooner.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ════════════════════════════════════════
                            PHASE 3 — RATE
                            ════════════════════════════════════════ */}
                        {phase === 'rate' && (
                            <div className="p-5 space-y-4">
                                <div>
                                    <p className="text-sm font-bold text-text-primary mb-1">
                                        How well did you remember this?
                                    </p>
                                    <p className="text-xs text-text-tertiary mb-4">
                                        Be honest — this drives the SM-2 algorithm.
                                        Review #{(solution.reviewCount || 0) + 1}
                                        {solution.sm2Repetitions > 0 && ` · Current EF: ${(solution.sm2EasinessFactor ?? 2.5).toFixed(2)}`}
                                    </p>
                                    <ConfidencePicker value={confidence} onChange={setConfidence} />
                                </div>

                                {/* SM-2 next review preview */}
                                {confidence > 0 && nextDate && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            'flex items-start gap-3 px-4 py-3 rounded-xl border',
                                            isRecallPass
                                                ? 'bg-surface-2 border-border-default'
                                                : 'bg-warning-soft border-warning-line'
                                        )}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round"
                                            className="text-brand-fg-soft flex-shrink-0 mt-0.5">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                        <div className="flex-1">
                                            <p className="text-xs text-text-secondary">
                                                Next review:{' '}
                                                <span className="font-semibold text-brand-fg-soft">{nextDate}</span>
                                                <span className="text-text-disabled ml-1">
                                                    (in {nextDays} day{nextDays !== 1 ? 's' : ''})
                                                </span>
                                            </p>
                                            {/* SM-2 outcome explanation */}
                                            {confidence <= 2 && (
                                                <p className="text-[11px] text-warning-fg mt-1">
                                                    Didn't recall it — repetition counter resets to 0. Back in 1 day.
                                                    EF decreases slightly (harder to space out).
                                                </p>
                                            )}
                                            {confidence === 3 && (
                                                <p className="text-[11px] text-text-tertiary mt-1">
                                                    Recalled with effort — interval advances. EF stays stable.
                                                </p>
                                            )}
                                            {confidence === 4 && (
                                                <p className="text-[11px] text-text-tertiary mt-1">
                                                    Good recall — interval extends. EF increases slightly.
                                                </p>
                                            )}
                                            {confidence === 5 && (
                                                <p className="text-[11px] text-success-fg mt-1">
                                                    Perfect recall — maximum EF increase. Interval extends significantly.
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {/* SM-2 explanation for first-time users */}
                                {(solution.reviewCount || 0) === 0 && (
                                    <div className="bg-info-soft border border-info-line rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-info-fg mb-1">
                                            How SM-2 works
                                        </p>
                                        <p className="text-[10px] text-text-tertiary leading-relaxed">
                                            Your rating adjusts two things: the <strong>interval</strong> (days until next review)
                                            and the <strong>easiness factor</strong> (how fast intervals grow).
                                            High ratings compound into months-long intervals.
                                            Low ratings reset the clock — the item comes back tomorrow.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Footer actions ───────────────────────── */}
                    <div className="flex items-center gap-3 px-5 py-4 border-t border-border-default flex-shrink-0 bg-surface-1">
                        {phase === 'recall' && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { onClose(); navigate(`/problems/${solution.problemId}`) }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    View Problem
                                </Button>
                                <Button variant="primary" size="md" fullWidth onClick={handleReveal}>
                                    Reveal My Notes →
                                </Button>
                            </>
                        )}
                        {phase === 'reveal' && (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => setPhase('recall')}>
                                    ← Back
                                </Button>
                                <Button variant="primary" size="md" fullWidth onClick={() => setPhase('rate')}>
                                    Rate My Memory →
                                </Button>
                            </>
                        )}
                        {phase === 'rate' && (
                            <>
                                <Button variant="ghost" size="sm" onClick={() => setPhase('reveal')}>
                                    ← Back
                                </Button>
                                <Button
                                    variant="primary"
                                    size="md"
                                    fullWidth
                                    disabled={confidence == null}
                                    loading={isSaving}
                                    onClick={() => onSave(confidence, recallText)}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Save Review
                                </Button>
                            </>
                        )}
                    </div>
                </motion.div>
            </div>
        </>
    )
}

// ── Pattern group header ───────────────────────────────
function PatternGroupHeader({ pattern, count, onReviewAll }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                    Pattern
                </span>
                <span className="text-xs font-bold text-brand-fg-soft bg-brand-soft
                                 border border-brand-line rounded-full px-2.5 py-0.5">
                    {pattern || 'No Pattern Tagged'}
                </span>
                <span className="text-[11px] text-text-disabled">
                    {count} due
                </span>
            </div>
            {count > 1 && (
                <button
                    onClick={onReviewAll}
                    className="text-[11px] font-semibold text-brand-fg-soft hover:text-brand-200 transition-colors"
                >
                    Review all →
                </button>
            )}
        </div>
    )
}

// ── Due card ───────────────────────────────────────────
// overdueDays and retentionEstimate come from the server-side
// getReviewQueue endpoint — no client-side computation needed.
function DueCard({ solution, index, onReview }) {
    const overdueDays = solution.overdueDays ?? 0
    const retentionEstimate = solution.retentionEstimate ?? null
    const prevConf = CONFIDENCE_LEVELS.find(c => c.value === solution.confidence)

    // Retention health derived from SM-2 state
    const retentionHealth = (() => {
        const reps = solution.sm2Repetitions ?? 0
        const ef = solution.sm2EasinessFactor ?? 2.5
        if (reps === 0) return null
        if (reps >= 3 && ef >= 2.3) return 'strong'
        if (reps >= 1 && ef >= 1.8) return 'building'
        return 'weak'
    })()

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            className={cn(
                'group bg-surface-1 border rounded-2xl p-5 transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-md',
                overdueDays > 3
                    ? 'border-danger-line hover:border-danger-line'
                    : overdueDays > 0
                        ? 'border-warning-line hover:border-warning-line'
                        : 'border-border-default hover:border-brand-line'
            )}
        >
            <div className="flex items-start gap-4">
                <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border',
                    overdueDays > 3 ? 'bg-danger-soft border-danger-line'
                        : overdueDays > 0 ? 'bg-warning-soft border-warning-line'
                            : 'bg-brand-soft border-brand-line'
                )}>
                    🧠
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-text-primary truncate mb-1">
                                {solution.problem?.title}
                                {/* Admin edited the statement after this solution
                                    was submitted — worth flagging before review. */}
                                {solution.problemVersion != null &&
                                    solution.problem?.version != null &&
                                    solution.problem.version > solution.problemVersion && (
                                        <span
                                            className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-px rounded-full border bg-warning-soft border-warning-line text-warning-fg align-middle"
                                            title={`Problem updated since you solved it (you solved v${solution.problemVersion}, now v${solution.problem.version})`}
                                        >
                                            ✨ Updated
                                        </span>
                                    )}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'} size="xs">
                                    {solution.problem?.difficulty?.charAt(0) +
                                        solution.problem?.difficulty?.slice(1).toLowerCase()}
                                </Badge>
                                {solution.language && (
                                    <span className="text-[11px] text-text-disabled">
                                        {LANGUAGE_LABELS[solution.language] || solution.language}
                                    </span>
                                )}
                                {/* Retention health from SM-2 state */}
                                {retentionHealth && (
                                    <span className={cn(
                                        'text-[9px] font-bold px-1.5 py-px rounded-full border',
                                        retentionHealth === 'strong'
                                            ? 'bg-success-soft text-success-fg border-success-line'
                                            : retentionHealth === 'building'
                                                ? 'bg-warning-soft text-warning-fg border-warning-line'
                                                : 'bg-danger-soft text-danger-fg border-danger-line'
                                    )}>
                                        {retentionHealth === 'strong' ? '↑ Strong'
                                            : retentionHealth === 'building' ? '~ Building'
                                                : '↓ Fragile'}
                                    </span>
                                )}
                                {/* Per-item Ebbinghaus forgetting curve — dashed
                                    tail shows projected decay if skipped */}
                                {retentionEstimate !== null && (
                                    <span
                                        className="inline-flex items-center"
                                        title={`~${retentionEstimate}% estimated retention (Ebbinghaus decay from last review)`}
                                    >
                                        <ForgettingCurve
                                            ef={solution.sm2EasinessFactor ?? 2.5}
                                            reps={solution.sm2Repetitions ?? 0}
                                            daysSinceReview={solution.daysSinceReview ?? overdueDays ?? 0}
                                        />
                                    </span>
                                )}
                            </div>
                        </div>
                        {/* Due badge */}
                        <span className={cn(
                            'text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                            overdueDays > 3
                                ? 'bg-danger-soft text-danger-fg border border-danger-line'
                                : overdueDays > 0
                                    ? 'bg-warning-soft text-warning-fg border border-warning-line'
                                    : 'bg-brand-soft text-brand-fg-soft border border-brand-line'
                        )}>
                            {overdueDays === 0 ? 'Due today'
                                : overdueDays === 1 ? '1d overdue'
                                    : `${overdueDays}d overdue`}
                        </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-text-tertiary mb-3 flex-wrap">
                        <span>Solved {formatRelativeDate(solution.createdAt)}</span>
                        {solution.reviewCount > 0 && (
                            <span>Reviewed {solution.reviewCount}x</span>
                        )}
                        {solution.sm2Repetitions > 0 && (
                            <span className="font-mono">
                                EF {(solution.sm2EasinessFactor ?? 2.5).toFixed(1)}
                            </span>
                        )}
                        {prevConf && (
                            <span className="flex items-center gap-1">
                                Last: {prevConf.emoji}
                                <span className={cn('font-semibold', prevConf.color)}>
                                    {prevConf.label}
                                </span>
                            </span>
                        )}
                    </div>

                    {/* Key insight preview */}
                    {solution.keyInsight && (
                        <p className="text-xs text-text-tertiary leading-relaxed mb-3
                                       border-l-2 border-brand-line pl-3 italic line-clamp-2">
                            "{solution.keyInsight}"
                        </p>
                    )}

                    <Button variant="primary" size="sm" onClick={() => onReview(solution)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Start Review
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}

// ── Upcoming card ──────────────────────────────────────
// daysUntil computed from nextReviewDate provided by server
function UpcomingCard({ solution, index }) {
    const navigate = useNavigate()

    const daysUntil = useMemo(() => {
        if (!solution.nextReviewDate) return null
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const next = new Date(solution.nextReviewDate)
        next.setHours(0, 0, 0, 0)
        const diff = Math.round((next - now) / 86400000)
        return diff > 0 ? diff : null
    }, [solution.nextReviewDate])

    if (daysUntil === null) return null

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: index * 0.03 }}
            onClick={() => navigate(`/problems/${solution.problemId}`)}
            className="flex items-center gap-3 p-3.5 rounded-xl border
                       bg-surface-1 border-border-default
                       hover:border-border-strong cursor-pointer transition-all"
        >
            <div className="w-8 h-8 rounded-lg bg-surface-3 border border-border-default
                            flex items-center justify-center flex-shrink-0 text-sm">
                📅
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">
                    {solution.problem?.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'} size="xs">
                        {solution.problem?.difficulty?.charAt(0) +
                            solution.problem?.difficulty?.slice(1).toLowerCase()}
                    </Badge>
                    {solution.patterns?.length > 0 && (
                        <span className="text-[10px] text-brand-fg-soft">{solution.patterns.join(', ')}</span>
                    )}
                    <span className="text-[11px] text-text-tertiary">
                        in {daysUntil} day{daysUntil !== 1 ? 's' : ''}
                    </span>
                    {solution.sm2Interval && (
                        <span className="text-[9px] font-mono text-text-disabled">
                            {solution.sm2Interval}d interval
                        </span>
                    )}
                </div>
            </div>
            <span className={cn(
                'text-[10px] font-bold flex-shrink-0',
                daysUntil <= 2 ? 'text-warning-fg' : 'text-text-disabled'
            )}>
                {daysUntil <= 2
                    ? 'Soon'
                    : formatShortDate(new Date(Date.now() + daysUntil * 86400000))}
            </span>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ReviewQueuePage() {
    const navigate = useNavigate()
    const [reviewing, setReviewing] = useState(null)
    const [reviewed, setReviewed] = useState([])
    const [showBanner, setShowBanner] = useState(false)
    const [sessionCount, setSessionCount] = useState(0)
    const [groupByPattern, setGroupByPattern] = useState(false)

    // Server-side filtered queue — no client-side date math needed
    const { data: queueData, isLoading } = useReviewQueue()
    const reviewMutation = useSubmitReview()

    // Filter out items reviewed this session (optimistic removal)
    const due = useMemo(() => {
        if (!queueData?.due) return []
        return queueData.due.filter(s => !reviewed.includes(s.id))
    }, [queueData, reviewed])

    const upcoming = queueData?.upcoming || []

    // Pattern groups for due solutions
    const patternGroups = useMemo(() => {
        if (!due.length) return {}
        const groups = {}
        // Group by the primary (first) pattern. Multi-pattern solutions
        // still show all their patterns in the card; this is about which
        // bucket they land in.
        due.forEach(s => {
            const key = s.patterns?.[0] || 'No Pattern'
            if (!groups[key]) groups[key] = []
            groups[key].push(s)
        })
        return groups
    }, [due])

    // Save review — sends confidence + recall attempt to the server.
    // Server computes SM-2 state, creates a ReviewAttempt row, returns
    // next interval.
    async function handleSaveReview(confidenceLevel, recallText) {
        if (!reviewing) return

        await reviewMutation.mutateAsync({
            solutionId: reviewing.id,
            confidence: confidenceLevel,
            recallText: recallText?.trim() || null,
        })

        setReviewed(prev => [...prev, reviewing.id])
        setSessionCount(c => c + 1)
        setReviewing(null)

        if (due.length - 1 === 0) {
            setShowBanner(true)
        }
    }

    const totalDue = due.length
    const totalDoneToday = reviewed.length
    const progressPct = totalDoneToday + totalDue > 0
        ? Math.round((totalDoneToday / (totalDoneToday + totalDue)) * 100)
        : 0

    // reviewedToday: count from server data + this session
    const reviewedToday = useMemo(() => {
        if (!queueData) return totalDoneToday
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        // Server returns all due items — we approximate today's total
        // from session count since queue only returns due/upcoming
        return totalDoneToday
    }, [queueData, totalDoneToday])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary animate-pulse">
                        Loading your review queue...
                    </p>
                </div>
            </div>
        )
    }

    const hasAnyData = due.length > 0 || upcoming.length > 0 || totalDoneToday > 0

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Review Queue
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        SM-2 spaced repetition + active recall — the fastest path to long-term retention
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {totalDue > 1 && (
                        <button
                            onClick={() => setGroupByPattern(v => !v)}
                            className={cn(
                                'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
                                groupByPattern
                                    ? 'bg-brand-soft border-brand-line text-brand-fg-soft'
                                    : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary'
                            )}
                        >
                            {groupByPattern ? '📋 By Pattern' : '📋 Group by Pattern'}
                        </button>
                    )}
                    {totalDue > 0 && (
                        <Button variant="primary" size="md" onClick={() => setReviewing(due[0])}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Start Session ({totalDue})
                        </Button>
                    )}
                </div>
            </div>

            {/* Flashcards (gated, hidden when feature flag is off) */}
            <div className="mb-6">
                <FlashcardReviewSection />
            </div>

            {/* Session complete banner */}
            <AnimatePresence>
                {showBanner && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="bg-success-soft border border-success-line rounded-2xl p-5
                                   flex items-center gap-4 mb-6"
                    >
                        <div className="text-3xl flex-shrink-0">🎉</div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-success-fg">Review session complete!</p>
                            <p className="text-xs text-text-secondary mt-0.5">
                                You actively recalled {sessionCount} problem{sessionCount !== 1 ? 's' : ''}.
                                SM-2 has updated each interval based on your ratings.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowBanner(false)}
                            className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Recall-quality analytics — collapsible panel */}
            <div className="mb-6">
                <RecallAnalyticsPanel />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                    {
                        label: 'Due Now',
                        value: totalDue,
                        icon: '🧠',
                        color: totalDue > 0 ? 'text-warning-fg' : 'text-success-fg',
                        bg: totalDue > 0 ? 'bg-warning-soft border-warning-line' : 'bg-success-soft border-success-line',
                    },
                    {
                        label: 'Done This Session',
                        value: totalDoneToday,
                        icon: '✅',
                        color: 'text-success-fg',
                        bg: 'bg-success-soft border-success-line',
                    },
                    {
                        label: 'Coming (14d)',
                        value: upcoming.length,
                        icon: '📅',
                        color: 'text-brand-fg-soft',
                        bg: 'bg-brand-soft border-brand-line',
                    },
                    {
                        label: 'Total Tracked',
                        value: (queueData?.due?.length ?? 0) + (queueData?.upcoming?.length ?? 0),
                        icon: '📚',
                        color: 'text-text-secondary',
                        bg: 'bg-surface-3 border-border-default',
                    },
                ].map((card, i) => (
                    <motion.div
                        key={card.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={cn('rounded-xl border p-4 text-center', card.bg)}
                    >
                        <div className="text-2xl mb-1">{card.icon}</div>
                        <div className={cn('text-2xl font-extrabold font-mono', card.color)}>
                            {card.value}
                        </div>
                        <div className="text-[11px] text-text-disabled uppercase tracking-wider mt-1">
                            {card.label}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Progress bar */}
            {(totalDue > 0 || totalDoneToday > 0) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-text-tertiary font-medium">Session progress</span>
                        <span className="font-bold text-text-primary">
                            {totalDoneToday} / {totalDoneToday + totalDue} reviewed
                        </span>
                    </div>
                    <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-brand-400 to-success rounded-full"
                        />
                    </div>
                </motion.div>
            )}

            {/* Active recall explanation — shown before first review this session */}
            {totalDue > 0 && !reviewed.length && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-brand-soft border border-brand-line rounded-xl p-4 mb-6"
                >
                    <div className="flex items-start gap-3">
                        <span className="text-lg flex-shrink-0">🧪</span>
                        <div>
                            <p className="text-xs font-bold text-text-primary mb-1">
                                SM-2 Spaced Repetition — Active Recall Mode
                            </p>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                3 phases per review: <strong>Recall</strong> (try to remember without notes),
                                <strong> Reveal</strong> (compare + AI questions),
                                <strong> Rate</strong> (honest confidence). Your rating drives the SM-2 algorithm —
                                high ratings space items to weeks, low ratings reset to tomorrow.
                                Items are sorted by most forgotten first (Ebbinghaus retention estimate).
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Due now section */}
            {totalDue > 0 ? (
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                        <span className="text-warning-fg">⚡</span>
                        Due Now
                        <Badge variant="warning" size="xs">{totalDue}</Badge>
                        <span className="text-[10px] font-normal text-text-disabled ml-1">
                            sorted by most overdue · fragile memories first
                        </span>
                    </h2>
                    {groupByPattern ? (
                        <div className="space-y-6">
                            {Object.entries(patternGroups)
                                .sort(([, a], [, b]) => b.length - a.length)
                                .map(([pattern, patternSolutions]) => (
                                    <div key={pattern}>
                                        <PatternGroupHeader
                                            pattern={pattern}
                                            count={patternSolutions.length}
                                            onReviewAll={() => setReviewing(patternSolutions[0])}
                                        />
                                        <motion.div layout className="space-y-3">
                                            <AnimatePresence mode="popLayout">
                                                {patternSolutions.map((s, i) => (
                                                    <DueCard key={s.id} solution={s} index={i} onReview={setReviewing} />
                                                ))}
                                            </AnimatePresence>
                                        </motion.div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <motion.div layout className="space-y-3">
                            <AnimatePresence mode="popLayout">
                                {due.map((s, i) => (
                                    <DueCard key={s.id} solution={s} index={i} onReview={setReviewing} />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-surface-1 border border-success-line rounded-2xl p-10 text-center mb-8"
                >
                    <div className="text-5xl mb-4">
                        {totalDoneToday > 0 ? '🎉' : '✅'}
                    </div>
                    <h2 className="text-lg font-bold text-text-primary mb-2">
                        {totalDoneToday > 0
                            ? `Great session! ${totalDoneToday} review${totalDoneToday !== 1 ? 's' : ''} done.`
                            : 'All caught up!'
                        }
                    </h2>
                    <p className="text-sm text-text-tertiary max-w-sm mx-auto mb-5">
                        {upcoming.length > 0
                            ? `You have ${upcoming.length} review${upcoming.length !== 1 ? 's' : ''} coming up in the next 14 days.`
                            : 'No reviews scheduled. Keep solving problems to build your queue.'
                        }
                    </p>
                    <Button variant="secondary" size="md" onClick={() => navigate('/problems')}>
                        Browse Problems
                    </Button>
                </motion.div>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                        <span>📅</span>
                        Coming Up
                        <span className="text-xs text-text-disabled font-normal">next 14 days</span>
                    </h2>
                    <div className="space-y-2">
                        {upcoming.map((s, i) => (
                            <UpcomingCard key={s.id} solution={s} index={i} />
                        ))}
                    </div>
                </div>
            )}

            {/* How it works — shown when no data at all */}
            {!hasAnyData && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6"
                >
                    <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>📖</span> How SM-2 Spaced Repetition Works
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                step: '1', icon: '📝',
                                title: 'Solve a problem',
                                desc: 'Submit a solution. SM-2 initializes with an easiness factor based on your confidence. First review is scheduled for tomorrow.',
                            },
                            {
                                step: '2', icon: '🧠',
                                title: 'Active recall',
                                desc: 'When due, try to recall from memory before looking at your notes. Retrieval practice is 2-3x more effective than re-reading (Roediger & Butler, 2011).',
                            },
                            {
                                step: '3', icon: '📈',
                                title: 'SM-2 adaptive intervals',
                                desc: 'Your rating adjusts the easiness factor and interval. Perfect recall compounds into months-long gaps. Forgetting resets to 1 day — the algorithm finds your personal forgetting rate.',
                            },
                        ].map(item => (
                            <div
                                key={item.step}
                                className="bg-surface-2 border border-border-default rounded-xl p-4"
                            >
                                <div className="text-2xl mb-2">{item.icon}</div>
                                <p className="text-xs font-bold text-text-primary mb-1">{item.title}</p>
                                <p className="text-xs text-text-tertiary leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 text-center">
                        <Button variant="primary" size="md" onClick={() => navigate('/problems')}>
                            Start Solving Problems
                        </Button>
                    </div>
                </motion.div>
            )}

            {/* Review modal */}
            <AnimatePresence>
                {reviewing && (
                    <ReviewModal
                        solution={reviewing}
                        onClose={() => setReviewing(null)}
                        onSave={handleSaveReview}
                        isSaving={reviewMutation.isPending}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}