import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMySolutions, useReviewSolution } from '@hooks/useSolutions'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'
import {
    formatRelativeDate, formatShortDate, formatDuration,
} from '@utils/formatters'
import {
    CONFIDENCE_LEVELS, LANGUAGE_LABELS, PATTERNS,
} from '@utils/constants'
import useAuthStore from '@store/useAuthStore'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Date helpers ───────────────────────────────────────
function getToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

function getDueInfo(reviewDates) {
    if (!reviewDates?.length) return null
    const today = getToday()
    const dates = reviewDates
        .map(d => { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd })
        .sort((a, b) => a - b)

    const due = dates.find(d => d <= today)
    if (!due) return null

    const diff = Math.round((today - due) / 86400000)
    return {
        date: due,
        overdue: diff > 0,
        days: diff,
        label: diff === 0 ? 'Due today' : `${diff}d overdue`,
    }
}

function getUpcomingInfo(reviewDates) {
    if (!reviewDates?.length) return null
    const today = getToday()
    const future = reviewDates
        .map(d => { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd })
        .filter(d => d > today)
        .sort((a, b) => a - b)
    if (!future.length) return null
    const diff = Math.round((future[0] - today) / 86400000)
    return { date: future[0], daysUntil: diff }
}

// ── Confidence selector ────────────────────────────────
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

// ── Review modal ───────────────────────────────────────
function ReviewModal({ solution, onClose, onSave, isSaving }) {
    const navigate = useNavigate()
    const [confidence, setConfidence] = useState(solution.confidenceLevel || 0)

    const intervalMap = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 21 }
    const nextDays = intervalMap[confidence]
    const nextDate = nextDays
        ? (() => {
            const d = new Date()
            d.setDate(d.getDate() + nextDays)
            return formatShortDate(d)
        })()
        : null

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-overlay bg-black/65 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -16 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    className="w-full max-w-lg bg-surface-1 border border-border-strong
                     rounded-2xl shadow-xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 p-6
                          border-b border-border-default">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <Badge
                                    variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'}
                                    size="xs"
                                >
                                    {solution.problem?.difficulty?.charAt(0) +
                                        solution.problem?.difficulty?.slice(1).toLowerCase()}
                                </Badge>
                                {solution.patternIdentified && (
                                    <span className="text-xs text-brand-300 bg-brand-400/10
                                   border border-brand-400/20 rounded-full
                                   px-2 py-px font-medium">
                                        {solution.patternIdentified}
                                    </span>
                                )}
                                <Badge variant="gray" size="xs">
                                    {LANGUAGE_LABELS[solution.language] || solution.language}
                                </Badge>
                            </div>
                            <h2 className="text-base font-bold text-text-primary leading-snug">
                                {solution.problem?.title}
                            </h2>
                            <p className="text-xs text-text-tertiary mt-1">
                                Solved {formatRelativeDate(solution.solvedAt)}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-text-tertiary hover:text-text-primary transition-colors
                         flex-shrink-0 mt-0.5"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    {/* Solution recap */}
                    <div className="px-6 py-4 space-y-3 max-h-[260px] overflow-y-auto">
                        {solution.keyInsight && (
                            <RecapRow icon="💡" label="Key Insight" value={solution.keyInsight} />
                        )}
                        {solution.optimizedApproach && (
                            <RecapRow icon="⚡" label="Optimized Approach" value={solution.optimizedApproach} />
                        )}
                        {solution.optimizedTime && (
                            <RecapRow
                                icon="📊"
                                label="Complexity"
                                value={`Time: ${solution.optimizedTime}${solution.optimizedSpace ? `  ·  Space: ${solution.optimizedSpace}` : ''}`}
                                mono
                            />
                        )}
                        {solution.feynmanExplanation && (
                            <RecapRow icon="🧠" label="Feynman" value={solution.feynmanExplanation} />
                        )}
                        {!solution.keyInsight && !solution.optimizedApproach && (
                            <p className="text-sm text-text-tertiary italic text-center py-4">
                                No notes recorded for this solution.
                            </p>
                        )}
                    </div>

                    {/* Confidence rating */}
                    <div className="px-6 py-5 border-t border-border-default bg-surface-0/40">
                        <p className="text-sm font-bold text-text-primary mb-1">
                            How well do you remember this?
                        </p>
                        <p className="text-xs text-text-tertiary mb-4">
                            Be honest — this determines when you'll review it next.
                        </p>
                        <ConfidencePicker value={confidence} onChange={setConfidence} />

                        {/* Next review preview */}
                        {confidence > 0 && nextDate && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-4 flex items-center gap-2 px-3 py-2 rounded-xl
                           bg-surface-3 border border-border-default"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    className="text-brand-300 flex-shrink-0">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span className="text-xs text-text-secondary">
                                    Next review:{' '}
                                    <span className="font-semibold text-brand-300">
                                        {nextDate}
                                    </span>
                                    {' '}
                                    <span className="text-text-disabled">
                                        (in {nextDays} day{nextDays !== 1 ? 's' : ''})
                                    </span>
                                </span>
                            </motion.div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 px-6 py-4
                          border-t border-border-default">
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => {
                                onClose()
                                navigate(`/problems/${solution.problemId}`)
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                            View Problem
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
                    </div>
                </motion.div>
            </div>
        </>
    )
}

function RecapRow({ icon, label, value, mono = false }) {
    return (
        <div className="flex gap-3">
            <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
            <div className="min-w-0">
                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-0.5">
                    {label}
                </p>
                <p className={cn(
                    'text-sm text-text-secondary leading-relaxed',
                    mono && 'font-mono text-xs'
                )}>
                    {value}
                </p>
            </div>
        </div>
    )
}

// ── Due card ───────────────────────────────────────────
function DueCard({ solution, index, onReview }) {
    const dueInfo = getDueInfo(solution.reviewDates)
    const prevConf = CONFIDENCE_LEVELS.find(c => c.value === solution.confidenceLevel)

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
                dueInfo?.overdue
                    ? 'border-warning/25 hover:border-warning/50'
                    : 'border-border-default hover:border-brand-400/30'
            )}
        >
            <div className="flex items-start gap-4">
                {/* Left icon */}
                <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    'text-xl flex-shrink-0 border',
                    dueInfo?.overdue
                        ? 'bg-warning/10 border-warning/25'
                        : 'bg-brand-400/10 border-brand-400/20'
                )}>
                    🧠
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-text-primary truncate mb-1">
                                {solution.problem?.title}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                    variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'}
                                    size="xs"
                                >
                                    {solution.problem?.difficulty?.charAt(0) +
                                        solution.problem?.difficulty?.slice(1).toLowerCase()}
                                </Badge>
                                {solution.patternIdentified && (
                                    <span className="text-[11px] text-brand-300 bg-brand-400/10
                                   border border-brand-400/15 rounded-full px-2 py-px">
                                        {solution.patternIdentified}
                                    </span>
                                )}
                                {solution.language && (
                                    <span className="text-[11px] text-text-tertiary">
                                        {LANGUAGE_LABELS[solution.language] || solution.language}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Due badge */}
                        {dueInfo && (
                            <span className={cn(
                                'text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                                dueInfo.overdue
                                    ? 'bg-warning/15 text-warning border border-warning/30'
                                    : 'bg-brand-400/12 text-brand-300 border border-brand-400/25'
                            )}>
                                {dueInfo.label}
                            </span>
                        )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-text-tertiary mb-4 flex-wrap">
                        <span>Solved {formatRelativeDate(solution.solvedAt)}</span>
                        {solution.optimizedTime && (
                            <span className="font-mono">{solution.optimizedTime}</span>
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
                        <p className="text-xs text-text-tertiary leading-relaxed mb-4
                          border-l-2 border-brand-400/30 pl-3 italic">
                            "{solution.keyInsight}"
                        </p>
                    )}

                    {/* Review button */}
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onReview(solution)}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
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
    const upcoming = getUpcomingInfo(solution.reviewDates)
    if (!upcoming) return null

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: index * 0.03 }}
            onClick={() => navigate(`/problems/${solution.problemId}`)}
            className="flex items-center gap-3 p-3.5 rounded-xl border
                 bg-surface-1 border-border-default
                 hover:border-border-strong cursor-pointer
                 transition-all duration-150"
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
                    <Badge
                        variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'}
                        size="xs"
                    >
                        {solution.problem?.difficulty?.charAt(0) +
                            solution.problem?.difficulty?.slice(1).toLowerCase()}
                    </Badge>
                    <span className="text-[11px] text-text-tertiary">
                        in {upcoming.daysUntil} day{upcoming.daysUntil !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
            <span className="text-[11px] text-text-disabled flex-shrink-0 font-mono">
                {formatShortDate(upcoming.date)}
            </span>
        </motion.div>
    )
}

// ── Session complete banner ────────────────────────────
function SessionBanner({ count, onDismiss }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-success/10 border border-success/30 rounded-2xl p-5
                 flex items-center gap-4 mb-6"
        >
            <div className="text-3xl flex-shrink-0">🎉</div>
            <div className="flex-1">
                <p className="text-sm font-bold text-success">
                    Review session complete!
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                    You reviewed {count} problem{count !== 1 ? 's' : ''}.
                    Your schedule has been updated.
                </p>
            </div>
            <button
                onClick={onDismiss}
                className="text-text-tertiary hover:text-text-primary transition-colors
                   flex-shrink-0"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ReviewQueuePage() {
    const navigate = useNavigate()
    const [reviewing, setReviewing] = useState(null)  // solution being reviewed
    const [reviewed, setReviewed] = useState([])    // ids reviewed this session
    const [showBanner, setShowBanner] = useState(false)
    const [sessionCount, setSessionCount] = useState(0)

    const { data: solutions, isLoading } = useMySolutions()
    const reviewMutation = useReviewSolution()

    // Categorise solutions
    const { due, upcoming, noReviews } = useMemo(() => {
        if (!solutions) return { due: [], upcoming: [], noReviews: [] }

        const today = getToday()
        const in7 = new Date(today)
        in7.setDate(in7.getDate() + 7)

        const due = []
        const upcoming = []
        const noReviews = []

        solutions.forEach(s => {
            const dates = s.reviewDates || []
            if (!dates.length) { noReviews.push(s); return }

            const hasDue = dates.some(d => {
                const rd = new Date(d); rd.setHours(0, 0, 0, 0)
                return rd <= today
            })

            if (hasDue) {
                if (!reviewed.includes(s.id)) due.push(s)
                return
            }

            const hasUpcoming = dates.some(d => {
                const rd = new Date(d); rd.setHours(0, 0, 0, 0)
                return rd > today && rd <= in7
            })
            if (hasUpcoming) upcoming.push(s)
        })

        return { due, upcoming, noReviews }
    }, [solutions, reviewed])

    async function handleSaveReview(confidenceLevel) {
        if (!reviewing) return
        await reviewMutation.mutateAsync({
            id: reviewing.id,
            confidenceLevel,
        })
        const newReviewed = [...reviewed, reviewing.id]
        setReviewed(newReviewed)
        setSessionCount(c => c + 1)
        setReviewing(null)

        // Show banner when queue is cleared
        if (due.length - 1 === 0) {
            setShowBanner(true)
        }
    }

    // Progress through queue automatically
    function handleReviewNext() {
        if (due.length === 0) return
        setReviewing(due[0])
    }

    const totalDue = due.length
    const totalDoneToday = reviewed.length
    const progressPct = solutions?.length
        ? Math.round((totalDoneToday / (totalDoneToday + totalDue)) * 100)
        : 0

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary animate-pulse">
                        Loading your review queue…
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
                        Spaced repetition keeps knowledge sharp — review what's due today
                    </p>
                </div>
                {totalDue > 0 && (
                    <Button variant="primary" size="md" onClick={handleReviewNext}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Start Session ({totalDue})
                    </Button>
                )}
            </div>

            {/* Session complete banner */}
            <AnimatePresence>
                {showBanner && (
                    <SessionBanner
                        count={sessionCount}
                        onDismiss={() => setShowBanner(false)}
                    />
                )}
            </AnimatePresence>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {[
                    {
                        label: 'Due Today',
                        value: totalDue,
                        icon: '🧠',
                        color: totalDue > 0 ? 'text-warning' : 'text-success',
                        bg: totalDue > 0 ? 'bg-warning/10 border-warning/20' : 'bg-success/10 border-success/20',
                    },
                    {
                        label: 'Done Today',
                        value: totalDoneToday,
                        icon: '✅',
                        color: 'text-success',
                        bg: 'bg-success/10 border-success/20',
                    },
                    {
                        label: 'Upcoming (7d)',
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
                        className={cn(
                            'rounded-xl border p-4 text-center',
                            card.bg
                        )}
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

            {/* Progress bar — only show if there are reviews */}
            {(totalDue > 0 || totalDoneToday > 0) && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-6"
                >
                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-text-tertiary font-medium">
                            Today's progress
                        </span>
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

            {/* Due now section */}
            {totalDue > 0 ? (
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                        <span className="text-warning">⚡</span>
                        Due Now
                        <Badge variant="warning" size="xs" dot pulse>{totalDue}</Badge>
                    </h2>
                    <motion.div layout className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {due.map((s, i) => (
                                <DueCard
                                    key={s.id}
                                    solution={s}
                                    index={i}
                                    onReview={setReviewing}
                                />
                            ))}
                        </AnimatePresence>
                    </motion.div>
                </div>
            ) : (
                // All caught up state
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-surface-1 border border-success/25 rounded-2xl p-10
                     text-center mb-8"
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
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={() => navigate('/problems')}
                    >
                        Browse Problems
                    </Button>
                </motion.div>
            )}

            {/* Upcoming section */}
            {upcoming.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                        <span>📅</span>
                        Coming Up
                        <span className="text-xs text-text-disabled font-normal">next 7 days</span>
                    </h2>
                    <div className="space-y-2">
                        {upcoming
                            .sort((a, b) => {
                                const ua = getUpcomingInfo(a.reviewDates)
                                const ub = getUpcomingInfo(b.reviewDates)
                                return (ua?.daysUntil || 99) - (ub?.daysUntil || 99)
                            })
                            .map((s, i) => (
                                <UpcomingCard key={s.id} solution={s} index={i} />
                            ))}
                    </div>
                </div>
            )}

            {/* How it works — shown when queue is empty and no solutions */}
            {!solutions?.length && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6"
                >
                    <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>📖</span> How Spaced Repetition Works
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                step: '1',
                                title: 'Solve a problem',
                                desc: 'When you submit a solution, review dates are automatically scheduled.',
                                icon: '📝',
                            },
                            {
                                step: '2',
                                title: 'Review when due',
                                desc: 'Come back here and re-rate your confidence without looking at your notes.',
                                icon: '🧠',
                            },
                            {
                                step: '3',
                                title: 'Intervals adapt',
                                desc: 'High confidence → longer gap. Low confidence → review again soon.',
                                icon: '📈',
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
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => navigate('/problems')}
                        >
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