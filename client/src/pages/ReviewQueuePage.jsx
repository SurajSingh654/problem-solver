import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMySolutions, useUpdateSolution } from '@hooks/useSolutions'
import { useReviewHints } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatRelativeDate, formatShortDate } from '@utils/formatters'
import { CONFIDENCE_LEVELS, LANGUAGE_LABELS } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── SM-2 inspired interval calculator ─────────────────
// Accounts for review count, not just confidence level.
// Higher repetitions = longer intervals for the same confidence.
function calculateNextInterval(confidence, reviewCount) {
    // Base intervals by confidence (days)
    const baseIntervals = { 1: 1, 2: 1, 3: 3, 4: 7, 5: 14 }
    const base = baseIntervals[confidence] || 1

    if (confidence <= 2) {
        // Forgot it — reset to short interval regardless of history
        return 1
    }

    // Scale up based on review count — well-reviewed items get longer gaps
    const multiplier = Math.min(1 + (reviewCount - 1) * 0.3, 3)
    return Math.round(base * multiplier)
}

// ── Date helpers ───────────────────────────────────────
function getToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

function isDue(reviewDates) {
    if (!reviewDates?.length) return false
    const today = getToday()
    return reviewDates.some(d => {
        const rd = new Date(d)
        rd.setHours(0, 0, 0, 0)
        return rd <= today
    })
}

function getOverdueDays(reviewDates) {
    if (!reviewDates?.length) return 0
    const today = getToday()
    const dueDates = reviewDates
        .map(d => { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd })
        .filter(d => d <= today)
        .sort((a, b) => a - b)
    if (!dueDates.length) return 0
    return Math.round((today - dueDates[0]) / 86400000)
}

function getNextUpcoming(reviewDates) {
    if (!reviewDates?.length) return null
    const today = getToday()
    const future = reviewDates
        .map(d => { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd })
        .filter(d => d > today)
        .sort((a, b) => a - b)
    if (!future.length) return null
    return Math.round((future[0] - today) / 86400000)
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
                            ? 'bg-brand-400/15 border-brand-400/40 scale-105'
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
                isLow ? 'text-danger animate-pulse' : 'text-text-tertiary'
            )}>
                {mins}:{secs}
            </span>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// REVIEW MODAL — Two-phase active recall
// ══════════════════════════════════════════════════════
function ReviewModal({ solution, onClose, onSave, isSaving }) {
    const navigate = useNavigate()
    const reviewHints = useReviewHints()

    // Phase: 'recall' | 'reveal' | 'rate'
    const [phase, setPhase] = useState('recall')
    const [recallText, setRecallText] = useState('')
    const [confidence, setConfidence] = useState(solution.confidence || 0)
    const [timerExpired, setTimerExpired] = useState(false)
    const [aiQuestions, setAiQuestions] = useState(null)
    const [showAiHints, setShowAiHints] = useState(false)
    const textareaRef = useRef(null)

    // Focus textarea on mount
    useEffect(() => {
        if (phase === 'recall') {
            setTimeout(() => textareaRef.current?.focus(), 200)
        }
    }, [phase])

    // Fetch AI hints when revealing
    async function handleReveal() {
        setPhase('reveal')
        // Fire AI hint generation in background — don't block reveal
        try {
            const res = await reviewHints.mutateAsync(solution.id)
            setAiQuestions(res.data.data)
        } catch {
            // Silent — AI hints are enhancement, not critical
        }
    }

    function handleTimerExpire() {
        setTimerExpired(true)
    }

    const nextDays = calculateNextInterval(confidence, (solution.reviewCount || 0) + 1)
    const nextDate = confidence > 0
        ? (() => {
            const d = new Date()
            d.setDate(d.getDate() + nextDays)
            return formatShortDate(d)
        })()
        : null

    // What fields does this solution have to show in reveal
    const hasNotes = solution.keyInsight || solution.optimizedApproach ||
        stripHtml(solution.feynmanExplanation) || solution.timeComplexity

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
                                {/* Phase indicator */}
                                <span className={cn(
                                    'text-[9px] font-bold px-2 py-px rounded-full border ml-auto',
                                    phase === 'recall' ? 'bg-warning/10 text-warning border-warning/25'
                                        : phase === 'reveal' ? 'bg-info/10 text-info border-info/25'
                                            : 'bg-success/10 text-success border-success/25'
                                )}>
                                    {phase === 'recall' ? '① Recall' : phase === 'reveal' ? '② Review' : '③ Rate'}
                                </span>
                            </div>
                            <h2 className="text-base font-bold text-text-primary leading-snug">
                                {solution.problem?.title}
                            </h2>
                            <p className="text-xs text-text-disabled mt-0.5">
                                Review #{(solution.reviewCount || 0) + 1} · Solved {formatRelativeDate(solution.createdAt)}
                            </p>
                        </div>
                        {phase !== 'recall' && (
                            <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
                                <div className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-bold text-text-primary">
                                            🧠 Before looking at your notes...
                                        </p>
                                        {!timerExpired && (
                                            <RecallTimer seconds={90} onExpire={handleTimerExpire} />
                                        )}
                                        {timerExpired && (
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
                                        { icon: '💡', label: 'Key Insight', q: `What's the "aha" moment?` },
                                        { icon: '⏱', label: 'Complexity', q: 'Time & space complexity?' },
                                    ].map(p => (
                                        <div key={p.label}
                                            className="bg-surface-2 border border-border-default rounded-xl p-3 text-center">
                                            <span className="text-lg">{p.icon}</span>
                                            <p className="text-[10px] font-bold text-text-primary mt-1">{p.label}</p>
                                            <p className="text-[10px] text-text-disabled mt-0.5 leading-tight">{p.q}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Recall textarea */}
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                        Your recall (optional — typing helps retention)
                                    </label>
                                    <textarea
                                        ref={textareaRef}
                                        value={recallText}
                                        onChange={e => setRecallText(e.target.value)}
                                        placeholder="Write what you remember about this problem... pattern, approach, key insight, complexity..."
                                        rows={4}
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                               text-sm text-text-primary placeholder:text-text-disabled
                               px-3.5 py-2.5 outline-none resize-none
                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                               transition-all"
                                    />
                                    <p className="text-[10px] text-text-disabled mt-1">
                                        Research shows writing activates recall better than just reading. Even a few words helps.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ════════════════════════════════════════
                PHASE 2 — REVEAL + COMPARE
                ════════════════════════════════════════ */}
                        {phase === 'reveal' && (
                            <div className="p-5 space-y-4">
                                {/* Comparison */}
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
                                    <div className="rounded-xl border border-brand-400/20 bg-brand-400/3 p-4">
                                        <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-2">
                                            Your original notes
                                        </p>
                                        {hasNotes ? (
                                            <div className="space-y-2">
                                                {solution.pattern && (
                                                    <div>
                                                        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
                                                        <p className="text-xs font-semibold text-brand-300">{solution.pattern}</p>
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

                                {/* AI Recall Questions */}
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
                                                className="text-[10px] text-brand-300 hover:text-brand-200 transition-colors"
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
                                                        <span className="text-[10px] font-bold text-brand-300 flex-shrink-0 mt-0.5">
                                                            Q{i + 1}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-text-primary leading-relaxed">
                                                                {q.question}
                                                            </p>
                                                            <span className={cn(
                                                                'text-[9px] font-bold mt-1 inline-block',
                                                                q.focus === 'pattern' ? 'text-brand-300' :
                                                                    q.focus === 'complexity' ? 'text-warning' :
                                                                        q.focus === 'edge_case' ? 'text-danger' : 'text-text-disabled'
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
                                        The intervals will adjust and bring it back sooner.
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
                                        Be honest — this determines when you'll see it next. Based on {(solution.reviewCount || 0) + 1} total reviews.
                                    </p>
                                    <ConfidencePicker value={confidence} onChange={setConfidence} />
                                </div>

                                {/* Next review preview */}
                                {confidence > 0 && nextDate && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl
                               bg-surface-2 border border-border-default"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" strokeWidth="2"
                                            strokeLinecap="round" strokeLinejoin="round"
                                            className="text-brand-300 flex-shrink-0">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                        <div>
                                            <p className="text-xs text-text-secondary">
                                                Next review:{' '}
                                                <span className="font-semibold text-brand-300">{nextDate}</span>
                                                <span className="text-text-disabled ml-1">
                                                    (in {nextDays} day{nextDays !== 1 ? 's' : ''})
                                                </span>
                                            </p>
                                            {confidence <= 2 && (
                                                <p className="text-[11px] text-warning mt-0.5">
                                                    Low confidence — will review again soon to reinforce
                                                </p>
                                            )}
                                            {confidence >= 4 && (solution.reviewCount || 0) >= 2 && (
                                                <p className="text-[11px] text-success mt-0.5">
                                                    Strong retention — interval extended based on your history
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Footer actions ───────────────────────── */}
                    <div className="flex items-center gap-3 px-5 py-4 border-t border-border-default flex-shrink-0 bg-surface-1">
                        {phase === 'recall' && (
                            <>
                                <Button variant="ghost" size="sm"
                                    onClick={() => { onClose(); navigate(`/problems/${solution.problemId}`) }}>
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
                                    disabled={confidence === 0}
                                    loading={isSaving}
                                    onClick={() => onSave(confidence)}
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
                <span className="text-xs font-bold text-brand-300 bg-brand-400/10
                         border border-brand-400/20 rounded-full px-2.5 py-0.5">
                    {pattern || 'No Pattern Tagged'}
                </span>
                <span className="text-[11px] text-text-disabled">
                    {count} due
                </span>
            </div>
            {count > 1 && (
                <button
                    onClick={onReviewAll}
                    className="text-[11px] font-semibold text-brand-300 hover:text-brand-200 transition-colors"
                >
                    Review all →
                </button>
            )}
        </div>
    )
}

// ── Due card ───────────────────────────────────────────
function DueCard({ solution, index, onReview }) {
    const overdueDays = getOverdueDays(solution.reviewDates)
    const prevConf = CONFIDENCE_LEVELS.find(c => c.value === solution.confidence)

    // Retention health: based on review count and last confidence
    // Low confidence + many reviews = struggling. High confidence + few reviews = not enough data.
    const retentionHealth = (() => {
        const conf = solution.confidence || 0
        const reviews = solution.reviewCount || 0
        if (reviews === 0) return null
        if (conf >= 4 && reviews >= 2) return 'strong'
        if (conf >= 3) return 'building'
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
                    ? 'border-danger/25 hover:border-danger/40'
                    : overdueDays > 0
                        ? 'border-warning/25 hover:border-warning/40'
                        : 'border-border-default hover:border-brand-400/30'
            )}
        >
            <div className="flex items-start gap-4">
                <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border',
                    overdueDays > 3 ? 'bg-danger/10 border-danger/25'
                        : overdueDays > 0 ? 'bg-warning/10 border-warning/25'
                            : 'bg-brand-400/10 border-brand-400/20'
                )}>
                    🧠
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-text-primary truncate mb-1">
                                {solution.problem?.title}
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
                                {/* Retention health indicator */}
                                {retentionHealth && (
                                    <span className={cn(
                                        'text-[9px] font-bold px-1.5 py-px rounded-full border',
                                        retentionHealth === 'strong'
                                            ? 'bg-success/10 text-success border-success/20'
                                            : retentionHealth === 'building'
                                                ? 'bg-warning/10 text-warning border-warning/20'
                                                : 'bg-danger/10 text-danger border-danger/20'
                                    )}>
                                        {retentionHealth === 'strong' ? '↑ Strong retention'
                                            : retentionHealth === 'building' ? '~ Building'
                                                : '↓ Fragile'}
                                    </span>
                                )}
                            </div>
                        </div>
                        {/* Due badge */}
                        <span className={cn(
                            'text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                            overdueDays > 3 ? 'bg-danger/15 text-danger border border-danger/30'
                                : overdueDays > 0 ? 'bg-warning/15 text-warning border border-warning/30'
                                    : 'bg-brand-400/12 text-brand-300 border border-brand-400/25'
                        )}>
                            {overdueDays === 0 ? 'Due today'
                                : overdueDays === 1 ? '1d overdue'
                                    : `${overdueDays}d overdue`}
                        </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-text-tertiary mb-3 flex-wrap">
                        <span>Solved {formatRelativeDate(solution.createdAt)}</span>
                        {solution.reviewCount > 0 && (
                            <span>Reviewed {solution.reviewCount}x</span>
                        )}
                        {prevConf && (
                            <span className="flex items-center gap-1">
                                Last rating: {prevConf.emoji}
                                <span className={cn('font-semibold', prevConf.color)}>
                                    {prevConf.label}
                                </span>
                            </span>
                        )}
                    </div>

                    {/* Key insight preview */}
                    {solution.keyInsight && (
                        <p className="text-xs text-text-tertiary leading-relaxed mb-3
                          border-l-2 border-brand-400/30 pl-3 italic line-clamp-2">
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
function UpcomingCard({ solution, index }) {
    const navigate = useNavigate()
    const daysUntil = getNextUpcoming(solution.reviewDates)
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
                    {solution.pattern && (
                        <span className="text-[10px] text-brand-300">{solution.pattern}</span>
                    )}
                    <span className="text-[11px] text-text-tertiary">
                        in {daysUntil} day{daysUntil !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
            <span className={cn(
                'text-[10px] font-bold flex-shrink-0',
                daysUntil <= 2 ? 'text-warning' : 'text-text-disabled'
            )}>
                {daysUntil <= 2 ? 'Soon' : formatShortDate(new Date(Date.now() + daysUntil * 86400000))}
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

    const { data: solutions, isLoading } = useMySolutions()
    const reviewMutation = useUpdateSolution()

    // Categorise solutions
    const { due, upcoming } = useMemo(() => {
        if (!solutions) return { due: [], upcoming: [] }
        const today = getToday()
        const in7 = new Date(today)
        in7.setDate(in7.getDate() + 7)

        const due = []
        const upcoming = []

        solutions.forEach(s => {
            if (!s.reviewDates?.length) return
            if (reviewed.includes(s.id)) return

            if (isDue(s.reviewDates)) {
                due.push(s)
                return
            }
            const daysUntil = getNextUpcoming(s.reviewDates)
            if (daysUntil !== null && daysUntil <= 7) {
                upcoming.push(s)
            }
        })

        // Sort due: most overdue first
        due.sort((a, b) => getOverdueDays(b.reviewDates) - getOverdueDays(a.reviewDates))

        return { due, upcoming }
    }, [solutions, reviewed])

    // Pattern groups for due solutions
    const patternGroups = useMemo(() => {
        if (!due.length) return {}
        const groups = {}
        due.forEach(s => {
            const key = s.pattern || 'No Pattern'
            if (!groups[key]) groups[key] = []
            groups[key].push(s)
        })
        return groups
    }, [due])

    async function handleSaveReview(confidenceLevel) {
        if (!reviewing) return

        // Compute smart next review date using SM-2 inspired formula
        const nextDays = calculateNextInterval(
            confidenceLevel,
            (reviewing.reviewCount || 0) + 1
        )
        const nextReviewDate = new Date()
        nextReviewDate.setDate(nextReviewDate.getDate() + nextDays)

        await reviewMutation.mutateAsync({
            solutionId: reviewing.id,
            data: {
                confidence: confidenceLevel,
                nextReviewDate: nextReviewDate.toISOString(),
            },
        })

        const newReviewed = [...reviewed, reviewing.id]
        setReviewed(newReviewed)
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

    // Streak computation — solutions reviewed today
    const reviewedToday = useMemo(() => {
        if (!solutions) return 0
        const today = getToday()
        return solutions.filter(s => {
            if (!s.lastReviewedAt) return false
            const lr = new Date(s.lastReviewedAt)
            lr.setHours(0, 0, 0, 0)
            return lr.getTime() === today.getTime()
        }).length + totalDoneToday
    }, [solutions, totalDoneToday])

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

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Review Queue
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Active recall + spaced repetition — the fastest path to retention
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {totalDue > 1 && (
                        <button
                            onClick={() => setGroupByPattern(v => !v)}
                            className={cn(
                                'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
                                groupByPattern
                                    ? 'bg-brand-400/15 border-brand-400/30 text-brand-300'
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

            {/* Session complete banner */}
            <AnimatePresence>
                {showBanner && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="bg-success/10 border border-success/30 rounded-2xl p-5
                       flex items-center gap-4 mb-6"
                    >
                        <div className="text-3xl flex-shrink-0">🎉</div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-success">Review session complete!</p>
                            <p className="text-xs text-text-secondary mt-0.5">
                                You actively recalled {sessionCount} problem{sessionCount !== 1 ? 's' : ''}.
                                Each review strengthens the neural pathway.
                            </p>
                        </div>
                        <button onClick={() => setShowBanner(false)}
                            className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                    {
                        label: 'Due Now',
                        value: totalDue,
                        icon: '🧠',
                        color: totalDue > 0 ? 'text-warning' : 'text-success',
                        bg: totalDue > 0 ? 'bg-warning/10 border-warning/20' : 'bg-success/10 border-success/20',
                    },
                    {
                        label: 'Done Today',
                        value: reviewedToday,
                        icon: '✅',
                        color: 'text-success',
                        bg: 'bg-success/10 border-success/20',
                    },
                    {
                        label: 'Coming (7d)',
                        value: upcoming.length,
                        icon: '📅',
                        color: 'text-brand-300',
                        bg: 'bg-brand-400/10 border-brand-400/20',
                    },
                    {
                        label: 'Total Tracked',
                        value: solutions?.filter(s => s.reviewDates?.length).length || 0,
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
                        <span className="text-text-tertiary font-medium">Today's session</span>
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

            {/* Active recall explanation — shown on first use */}
            {totalDue > 0 && !reviewed.length && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4 mb-6"
                >
                    <div className="flex items-start gap-3">
                        <span className="text-lg flex-shrink-0">🧪</span>
                        <div>
                            <p className="text-xs font-bold text-text-primary mb-1">
                                Active Recall Mode — New!
                            </p>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                Each review now has 3 phases: <strong>Recall</strong> (try to remember without notes),
                                <strong> Reveal</strong> (compare with your original notes + AI-generated questions),
                                <strong> Rate</strong> (honest confidence rating). Research shows this is 2-3x more effective
                                than passive re-reading.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Due now section */}
            {totalDue > 0 ? (
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                        <span className="text-warning">⚡</span>
                        Due Now
                        <Badge variant="warning" size="xs">{totalDue}</Badge>
                    </h2>

                    {groupByPattern ? (
                        // Pattern-grouped view
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
                        // Flat list view
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
                // All caught up
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-surface-1 border border-success/25 rounded-2xl p-10 text-center mb-8"
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
                            ? `You have ${upcoming.length} review${upcoming.length !== 1 ? 's' : ''} coming up in the next 7 days.`
                            : "No reviews scheduled. Keep solving problems to build your queue."
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
                        <span className="text-xs text-text-disabled font-normal">next 7 days</span>
                    </h2>
                    <div className="space-y-2">
                        {upcoming
                            .sort((a, b) => (getNextUpcoming(a.reviewDates) || 99) - (getNextUpcoming(b.reviewDates) || 99))
                            .map((s, i) => (
                                <UpcomingCard key={s.id} solution={s} index={i} />
                            ))}
                    </div>
                </div>
            )}

            {/* How it works — shown when no solutions */}
            {!solutions?.length && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6"
                >
                    <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>📖</span> How Active Recall + Spaced Repetition Works
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                step: '1', icon: '📝',
                                title: 'Solve a problem',
                                desc: 'Submit a solution. Review dates are automatically scheduled using spaced repetition.',
                            },
                            {
                                step: '2', icon: '🧠',
                                title: 'Active recall',
                                desc: 'Come back here when due. Try to recall the solution from memory — then compare with your notes.',
                            },
                            {
                                step: '3', icon: '📈',
                                title: 'Adaptive intervals',
                                desc: 'High confidence + more reviews = longer gap. Forgot it = back in 1 day. Intervals compound over time.',
                            },
                        ].map(item => (
                            <div key={item.step}
                                className="bg-surface-2 border border-border-default rounded-xl p-4">
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