// ============================================================================
// ProbSolver v3.0 — AI Review Card (Production Grade)
// ============================================================================
//
// Shows rubric-based multi-dimensional feedback designed to help
// candidates crack real interviews. Surfaces what matters most:
//
// 1. Critical flags first (interview killers shown prominently)
// 2. Score with improvement trend
// 3. 5 dimension breakdown with bars + per-dimension feedback
// 4. Code analysis (complexity, correctness, optimization)
// 5. Strengths vs gaps with interview context
// 6. Follow-up question performance
// 7. One concrete next action
//
// Supports aiFeedback as array (review history) for improvement tracking.
//
// ============================================================================
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAIReview } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'

// ── Score ring ─────────────────────────────────────────
function ScoreRing({ score, size = 72 }) {
    const r = (size / 2) - 6
    const circumf = 2 * Math.PI * r
    const dashOffset = circumf - (score / 10) * circumf
    const color =
        score >= 8 ? '#22c55e' :
            score >= 6 ? '#7c6ff7' :
                score >= 4 ? '#eab308' : '#ef4444'
    const label =
        score >= 8 ? 'Excellent' :
            score >= 6 ? 'Good' :
                score >= 4 ? 'Developing' : 'Needs Work'

    return (
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle
                        cx={size / 2} cy={size / 2} r={r}
                        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"
                    />
                    <motion.circle
                        cx={size / 2} cy={size / 2} r={r}
                        fill="none" stroke={color} strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={circumf}
                        initial={{ strokeDashoffset: circumf }}
                        animate={{ strokeDashoffset: dashOffset }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-extrabold font-mono text-text-primary leading-none">
                        {score}
                    </span>
                    <span className="text-[9px] text-text-disabled">/10</span>
                </div>
            </div>
            <span className="text-[10px] font-bold" style={{ color }}>{label}</span>
        </div>
    )
}

// ── Dimension bar ──────────────────────────────────────
function DimensionBar({ label, score, weight, feedback, color, delay = 0 }) {
    const [showFeedback, setShowFeedback] = useState(false)
    const barColor =
        score >= 8 ? 'bg-success' :
            score >= 6 ? 'bg-brand-400' :
                score >= 4 ? 'bg-warning' : 'bg-danger'

    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={() => setShowFeedback(v => !v)}
                className="w-full flex items-center gap-3 group"
            >
                <span className="text-[10px] text-text-tertiary w-32 text-left flex-shrink-0 group-hover:text-text-secondary transition-colors">
                    {label}
                </span>
                <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${score * 10}%` }}
                        transition={{ duration: 0.7, delay, ease: 'easeOut' }}
                        className={cn('h-full rounded-full', barColor)}
                    />
                </div>
                <span className={cn(
                    'text-[10px] font-extrabold font-mono w-6 text-right flex-shrink-0',
                    score >= 8 ? 'text-success' :
                        score >= 6 ? 'text-brand-300' :
                            score >= 4 ? 'text-warning' : 'text-danger'
                )}>
                    {score}
                </span>
                <span className="text-[9px] text-text-disabled w-8 text-right flex-shrink-0">
                    {weight}%
                </span>
                {feedback && (
                    <motion.span
                        animate={{ rotate: showFeedback ? 180 : 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-text-disabled group-hover:text-text-tertiary flex-shrink-0"
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </motion.span>
                )}
            </button>
            <AnimatePresence>
                {showFeedback && feedback && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden ml-32 pl-3"
                    >
                        <p className="text-[11px] text-text-tertiary leading-relaxed
                               bg-surface-2 rounded-lg p-2.5 border border-border-subtle">
                            {feedback}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ── Critical flag banner ───────────────────────────────
function FlagBanner({ flags }) {
    if (!flags) return null

    const activeFlags = [
        flags.incompleteSubmission && {
            icon: '🚨',
            label: 'Incomplete Submission',
            desc: 'Your code is missing critical sections. Interviewers will fail you before you can explain your approach.',
            severity: 'critical',
        },
        flags.languageMismatch && {
            icon: '⚠️',
            label: `Language Mismatch Detected`,
            desc: `You selected ${flags.selectedLanguage || 'one language'} but your code appears to be ${flags.detectedLanguage || 'a different language'}. Verify this is intentional.`,
            severity: 'warning',
        },
        flags.wrongPattern && {
            icon: '🎯',
            label: 'Wrong Pattern Identified',
            desc: `You identified "${flags.identifiedPattern || 'the wrong pattern'}" but this problem uses ${flags.correctPattern || 'a different pattern'}. Pattern recognition is tested directly in interviews.`,
            severity: 'warning',
        },
        flags.overconfidenceDetected && {
            icon: '⚡',
            label: 'Confidence Mismatch',
            desc: 'Your self-confidence is significantly higher than your solution quality. Overconfidence in interviews signals poor self-awareness to interviewers.',
            severity: 'warning',
        },
    ].filter(Boolean)

    if (activeFlags.length === 0) return null

    return (
        <div className="space-y-2 mb-4">
            {activeFlags.map((flag, i) => (
                <motion.div
                    key={flag.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={cn(
                        'flex items-start gap-3 p-3.5 rounded-xl border',
                        flag.severity === 'critical'
                            ? 'bg-danger/8 border-danger/25'
                            : 'bg-warning/8 border-warning/25'
                    )}
                >
                    <span className="text-base flex-shrink-0">{flag.icon}</span>
                    <div>
                        <p className={cn(
                            'text-xs font-bold mb-0.5',
                            flag.severity === 'critical' ? 'text-danger' : 'text-warning'
                        )}>
                            {flag.label}
                        </p>
                        <p className="text-[11px] text-text-secondary leading-relaxed">
                            {flag.desc}
                        </p>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}

// ── Score improvement indicator ────────────────────────
function ScoreTrend({ current, previous }) {
    if (!previous || previous === current) return null
    const improved = current > previous
    const diff = Math.abs(current - previous)

    return (
        <div className={cn(
            'flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
            improved
                ? 'text-success bg-success/12'
                : 'text-danger bg-danger/12'
        )}>
            <span>{improved ? '↑' : '↓'}</span>
            <span>{diff} from last review</span>
        </div>
    )
}

// ── Follow-up performance ──────────────────────────────
function FollowUpSection({ followUpEvaluations, problemFollowUps }) {
    if (!problemFollowUps?.length) return null

    return (
        <div>
            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
                Follow-up Questions
            </p>
            <div className="space-y-2">
                {problemFollowUps.map((fq, i) => {
                    const evaluation = followUpEvaluations?.find(
                        e => e.questionId === fq.id
                    )
                    const wasAnswered = evaluation && evaluation.score != null
                    const wasSkipped = !wasAnswered

                    return (
                        <motion.div
                            key={fq.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={cn(
                                'rounded-xl border p-3',
                                wasSkipped
                                    ? 'bg-surface-2 border-border-subtle'
                                    : evaluation.score >= 7
                                        ? 'bg-success/5 border-success/20'
                                        : evaluation.score >= 5
                                            ? 'bg-warning/5 border-warning/20'
                                            : 'bg-danger/5 border-danger/20'
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2 flex-1">
                                    <span className={cn(
                                        'text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0 mt-0.5',
                                        fq.difficulty === 'EASY'
                                            ? 'bg-success/10 text-success border-success/20'
                                            : fq.difficulty === 'MEDIUM'
                                                ? 'bg-warning/10 text-warning border-warning/20'
                                                : 'bg-danger/10 text-danger border-danger/20'
                                    )}>
                                        {fq.difficulty}
                                    </span>
                                    <p className="text-[11px] text-text-secondary leading-relaxed">
                                        {fq.question}
                                    </p>
                                </div>
                                {wasSkipped ? (
                                    <span className="text-[9px] font-bold text-text-disabled
                                           bg-surface-3 border border-border-subtle
                                           px-1.5 py-px rounded-full flex-shrink-0">
                                        Skipped
                                    </span>
                                ) : (
                                    <span className={cn(
                                        'text-[10px] font-extrabold font-mono flex-shrink-0',
                                        evaluation.score >= 7 ? 'text-success' :
                                            evaluation.score >= 5 ? 'text-warning' : 'text-danger'
                                    )}>
                                        {evaluation.score}/10
                                    </span>
                                )}
                            </div>
                            {!wasSkipped && evaluation.feedback && (
                                <p className="text-[10px] text-text-tertiary mt-1.5 ml-7 leading-relaxed">
                                    {evaluation.feedback}
                                </p>
                            )}
                            {wasSkipped && (
                                <p className="text-[10px] text-text-disabled mt-1.5 ml-7 italic">
                                    Answering this would show depth of understanding beyond the base solution.
                                </p>
                            )}
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Main component ─────────────────────────────────────
export function AIReviewCard({ solutionId, existingReview, problemFollowUps }) {
    const [expanded, setExpanded] = useState(false)
    const [activeTab, setActiveTab] = useState('overview')
    const aiReview = useAIReview()

    // Handle aiFeedback as array (new) or single object (legacy)
    const reviewHistory = useMemo(() => {
        if (!existingReview) return []
        if (Array.isArray(existingReview)) return existingReview
        // Legacy: single object — wrap in array
        return [existingReview]
    }, [existingReview])

    const latestReview = reviewHistory[reviewHistory.length - 1] || null
    const previousReview = reviewHistory.length > 1
        ? reviewHistory[reviewHistory.length - 2]
        : null

    const [currentReview, setCurrentReview] = useState(latestReview)

    async function handleReview() {
        try {
            const res = await aiReview.mutateAsync(solutionId)
            const newReview = res.data.data.feedback
            setCurrentReview(newReview)
            setExpanded(true)
            setActiveTab('overview')
        } catch {
            // error handled by hook
        }
    }

    // Build dimension config from scores
    const dimensions = currentReview?.dimensionScores ? [
        {
            label: 'Code Correctness',
            key: 'codeCorrectness',
            weight: 35,
            score: currentReview.dimensionScores.codeCorrectness,
            feedback: 'Whether your solution correctly handles all cases, edge cases, and would pass test cases.',
        },
        {
            label: 'Pattern Accuracy',
            key: 'patternAccuracy',
            weight: 20,
            score: currentReview.dimensionScores.patternAccuracy,
            feedback: 'Whether you identified and applied the right algorithm pattern for this problem.',
        },
        {
            label: 'Understanding Depth',
            key: 'understandingDepth',
            weight: 20,
            score: currentReview.dimensionScores.understandingDepth,
            feedback: 'Quality of your key insight, Feynman explanation, and demonstrated conceptual understanding.',
        },
        {
            label: 'Explanation Quality',
            key: 'explanationQuality',
            weight: 15,
            score: currentReview.dimensionScores.explanationQuality,
            feedback: 'How clearly you explained your approach. Critical in interviews — thinking aloud is evaluated.',
        },
        {
            label: 'Confidence Calibration',
            key: 'confidenceCalibration',
            weight: 10,
            score: currentReview.dimensionScores.confidenceCalibration,
            feedback: 'Whether your self-assessed confidence matches the actual quality of your solution.',
        },
    ] : []

    // No review yet
    if (!currentReview) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-5"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-400/15 border border-brand-400/20
                                flex items-center justify-center text-xl flex-shrink-0">
                            🤖
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-text-primary">AI Review</h3>
                            <p className="text-xs text-text-tertiary">
                                Multi-dimensional analysis to help you crack interviews
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={aiReview.isPending}
                        onClick={handleReview}
                    >
                        {aiReview.isPending ? (
                            'Analyzing...'
                        ) : (
                            <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                                Get AI Review
                            </>
                        )}
                    </Button>
                </div>

                {/* What the review checks */}
                <div className="mt-4 pt-4 border-t border-border-subtle grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                        { icon: '🔍', label: 'Code Analysis' },
                        { icon: '🧩', label: 'Pattern Check' },
                        { icon: '🧠', label: 'Understanding' },
                        { icon: '💬', label: 'Explanation' },
                        { icon: '⚡', label: 'Flags & Alerts' },
                    ].map(item => (
                        <div key={item.label}
                            className="flex items-center gap-1.5 text-[10px] text-text-disabled">
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            </motion.div>
        )
    }

    const overallScore = currentReview.overallScore
    const flags = currentReview.flags
    const hasFlags = flags && Object.values(flags).some(v =>
        v === true || (typeof v === 'string' && v)
    )
    const ragContext = currentReview.ragContext
    const followUpBonus = currentReview.followUpBonus || 0
    const isFirstReview = reviewHistory.length <= 1

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
        >
            {/* Header — always visible, clickable to expand */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-4 p-5 text-left
                   hover:bg-surface-2/50 transition-colors"
            >
                <ScoreRing score={overallScore} />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-bold text-text-primary">AI Review</h3>
                        {hasFlags && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                   bg-warning/15 text-warning border border-warning/25">
                                {Object.values(flags).filter(v => v === true || (typeof v === 'string' && v)).length} flag{Object.values(flags).filter(v => v === true || (typeof v === 'string' && v)).length !== 1 ? 's' : ''}
                            </span>
                        )}
                        {!isFirstReview && (
                            <ScoreTrend
                                current={overallScore}
                                previous={previousReview?.overallScore}
                            />
                        )}
                        {followUpBonus > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                   bg-success/12 text-success border border-success/20">
                                +{followUpBonus} follow-up bonus
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-text-tertiary">
                        {ragContext?.teammateCount > 0
                            ? `Compared with ${ragContext.teammateCount} teammate solution${ragContext.teammateCount !== 1 ? 's' : ''}`
                            : 'Individual analysis'
                        }
                        {ragContext?.hasAdminNotes && ' · Admin notes applied'}
                        {currentReview.reviewNumber > 1 && ` · Review #${currentReview.reviewNumber}`}
                    </p>
                </div>

                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-disabled flex-shrink-0"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-border-default">
                            {/* Tab navigation */}
                            <div className="flex gap-1 px-5 pt-4 pb-0">
                                {[
                                    { id: 'overview', label: '📊 Overview' },
                                    { id: 'dimensions', label: '📐 Dimensions' },
                                    { id: 'code', label: '💻 Code' },
                                    ...(problemFollowUps?.length > 0 ? [{ id: 'followups', label: '🧠 Follow-ups' }] : []),
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            'px-3 py-2 rounded-t-lg text-xs font-semibold transition-all border-b-2',
                                            activeTab === tab.id
                                                ? 'text-brand-300 border-brand-400 bg-brand-400/5'
                                                : 'text-text-tertiary border-transparent hover:text-text-secondary'
                                        )}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="px-5 pb-5 pt-4 space-y-4">

                                {/* OVERVIEW TAB */}
                                {activeTab === 'overview' && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-4"
                                    >
                                        {/* Critical flags — shown first */}
                                        <FlagBanner flags={flags} />

                                        {/* Strengths */}
                                        {currentReview.strengths?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-success
                                                       uppercase tracking-widest mb-2.5">
                                                    ✅ Strengths
                                                </p>
                                                <div className="space-y-2">
                                                    {currentReview.strengths.map((s, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ opacity: 0, x: -8 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: i * 0.05 }}
                                                            className="flex items-start gap-2.5
                                                                   text-xs text-text-secondary leading-relaxed"
                                                        >
                                                            <span className="w-1.5 h-1.5 rounded-full
                                                                   bg-success flex-shrink-0 mt-1.5" />
                                                            {s}
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Gaps */}
                                        {currentReview.gaps?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-warning
                                                       uppercase tracking-widest mb-2.5">
                                                    ⚠️ Gaps
                                                </p>
                                                <div className="space-y-2">
                                                    {currentReview.gaps.map((g, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ opacity: 0, x: -8 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: i * 0.05 }}
                                                            className="flex items-start gap-2.5
                                                                   text-xs text-text-secondary leading-relaxed"
                                                        >
                                                            <span className="w-1.5 h-1.5 rounded-full
                                                                   bg-warning flex-shrink-0 mt-1.5" />
                                                            {g}
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Key improvement */}
                                        {currentReview.improvement && (
                                            <div className="bg-brand-400/5 border border-brand-400/20
                                                   rounded-xl p-4">
                                                <p className="text-[10px] font-bold text-brand-300
                                                       uppercase tracking-widest mb-2">
                                                    💡 Key Improvement
                                                </p>
                                                <p className="text-sm text-text-secondary leading-relaxed">
                                                    {currentReview.improvement}
                                                </p>
                                            </div>
                                        )}

                                        {/* Interview tip */}
                                        {currentReview.interviewTip && (
                                            <div className="bg-info/5 border border-info/20
                                                   rounded-xl p-4">
                                                <p className="text-[10px] font-bold text-info
                                                       uppercase tracking-widest mb-2">
                                                    🎯 Interview Tip
                                                </p>
                                                <p className="text-sm text-text-secondary leading-relaxed">
                                                    {currentReview.interviewTip}
                                                </p>
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* DIMENSIONS TAB */}
                                {activeTab === 'dimensions' && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-3"
                                    >
                                        <p className="text-[10px] text-text-disabled leading-relaxed">
                                            Click any dimension to see specific feedback.
                                            Weighted score: 35% Code · 20% Pattern · 20% Understanding · 15% Explanation · 10% Confidence
                                        </p>

                                        {dimensions.map((dim, i) => (
                                            <DimensionBar
                                                key={dim.key}
                                                label={dim.label}
                                                score={dim.score}
                                                weight={dim.weight}
                                                feedback={dim.feedback}
                                                delay={i * 0.08}
                                            />
                                        ))}

                                        {/* Score breakdown */}
                                        <div className="pt-3 border-t border-border-subtle">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="text-text-disabled">
                                                    Weighted score
                                                </span>
                                                <span className="font-bold text-text-secondary">
                                                    {dimensions.reduce((sum, d) =>
                                                        sum + (d.score * d.weight / 10), 0
                                                    ).toFixed(1)}
                                                </span>
                                            </div>
                                            {followUpBonus > 0 && (
                                                <div className="flex items-center justify-between text-[10px] mt-1">
                                                    <span className="text-text-disabled">
                                                        Follow-up bonus
                                                    </span>
                                                    <span className="font-bold text-success">
                                                        +{followUpBonus}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between text-[11px] mt-2 pt-2
                                                   border-t border-border-subtle font-bold">
                                                <span className="text-text-secondary">
                                                    Final score
                                                </span>
                                                <span className={cn(
                                                    overallScore >= 8 ? 'text-success' :
                                                        overallScore >= 6 ? 'text-brand-300' :
                                                            overallScore >= 4 ? 'text-warning' : 'text-danger'
                                                )}>
                                                    {overallScore}/10
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* CODE TAB */}
                                {activeTab === 'code' && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-4"
                                    >
                                        {/* Complexity analysis */}
                                        {currentReview.complexityCheck && (
                                            <div>
                                                <p className="text-[10px] font-bold text-text-disabled
                                                       uppercase tracking-widest mb-3">
                                                    Complexity Analysis
                                                </p>
                                                <div className="grid grid-cols-2 gap-3 mb-3">
                                                    {[
                                                        {
                                                            label: 'Time Complexity',
                                                            value: currentReview.complexityCheck.timeComplexity,
                                                            optimal: currentReview.complexityCheck.timeCorrect,
                                                        },
                                                        {
                                                            label: 'Space Complexity',
                                                            value: currentReview.complexityCheck.spaceComplexity,
                                                            optimal: currentReview.complexityCheck.spaceCorrect,
                                                        },
                                                    ].map(c => (
                                                        <div key={c.label}
                                                            className={cn(
                                                                'rounded-xl p-3.5 border',
                                                                c.optimal
                                                                    ? 'bg-success/5 border-success/20'
                                                                    : 'bg-warning/5 border-warning/20'
                                                            )}>
                                                            <p className="text-[10px] text-text-disabled mb-1">
                                                                {c.label}
                                                            </p>
                                                            <p className={cn(
                                                                'text-base font-extrabold font-mono',
                                                                c.optimal ? 'text-success' : 'text-warning'
                                                            )}>
                                                                {c.value || 'N/A'}
                                                            </p>
                                                            <p className="text-[9px] mt-0.5"
                                                                style={{ color: c.optimal ? '#22c55e' : '#eab308' }}>
                                                                {c.optimal ? 'Optimal' : 'Can be improved'}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {currentReview.complexityCheck.optimizationNote && (
                                                    <div className="bg-surface-2 border border-border-subtle
                                                           rounded-xl p-3">
                                                        <p className="text-[10px] font-bold text-text-disabled
                                                               uppercase tracking-widest mb-1">
                                                            Optimization Opportunity
                                                        </p>
                                                        <p className="text-xs text-text-secondary leading-relaxed">
                                                            {currentReview.complexityCheck.optimizationNote}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Code correctness score in context */}
                                        {currentReview.dimensionScores && (
                                            <div className={cn(
                                                'rounded-xl p-4 border',
                                                currentReview.dimensionScores.codeCorrectness >= 7
                                                    ? 'bg-success/5 border-success/20'
                                                    : currentReview.dimensionScores.codeCorrectness >= 5
                                                        ? 'bg-warning/5 border-warning/20'
                                                        : 'bg-danger/5 border-danger/20'
                                            )}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-bold text-text-primary">
                                                        Code Correctness
                                                    </p>
                                                    <span className={cn(
                                                        'text-lg font-extrabold font-mono',
                                                        currentReview.dimensionScores.codeCorrectness >= 7 ? 'text-success' :
                                                            currentReview.dimensionScores.codeCorrectness >= 5 ? 'text-warning' : 'text-danger'
                                                    )}>
                                                        {currentReview.dimensionScores.codeCorrectness}/10
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-text-tertiary leading-relaxed">
                                                    {currentReview.dimensionScores.codeCorrectness >= 8
                                                        ? 'Your code appears correct and handles edge cases well.'
                                                        : currentReview.dimensionScores.codeCorrectness >= 6
                                                            ? 'Your code handles the main cases but may miss some edge cases.'
                                                            : currentReview.dimensionScores.codeCorrectness >= 4
                                                                ? 'Your code has significant issues that would fail test cases.'
                                                                : 'Your code has fundamental correctness problems. Focus on fixing this before anything else.'
                                                    }
                                                </p>
                                                {currentReview.dimensionScores.codeCorrectness <= 5 && (
                                                    <p className="text-[10px] text-danger mt-2 font-semibold">
                                                        ⚠️ Interviewers will not proceed past this in a real interview.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* FOLLOW-UPS TAB */}
                                {activeTab === 'followups' && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <FollowUpSection
                                            followUpEvaluations={currentReview.followUpEvaluations}
                                            problemFollowUps={problemFollowUps}
                                        />
                                    </motion.div>
                                )}

                            </div>

                            {/* Footer — re-analyze + review history indicator */}
                            <div className="px-5 pb-4 flex items-center justify-between
                                   border-t border-border-subtle pt-3">
                                <div className="flex items-center gap-2">
                                    {reviewHistory.length > 1 && (
                                        <span className="text-[10px] text-text-disabled">
                                            Review {currentReview.reviewNumber || reviewHistory.length} of {reviewHistory.length}
                                        </span>
                                    )}
                                    {currentReview.reviewedAt && (
                                        <span className="text-[10px] text-text-disabled">
                                            · {new Date(currentReview.reviewedAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    loading={aiReview.isPending}
                                    onClick={handleReview}
                                >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                                    </svg>
                                    Re-analyze
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}