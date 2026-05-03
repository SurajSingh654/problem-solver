// ============================================================================
// ProbSolver v3.0 — Problem Detail Page
// ============================================================================
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useProblemSolutions } from '@hooks/useSolutions'
import useAuthStore from '@store/useAuthStore'
import { SolutionCard } from '@components/features/solutions/SolutionCard'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { EmptyState } from '@components/ui/EmptyState'
import { AIReviewCard } from '@components/features/ai/AIReviewCard'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { useAIStatus } from '@hooks/useAI'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'
import { PROBLEM_CATEGORIES } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Category icon helper ───────────────────────────────
function getCategoryIcon(category) {
    const icons = {
        SYSTEM_DESIGN: '🏗️',
        LOW_LEVEL_DESIGN: '🔧',
        BEHAVIORAL: '🗣️',
        CS_FUNDAMENTALS: '🧠',
        HR: '🤝',
        SQL: '🗃️',
        CODING: '💻',
    }
    return icons[category] || '📋'
}

// ── Category-specific submit button label ──────────────
function getSubmitLabel(category) {
    const labels = {
        SYSTEM_DESIGN: 'Submit My Design',
        LOW_LEVEL_DESIGN: 'Submit My Design',
        BEHAVIORAL: 'Submit My Response',
        CS_FUNDAMENTALS: 'Submit My Explanation',
        HR: 'Submit My Answer',
        SQL: 'Submit My Query',
    }
    return labels[category] || 'Submit Solution'
}

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

function getPlatformSearchUrl(source, title) {
    if (!title) return null
    const encoded = encodeURIComponent(title)
    const searchUrls = {
        LEETCODE: `https://leetcode.com/problemset/?search=${encoded}`,
        GFG: `https://www.geeksforgeeks.org/explore?searchQuery=${encoded}`,
        HACKERRANK: `https://www.hackerrank.com/domains/algorithms?filters%5Bsubdomains%5D%5B%5D=arrays&searchQuery=${encoded}`,
        INTERVIEWBIT: `https://www.interviewbit.com/search/?query=${encoded}`,
        CODECHEF: `https://www.codechef.com/problems/school?search=${encoded}`,
    }
    return searchUrls[source] || null
}

export default function ProblemDetailPage() {
    const { problemId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.teamRole === 'TEAM_ADMIN'
    const { data: aiStatus } = useAIStatus()
    const aiEnabled = aiStatus?.enabled

    const { data: problem, isLoading, isError } = useProblem(problemId)
    const { data: solutionsData } = useProblemSolutions(problemId)

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
        title, difficulty, category, description, tags, isPinned,
        realWorldContext, useCases, adminNotes, followUpQuestions,
        isSolved, teamSolutionCount, createdBy, createdAt,
    } = problem

    const isSystemDesign = category === 'SYSTEM_DESIGN'
    const isLLD = category === 'LOW_LEVEL_DESIGN'

    const solutions = solutionsData?.solutions || []
    const mySolution = solutions.find(s => s.userId === user?.id || s.isOwn)
    const otherSolutions = solutions.filter(s => s.userId !== user?.id && !s.isOwn)

    const useCasesList = useCases
        ? (typeof useCases === 'string' ? useCases.split('\n').filter(Boolean) : useCases)
        : []

    // For SD: real world context and admin notes are hidden until submission.
    // Revealing them upfront defeats the learning — candidates must attempt first.
    // For all other categories: show everything.
    const showRealWorldContext = (!isSystemDesign && !isLLD) || isSolved
    const showAdminNotes = isAdmin || ((isSystemDesign || isLLD) && isSolved)

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

            {/* ── Header card ──────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
            >
                {/* Badges row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Badge variant={DIFF_VARIANT[difficulty] || 'brand'} size="sm">
                        {difficulty?.charAt(0) + difficulty?.slice(1).toLowerCase()}
                    </Badge>
                    {category && (() => {
                        const cat = PROBLEM_CATEGORIES.find(c => c.id === category)
                        return cat ? (
                            <span className={cn('text-xs font-bold px-2.5 py-0.5 rounded-full border', cat.bg)}>
                                {cat.icon} {cat.label}
                            </span>
                        ) : null
                    })()}
                    {/* Platform badge — only relevant for CODING/SQL */}
                    {problem.categoryData?.platform &&
                        problem.categoryData.platform !== 'OTHER' &&
                        !isSystemDesign && !isLLD && (
                            <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                             border border-border-subtle rounded-full px-2 py-px">
                                {problem.categoryData.platform}
                            </span>
                        )}
                    {isPinned && (
                        <span className="text-xs font-bold text-warning bg-warning/10
                                         border border-warning/25 rounded-full px-2 py-0.5">
                            📌 Pinned
                        </span>
                    )}
                    {isSolved && (
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

                {/* External link — CODING/SQL only, never SD/LLD */}
                {problem.categoryData?.sourceUrl && !isSystemDesign && !isLLD && (
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <a
                            href={problem.categoryData.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                                       bg-brand-400/10 border border-brand-400/25
                                       text-sm font-semibold text-brand-300 hover:text-brand-200
                                       hover:bg-brand-400/15 transition-all"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            Solve on {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER'
                                ? problem.categoryData.platform.replace('_', ' ')
                                : 'External Site'}
                        </a>
                        {getPlatformSearchUrl(problem.categoryData?.platform, problem.title) && (
                            <a
                                href={getPlatformSearchUrl(problem.categoryData?.platform, problem.title)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl
                                           bg-surface-2 border border-border-default
                                           text-xs font-medium text-text-tertiary hover:text-text-primary
                                           hover:border-border-strong transition-all"
                                title="If the direct link doesn't work, search here"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                Search if link broken
                            </a>
                        )}
                    </div>
                )}

                {/* Company tags */}
                {problem.categoryData?.companyTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {problem.categoryData.companyTags.map(c => (
                            <span key={c}
                                className="text-[10px] font-semibold text-warning
                                           bg-warning/10 border border-warning/20
                                           rounded-full px-2.5 py-0.5">
                                🏢 {c}
                            </span>
                        ))}
                    </div>
                )}

                {/* Quick stats */}
                <div className="flex items-center gap-3 flex-wrap mb-5">
                    <InfoChip label="Solutions" value={teamSolutionCount || 0} color="text-brand-300" />
                    <InfoChip label="Follow-ups" value={followUpQuestions?.length || 0} color="text-info" />
                    {createdBy && (
                        <div className="flex flex-col justify-center bg-surface-2
                                        border border-border-default rounded-xl px-4 py-3">
                            <span className="text-[10px] text-text-disabled uppercase tracking-wider mb-0.5">
                                Added by
                            </span>
                            <span className="text-sm font-bold text-text-primary">{createdBy.name}</span>
                        </div>
                    )}
                    <div className="flex flex-col justify-center bg-surface-2
                                    border border-border-default rounded-xl px-4 py-3">
                        <span className="text-[10px] text-text-disabled uppercase tracking-wider mb-0.5">
                            Added
                        </span>
                        <span className="text-sm font-bold text-text-primary">
                            {formatShortDate(createdAt)}
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

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-5 flex-wrap">
                    {!isSolved ? (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => navigate(`/problems/${problemId}/submit`)}
                        >
                            {getSubmitLabel(category)}
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={() => navigate(`/problems/${problemId}/edit-solution/${problem.userSolutionId}`)}
                        >
                            Edit My Solution
                        </Button>
                    )}
                    {isAdmin && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => navigate(`/admin/edit-problem/${problemId}`)}
                        >
                            Edit Problem
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* ── Problem Description ───────────────────────
                For SYSTEM_DESIGN and LOW_LEVEL_DESIGN, the description IS the problem.
                It is the design brief / challenge statement — style it prominently.
                For other categories, it's supplementary context.
            ─────────────────────────────────────────────── */}
            {description && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 }}
                    className={cn(
                        'border rounded-2xl p-5 mb-6',
                        isSystemDesign
                            ? 'bg-brand-400/5 border-brand-400/25'
                            : isLLD
                                ? 'bg-purple-400/5 border-purple-400/25'
                                : category && category !== 'CODING'
                                    ? 'bg-brand-400/3 border-brand-400/20'
                                    : 'bg-surface-1 border-border-default'
                    )}
                >
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                        <span>{getCategoryIcon(category)}</span>
                        {isSystemDesign ? 'Design Brief'
                            : isLLD ? 'Design Challenge'
                                : 'Description'}
                    </h2>

                    {/* SD/LLD context hint */}
                    {(isSystemDesign || isLLD) && (
                        <p className="text-[11px] text-text-tertiary mb-3 flex items-center gap-1.5">
                            <span>💡</span>
                            {isSystemDesign
                                ? 'This is the complete problem. Start by clarifying requirements before designing anything.'
                                : 'Identify the entities and their responsibilities before writing any code.'
                            }
                        </p>
                    )}

                    <MarkdownRenderer content={description} />
                </motion.div>
            )}

            {/* ── Real World Context ────────────────────────
                SYSTEM_DESIGN: Hidden until the member submits.
                Revealing it upfront gives away the answer — the candidate
                must form their own understanding first, then compare.
                All other categories: always visible.
            ─────────────────────────────────────────────── */}
            {showRealWorldContext && (realWorldContext || useCasesList.length > 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                        <span>🌍</span>
                        {isSystemDesign ? 'Real World Context — How Others Solved This' : 'Real World Context'}
                    </h2>
                    {isSystemDesign && isSolved && (
                        <p className="text-[11px] text-text-tertiary mb-3 bg-success/5
                                       border border-success/20 rounded-lg px-3 py-2">
                            ✓ You submitted your design. Compare your thinking with how real systems approach this.
                        </p>
                    )}
                    {realWorldContext && (
                        <MarkdownRenderer content={realWorldContext} className="mb-3" />
                    )}
                    {useCasesList.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {useCasesList.map((u, i) => (
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

            {/* ── Hints locked notice — SD only, before submission ── */}
            {(isSystemDesign || isLLD) && !isSolved && (realWorldContext || useCasesList.length > 0 || adminNotes) && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-surface-3 border border-border-default
                                        flex items-center justify-center text-lg flex-shrink-0">
                            🔒
                        </div>
                        <div>
                            <p className="text-sm font-bold text-text-primary mb-1">
                                Real World Context & Teaching Notes
                            </p>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                {isSystemDesign
                                    ? 'These unlock after you submit your design. Attempt the design before looking at hints.'
                                    : 'These unlock after you submit your design. The expected class hierarchy, patterns, and SOLID analysis unlock so you can compare your thinking to the model answer.'
                                }
                            </p>
                            <button
                                onClick={() => navigate(`/problems/${problemId}/submit`)}
                                className="mt-3 text-xs font-bold text-brand-300 hover:text-brand-200
                                           transition-colors flex items-center gap-1"
                            >
                                Submit your design to unlock
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ── Follow-up questions ───────────────────── */}
            {followUpQuestions?.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                            <span>🧠</span>
                            {isSystemDesign ? 'Design Deep-Dive Questions' : 'Follow-up Questions'}
                            <Badge variant="brand" size="xs">{followUpQuestions.length}</Badge>
                        </h2>
                        {isSolved && problem.userSolutionId && (
                            <button
                                onClick={() => navigate(`/problems/${problemId}/edit-solution/${problem.userSolutionId}`)}
                                className="text-xs font-semibold text-brand-300 hover:text-brand-200
                                           transition-colors flex items-center gap-1"
                            >
                                Answer these
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {isSystemDesign && (
                        <p className="text-[11px] text-text-tertiary mb-3 leading-relaxed">
                            These are the probing questions a real interviewer would ask after your initial design.
                            Answering them demonstrates depth and earns bonus points on your AI review.
                        </p>
                    )}

                    <div className="space-y-3">
                        {followUpQuestions.map((fq, i) => (
                            <div key={fq.id || i}
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
                                            variant={DIFF_VARIANT[fq.difficulty] || 'brand'}
                                            size="xs"
                                            className="flex-shrink-0"
                                        >
                                            {fq.difficulty?.charAt(0) + fq.difficulty?.slice(1).toLowerCase()}
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

                    {!isSolved && (
                        <p className="text-[11px] text-text-disabled mt-4 pt-3 border-t border-border-subtle">
                            Submit your {isSystemDesign ? 'design' : 'solution'} first — you can answer these
                            follow-ups to earn bonus points on your AI review.
                        </p>
                    )}
                </motion.div>
            )}

            {/* ── Admin notes ───────────────────────────────
                Always visible to admins.
                For SYSTEM_DESIGN: also visible to the member after they submit —
                  these are teaching notes that are most valuable as a comparison
                  tool after the candidate has attempted the design.
                For all other categories: admin-only.
            ─────────────────────────────────────────────── */}
            {showAdminNotes && adminNotes && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className={cn(
                        'border rounded-2xl p-5 mb-6',
                        isAdmin
                            ? 'bg-warning/5 border-warning/20'
                            : 'bg-brand-400/5 border-brand-400/20'
                    )}
                >
                    <h2 className={cn(
                        'text-sm font-bold flex items-center gap-2 mb-3',
                        isAdmin ? 'text-warning' : 'text-brand-300'
                    )}>
                        <span>{isAdmin ? '⚡' : '📖'}</span>
                        {isAdmin
                            ? 'Admin Notes'
                            : isSystemDesign
                                ? 'Teaching Notes — Compare Your Design'
                                : 'Teaching Notes — Compare Your Design'}
                    </h2>

                    {/* Context for members seeing teaching notes post-submission */}
                    {!isAdmin && (isSystemDesign || isLLD) && isSolved && (
                        <p className="text-xs text-text-tertiary mb-3 leading-relaxed">
                            {isLLD
                                ? 'This shows the expected class hierarchy, design patterns, and SOLID analysis. Compare each section to your submission — note what you got right, what you missed, and what design decisions you would change.'
                                : 'This is what an experienced interviewer would expect from a strong answer. Compare each section to your submission.'}
                        </p>
                    )}

                    <MarkdownRenderer content={adminNotes} size="sm" />
                </motion.div>
            )}

            {/* ── Solutions section ─────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                        <span>👥</span>
                        {isSystemDesign ? 'Team Designs' : 'Team Solutions'}
                        <Badge variant="brand" size="xs">{teamSolutionCount || 0}</Badge>
                    </h2>
                </div>

                {solutions.length === 0 ? (
                    <div className="bg-surface-1 border border-border-default
                                    rounded-2xl p-10 text-center">
                        <div className="text-3xl mb-3">🌱</div>
                        <p className="text-sm font-semibold text-text-primary mb-1">
                            {isSystemDesign ? 'No designs yet' : 'No solutions yet'}
                        </p>
                        <p className="text-xs text-text-tertiary mb-4">
                            {isSystemDesign
                                ? 'Be the first to submit a design!'
                                : 'Be the first to submit a solution!'}
                        </p>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => navigate(`/problems/${problemId}/submit`)}
                        >
                            {getSubmitLabel(category)}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {mySolution && (
                            <div>
                                <p className="text-xs font-bold text-text-disabled uppercase
                                               tracking-widest mb-2">
                                    {isSystemDesign ? 'Your Design' : 'Your Solution'}
                                </p>
                                <SolutionCard
                                    solution={mySolution}
                                    isOwn
                                    problemFollowUps={followUpQuestions}
                                />
                                {aiEnabled && (
                                    <div className="mt-3">
                                        <AIReviewCard
                                            solutionId={mySolution.id}
                                            existingReview={mySolution.aiFeedback}
                                            problemFollowUps={followUpQuestions}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {otherSolutions.length > 0 && (
                            <div>
                                {mySolution && (
                                    <p className="text-xs font-bold text-text-disabled uppercase
                                                   tracking-widest mb-2 mt-4">
                                        {isSystemDesign ? 'Teammates\' Designs' : 'Teammates'}
                                    </p>
                                )}
                                <div className="space-y-3">
                                    {otherSolutions.map(s => (
                                        <SolutionCard
                                            key={s.id}
                                            solution={s}
                                            problemFollowUps={followUpQuestions}
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