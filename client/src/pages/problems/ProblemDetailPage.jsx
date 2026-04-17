import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useAuthStore } from '@store/useAuthStore'
import { SolutionCard } from '@components/features/solutions/SolutionCard'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { EmptyState } from '@components/ui/EmptyState'
import { AIReviewCard } from '@components/features/ai/AIReviewCard'
import { useAIStatus } from '@hooks/useAI'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'
import {
    DIFFICULTY_COLORS,
    SOURCE_LABELS,
} from '@utils/constants'

// ── Difficulty badge ───────────────────────────────────
const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const SOURCE_COLOR = {
    LEETCODE: 'text-orange-400', GFG: 'text-green-500',
    CODECHEF: 'text-amber-600', INTERVIEWBIT: 'text-blue-500',
    HACKERRANK: 'text-emerald-500', CODEFORCES: 'text-red-500',
    OTHER: 'text-text-tertiary',
}

// ── Info chip ──────────────────────────────────────────
function InfoChip({ label, value, color }) {
    return (
        <div className="flex flex-col items-center justify-center
                    bg-surface-2 border border-border-default
                    rounded-xl px-4 py-3 min-w-[80px]">
            <span className={cn('text-lg font-extrabold', color)}>{value}</span>
            <span className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                {label}
            </span>
        </div>
    )
}

// ── Main ───────────────────────────────────────────────
export default function ProblemDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const isAdmin = user?.role === 'ADMIN'
    const { data: aiStatus } = useAIStatus()
    const aiEnabled = aiStatus?.enabled

    const { data: problem, isLoading, isError } = useProblem(id)

    if (isLoading) return <PageSpinner />

    if (isError || !problem) {
        return (
            <EmptyState
                icon="😕"
                title="Problem not found"
                description="This problem may have been removed or the link is invalid."
                actionLabel="Back to Problems"
                onAction={() => navigate('/problems')}
            />
        )
    }

    const {
        title, source, sourceUrl, difficulty,
        tags, companyTags, isPinned, isBlindChallenge,
        realWorldContext, useCases, adminNotes,
        followUps, solutions, isSolvedByMe,
        totalSolutions, addedBy, addedAt,
    } = problem

    const mySolution = solutions?.find(s => s.userId === user?.id)
    const otherSolutions = solutions?.filter(s => s.userId !== user?.id) || []

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Back button */}
            <button
                onClick={() => navigate('/problems')}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                   hover:text-text-primary transition-colors mb-6"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Problems
            </button>

            {/* Header card */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
            >
                {/* Badges row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Badge variant={DIFF_VARIANT[difficulty] || 'brand'} size="sm">
                        {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
                    </Badge>
                    <span className={cn(
                        'text-sm font-semibold',
                        SOURCE_COLOR[source] || 'text-text-tertiary'
                    )}>
                        {SOURCE_LABELS[source] || source}
                    </span>
                    {isPinned && (
                        <span className="text-xs font-bold text-warning bg-warning/10
                             border border-warning/25 rounded-full px-2 py-0.5">
                            📌 Pinned
                        </span>
                    )}
                    {isBlindChallenge && (
                        <span className="text-xs font-bold text-brand-300 bg-brand-400/10
                             border border-brand-400/25 rounded-full px-2 py-0.5">
                            🎯 Blind Challenge
                        </span>
                    )}
                    {isSolvedByMe && (
                        <span className="text-xs font-bold text-success bg-success/10
                             border border-success/25 rounded-full px-2 py-0.5
                             flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="3"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Solved
                        </span>
                    )}
                </div>

                {/* Title */}
                <h1 className="text-2xl font-extrabold text-text-primary mb-4 leading-tight">
                    {title}
                </h1>

                {/* Quick stats */}
                <div className="flex items-center gap-3 flex-wrap mb-5">
                    <InfoChip
                        label="Solutions"
                        value={totalSolutions}
                        color="text-brand-300"
                    />
                    <InfoChip
                        label="Follow-ups"
                        value={followUps?.length || 0}
                        color="text-info"
                    />
                    {addedBy && (
                        <div className="flex flex-col justify-center bg-surface-2
                            border border-border-default rounded-xl px-4 py-3">
                            <span className="text-[10px] text-text-disabled uppercase tracking-wider mb-0.5">
                                Added by
                            </span>
                            <span className="text-sm font-bold text-text-primary">
                                {addedBy.username}
                            </span>
                        </div>
                    )}
                    <div className="flex flex-col justify-center bg-surface-2
                          border border-border-default rounded-xl px-4 py-3">
                        <span className="text-[10px] text-text-disabled uppercase tracking-wider mb-0.5">
                            Added
                        </span>
                        <span className="text-sm font-bold text-text-primary">
                            {formatShortDate(addedAt)}
                        </span>
                    </div>
                </div>

                {/* Tags */}
                {tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {tags.map(t => (
                            <span key={t}
                                className="text-xs text-text-secondary bg-surface-3
                               border border-border-subtle rounded-lg px-2.5 py-1">
                                {t}
                            </span>
                        ))}
                    </div>
                )}

                {/* Company tags */}
                {companyTags?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {companyTags.map(c => (
                            <span key={c}
                                className="text-xs text-warning bg-warning/8
                               border border-warning/20 rounded-lg px-2.5 py-1 font-medium">
                                🏢 {c}
                            </span>
                        ))}
                    </div>
                )}

                {/* Source link */}
                {sourceUrl && (
                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-brand-300
                       hover:text-brand-200 transition-colors mt-1"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        View on {SOURCE_LABELS[source] || source}
                    </a>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-5 flex-wrap">
                    {!isSolvedByMe ? (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => navigate(`/problems/${id}/submit`)}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Submit Solution
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={() => navigate(`/problems/${id}/edit`)}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit My Solution
                        </Button>
                    )}
                    {isAdmin && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => navigate(`/admin/problems/${id}/edit`)}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            Edit Problem
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* Real world context */}
            {(realWorldContext || useCases?.length > 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                        <span>🌍</span> Real World Context
                    </h2>
                    {realWorldContext && (
                        <p className="text-sm text-text-secondary leading-relaxed mb-3">
                            {realWorldContext}
                        </p>
                    )}
                    {useCases?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {useCases.map((u, i) => (
                                <span key={i}
                                    className="text-xs bg-surface-3 border border-border-default
                                 rounded-lg px-2.5 py-1 text-text-secondary">
                                    {u}
                                </span>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Follow-up questions */}
            {followUps?.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                        <span>🧠</span> Follow-up Questions
                        <Badge variant="brand" size="xs">{followUps.length}</Badge>
                    </h2>
                    <div className="space-y-3">
                        {followUps.map((fq, i) => (
                            <div key={fq.id}
                                className="flex gap-3 bg-surface-2 border border-border-subtle
                              rounded-xl p-3.5">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-3
                                 border border-border-default flex items-center
                                 justify-center text-xs font-bold text-text-tertiary">
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium text-text-primary leading-relaxed">
                                            {fq.question}
                                        </p>
                                        <Badge
                                            variant={DIFF_VARIANT[fq.difficulty] || 'gray'}
                                            size="xs"
                                            className="flex-shrink-0"
                                        >
                                            {fq.difficulty.charAt(0) + fq.difficulty.slice(1).toLowerCase()}
                                        </Badge>
                                    </div>
                                    {fq.hint && (
                                        <details className="mt-2">
                                            <summary className="text-xs text-brand-300 cursor-pointer
                                          hover:text-brand-200 transition-colors w-fit">
                                                💡 Show hint
                                            </summary>
                                            <p className="text-xs text-text-secondary mt-1.5 bg-surface-3
                                    border border-border-subtle rounded-lg p-2.5">
                                                {fq.hint}
                                            </p>
                                        </details>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Admin notes — only visible to admins */}
            {isAdmin && adminNotes && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-warning/5 border border-warning/20 rounded-2xl p-5 mb-6"
                >
                    <h2 className="text-sm font-bold text-warning flex items-center gap-2 mb-2">
                        <span>⚡</span> Admin Notes
                    </h2>
                    <p className="text-sm text-text-secondary leading-relaxed">{adminNotes}</p>
                </motion.div>
            )}

            {/* Solutions section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                        <span>👥</span> Team Solutions
                        <Badge variant="brand" size="xs">{totalSolutions}</Badge>
                    </h2>
                </div>

                {solutions?.length === 0 ? (
                    <div className="bg-surface-1 border border-border-default
                          rounded-2xl p-10 text-center">
                        <div className="text-3xl mb-3">🌱</div>
                        <p className="text-sm font-semibold text-text-primary mb-1">
                            No solutions yet
                        </p>
                        <p className="text-xs text-text-tertiary mb-4">
                            Be the first to submit a solution!
                        </p>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => navigate(`/problems/${id}/submit`)}
                        >
                            Submit Solution
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Your solution first */}
                        {mySolution && (
                            <div>
                                <p className="text-xs font-bold text-text-disabled uppercase
                               tracking-widest mb-2">
                                    Your Solution
                                </p>
                                <SolutionCard
                                    solution={mySolution}
                                    isOwn
                                    problemFollowUps={followUps}
                                />
                                {/* AI Review — show only if AI is enabled */}
                                {aiEnabled && (
                                    <div className="mt-3">
                                        <AIReviewCard
                                            solutionId={mySolution.id}
                                            existingReview={mySolution.aiFeedback}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Teammates */}
                        {otherSolutions.length > 0 && (
                            <div>
                                {mySolution && (
                                    <p className="text-xs font-bold text-text-disabled uppercase
                                 tracking-widest mb-2 mt-4">
                                        Teammates
                                    </p>
                                )}
                                <div className="space-y-3">
                                    {otherSolutions.map(s => (
                                        <SolutionCard
                                            key={s.id}
                                            solution={s}
                                            problemFollowUps={followUps}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    )
}