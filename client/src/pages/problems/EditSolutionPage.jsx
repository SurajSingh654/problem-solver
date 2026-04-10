import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useProblem } from '@hooks/useProblems'
import { useMySolutions, useUpdateSolution } from '@hooks/useSolutions'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { Badge } from '@components/ui/Badge'
import { cn } from '@utils/cn'
import {
    PATTERNS, LANGUAGE_LABELS, CONFIDENCE_LEVELS,
} from '@utils/constants'

// Re-import all the step sub-components from SubmitSolutionPage
// Since they're defined in the same pattern, we duplicate the minimal
// pieces needed here, or better — extract them to a shared file.
// For now we import the page and reuse the form logic inline.

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const SOURCE_LABELS = {
    LEETCODE: 'LeetCode', GFG: 'GFG', CODECHEF: 'CodeChef',
    INTERVIEWBIT: 'InterviewBit', HACKERRANK: 'HackerRank',
    CODEFORCES: 'Codeforces', OTHER: 'Other',
}

export default function EditSolutionPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    const { data: problem, isLoading: problemLoading } = useProblem(id)
    const { data: solutions, isLoading: solutionsLoading } = useMySolutions()
    const updateSolution = useUpdateSolution()

    const mySolution = solutions?.find(s => s.problemId === id)

    const form = useForm({
        defaultValues: {
            patternIdentified: '',
            firstInstinct: '',
            whyThisPattern: '',
            bruteForceApproach: '',
            bruteForceTime: '',
            bruteForceSpace: '',
            optimizedApproach: '',
            optimizedTime: '',
            optimizedSpace: '',
            predictedTime: '',
            predictedSpace: '',
            keyInsight: '',
            feynmanExplanation: '',
            realWorldConnection: '',
            followUpAnswers: [],
            confidenceLevel: 0,
            difficultyFelt: '',
            stuckPoints: '',
            hintsUsed: false,
            language: 'PYTHON',
        }
    })

    const { reset, handleSubmit } = form

    // Pre-fill form once solution loads
    useEffect(() => {
        if (mySolution) {
            reset({
                patternIdentified: mySolution.patternIdentified || '',
                firstInstinct: mySolution.firstInstinct || '',
                whyThisPattern: mySolution.whyThisPattern || '',
                bruteForceApproach: mySolution.bruteForceApproach || '',
                bruteForceTime: mySolution.bruteForceTime || '',
                bruteForceSpace: mySolution.bruteForceSpace || '',
                optimizedApproach: mySolution.optimizedApproach || '',
                optimizedTime: mySolution.optimizedTime || '',
                optimizedSpace: mySolution.optimizedSpace || '',
                predictedTime: mySolution.predictedTime || '',
                predictedSpace: mySolution.predictedSpace || '',
                keyInsight: mySolution.keyInsight || '',
                feynmanExplanation: mySolution.feynmanExplanation || '',
                realWorldConnection: mySolution.realWorldConnection || '',
                followUpAnswers: mySolution.followUpAnswers || [],
                confidenceLevel: mySolution.confidenceLevel || 0,
                difficultyFelt: mySolution.difficultyFelt || '',
                stuckPoints: mySolution.stuckPoints || '',
                hintsUsed: mySolution.hintsUsed || false,
                language: mySolution.language || 'PYTHON',
            })
        }
    }, [mySolution, reset])

    async function onSubmit(data) {
        if (!mySolution) return
        try {
            await updateSolution.mutateAsync({
                id: mySolution.id,
                data: {
                    patternIdentified: data.patternIdentified || null,
                    firstInstinct: data.firstInstinct || null,
                    whyThisPattern: data.whyThisPattern || null,
                    bruteForceApproach: data.bruteForceApproach || null,
                    bruteForceTime: data.bruteForceTime || null,
                    bruteForceSpace: data.bruteForceSpace || null,
                    optimizedApproach: data.optimizedApproach || null,
                    optimizedTime: data.optimizedTime || null,
                    optimizedSpace: data.optimizedSpace || null,
                    predictedTime: data.predictedTime || null,
                    predictedSpace: data.predictedSpace || null,
                    keyInsight: data.keyInsight || null,
                    feynmanExplanation: data.feynmanExplanation || null,
                    realWorldConnection: data.realWorldConnection || null,
                    followUpAnswers: data.followUpAnswers || [],
                    confidenceLevel: data.confidenceLevel || 0,
                    difficultyFelt: data.difficultyFelt || null,
                    stuckPoints: data.stuckPoints || null,
                    hintsUsed: data.hintsUsed || false,
                    language: data.language || 'PYTHON',
                },
            })
            navigate(`/problems/${id}`)
        } catch {
            // error toast handled by mutation
        }
    }

    if (problemLoading || solutionsLoading) return <PageSpinner />

    if (!mySolution) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="text-4xl">🤔</div>
                <p className="text-text-secondary text-sm">
                    You haven't submitted a solution for this problem yet.
                </p>
                <Button variant="primary" onClick={() => navigate(`/problems/${id}/submit`)}>
                    Submit Solution
                </Button>
            </div>
        )
    }

    const { watch, setValue, register } = form

    // ── Inline minimal field components ───────────────────
    function Textarea({ label, optional, hint, rows = 3, ...props }) {
        return (
            <div>
                {label && (
                    <label className="block text-sm font-semibold text-text-primary mb-1.5">
                        {label}
                        {optional && <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>}
                    </label>
                )}
                {hint && <p className="text-xs text-text-tertiary mb-2">{hint}</p>}
                <textarea
                    rows={rows}
                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                     text-sm text-text-primary placeholder:text-text-tertiary
                     px-3.5 py-2.5 outline-none resize-none
                     focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                     transition-all duration-150"
                    {...props}
                />
            </div>
        )
    }

    function ComplexityRow({ label, field }) {
        const val = watch(field) || ''
        const suggestions = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)']
        return (
            <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">{label}</label>
                <input
                    type="text"
                    value={val}
                    onChange={e => setValue(field, e.target.value)}
                    placeholder="e.g. O(n)"
                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                     text-sm font-mono text-text-primary placeholder:text-text-tertiary
                     px-3.5 py-2 outline-none mb-2
                     focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                />
                <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(s => (
                        <button key={s} type="button" onClick={() => setValue(field, s)}
                            className={cn('text-[11px] font-mono px-2 py-0.5 rounded-lg border transition-all',
                                val === s
                                    ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                    : 'bg-surface-3 border-border-subtle text-text-tertiary hover:text-text-primary')}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    const confidence = watch('confidenceLevel') || 0
    const language = watch('language') || 'PYTHON'
    const hintsUsed = watch('hintsUsed') || false
    const followUpAnswers = watch('followUpAnswers') || []

    return (
        <div className="p-6 max-w-[720px] mx-auto">
            <button
                type="button"
                onClick={() => navigate(`/problems/${id}`)}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                   hover:text-text-primary transition-colors mb-6"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Problem
            </button>

            {/* Problem header */}
            {problem && (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="xs">
                                    {problem.difficulty.charAt(0) + problem.difficulty.slice(1).toLowerCase()}
                                </Badge>
                                <span className="text-xs text-text-tertiary">
                                    {SOURCE_LABELS[problem.source] || problem.source}
                                </span>
                            </div>
                            <h2 className="text-base font-bold text-text-primary">{problem.title}</h2>
                        </div>
                        {problem.sourceUrl && (
                            <a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="sm">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                    Open Problem
                                </Button>
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* Full single-page edit form */}
            <form onSubmit={handleSubmit(onSubmit)}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-8">

                <div className="flex items-center gap-2 pb-4 border-b border-border-default">
                    <span className="text-xl">✏️</span>
                    <h2 className="text-lg font-bold text-text-primary">Edit Solution</h2>
                </div>

                {/* Pattern */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>🧩</span> Pattern
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PATTERNS.map(p => {
                            const selected = watch('patternIdentified') === p.label
                            return (
                                <button key={p.id} type="button"
                                    onClick={() => setValue('patternIdentified',
                                        selected ? '' : p.label, { shouldDirty: true })}
                                    className={cn(
                                        'text-left px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                                        selected
                                            ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                            : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
                                    )}>
                                    {p.label}
                                </button>
                            )
                        })}
                    </div>
                    <Textarea label="First Instinct" optional rows={2} {...register('firstInstinct')} />
                    <Textarea label="Why This Pattern?" optional rows={2} {...register('whyThisPattern')} />
                </div>

                {/* Approach */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>⚙️</span> Approach
                    </h3>
                    <div className="bg-surface-2 border border-border-default rounded-xl p-4 space-y-4">
                        <p className="text-xs font-bold text-text-disabled uppercase tracking-widest">🐌 Brute Force</p>
                        <Textarea optional rows={2} {...register('bruteForceApproach')} />
                        <div className="grid grid-cols-2 gap-4">
                            <ComplexityRow label="Time" field="bruteForceTime" />
                            <ComplexityRow label="Space" field="bruteForceSpace" />
                        </div>
                    </div>
                    <div className="bg-brand-400/3 border border-brand-400/20 rounded-xl p-4 space-y-4">
                        <p className="text-xs font-bold text-brand-300 uppercase tracking-widest">⚡ Optimized</p>
                        <Textarea optional rows={3} {...register('optimizedApproach')} />
                        <div className="grid grid-cols-2 gap-4">
                            <ComplexityRow label="Time" field="optimizedTime" />
                            <ComplexityRow label="Space" field="optimizedSpace" />
                        </div>
                        <div className="border-t border-brand-400/15 pt-4">
                            <p className="text-xs text-text-disabled mb-3">Predicted complexities (before solving)</p>
                            <div className="grid grid-cols-2 gap-4">
                                <ComplexityRow label="Predicted Time" field="predictedTime" />
                                <ComplexityRow label="Predicted Space" field="predictedSpace" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Depth */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>🔬</span> Depth
                    </h3>
                    <Textarea label="Key Insight" optional rows={2} {...register('keyInsight')} />
                    <Textarea label="Feynman Explanation" optional rows={3} {...register('feynmanExplanation')} />
                    <Textarea label="Real World Connection" optional rows={2} {...register('realWorldConnection')} />
                    {problem?.followUps?.map((fq, i) => (
                        <div key={fq.id} className="bg-surface-2 border border-border-default rounded-xl p-4">
                            <p className="text-xs font-semibold text-text-secondary mb-2">{fq.question}</p>
                            <textarea
                                rows={2}
                                value={followUpAnswers[i] || ''}
                                onChange={e => {
                                    const updated = [...followUpAnswers]
                                    updated[i] = e.target.value
                                    setValue('followUpAnswers', updated)
                                }}
                                placeholder="Your answer…"
                                className="w-full bg-surface-3 border border-border-strong rounded-xl
                           text-sm text-text-primary placeholder:text-text-tertiary
                           px-3 py-2 outline-none resize-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                        </div>
                    ))}
                </div>

                {/* Assessment */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>📊</span> Assessment
                    </h3>
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-3">
                            Confidence Level
                        </label>
                        <div className="flex gap-3 flex-wrap">
                            {CONFIDENCE_LEVELS.map(c => (
                                <button key={c.value} type="button"
                                    onClick={() => setValue('confidenceLevel', c.value, { shouldDirty: true })}
                                    className={cn(
                                        'flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition-all min-w-[70px]',
                                        confidence === c.value
                                            ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                                    )}>
                                    <span className="text-2xl">{c.emoji}</span>
                                    <span className={cn('text-[11px] font-bold',
                                        confidence === c.value ? c.color : 'text-text-tertiary')}>
                                        {c.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-2">Language</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {Object.entries(LANGUAGE_LABELS).map(([key, lbl]) => (
                                <button key={key} type="button"
                                    onClick={() => setValue('language', key, { shouldDirty: true })}
                                    className={cn(
                                        'px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                                        language === key
                                            ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                            : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
                                    )}>
                                    {lbl}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Textarea label="Difficulty Felt" optional rows={2} {...register('difficultyFelt')} />
                    <Textarea label="Where I Got Stuck" optional rows={3} {...register('stuckPoints')} />
                    <div className="flex gap-3">
                        {[
                            { value: false, label: '✅ No hints', desc: 'Solved independently' },
                            { value: true, label: '💡 Used hints', desc: 'Referenced hints or solutions' },
                        ].map(opt => (
                            <button key={String(opt.value)} type="button"
                                onClick={() => setValue('hintsUsed', opt.value, { shouldDirty: true })}
                                className={cn(
                                    'flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition-all text-center',
                                    hintsUsed === opt.value
                                        ? opt.value
                                            ? 'bg-warning/10 border-warning/40 text-warning'
                                            : 'bg-success/10 border-success/40 text-success'
                                        : 'bg-surface-3 border-border-default text-text-secondary hover:border-border-strong'
                                )}>
                                <span className="text-sm font-bold">{opt.label}</span>
                                <span className="text-[11px] opacity-70">{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Submit */}
                <div className="flex items-center justify-between pt-4 border-t border-border-default">
                    <Button type="button" variant="ghost" size="md"
                        onClick={() => navigate(`/problems/${id}`)}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" size="md"
                        loading={updateSolution.isPending}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Save Changes
                    </Button>
                </div>
            </form>
        </div>
    )
}