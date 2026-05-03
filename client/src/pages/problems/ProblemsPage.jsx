// ============================================================================
// ProbSolver v3.0 — Problems Page (Team-Scoped)
// ============================================================================
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblems } from '@hooks/useProblems'
import { useTeamContext } from '@hooks/useTeamContext'
import { ProblemCard } from '@components/features/problems/ProblemCard'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { EmptyState } from '@components/ui/EmptyState'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES, HR_STAKES } from '@utils/constants'

// ── Helpers ────────────────────────────────────────────

// Get the display label for a difficulty value, considering category.
// HR problems use stakes labels (Common/Tricky/Sensitive) instead of Easy/Medium/Hard.
function getDifficultyLabel(difficulty, category) {
    if (category === 'HR') {
        return HR_STAKES[difficulty]?.label || difficulty
    }
    const d = difficulty?.toLowerCase()
    return d ? d.charAt(0).toUpperCase() + d.slice(1) : difficulty
}

// Get the display color class for a difficulty value, considering category.
function getDifficultyColor(difficulty, category) {
    if (category === 'HR') {
        return HR_STAKES[difficulty]?.color || 'text-text-secondary'
    }
    const colors = { EASY: 'text-success', MEDIUM: 'text-warning', HARD: 'text-danger' }
    return colors[difficulty] || 'text-text-secondary'
}

// ── Stats bar ──────────────────────────────────────────
// Category-aware: shows stakes labels for HR problems in the count.
function StatsBar({ problems }) {
    const total = problems.length
    const solved = problems.filter(p => p.isSolved).length

    // Separate HR and non-HR for accurate stats display
    const hrProblems = problems.filter(p => p.category === 'HR')
    const nonHrProblems = problems.filter(p => p.category !== 'HR')

    const easy = nonHrProblems.filter(p => p.difficulty === 'EASY').length
    const medium = nonHrProblems.filter(p => p.difficulty === 'MEDIUM').length
    const hard = nonHrProblems.filter(p => p.difficulty === 'HARD').length

    // HR stakes counts
    const common = hrProblems.filter(p => p.difficulty === 'EASY').length
    const tricky = hrProblems.filter(p => p.difficulty === 'MEDIUM').length
    const sensitive = hrProblems.filter(p => p.difficulty === 'HARD').length

    return (
        <div className="flex items-center gap-4 flex-wrap text-xs text-text-tertiary">
            <span className="font-semibold text-text-primary">{total} problems</span>
            <span className="text-success font-semibold">{solved} solved</span>
            {nonHrProblems.length > 0 && (
                <>
                    <span className="text-success">{easy} Easy</span>
                    <span className="text-warning">{medium} Medium</span>
                    <span className="text-danger">{hard} Hard</span>
                </>
            )}
            {hrProblems.length > 0 && (
                <>
                    {common > 0 && <span className="text-success">{common} Common</span>}
                    {tricky > 0 && <span className="text-warning">{tricky} Tricky</span>}
                    {sensitive > 0 && <span className="text-danger">{sensitive} Sensitive</span>}
                </>
            )}
        </div>
    )
}

// ── List row ───────────────────────────────────────────
function ProblemListRow({ problem, index }) {
    const navigate = useNavigate()
    const isHR = problem.category === 'HR'
    const stakes = isHR ? HR_STAKES[problem.difficulty] : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, delay: index * 0.02 }}
            onClick={() => navigate(`/problems/${problem.id}`)}
            className={cn(
                'flex items-center gap-4 p-3.5 rounded-xl border cursor-pointer',
                'transition-all duration-150 hover:-translate-y-px hover:shadow-sm',
                problem.isSolved
                    ? 'bg-success/3 border-success/15 hover:border-success/30'
                    : 'bg-surface-2 border-border-default hover:border-brand-400/30'
            )}
        >
            {/* Solved check */}
            <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                problem.isSolved
                    ? 'bg-success/15 border border-success/30'
                    : 'bg-surface-3 border border-border-default'
            )}>
                {problem.isSolved && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="#22c55e" strokeWidth="3"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </div>

            {/* Title */}
            <span className="flex-1 text-sm font-semibold text-text-primary truncate">
                {problem.isPinned && <span className="mr-1.5">📌</span>}
                {problem.title}
            </span>

            {/* Badges */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                {/* HR: stakes badge */}
                {isHR && stakes ? (
                    <span className={cn(
                        'text-[10px] font-bold px-2 py-px rounded-full border',
                        stakes.bg
                    )}>
                        <span className={stakes.color}>{stakes.icon} {stakes.label}</span>
                    </span>
                ) : (
                    // Non-HR: standard difficulty badge
                    <Badge
                        variant={
                            problem.difficulty === 'EASY' ? 'easy'
                                : problem.difficulty === 'MEDIUM' ? 'medium'
                                    : problem.difficulty === 'HARD' ? 'hard'
                                        : 'brand'
                        }
                        size="xs"
                    >
                        {getDifficultyLabel(problem.difficulty, problem.category)}
                    </Badge>
                )}

                {/* Tags — not shown for HR */}
                {!isHR && problem.tags?.slice(0, 2).map(t => (
                    <span key={t}
                        className="text-[11px] text-text-tertiary bg-surface-3
                                   px-1.5 py-px rounded border border-border-subtle hidden md:inline">
                        {t}
                    </span>
                ))}
            </div>

            {/* Solution count */}
            <span className="text-xs text-text-disabled flex-shrink-0 hidden sm:block">
                {problem.solutionCount || 0} {isHR ? 'answers' : 'solved'}
            </span>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ProblemsPage() {
    const navigate = useNavigate()
    const { isTeamAdmin, isPersonalMode } = useTeamContext()

    const [search, setSearch] = useState('')
    const [difficulty, setDifficulty] = useState('')
    const [category, setCategory] = useState('')
    const [tag, setTag] = useState('')
    const [showPinned, setShowPinned] = useState(false)
    const [viewMode, setViewMode] = useState('grid')

    const { data, isLoading } = useProblems({ limit: 200 })
    const allProblems = data?.problems || []

    // Client-side filtering
    const filtered = useMemo(() => {
        let list = [...allProblems]
        if (showPinned) list = list.filter(p => p.isPinned)
        if (difficulty) list = list.filter(p => p.difficulty === difficulty)
        if (category) list = list.filter(p => p.category === category)
        if (tag) list = list.filter(p =>
            p.tags?.some(t => t.toLowerCase().includes(tag.toLowerCase()))
        )
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.tags?.some(t => t.toLowerCase().includes(q))
            )
        }
        return list
    }, [allProblems, search, difficulty, category, tag, showPinned])

    // Available tags from non-HR problems (HR problems don't use algorithmic tags)
    const availableTags = useMemo(() => {
        const t = new Set(
            allProblems
                .filter(p => p.category !== 'HR')
                .flatMap(p => p.tags || [])
        )
        return [...t].slice(0, 20)
    }, [allProblems])

    // Whether any HR problems exist — affects filter row labels
    const hasHRProblems = useMemo(
        () => allProblems.some(p => p.category === 'HR'),
        [allProblems]
    )

    // Whether the current category filter is HR
    const isHRFilter = category === 'HR'

    const hasFilters = difficulty || tag || search || showPinned || category

    function clearFilters() {
        setSearch('')
        setDifficulty('')
        setCategory('')
        setTag('')
        setShowPinned(false)
    }

    // Difficulty filter options — label changes when HR category is selected
    const difficultyOptions = [
        {
            id: 'EASY',
            label: isHRFilter ? `${HR_STAKES.EASY.icon} ${HR_STAKES.EASY.label}` : 'Easy',
            activeClass: 'bg-success/15 border-success/40 text-success',
            dot: 'bg-success',
        },
        {
            id: 'MEDIUM',
            label: isHRFilter ? `${HR_STAKES.MEDIUM.icon} ${HR_STAKES.MEDIUM.label}` : 'Medium',
            activeClass: 'bg-warning/15 border-warning/40 text-warning',
            dot: 'bg-warning',
        },
        {
            id: 'HARD',
            label: isHRFilter ? `${HR_STAKES.HARD.icon} ${HR_STAKES.HARD.label}` : 'Hard',
            activeClass: 'bg-danger/15 border-danger/40 text-danger',
            dot: 'bg-danger',
        },
    ]

    return (
        <div className="p-6 max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Problems
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        {isPersonalMode
                            ? 'Your personal practice problems'
                            : 'Team problems — practice, solve, and track your progress'}
                    </p>
                </div>
                {isTeamAdmin && (
                    <Button
                        variant="primary"
                        size="md"
                        onClick={() => navigate('/admin/add-problem')}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Problem
                    </Button>
                )}
            </div>

            {/* Search + view toggle */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex-1">
                    <Input
                        placeholder="Search problems, tags…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        leftIcon={
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        }
                    />
                </div>
                <div className="flex items-center bg-surface-2 border border-border-default
                                rounded-lg p-1 gap-1 flex-shrink-0">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn(
                            'p-1.5 rounded-md transition-all',
                            viewMode === 'grid'
                                ? 'bg-surface-4 text-text-primary'
                                : 'text-text-tertiary hover:text-text-secondary'
                        )}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            'p-1.5 rounded-md transition-all',
                            viewMode === 'list'
                                ? 'bg-surface-4 text-text-primary'
                                : 'text-text-tertiary hover:text-text-secondary'
                        )}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="8" y1="6" x2="21" y2="6" />
                            <line x1="8" y1="12" x2="21" y2="12" />
                            <line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" />
                            <line x1="3" y1="12" x2="3.01" y2="12" />
                            <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-surface-1 border border-border-default rounded-xl p-4 mb-4 space-y-3">
                {/* Row 1: Category */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest w-16 flex-shrink-0">
                        Type
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {PROBLEM_CATEGORIES.map(cat => {
                            const count = allProblems.filter(p => p.category === cat.id).length
                            if (count === 0) return null
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(v => v === cat.id ? '' : cat.id)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg',
                                        'text-[11px] font-semibold border transition-all duration-150',
                                        category === cat.id
                                            ? `${cat.bg} ${cat.color}`
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-secondary hover:border-border-strong'
                                    )}
                                >
                                    <span className="text-xs">{cat.icon}</span>
                                    {cat.label}
                                    <span className={cn(
                                        'text-[9px] px-1 py-px rounded-full font-bold',
                                        category === cat.id ? 'bg-white/10' : 'bg-surface-4 text-text-disabled'
                                    )}>
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Row 2: Difficulty / Stakes + Pinned */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest w-16 flex-shrink-0">
                        {isHRFilter ? 'Stakes' : 'Level'}
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                        {difficultyOptions.map(d => {
                            // Count problems matching this difficulty, filtered by current category if set
                            const count = allProblems.filter(p =>
                                p.difficulty === d.id &&
                                (category ? p.category === category : true)
                            ).length
                            return (
                                <button
                                    key={d.id}
                                    onClick={() => setDifficulty(v => v === d.id ? '' : d.id)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg',
                                        'text-[11px] font-semibold border transition-all duration-150',
                                        difficulty === d.id
                                            ? d.activeClass
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    {!isHRFilter && (
                                        <span className={cn('w-1.5 h-1.5 rounded-full', d.dot)} />
                                    )}
                                    {d.label}
                                    <span className={cn(
                                        'text-[9px] px-1 py-px rounded-full font-bold',
                                        difficulty === d.id ? 'bg-white/10' : 'bg-surface-4 text-text-disabled'
                                    )}>
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                        <button
                            onClick={() => setShowPinned(v => !v)}
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg',
                                'text-[11px] font-semibold border transition-all duration-150',
                                showPinned
                                    ? 'bg-warning/15 border-warning/40 text-warning'
                                    : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                            )}
                        >
                            📌 Pinned
                        </button>
                    </div>
                </div>

                {/* Row 3: Tags — hidden when HR category is filtered (HR has no algo tags) */}
                {availableTags.length > 0 && !isHRFilter && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest w-16 flex-shrink-0">
                            Tags
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {availableTags.slice(0, 8).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTag(v => v === t ? '' : t)}
                                    className={cn(
                                        'inline-flex items-center px-2.5 py-1 rounded-lg',
                                        'text-[11px] font-semibold border transition-all duration-150',
                                        tag === t
                                            ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Active filters summary / Stats */}
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                    <StatsBar problems={filtered} />
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                       text-xs font-semibold text-danger border border-danger/25
                                       bg-danger/8 hover:bg-danger/15 transition-all"
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="3"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Clear all
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="mt-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Spinner size="lg" />
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon="🔍"
                        title={hasFilters ? 'No problems match your filters' : 'No problems yet'}
                        description={
                            hasFilters
                                ? 'Try adjusting or clearing your filters.'
                                : isTeamAdmin
                                    ? 'Get started by adding the first problem.'
                                    : 'The team admin hasn\'t added any problems yet. Check back soon!'
                        }
                        actionLabel={hasFilters ? 'Clear filters' : isTeamAdmin ? 'Add Problem' : undefined}
                        onAction={
                            hasFilters
                                ? clearFilters
                                : isTeamAdmin
                                    ? () => navigate('/admin/add-problem')
                                    : undefined
                        }
                    />
                ) : viewMode === 'grid' ? (
                    <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <AnimatePresence mode="popLayout">
                            {filtered.map((problem, i) => (
                                <ProblemCard key={problem.id} problem={problem} index={i} />
                            ))}
                        </AnimatePresence>
                    </motion.div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <AnimatePresence mode="popLayout">
                            {filtered.map((problem, i) => (
                                <ProblemListRow key={problem.id} problem={problem} index={i} />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    )
}