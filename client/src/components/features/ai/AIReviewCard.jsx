// ============================================================================
// ProbSolver v3.0 — AI Review Card (Production Grade)
// ============================================================================
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAIReview } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { HR_STAKES } from '@utils/constants'

// ── Category-aware dimension label maps ───────────────
// The AI always returns the same JSON keys (codeCorrectness, patternAccuracy, etc.)
// but for non-coding categories these labels are meaningless or actively wrong.
// We map each key to the category-appropriate display label so the member
// sees "Answer Authenticity" not "Code Correctness" on an HR review.
//
// Research basis: showing "Code Correctness: 8/10" on an HR answer review
// destroys trust in the platform. Category-aware labels are a correctness issue,
// not just a UX issue.
const DIMENSION_LABELS = {
    // CODING (default — these are the literal field names)
    CODING: {
        codeCorrectness: { label: 'Code Correctness', weight: 35, desc: 'Whether your solution is logically correct and handles edge cases.' },
        patternAccuracy: { label: 'Pattern Accuracy', weight: 20, desc: 'Whether you identified and applied the right algorithm pattern.' },
        understandingDepth: { label: 'Understanding', weight: 20, desc: 'Quality of your key insight and Feynman explanation.' },
        explanationQuality: { label: 'Explanation', weight: 15, desc: 'How clearly you described your approach.' },
        confidenceCalibration: { label: 'Confidence Cal.', weight: 10, desc: 'Whether your self-assessment matches actual solution quality.' },
    },
    SYSTEM_DESIGN: {
        codeCorrectness: { label: 'Design Correctness', weight: 35, desc: 'Does the design solve the stated system at the stated scale with the right components?' },
        patternAccuracy: { label: 'Architectural Pattern', weight: 20, desc: 'Is the architectural style (microservices, event-driven, etc.) appropriate for the requirements?' },
        understandingDepth: { label: 'Systems Thinking', weight: 20, desc: 'Does the candidate understand WHY each component exists and what it trades off?' },
        explanationQuality: { label: 'Design Clarity', weight: 15, desc: 'Could another engineer implement this system from this description?' },
        confidenceCalibration: { label: 'Confidence Cal.', weight: 10, desc: 'Whether self-assessment matches actual design quality.' },
    },
    LOW_LEVEL_DESIGN: {
        codeCorrectness: { label: 'OOP Correctness', weight: 35, desc: 'Is the class structure semantically correct? Clear SRP, correct relationships?' },
        patternAccuracy: { label: 'Pattern Accuracy', weight: 20, desc: 'Is the design pattern applied structurally correctly — not just named?' },
        understandingDepth: { label: 'OOP Understanding', weight: 20, desc: 'Does the candidate understand WHY the chosen hierarchy/pattern is correct?' },
        explanationQuality: { label: 'Design Clarity', weight: 15, desc: 'Could another engineer implement the class structure from this description?' },
        confidenceCalibration: { label: 'Confidence Cal.', weight: 10, desc: 'Whether self-assessment matches actual design quality.' },
    },
    BEHAVIORAL: {
        codeCorrectness: { label: 'STAR Completeness', weight: 35, desc: 'Are all four STAR components present and developed with specific detail?' },
        patternAccuracy: { label: 'Competency Alignment', weight: 20, desc: 'Does the story actually demonstrate the competency being asked about?' },
        understandingDepth: { label: 'Self-Awareness', weight: 20, desc: 'Does the candidate show genuine reflection and growth mindset?' },
        explanationQuality: { label: 'Communication & Ownership', weight: 15, desc: 'Is "I" used consistently? Is the story clear and non-rambling?' },
        confidenceCalibration: { label: 'Confidence Cal.', weight: 10, desc: 'Does the candidate know their own story authentically?' },
    },
    CS_FUNDAMENTALS: {
        codeCorrectness: { label: 'Conceptual Accuracy', weight: 35, desc: 'Is the concept explained correctly with no factual errors?' },
        patternAccuracy: { label: 'Topic Coverage', weight: 20, desc: 'Did the candidate cover the right sub-topics and mechanism?' },
        understandingDepth: { label: 'Depth & Real-World', weight: 20, desc: 'Do they explain WHY and connect to real production systems?' },
        explanationQuality: { label: 'Teaching Clarity', weight: 15, desc: 'Could a junior engineer understand this explanation?' },
        confidenceCalibration: { label: 'Confidence Cal.', weight: 10, desc: 'Whether self-assessed confidence matches actual knowledge depth.' },
    },
    HR: {
        codeCorrectness: { label: 'Authenticity & Specificity', weight: 35, desc: 'Does the answer feel genuine with specific personal details — not generic?' },
        patternAccuracy: { label: 'Company & Role Alignment', weight: 20, desc: 'Does the candidate demonstrate research about THIS specific company and role?' },
        understandingDepth: { label: 'Career Narrative & Self-Awareness', weight: 20, desc: 'Is there a coherent career story? Honest self-knowledge?' },
        explanationQuality: { label: 'Answer Structure & Clarity', weight: 15, desc: 'Is it concise, does it answer what was actually asked, is there a clear ending?' },
        confidenceCalibration: { label: 'Answer Authenticity', weight: 10, desc: 'How authentic and specific does this answer feel vs generic?' },
    },
    SQL: {
        codeCorrectness: { label: 'Query Correctness', weight: 35, desc: 'Does the query return correct results for all cases including NULLs and duplicates?' },
        patternAccuracy: { label: 'Query Pattern Selection', weight: 20, desc: 'Is the right pattern used? (JOIN vs subquery vs CTE vs window function)' },
        understandingDepth: { label: 'Schema & Optimization', weight: 20, desc: 'Does the candidate understand the access patterns and optimize for them?' },
        explanationQuality: { label: 'Query Explanation', weight: 15, desc: 'Can they walk through what their query does step by step?' },
        confidenceCalibration: { label: 'Confidence Cal.', weight: 10, desc: 'Whether self-assessment matches actual query quality.' },
    },
}

// Categories where complexity analysis (time/space) is irrelevant
const NO_COMPLEXITY_CATEGORIES = new Set([
    'BEHAVIORAL', 'HR', 'CS_FUNDAMENTALS', 'SYSTEM_DESIGN', 'LOW_LEVEL_DESIGN'
])

// Categories where the Code tab should not be shown
const NO_CODE_TAB_CATEGORIES = new Set([
    'BEHAVIORAL', 'HR', 'CS_FUNDAMENTALS'
])

// Get dimension labels for a category, falling back to CODING defaults
function getDimensionLabels(category) {
    return DIMENSION_LABELS[category] || DIMENSION_LABELS.CODING
}

// ── Infer category from review data ───────────────────
// AIReviewCard does not receive the problem category directly.
// We infer it from the review data shape so we can apply the right labels.
// This avoids threading category through every call site.
function inferCategory(review) {
    if (!review) return 'CODING'
    // Check for category stored in the review record (future-proofing)
    if (review.category) return review.category
    // Infer from the presence of category-specific feedback content
    // This works because the AI prompt produces category-specific feedback text
    // that contains these signals in the improvement/interviewTip fields
    const text = [
        review.improvement || '',
        review.interviewTip || '',
        review.readinessVerdict || '',
        ...(review.strengths || []),
        ...(review.gaps || []),
    ].join(' ').toLowerCase()
    if (text.includes('star format') || text.includes('situation') || text.includes('action')) return 'BEHAVIORAL'
    if (text.includes('authenticity') || text.includes('company research') || text.includes('career narrative')) return 'HR'
    if (text.includes('class hierarchy') || text.includes('solid principle') || text.includes('design pattern')) return 'LOW_LEVEL_DESIGN'
    if (text.includes('microservices') || text.includes('capacity') || text.includes('trade-off') || text.includes('api design')) return 'SYSTEM_DESIGN'
    if (text.includes('join') || text.includes('query') || text.includes('schema') || text.includes('index')) return 'SQL'
    if (text.includes('concept') || text.includes('tcp') || text.includes('process') || text.includes('virtual memory')) return 'CS_FUNDAMENTALS'
    return 'CODING'
}

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
                    <circle cx={size / 2} cy={size / 2} r={r}
                        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
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
function DimensionBar({ label, score, weight, feedback, delay = 0 }) {
    const [showFeedback, setShowFeedback] = useState(false)
    const barColor =
        score >= 8 ? 'bg-success' :
            score >= 6 ? 'bg-brand-400' :
                score >= 4 ? 'bg-warning' : 'bg-danger'
    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={() => feedback && setShowFeedback(v => !v)}
                className={cn('w-full flex items-center gap-3 group', feedback && 'cursor-pointer')}
            >
                <span className="text-[10px] text-text-tertiary w-36 text-left flex-shrink-0
                                 group-hover:text-text-secondary transition-colors">
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
                        className="overflow-hidden ml-36 pl-3"
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
function FlagBanner({ flags, category }) {
    if (!flags || typeof flags !== 'object') return null

    const isHR = category === 'HR'
    const isBehavioral = category === 'BEHAVIORAL'
    const isNonCoding = NO_CODE_TAB_CATEGORIES.has(category)

    const activeFlags = [
        // Incomplete submission — relevant for all categories
        flags.incompleteSubmission === true && {
            icon: '🚨',
            label: isHR ? 'Incomplete Answer'
                : isBehavioral ? 'Incomplete Response'
                    : 'Incomplete Submission',
            desc: isHR
                ? 'Your answer is missing critical components. A strong HR answer requires both the analysis of what\'s being asked AND a specific, authentic response.'
                : isBehavioral
                    ? 'Your STAR response is missing key components. Ensure Situation, Task, Action, and Result are all clearly present.'
                    : 'Your code is missing critical sections or is pseudocode. In a real interview, this would end your evaluation immediately.',
            severity: 'critical',
        },
        // Overconfidence — relevant for all categories
        flags.overconfidenceDetected === true && {
            icon: '⚡',
            label: 'Confidence Mismatch Detected',
            desc: isHR
                ? `You rated your answer ${flags.candidateConfidence}/5 (high confidence) but the authenticity and specificity score is ${flags.codeCorrectnessScore}/10. Over-rating generic answers signals poor self-awareness — interviewers specifically watch for this.`
                : `You rated your confidence ${flags.candidateConfidence}/5 but your score is ${flags.codeCorrectnessScore}/10. Overconfidence in interviews signals poor self-awareness.`,
            severity: 'critical',
        },
        // Language mismatch — only relevant for coding categories
        !isNonCoding && flags.languageMismatch === true && {
            icon: '⚠️',
            label: 'Language Mismatch Detected',
            desc: `You selected ${flags.selectedLanguage || 'one language'} but your code appears to be ${flags.detectedLanguage || 'a different language'}. Verify your language selection is correct.`,
            severity: 'warning',
        },
        // Wrong pattern — only relevant for coding/LLD/behavioral (not HR)
        !isHR && flags.wrongPattern === true && {
            icon: '🎯',
            label: category === 'LOW_LEVEL_DESIGN'
                ? 'Wrong Design Pattern'
                : category === 'BEHAVIORAL'
                    ? 'Wrong Competency Identified'
                    : 'Wrong Pattern Identified',
            desc: `You identified "${flags.identifiedPattern || 'a pattern'}" but ${flags.correctPattern
                ? `this calls for ${flags.correctPattern}`
                : 'a different pattern is more appropriate here'
                }.`,
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
                    <span className="text-base flex-shrink-0 mt-0.5">{flag.icon}</span>
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

// ── Score trend ────────────────────────────────────────
function ScoreTrend({ current, previous }) {
    if (previous == null || previous === current) return null
    const improved = current > previous
    const diff = Math.abs(current - previous)
    return (
        <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full',
            improved ? 'text-success bg-success/12' : 'text-danger bg-danger/12'
        )}>
            {improved ? '↑' : '↓'}{diff} from last
        </span>
    )
}

// ── Follow-up section ──────────────────────────────────
function FollowUpSection({ followUpEvaluations, problemFollowUps, isHR = false }) {
    if (!problemFollowUps?.length) {
        return (
            <p className="text-xs text-text-disabled text-center py-4">
                No follow-up questions for this problem.
            </p>
        )
    }

    return (
        <div className="space-y-2">
            {problemFollowUps.map((fq, i) => {
                const evaluation = followUpEvaluations?.find(e => e.questionId === fq.id)
                const wasAnswered = evaluation?.wasAnswered ?? false
                const score = evaluation?.score ?? null

                // HR: use stakes labels instead of Easy/Medium/Hard
                const difficultyBadge = isHR ? (() => {
                    const stakes = HR_STAKES[fq.difficulty]
                    return stakes ? (
                        <span className={cn(
                            'text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0 mt-0.5',
                            stakes.bg
                        )}>
                            <span className={stakes.color}>{stakes.label}</span>
                        </span>
                    ) : null
                })() : (
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
                )

                return (
                    <motion.div
                        key={fq.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className={cn(
                            'rounded-xl border p-3.5',
                            !wasAnswered
                                ? 'bg-surface-2 border-border-subtle'
                                : score != null && score >= 7
                                    ? 'bg-success/5 border-success/20'
                                    : score != null && score >= 5
                                        ? 'bg-warning/5 border-warning/20'
                                        : 'bg-danger/5 border-danger/20'
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                                {difficultyBadge}
                                <p className="text-[11px] text-text-secondary leading-relaxed">
                                    {fq.question}
                                </p>
                            </div>
                            <div className="flex-shrink-0">
                                {!wasAnswered ? (
                                    <span className="text-[9px] font-bold text-text-disabled
                                                     bg-surface-3 border border-border-subtle
                                                     px-1.5 py-px rounded-full">
                                        Skipped
                                    </span>
                                ) : score != null ? (
                                    <span className={cn(
                                        'text-[11px] font-extrabold font-mono',
                                        score >= 7 ? 'text-success' :
                                            score >= 5 ? 'text-warning' : 'text-danger'
                                    )}>
                                        {score}/10
                                    </span>
                                ) : (
                                    <span className="text-[9px] text-text-disabled">Answered</span>
                                )}
                            </div>
                        </div>
                        {evaluation?.feedback && evaluation.feedback !== 'Skipped' && (
                            <p className="text-[10px] text-text-tertiary mt-1.5 ml-7 leading-relaxed">
                                {evaluation.feedback}
                            </p>
                        )}
                        {!wasAnswered && (
                            <p className="text-[10px] text-text-disabled mt-1.5 ml-7 italic">
                                {isHR
                                    ? 'Preparing answers to probing follow-ups is what separates good candidates from great ones.'
                                    : 'Answering follow-ups earns bonus points and demonstrates mastery beyond the base solution.'
                                }
                            </p>
                        )}
                    </motion.div>
                )
            })}
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════
export function AIReviewCard({ solutionId, existingReview, problemFollowUps }) {
    const aiReview = useAIReview()
    const [activeTab, setActiveTab] = useState('overview')
    const [expanded, setExpanded] = useState(false)

    const [localHistory, setLocalHistory] = useState(() => {
        if (!existingReview) return []
        if (Array.isArray(existingReview)) return existingReview
        return [existingReview]
    })

    const latestReview = localHistory[localHistory.length - 1] || null
    const previousReview = localHistory.length > 1
        ? localHistory[localHistory.length - 2]
        : null

    // Infer the category from the review content
    // Used for dimension label selection and tab visibility
    const inferredCategory = useMemo(() => inferCategory(latestReview), [latestReview])
    const dimLabels = getDimensionLabels(inferredCategory)
    const isHR = inferredCategory === 'HR'
    const showCodeTab = !NO_CODE_TAB_CATEGORIES.has(inferredCategory)
    const showComplexity = !NO_COMPLEXITY_CATEGORIES.has(inferredCategory)

    async function handleReview() {
        try {
            const res = await aiReview.mutateAsync(solutionId)
            const newReview = res.data.data.feedback
            setLocalHistory(prev => [...prev, newReview])
            setExpanded(true)
            setActiveTab('overview')
        } catch {
            // error handled by hook
        }
    }

    // Build dimension list with category-appropriate labels
    const dimensions = latestReview?.dimensionScores ? [
        {
            ...dimLabels.codeCorrectness,
            key: 'codeCorrectness',
            score: latestReview.dimensionScores.codeCorrectness,
        },
        {
            ...dimLabels.patternAccuracy,
            key: 'patternAccuracy',
            score: latestReview.dimensionScores.patternAccuracy,
        },
        {
            ...dimLabels.understandingDepth,
            key: 'understandingDepth',
            score: latestReview.dimensionScores.understandingDepth,
        },
        {
            ...dimLabels.explanationQuality,
            key: 'explanationQuality',
            score: latestReview.dimensionScores.explanationQuality,
        },
        {
            ...dimLabels.confidenceCalibration,
            key: 'confidenceCalibration',
            score: latestReview.dimensionScores.confidenceCalibration,
        },
    ] : []

    const flagCount = latestReview?.flags
        ? [
            latestReview.flags.incompleteSubmission,
            latestReview.flags.overconfidenceDetected,
            !NO_CODE_TAB_CATEGORIES.has(inferredCategory) && latestReview.flags.languageMismatch,
            !isHR && latestReview.flags.wrongPattern,
        ].filter(Boolean).length
        : 0

    const followUpBonus = latestReview?.followUpBonus || 0
    const ragContext = latestReview?.ragContext

    // Category-appropriate "get review" description
    const reviewDescription = {
        HR: '5-dimension analysis · Flags generic answers · Checks authenticity',
        BEHAVIORAL: '5-dimension analysis · STAR structure check · Flags vague answers',
        SYSTEM_DESIGN: '5-dimension analysis · Architecture evaluation · Trade-off depth',
        LOW_LEVEL_DESIGN: '5-dimension analysis · OOP correctness · SOLID principles',
        SQL: '5-dimension analysis · Query correctness · Optimization check',
        CS_FUNDAMENTALS: '5-dimension analysis · Conceptual accuracy · Depth check',
    }[inferredCategory] || '5-dimension analysis · Flags interview killers · Tracks improvement'

    // ── No review yet ──────────────────────────────────
    if (!latestReview) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-5"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-400/15 border
                                        border-brand-400/20 flex items-center justify-center text-xl">
                            🤖
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-text-primary">AI Review</h3>
                            <p className="text-xs text-text-tertiary">{reviewDescription}</p>
                        </div>
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={aiReview.isPending}
                        onClick={handleReview}
                    >
                        {aiReview.isPending ? 'Analyzing...' : (
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
                <div className="mt-4 pt-4 border-t border-border-subtle
                                grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(isHR ? [
                        { icon: '🔍', label: 'Authenticity Check' },
                        { icon: '🎯', label: 'Company Alignment' },
                        { icon: '⚡', label: 'Flags Generic' },
                        { icon: '💬', label: 'Structure' },
                        { icon: '📈', label: 'Track Progress' },
                    ] : [
                        { icon: '🔍', label: 'Code Analysis' },
                        { icon: '🧩', label: 'Pattern Check' },
                        { icon: '⚡', label: 'Flags Killers' },
                        { icon: '💬', label: 'Explanation' },
                        { icon: '📈', label: 'Track Progress' },
                    ]).map(item => (
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

    const overallScore = latestReview.overallScore

    // Build tabs — Code tab hidden for non-coding categories
    const availableTabs = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'dimensions', label: '📐 Dimensions' },
        ...(showCodeTab ? [{ id: 'code', label: '💻 Code' }] : []),
        ...(problemFollowUps?.length > 0 ? [{ id: 'followups', label: isHR ? '💬 Follow-ups' : '🧠 Follow-ups' }] : []),
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
        >
            {/* Header */}
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
                        {flagCount > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                             bg-danger/15 text-danger border border-danger/25">
                                {flagCount} issue{flagCount !== 1 ? 's' : ''}
                            </span>
                        )}
                        <ScoreTrend
                            current={overallScore}
                            previous={previousReview?.overallScore}
                        />
                        {followUpBonus > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                             bg-success/12 text-success border border-success/20">
                                +{followUpBonus} bonus
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-text-tertiary">
                        {ragContext?.teammateCount > 0
                            ? `Compared with ${ragContext.teammateCount} teammate${ragContext.teammateCount !== 1 ? 's' : ''}`
                            : 'Individual analysis'
                        }
                        {ragContext?.hasAdminNotes && ' · Admin notes applied'}
                        {latestReview.reviewNumber > 1 && ` · Review #${latestReview.reviewNumber}`}
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
                            {/* Tabs */}
                            <div className="flex gap-1 px-5 pt-3">
                                {availableTabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            'px-3 py-2 rounded-t-lg text-xs font-semibold',
                                            'transition-all border-b-2',
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
                                {/* OVERVIEW */}
                                {activeTab === 'overview' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                        <FlagBanner flags={latestReview.flags} category={inferredCategory} />
                                        {latestReview.strengths?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-2.5">
                                                    ✅ Strengths
                                                </p>
                                                <div className="space-y-2">
                                                    {latestReview.strengths.map((s, i) => (
                                                        <div key={i} className="flex items-start gap-2.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0 mt-1.5" />
                                                            <MarkdownRenderer content={s} size="sm" className="flex-1" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {latestReview.gaps?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-2.5">
                                                    ⚠️ Gaps
                                                </p>
                                                <div className="space-y-2">
                                                    {latestReview.gaps.map((g, i) => (
                                                        <div key={i} className="flex items-start gap-2.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0 mt-1.5" />
                                                            <MarkdownRenderer content={g} size="sm" className="flex-1" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {latestReview.improvement && (
                                            <div className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4">
                                                <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-2">
                                                    💡 Key Improvement
                                                </p>
                                                <MarkdownRenderer content={latestReview.improvement} size="sm" />
                                            </div>
                                        )}
                                        {latestReview.interviewTip && (
                                            <div className="bg-info/5 border border-info/20 rounded-xl p-4">
                                                <p className="text-[10px] font-bold text-info uppercase tracking-widest mb-2">
                                                    🎯 Interview Tip
                                                </p>
                                                <MarkdownRenderer content={latestReview.interviewTip} size="sm" />
                                            </div>
                                        )}
                                        {latestReview.readinessVerdict && (
                                            <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                                    🏁 {isHR ? 'Interview Readiness' : 'Interview Readiness'}
                                                </p>
                                                <MarkdownRenderer content={latestReview.readinessVerdict} size="sm" />
                                            </div>
                                        )}
                                        {/* Pattern baseline — only for coding categories */}
                                        {latestReview.patternBaseline &&
                                            latestReview.patternBaseline.solutionCount > 0 &&
                                            !isHR && (
                                                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                                                        📊 Your {latestReview.patternBaseline.pattern} Baseline
                                                    </p>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-center">
                                                            <p className="text-base font-extrabold font-mono text-text-primary">
                                                                {latestReview.patternBaseline.avgOverallScore}/10
                                                            </p>
                                                            <p className="text-[9px] text-text-disabled">avg score</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-base font-extrabold font-mono text-text-disabled">
                                                                {latestReview.patternBaseline.solutionCount}
                                                            </p>
                                                            <p className="text-[9px] text-text-disabled">solutions</p>
                                                        </div>
                                                        {latestReview.patternBaseline.trend && (
                                                            <span className={cn(
                                                                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                                                latestReview.patternBaseline.trend === 'improving'
                                                                    ? 'bg-success/12 text-success'
                                                                    : latestReview.patternBaseline.trend === 'declining'
                                                                        ? 'bg-danger/12 text-danger'
                                                                        : 'bg-surface-3 text-text-disabled'
                                                            )}>
                                                                {latestReview.patternBaseline.trend === 'improving' ? '↑ Improving'
                                                                    : latestReview.patternBaseline.trend === 'declining' ? '↓ Declining'
                                                                        : '→ Stable'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                    </motion.div>
                                )}

                                {/* DIMENSIONS */}
                                {activeTab === 'dimensions' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                                        <p className="text-[10px] text-text-disabled">
                                            Click any row to see what this dimension measures for {
                                                isHR ? 'HR interviews'
                                                    : inferredCategory === 'BEHAVIORAL' ? 'behavioral interviews'
                                                        : inferredCategory === 'SYSTEM_DESIGN' ? 'system design interviews'
                                                            : inferredCategory === 'LOW_LEVEL_DESIGN' ? 'LLD interviews'
                                                                : 'this category'
                                            }.
                                        </p>
                                        {dimensions.map((dim, i) => (
                                            <DimensionBar
                                                key={dim.key}
                                                label={dim.label}
                                                score={dim.score}
                                                weight={dim.weight}
                                                feedback={dim.desc}
                                                delay={i * 0.08}
                                            />
                                        ))}
                                        <div className="pt-3 border-t border-border-subtle space-y-1.5">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-text-disabled">Weighted score</span>
                                                <span className="font-bold text-text-secondary font-mono">
                                                    {dimensions.reduce((sum, d) =>
                                                        sum + (d.score * d.weight / 10), 0
                                                    ).toFixed(1)}
                                                </span>
                                            </div>
                                            {followUpBonus > 0 && (
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-text-disabled">Follow-up bonus</span>
                                                    <span className="font-bold text-success font-mono">
                                                        +{followUpBonus}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle font-bold">
                                                <span className="text-text-secondary">Final score</span>
                                                <span className={cn(
                                                    'font-mono',
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

                                {/* CODE — only for coding categories */}
                                {activeTab === 'code' && showCodeTab && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                        {latestReview.complexityCheck && showComplexity ? (
                                            <>
                                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                                    Complexity Analysis (AI-derived from code)
                                                </p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {[
                                                        {
                                                            label: 'Time Complexity',
                                                            value: latestReview.complexityCheck.timeComplexity,
                                                            correct: latestReview.complexityCheck.timeCorrect,
                                                        },
                                                        {
                                                            label: 'Space Complexity',
                                                            value: latestReview.complexityCheck.spaceComplexity,
                                                            correct: latestReview.complexityCheck.spaceCorrect,
                                                        },
                                                    ].map(c => (
                                                        <div key={c.label}
                                                            className={cn('rounded-xl p-3.5 border',
                                                                c.correct
                                                                    ? 'bg-success/5 border-success/20'
                                                                    : 'bg-warning/5 border-warning/20'
                                                            )}>
                                                            <p className="text-[10px] text-text-disabled mb-1">{c.label}</p>
                                                            <p className={cn('text-lg font-extrabold font-mono', c.correct ? 'text-success' : 'text-warning')}>
                                                                {c.value || '?'}
                                                            </p>
                                                            <p className="text-[9px] mt-0.5" style={{ color: c.correct ? '#22c55e' : '#eab308' }}>
                                                                {c.correct ? 'Optimal' : 'Can be improved'}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {latestReview.complexityCheck.optimizationNote && (
                                                    <div className="bg-surface-2 border border-border-subtle rounded-xl p-3">
                                                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                                            Optimization Opportunity
                                                        </p>
                                                        <p className="text-xs text-text-secondary leading-relaxed">
                                                            {latestReview.complexityCheck.optimizationNote}
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-xs text-text-disabled text-center py-4">
                                                No code was submitted for analysis.
                                            </p>
                                        )}
                                        {/* Code correctness score */}
                                        {latestReview.dimensionScores?.codeCorrectness != null && (
                                            <div className={cn(
                                                'rounded-xl p-4 border',
                                                latestReview.dimensionScores.codeCorrectness >= 7
                                                    ? 'bg-success/5 border-success/20'
                                                    : latestReview.dimensionScores.codeCorrectness >= 5
                                                        ? 'bg-warning/5 border-warning/20'
                                                        : 'bg-danger/5 border-danger/20'
                                            )}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-bold text-text-primary">
                                                        {dimLabels.codeCorrectness.label} Score
                                                    </p>
                                                    <span className={cn(
                                                        'text-xl font-extrabold font-mono',
                                                        latestReview.dimensionScores.codeCorrectness >= 7
                                                            ? 'text-success'
                                                            : latestReview.dimensionScores.codeCorrectness >= 5
                                                                ? 'text-warning' : 'text-danger'
                                                    )}>
                                                        {latestReview.dimensionScores.codeCorrectness}/10
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-text-tertiary leading-relaxed">
                                                    {latestReview.dimensionScores.codeCorrectness >= 8
                                                        ? 'Your code appears correct and handles edge cases well.'
                                                        : latestReview.dimensionScores.codeCorrectness >= 6
                                                            ? 'Your code handles main cases but may miss some edge cases.'
                                                            : latestReview.dimensionScores.codeCorrectness >= 4
                                                                ? 'Your code has significant issues that would fail test cases.'
                                                                : 'Fundamental correctness problems. Fix this before anything else.'
                                                    }
                                                </p>
                                                {latestReview.dimensionScores.codeCorrectness <= 4 && (
                                                    <p className="text-[10px] text-danger mt-2 font-semibold">
                                                        ⚠️ Interviewers will not proceed past this in a real interview.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* FOLLOW-UPS */}
                                {activeTab === 'followups' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                        <FollowUpSection
                                            followUpEvaluations={latestReview.followUpEvaluations}
                                            problemFollowUps={problemFollowUps}
                                            isHR={isHR}
                                        />
                                    </motion.div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 pb-4 flex items-center justify-between
                                            border-t border-border-subtle pt-3">
                                <div className="text-[10px] text-text-disabled">
                                    {latestReview.reviewedAt && (
                                        <span>{new Date(latestReview.reviewedAt).toLocaleDateString()}</span>
                                    )}
                                    {localHistory.length > 1 && (
                                        <span> · Review #{latestReview.reviewNumber || localHistory.length} of {localHistory.length}</span>
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