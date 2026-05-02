// ============================================================================
// ProbSolver v3.0 — Add Problem Page (AI-First)
// ============================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ProblemForm } from '@components/features/admin/ProblemForm'
import { useCreateProblem } from '@hooks/useProblems'
import { useGenerateProblemsAI } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import api from '@services/api'
import { PROBLEM_CATEGORIES, CATEGORY_GENERATION_CONFIG } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const PLATFORM_SOURCES = ['LEETCODE', 'GFG', 'HACKERRANK', 'CODECHEF', 'INTERVIEWBIT', 'CODEFORCES']

// Hard cap enforced on both client and server
// Prevents Railway 30s timeout from parallel GPT calls
const MAX_PROBLEMS_PER_BATCH = 5

// ── AI Generated Problem Preview Card ──────────────────
function GeneratedProblemCard({ problem, index, onApprove, onReject, isApproving, disabled }) {
    const [expanded, setExpanded] = useState(false)

    // Normalize adminNotes for display — AI sometimes returns an object
    const adminNotesDisplay = problem.adminNotes
        ? typeof problem.adminNotes === 'object'
            ? Object.values(problem.adminNotes).join('\n\n')
            : problem.adminNotes
        : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
        >
            {/* Header — always visible */}
            <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="xs">
                                {problem.difficulty}
                            </Badge>
                            {problem.source && problem.source !== 'OTHER' && (
                                <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                   border border-border-subtle rounded-full px-2 py-px">
                                    {problem.source}
                                </span>
                            )}
                            {problem.companyTags?.slice(0, 3).map(c => (
                                <span key={c} className="text-[10px] font-semibold text-warning
                                   bg-warning/10 border border-warning/20 rounded-full px-2 py-px">
                                    {c}
                                </span>
                            ))}
                        </div>
                        <h3 className="text-sm font-bold text-text-primary mb-1">
                            {problem.title}
                        </h3>
                        {problem.sourceUrl && (
                            <a
                                href={problem.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-brand-300 hover:text-brand-200 transition-colors
                               flex items-center gap-1 mb-2"
                                onClick={e => e.stopPropagation()}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                View on {problem.source || 'Source'}
                            </a>
                        )}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {problem.tags?.slice(0, 5).map(t => (
                                <span key={t} className="text-[10px] text-text-tertiary bg-surface-3
                                   border border-border-subtle rounded px-1.5 py-px">
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-xs text-text-tertiary hover:text-text-primary
                             transition-colors px-2 py-1 rounded-lg hover:bg-surface-3"
                        >
                            {expanded ? 'Collapse' : 'Preview'}
                        </button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onReject(index)}
                            disabled={disabled}
                            className="text-danger hover:text-danger"
                        >
                            Skip
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            loading={isApproving}
                            disabled={disabled}
                            onClick={() => onApprove(problem, index)}
                        >
                            Add to Team
                        </Button>
                    </div>
                </div>
            </div>

            {/* Expanded preview */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 space-y-4 border-t border-border-default pt-4">
                            {problem.description && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase
                                   tracking-widest mb-1">Description</p>
                                    <p className="text-xs text-text-secondary leading-relaxed
                                   whitespace-pre-wrap">{problem.description}</p>
                                </div>
                            )}
                            {problem.realWorldContext && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase
                                   tracking-widest mb-1">Real World Context</p>
                                    <p className="text-xs text-text-tertiary leading-relaxed">
                                        {problem.realWorldContext}
                                    </p>
                                </div>
                            )}
                            {adminNotesDisplay && (
                                <div className="bg-warning/5 border border-warning/15 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-warning uppercase
                                   tracking-widest mb-1">Teaching Notes</p>
                                    <p className="text-xs text-text-tertiary leading-relaxed
                                   whitespace-pre-wrap">{adminNotesDisplay}</p>
                                </div>
                            )}
                            {problem.followUpQuestions?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase
                                   tracking-widest mb-2">Follow-up Questions</p>
                                    <div className="space-y-2">
                                        {problem.followUpQuestions.map((fq, i) => (
                                            <div key={i} className="flex items-start gap-2 bg-surface-2
                                            border border-border-subtle rounded-lg p-2.5">
                                                <Badge variant={DIFF_VARIANT[fq.difficulty] || 'brand'}
                                                    size="xs" className="mt-0.5 flex-shrink-0">
                                                    {fq.difficulty}
                                                </Badge>
                                                <div>
                                                    <p className="text-xs text-text-secondary">{fq.question}</p>
                                                    {fq.hint && (
                                                        <p className="text-[10px] text-text-disabled mt-1">
                                                            Hint: {fq.hint}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

function AIGenerateScreen({ onBack }) {
    const navigate = useNavigate()
    const [category, setCategory] = useState('CODING')
    const [count, setCount] = useState(3)
    const [difficulty, setDifficulty] = useState('auto')
    const [customMix, setCustomMix] = useState({ easy: 2, medium: 2, hard: 1 })
    const [targetCompany, setTargetCompany] = useState('')
    const [focusAreas, setFocusAreas] = useState('')
    const [generated, setGenerated] = useState(null)
    const [reasoning, setReasoning] = useState('')
    const [approvingIdx, setApprovingIdx] = useState(null)
    const [isApprovingAll, setIsApprovingAll] = useState(false)
    // Dedicated flag — only true after an actual failed save attempt
    // Prevents retry banner from showing on fresh generation results
    const [hasRetryState, setHasRetryState] = useState(false)

    const generateAI = useGenerateProblemsAI()
    const createProblem = useCreateProblem()

    const totalCustom = (customMix.easy || 0) + (customMix.medium || 0) + (customMix.hard || 0)

    // Cap at MAX_PROBLEMS_PER_BATCH — prevents Railway timeout
    const effectiveCount = Math.min(count, MAX_PROBLEMS_PER_BATCH)
    const effectiveTotalCustom = Math.min(totalCustom, MAX_PROBLEMS_PER_BATCH)

    // ── Single source of truth for problem data shape ──────
    function buildProblemData(problem) {
        return {
            title: problem.title,
            description: problem.description || '',
            difficulty: problem.difficulty || 'MEDIUM',
            category: problem.category || category,
            source: 'AI_GENERATED',
            categoryData: {
                sourceUrl: problem.sourceUrl || '',
                companyTags: problem.companyTags || [],
                platform: PLATFORM_SOURCES.includes(problem.source)
                    ? problem.source
                    : 'OTHER',
            },
            tags: problem.tags || [],
            realWorldContext: problem.realWorldContext || '',
            useCases: problem.useCases || '',
            // Normalize adminNotes client-side too — server also normalizes,
            // but this ensures the payload is always a string
            adminNotes: problem.adminNotes
                ? typeof problem.adminNotes === 'object'
                    ? Object.values(problem.adminNotes).join('\n\n')
                    : problem.adminNotes
                : '',
            followUps: (problem.followUpQuestions || []).map((fq, i) => ({
                question: fq.question,
                difficulty: fq.difficulty || 'MEDIUM',
                hint: fq.hint || '',
                order: i,
            })),
            isPinned: false,
        }
    }

    async function handleGenerate() {
        let finalCount = effectiveCount
        let finalDifficulty = difficulty

        if (difficulty === 'custom') {
            finalCount = effectiveTotalCustom
            if (finalCount === 0) {
                toast.error('Select at least 1 problem')
                return
            }
            finalDifficulty = `custom:${customMix.easy || 0},${customMix.medium || 0},${customMix.hard || 0}`
        }

        try {
            const res = await generateAI.mutateAsync({
                category,
                count: finalCount,
                difficulty: finalDifficulty,
                targetCompany: targetCompany.trim() || undefined,
                focusAreas: focusAreas.trim() || undefined,
            })
            setGenerated(res.data.data.problems || [])
            setReasoning(res.data.data.reasoning || '')
            setHasRetryState(false)
        } catch (err) {
            // Distinguish timeout from other errors for clear user messaging
            if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                toast.error('Generation timed out. Try fewer problems or try again.')
            } else {
                toast.error('Failed to generate problems')
            }
        }
    }

    // Individual approve — single problem via existing POST /problems endpoint
    async function handleApprove(problem, index) {
        setApprovingIdx(index)
        try {
            await createProblem.mutateAsync(buildProblemData(problem))
            toast.success(`"${problem.title}" added to team`)
            setGenerated(prev => prev.filter((_, i) => i !== index))
            setHasRetryState(false)
        } catch {
            toast.error('Failed to add problem')
        } finally {
            setApprovingIdx(null)
        }
    }

    function handleReject(index) {
        setGenerated(prev => prev.filter((_, i) => i !== index))
        setHasRetryState(false)
    }

    // Batch approve — single round trip via POST /problems/batch
    // Falls back to sequential if batch endpoint fails
    async function handleApproveAll() {
        if (!generated?.length) return
        setIsApprovingAll(true)
        setHasRetryState(false)

        try {
            // Single batch call — one round trip, one DB transaction
            const res = await api.post('/problems/batch', {
                problems: generated.map(buildProblemData),
            })
            const created = res.data.data.problems || []
            toast.success(
                `${created.length} problem${created.length !== 1 ? 's' : ''} added to team`
            )
            setGenerated([])
        } catch (batchErr) {
            // Batch failed — fall back to sequential so partial success is possible
            console.error('Batch create failed, falling back to sequential:', batchErr.message)
            toast.warning('Trying one at a time...')

            const snapshot = [...generated]
            const failed = []

            for (let i = 0; i < snapshot.length; i++) {
                setApprovingIdx(i)
                try {
                    await createProblem.mutateAsync(buildProblemData(snapshot[i]))
                    toast.success(`"${snapshot[i].title}" added`)
                } catch {
                    toast.error(`Failed: "${snapshot[i].title}"`)
                    failed.push(snapshot[i])
                }
            }

            setApprovingIdx(null)
            setGenerated(failed.length > 0 ? failed : [])
            if (failed.length > 0) setHasRetryState(true)
        } finally {
            setIsApprovingAll(false)
            setApprovingIdx(null)
        }
    }

    const displayCount = difficulty === 'custom' ? effectiveTotalCustom : effectiveCount

    return (
        <div className="space-y-6">
            {/* Configuration */}
            {!generated && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-5"
                >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-brand-400/15 border border-brand-400/25
                          flex items-center justify-center text-xl flex-shrink-0">
                            🤖
                        </div>
                        <div>
                            <h2 className="text-base font-extrabold text-text-primary">
                                AI Problem Generator
                            </h2>
                            <p className="text-xs text-text-tertiary">
                                AI analyzes your team's level and generates appropriate problems
                            </p>
                        </div>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-2">
                            Category
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {PROBLEM_CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategory(cat.id)}
                                    className={cn(
                                        'flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition-all',
                                        category === cat.id
                                            ? `${cat.bg} ${cat.color} font-bold`
                                            : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    <span className="text-lg">{cat.icon}</span>
                                    <span className="text-xs font-semibold">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Difficulty */}
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-2">
                            Difficulty
                        </label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {[
                                { id: 'auto', label: 'Auto', color: 'brand' },
                                { id: 'EASY', label: 'All Easy', color: 'success' },
                                { id: 'MEDIUM', label: 'All Medium', color: 'warning' },
                                { id: 'HARD', label: 'All Hard', color: 'danger' },
                                { id: 'custom', label: 'Custom Mix', color: 'info' },
                            ].map(d => (
                                <button
                                    key={d.id}
                                    onClick={() => setDifficulty(d.id)}
                                    className={cn(
                                        'px-4 py-2.5 rounded-xl border text-xs font-bold transition-all',
                                        difficulty === d.id
                                            ? `bg-${d.color}/12 border-${d.color}/35 text-${d.color}`
                                            : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                        {difficulty === 'auto' && (
                            <p className="text-[10px] text-text-disabled">
                                AI will analyze your team's performance and pick appropriate difficulty levels
                            </p>
                        )}
                        {difficulty === 'custom' && (
                            <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                                <p className="text-xs text-text-tertiary mb-3">
                                    Specify how many of each difficulty
                                    <span className="ml-1 text-text-disabled">
                                        (max {MAX_PROBLEMS_PER_BATCH} total)
                                    </span>
                                </p>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { key: 'easy', label: 'Easy', color: 'text-success' },
                                        { key: 'medium', label: 'Medium', color: 'text-warning' },
                                        { key: 'hard', label: 'Hard', color: 'text-danger' },
                                    ].map(d => (
                                        <div key={d.key} className="text-center">
                                            <label className={cn('text-xs font-bold block mb-2', d.color)}>
                                                {d.label}
                                            </label>
                                            <div className="flex items-center gap-2 justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomMix(prev => ({
                                                        ...prev,
                                                        [d.key]: Math.max(0, (prev[d.key] || 0) - 1)
                                                    }))}
                                                    className="w-8 h-8 rounded-lg bg-surface-3 border border-border-default
                                                       text-text-secondary hover:border-border-strong transition-all
                                                       flex items-center justify-center text-sm font-bold"
                                                >
                                                    −
                                                </button>
                                                <span className="text-base font-extrabold font-mono text-text-primary w-6 text-center">
                                                    {customMix[d.key] || 0}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomMix(prev => ({
                                                        ...prev,
                                                        [d.key]: Math.min(
                                                            MAX_PROBLEMS_PER_BATCH,
                                                            (prev[d.key] || 0) + 1
                                                        )
                                                    }))}
                                                    className="w-8 h-8 rounded-lg bg-surface-3 border border-border-default
                                                       text-text-secondary hover:border-border-strong transition-all
                                                       flex items-center justify-center text-sm font-bold"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className={cn(
                                    'text-xs font-bold text-center mt-3 pt-3 border-t border-border-subtle',
                                    effectiveTotalCustom > 0 ? 'text-brand-300' : 'text-text-disabled'
                                )}>
                                    Total: {effectiveTotalCustom} problem{effectiveTotalCustom !== 1 ? 's' : ''}
                                    {totalCustom > MAX_PROBLEMS_PER_BATCH && (
                                        <span className="text-warning ml-1">
                                            (capped at {MAX_PROBLEMS_PER_BATCH})
                                        </span>
                                    )}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Count — max 5 */}
                    {difficulty !== 'custom' && (
                        <div>
                            <label className="block text-sm font-semibold text-text-primary mb-2">
                                Number of Problems
                                <span className="ml-1.5 text-xs font-normal text-text-disabled">
                                    max {MAX_PROBLEMS_PER_BATCH}
                                </span>
                            </label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setCount(n)}
                                        className={cn(
                                            'flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all',
                                            count === n
                                                ? 'bg-brand-400/15 border-brand-400/35 text-brand-300'
                                                : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                        )}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Target Company Style — only for relevant categories */}
                    {CATEGORY_GENERATION_CONFIG[category]?.showTargetCompanyStyle && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                        >
                            <label className="block text-sm font-semibold text-text-primary mb-1">
                                Target Company Style
                                <span className="ml-1.5 text-xs font-normal text-text-disabled">
                                    optional
                                </span>
                            </label>
                            <p className="text-[11px] text-text-tertiary mb-2">
                                Tailors problems to match this company's interview culture and expectations
                            </p>
                            <input
                                type="text"
                                value={targetCompany}
                                onChange={e => setTargetCompany(e.target.value)}
                                placeholder={
                                    CATEGORY_GENERATION_CONFIG[category]?.companyStylePlaceholder ||
                                    "e.g. Google, Amazon..."
                                }
                                className="w-full bg-surface-3 border border-border-strong rounded-xl
                                           text-sm text-text-primary placeholder:text-text-tertiary
                                           px-3.5 py-2.5 outline-none
                                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                        </motion.div>
                    )}

                    {/* Focus Areas — only for relevant categories */}
                    {CATEGORY_GENERATION_CONFIG[category]?.showFocusAreas && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                        >
                            <label className="block text-sm font-semibold text-text-primary mb-1">
                                Focus Areas
                                <span className="ml-1.5 text-xs font-normal text-text-disabled">
                                    optional
                                </span>
                            </label>
                            <p className="text-[11px] text-text-tertiary mb-2">
                                Narrows the problem set to specific topics within this category
                            </p>
                            <input
                                type="text"
                                value={focusAreas}
                                onChange={e => setFocusAreas(e.target.value)}
                                placeholder={
                                    CATEGORY_GENERATION_CONFIG[category]?.focusAreaPlaceholder ||
                                    "e.g. specific topics..."
                                }
                                className="w-full bg-surface-3 border border-border-strong rounded-xl
                                           text-sm text-text-primary placeholder:text-text-tertiary
                                           px-3.5 py-2.5 outline-none
                                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                        </motion.div>
                    )}

                    {/* Generate button */}
                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        loading={generateAI.isPending}
                        disabled={difficulty === 'custom' && effectiveTotalCustom === 0}
                        onClick={handleGenerate}
                    >
                        {generateAI.isPending ? (
                            `AI is generating ${displayCount} problem${displayCount > 1 ? 's' : ''}...`
                        ) : (
                            <>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                                Generate {displayCount} Problem{displayCount > 1 ? 's' : ''}
                                {difficulty === 'custom' && ` (${customMix.easy || 0}E · ${customMix.medium || 0}M · ${customMix.hard || 0}H)`}
                            </>
                        )}
                    </Button>
                </motion.div>
            )}

            {/* Results */}
            {generated && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                                <span>🤖</span>
                                AI Generated {generated.length} Problem{generated.length !== 1 ? 's' : ''}
                            </h2>
                            {reasoning && (
                                <p className="text-xs text-text-tertiary mt-1 max-w-xl">{reasoning}</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={isApprovingAll}
                                onClick={() => {
                                    setGenerated(null)
                                    setHasRetryState(false)
                                }}
                            >
                                ← Generate More
                            </Button>
                            {generated.length > 1 && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    loading={isApprovingAll}
                                    onClick={handleApproveAll}
                                >
                                    {isApprovingAll
                                        ? `Adding ${generated.length}...`
                                        : `Add All (${generated.length})`
                                    }
                                </Button>
                            )}
                        </div>
                    </div>

                    {generated.length === 0 ? (
                        <div className="bg-surface-1 border border-success/25 rounded-2xl p-10 text-center">
                            <div className="text-4xl mb-3">✅</div>
                            <h3 className="text-base font-bold text-text-primary mb-2">All problems added!</h3>
                            <p className="text-sm text-text-tertiary mb-5">Your team can now start practicing.</p>
                            <div className="flex gap-3 justify-center">
                                <Button variant="primary" size="md" onClick={() => {
                                    setGenerated(null)
                                    setHasRetryState(false)
                                }}>
                                    Generate More
                                </Button>
                                <Button variant="secondary" size="md" onClick={() => navigate('/admin')}>
                                    Go to Admin
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Retry banner — only shown after a real failed save attempt */}
                            {hasRetryState && !isApprovingAll && generated.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-warning/5 border border-warning/20 rounded-xl p-3
                                               flex items-center gap-3"
                                >
                                    <span className="text-base flex-shrink-0">⚠️</span>
                                    <p className="text-xs text-text-secondary">
                                        {generated.length} problem{generated.length !== 1 ? 's' : ''} failed
                                        to add. Review and retry below.
                                    </p>
                                </motion.div>
                            )}
                            {generated.map((problem, i) => (
                                <GeneratedProblemCard
                                    key={`${problem.title}-${i}`}
                                    problem={problem}
                                    index={i}
                                    onApprove={handleApprove}
                                    onReject={handleReject}
                                    isApproving={approvingIdx === i}
                                    disabled={isApprovingAll}
                                />
                            ))}
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function AddProblemPage() {
    const navigate = useNavigate()
    const createProblem = useCreateProblem()
    const [mode, setMode] = useState('ai')

    async function handleManualSubmit(data) {
        await createProblem.mutateAsync(data)
        navigate('/admin')
    }

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                   hover:text-text-primary transition-colors mb-6"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Admin
            </button>
            <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Add Problems
                </h1>
                <p className="text-sm text-text-tertiary">
                    Let AI generate problems for your team, or add them manually
                </p>
            </div>
            {/* Mode toggle */}
            <div className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1 mb-6 w-fit">
                <button
                    onClick={() => setMode('ai')}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                        mode === 'ai'
                            ? 'bg-brand-400/15 text-brand-300 shadow-sm'
                            : 'text-text-tertiary hover:text-text-primary'
                    )}
                >
                    <span>🤖</span> AI Generate
                </button>
                <button
                    onClick={() => setMode('manual')}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all',
                        mode === 'manual'
                            ? 'bg-surface-4 text-text-primary shadow-sm'
                            : 'text-text-tertiary hover:text-text-primary'
                    )}
                >
                    <span>✏️</span> Manual Add
                </button>
            </div>
            {/* Content */}
            {mode === 'ai' ? (
                <AIGenerateScreen onBack={() => setMode('manual')} />
            ) : (
                <ProblemForm
                    onSubmit={handleManualSubmit}
                    isSubmitting={createProblem.isPending}
                    submitLabel="Create Problem"
                />
            )}
        </div>
    )
}