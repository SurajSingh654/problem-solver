import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblems } from '@hooks/useProblems'
import { useAuthStore } from '@store/useAuthStore'
import { ProblemCard } from '@components/features/problems/ProblemCard'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { EmptyState } from '@components/ui/EmptyState'
import { cn } from '@utils/cn'
import { DIFFICULTY, SOURCE_LABELS, PATTERNS, PROBLEM_CATEGORIES } from '@utils/constants'

// ── Stats bar ──────────────────────────────────────────
function StatsBar({ problems }) {
    const total = problems.length
    const solved = problems.filter(p => p.isSolvedByMe).length
    const easy = problems.filter(p => p.difficulty === 'EASY').length
    const medium = problems.filter(p => p.difficulty === 'MEDIUM').length
    const hard = problems.filter(p => p.difficulty === 'HARD').length

    return (
        <div className="flex items-center gap-4 flex-wrap text-xs text-text-tertiary">
            <span className="font-semibold text-text-primary">{total} problems</span>
            <span className="text-success font-semibold">{solved} solved</span>
            <span className="text-success">{easy} Easy</span>
            <span className="text-warning">{medium} Medium</span>
            <span className="text-danger">{hard} Hard</span>
        </div>
    )
}

// ── Main ───────────────────────────────────────────────
export default function ProblemsPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const isAdmin = user?.role === 'ADMIN'

    const [search, setSearch] = useState('')
    const [difficulty, setDifficulty] = useState('')
    const [source, setSource] = useState('')
    const [tag, setTag] = useState('')
    const [showPinned, setShowPinned] = useState(false)
    const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'

    const { data, isLoading } = useProblems({ limit: '200' })
    const allProblems = data?.problems || []

    const [category, setCategory] = useState('')

    // Client-side filtering (server already handles basic filters,
    // but we do it client-side here since we fetched all)
    const filtered = useMemo(() => {
        let list = [...allProblems]
        if (showPinned) list = list.filter(p => p.isPinned)
        if (difficulty) list = list.filter(p => p.difficulty === difficulty)
        if (source) list = list.filter(p => p.source === source)
        if (category) list = list.filter(p => p.category === category)
        if (tag) list = list.filter(p =>
            p.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
        )
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.tags.some(t => t.toLowerCase().includes(q)) ||
                (p.companyTags || []).some(c => c.toLowerCase().includes(q))
            )
        }
        return list
    }, [allProblems, search, difficulty, source, tag, showPinned])

    // Unique sources from available problems
    const availableSources = useMemo(() => {
        const s = new Set(allProblems.map(p => p.source))
        return [...s]
    }, [allProblems])

    // Available tags
    const availableTags = useMemo(() => {
        const t = new Set(allProblems.flatMap(p => p.tags))
        return [...t].slice(0, 20)
    }, [allProblems])

    const hasFilters = difficulty || source || tag || search || showPinned || category

    function clearFilters() {
        setSearch('')
        setDifficulty('')
        setSource('')
        setTag('')
        setCategory('')
        setShowPinned(false)
    }

    return (
        <div className="p-6 max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Problems
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Practice, solve, and track your progress
                    </p>
                </div>
                {isAdmin && (
                    <Button
                        variant="primary"
                        size="md"
                        onClick={() => navigate('/admin/problems/new')}
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
                        placeholder="Search problems, tags, companies…"
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
                {/* View toggle */}
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
            {/* Filters — grouped by type */}
            <div className="bg-surface-1 border border-border-default rounded-xl p-4 mb-4 space-y-3">

                {/* Row 1: Category */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest
                     w-16 flex-shrink-0">
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
                                        category === cat.id
                                            ? 'bg-white/10'
                                            : 'bg-surface-4 text-text-disabled'
                                    )}>
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Row 2: Difficulty + Pinned */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest
                     w-16 flex-shrink-0">
                        Level
                    </span>
                    <div className="flex gap-1.5">
                        {['EASY', 'MEDIUM', 'HARD'].map(d => {
                            const count = allProblems.filter(p => p.difficulty === d).length
                            const colors = {
                                EASY: { active: 'bg-success/15 border-success/40 text-success', dot: 'bg-success' },
                                MEDIUM: { active: 'bg-warning/15 border-warning/40 text-warning', dot: 'bg-warning' },
                                HARD: { active: 'bg-danger/15 border-danger/40 text-danger', dot: 'bg-danger' },
                            }
                            return (
                                <button
                                    key={d}
                                    onClick={() => setDifficulty(v => v === d ? '' : d)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg',
                                        'text-[11px] font-semibold border transition-all duration-150',
                                        difficulty === d
                                            ? colors[d].active
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    <span className={cn('w-1.5 h-1.5 rounded-full', colors[d].dot)} />
                                    {d.charAt(0) + d.slice(1).toLowerCase()}
                                    <span className={cn(
                                        'text-[9px] px-1 py-px rounded-full font-bold',
                                        difficulty === d ? 'bg-white/10' : 'bg-surface-4 text-text-disabled'
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

                {/* Row 3: Source — only show if multiple sources */}
                {availableSources.length > 1 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest
                       w-16 flex-shrink-0">
                            Source
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {availableSources.map(s => (
                                <button
                                    key={s}
                                    onClick={() => setSource(v => v === s ? '' : s)}
                                    className={cn(
                                        'inline-flex items-center px-2.5 py-1 rounded-lg',
                                        'text-[11px] font-semibold border transition-all duration-150',
                                        source === s
                                            ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    {SOURCE_LABELS[s] || s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Row 4: Tags — only show if tags exist */}
                {availableTags.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest
                       w-16 flex-shrink-0">
                            Tags
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {availableTags.slice(0, 6).map(t => (
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
                            {availableTags.length > 6 && (
                                <span className="text-[10px] text-text-disabled self-center">
                                    +{availableTags.length - 6} more
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Active filters summary + clear */}
                {hasFilters && (
                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                        <StatsBar problems={filtered} />
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
                    </div>
                )}

                {/* No filters — show stats */}
                {!hasFilters && !isLoading && (
                    <div className="pt-2 border-t border-border-subtle">
                        <StatsBar problems={filtered} />
                    </div>
                )}
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
                                : isAdmin
                                    ? 'Get started by adding the first problem.'
                                    : 'The admin hasn\'t added any problems yet. Check back soon!'
                        }
                        actionLabel={hasFilters ? 'Clear filters' : isAdmin ? 'Add Problem' : undefined}
                        onAction={
                            hasFilters
                                ? clearFilters
                                : isAdmin
                                    ? () => navigate('/admin/problems/new')
                                    : undefined
                        }
                    />
                ) : viewMode === 'grid' ? (
                    <motion.div
                        layout
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    >
                        <AnimatePresence mode="popLayout">
                            {filtered.map((problem, i) => (
                                <ProblemCard key={problem.id} problem={problem} index={i} />
                            ))}
                        </AnimatePresence>
                    </motion.div>
                ) : (
                    // List view
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

// ── List row (alternative view) ────────────────────────
function ProblemListRow({ problem, index }) {
    const navigate = useNavigate()
    const {
        id, title, difficulty, source, tags,
        isSolvedByMe, totalSolutions, isPinned,
    } = problem

    const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
    const SOURCE_COLOR = {
        LEETCODE: 'text-orange-400', GFG: 'text-green-500',
        CODECHEF: 'text-amber-600', OTHER: 'text-text-tertiary',
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, delay: index * 0.02 }}
            onClick={() => navigate(`/problems/${id}`)}
            className={cn(
                'flex items-center gap-4 p-3.5 rounded-xl border cursor-pointer',
                'transition-all duration-150 hover:-translate-y-px hover:shadow-sm',
                isSolvedByMe
                    ? 'bg-success/3 border-success/15 hover:border-success/30'
                    : 'bg-surface-2 border-border-default hover:border-brand-400/30'
            )}
        >
            {/* Solved check */}
            <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                isSolvedByMe
                    ? 'bg-success/15 border border-success/30'
                    : 'bg-surface-3 border border-border-default'
            )}>
                {isSolvedByMe && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="#22c55e" strokeWidth="3"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </div>
            {/* Title */}
            <span className="flex-1 text-sm font-semibold text-text-primary truncate">
                {isPinned && <span className="mr-1.5">📌</span>}
                {title}
            </span>
            {/* Badges */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <Badge variant={DIFF_VARIANT[difficulty] || 'brand'} size="xs">
                    {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
                </Badge>
                <span className={cn('text-xs font-medium', SOURCE_COLOR[source] || 'text-text-tertiary')}>
                    {SOURCE_LABELS[source] || source}
                </span>
                {tags.slice(0, 2).map(t => (
                    <span key={t} className="text-[11px] text-text-tertiary bg-surface-3
                                   px-1.5 py-px rounded border border-border-subtle hidden md:inline">
                        {t}
                    </span>
                ))}
            </div>
            {/* Solved count */}
            <span className="text-xs text-text-disabled flex-shrink-0 hidden sm:block">
                {totalSolutions} solved
            </span>
        </motion.div>
    )
}