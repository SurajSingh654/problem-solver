import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useMySolutions, useUpdateSolution } from '@hooks/useSolutions'
import { SolutionTabs } from '@components/features/solutions/SolutionTabs'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PATTERNS, CONFIDENCE_LEVELS } from '@utils/constants'

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
    const { data: allSolutions, isLoading: solutionsLoading } = useMySolutions()
    const updateSolution = useUpdateSolution()

    const mySolution = allSolutions?.find(s => s.problemId === id)

    // ── Form state ─────────────────────────────────────
    const [formData, setFormData] = useState({
        patternIdentified: '',
        patternReasoning: '',
        keyInsight: '',
        simpleExplanation: '',
        challenges: '',
        confidenceLevel: 0,
        followUpAnswers: [],
    })

    const [solutions, setSolutions] = useState([])
    const [commonNotes, setCommonNotes] = useState('')
    const [loaded, setLoaded] = useState(false)

    // ── Pre-fill form when solution loads ──────────────
    useEffect(() => {
        if (mySolution && !loaded) {
            // Build solutions array from existing data
            const existingSolutions = []

            // Add brute force if exists
            if (mySolution.bruteForceApproach) {
                existingSolutions.push({
                    type: 'BRUTE_FORCE',
                    approach: mySolution.bruteForceApproach || '',
                    timeComplexity: mySolution.bruteForceTime || '',
                    spaceComplexity: mySolution.bruteForceSpace || '',
                    code: '',
                    language: mySolution.language || 'PYTHON',
                })
            }

            // Add optimized / main solution
            existingSolutions.push({
                type: mySolution.bruteForceApproach ? 'OPTIMIZED' : 'BRUTE_FORCE',
                approach: mySolution.optimizedApproach || '',
                timeComplexity: mySolution.optimizedTime || '',
                spaceComplexity: mySolution.optimizedSpace || '',
                code: mySolution.code || '',
                language: mySolution.language || 'PYTHON',
            })

            // If no solutions were built, add an empty one
            if (existingSolutions.length === 0) {
                existingSolutions.push({
                    type: 'BRUTE_FORCE',
                    approach: '',
                    timeComplexity: '',
                    spaceComplexity: '',
                    code: '',
                    language: mySolution.language || 'PYTHON',
                })
            }

            setSolutions(existingSolutions)
            setCommonNotes(mySolution.realWorldConnection || '')

            setFormData({
                patternIdentified: mySolution.patternIdentified || '',
                patternReasoning: mySolution.firstInstinct || '',
                keyInsight: mySolution.keyInsight || '',
                simpleExplanation: mySolution.feynmanExplanation || '',
                challenges: mySolution.stuckPoints || '',
                confidenceLevel: mySolution.confidenceLevel || 0,
                followUpAnswers: mySolution.followUpAnswers || [],
            })

            setLoaded(true)
        }
    }, [mySolution, loaded])

    function updateFormData(updates) {
        setFormData(prev => ({ ...prev, ...updates }))
    }

    async function onSubmit() {
        if (!mySolution) return

        const optimized = solutions.find(s => s.type === 'OPTIMIZED')
        const brute = solutions.find(s => s.type === 'BRUTE_FORCE')
        const bestSol = optimized || solutions[0]
        const language = bestSol?.language || 'PYTHON'

        localStorage.setItem('ps_last_language', language)

        try {
            await updateSolution.mutateAsync({
                id: mySolution.id,
                data: {
                    patternIdentified: formData.patternIdentified || null,
                    firstInstinct: formData.patternReasoning || null,
                    whyThisPattern: null,
                    bruteForceApproach: brute?.approach || null,
                    bruteForceTime: brute?.timeComplexity || null,
                    bruteForceSpace: brute?.spaceComplexity || null,
                    optimizedApproach: optimized?.approach || bestSol?.approach || null,
                    optimizedTime: optimized?.timeComplexity || bestSol?.timeComplexity || null,
                    optimizedSpace: optimized?.spaceComplexity || bestSol?.spaceComplexity || null,
                    code: bestSol?.code || null,
                    language,
                    keyInsight: formData.keyInsight || null,
                    feynmanExplanation: formData.simpleExplanation || null,
                    realWorldConnection: commonNotes || null,
                    stuckPoints: formData.challenges || null,
                    followUpAnswers: formData.followUpAnswers || [],
                    confidenceLevel: formData.confidenceLevel || 0,
                    hintsUsed: false,
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

    const selectedPattern = formData.patternIdentified || ''

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Back */}
            <button
                type="button"
                onClick={() => navigate(`/problems/${id}`)}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                   hover:text-text-primary transition-colors mb-6"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
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

            {/* Edit form */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-8">

                {/* Header */}
                <div className="flex items-center gap-2 pb-4 border-b border-border-default">
                    <span className="text-xl">✏️</span>
                    <h2 className="text-lg font-bold text-text-primary">Edit Solution</h2>
                </div>

                {/* ── Pattern section ───────────────────────── */}
                <div className="space-y-5">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>🧩</span> Pattern
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PATTERNS.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => updateFormData({
                                    patternIdentified: selectedPattern === p.label ? '' : p.label
                                })}
                                className={cn(
                                    'text-left px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                                    selectedPattern === p.label
                                        ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                        : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <input
                            type="text"
                            placeholder="Or type a custom pattern…"
                            value={!PATTERNS.some(p => p.label === selectedPattern) ? selectedPattern : ''}
                            onChange={e => updateFormData({ patternIdentified: e.target.value })}
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                         text-sm text-text-primary placeholder:text-text-tertiary
                         px-3.5 py-2.5 outline-none
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </div>

                    <RichTextEditor
                        label="How did you identify this pattern?"
                        optional
                        hint="What clues in the problem pointed you to this approach?"
                        placeholder="e.g. The problem asks for a subarray sum — I immediately thought sliding window because..."
                        content={formData.patternReasoning || ''}
                        onChange={val => updateFormData({ patternReasoning: val })}
                        minHeight="100px"
                    />
                </div>

                {/* ── Solutions section ──────────────────────── */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>💻</span> Solutions
                    </h3>
                    <SolutionTabs
                        solutions={solutions}
                        onChange={setSolutions}
                        commonNotes={commonNotes}
                        onNotesChange={setCommonNotes}
                    />
                </div>

                {/* ── Reflection section ─────────────────────── */}
                <div className="space-y-5">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>🔬</span> Reflection
                    </h3>

                    {/* Key Insight */}
                    <div className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center
                              justify-center text-base flex-shrink-0 mt-0.5">
                                💡
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-text-primary mb-0.5">Key Insight</h4>
                                <p className="text-xs text-text-tertiary">
                                    In one sentence — what makes this problem click?
                                </p>
                            </div>
                        </div>
                        <textarea
                            rows={2}
                            value={formData.keyInsight || ''}
                            onChange={e => updateFormData({ keyInsight: e.target.value })}
                            placeholder="e.g. The trick is realizing you only need to track the running max..."
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                         text-sm text-text-primary placeholder:text-text-tertiary
                         px-3.5 py-2.5 outline-none resize-none
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </div>

                    {/* Explain it simply */}
                    <div className="bg-surface-2 border border-border-default rounded-2xl p-5">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center
                              justify-center text-base flex-shrink-0 mt-0.5">
                                🗣
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-text-primary mb-0.5">
                                    Explain It Simply
                                </h4>
                                <p className="text-xs text-text-tertiary">
                                    Explain to a non-programmer. Where does this appear in real software?
                                </p>
                            </div>
                        </div>
                        <RichTextEditor
                            placeholder="e.g. Imagine you're looking for two people in a room whose heights add up to 10 feet..."
                            content={formData.simpleExplanation || ''}
                            onChange={val => updateFormData({ simpleExplanation: val })}
                            minHeight="80px"
                        />
                    </div>

                    {/* What was challenging */}
                    <div className="bg-surface-2 border border-border-default rounded-2xl p-5">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center
                              justify-center text-base flex-shrink-0 mt-0.5">
                                🤔
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-text-primary mb-0.5">
                                    What Was Challenging?
                                </h4>
                                <p className="text-xs text-text-tertiary">
                                    Where did you get stuck? What made this harder than expected?
                                </p>
                            </div>
                        </div>
                        <RichTextEditor
                            placeholder="e.g. I struggled with the off-by-one error in the window boundary..."
                            content={formData.challenges || ''}
                            onChange={val => updateFormData({ challenges: val })}
                            minHeight="60px"
                        />
                    </div>

                    {/* Confidence */}
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-1">
                            Confidence Level
                        </label>
                        <p className="text-xs text-text-tertiary mb-3">
                            How well do you understand this solution right now?
                        </p>
                        <div className="flex gap-3 flex-wrap">
                            {CONFIDENCE_LEVELS.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => updateFormData({ confidenceLevel: c.value })}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                                        'transition-all duration-150 min-w-[80px]',
                                        formData.confidenceLevel === c.value
                                            ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                                    )}
                                >
                                    <span className="text-2xl">{c.emoji}</span>
                                    <span className={cn(
                                        'text-[10px] font-bold text-center leading-tight',
                                        formData.confidenceLevel === c.value ? c.color : 'text-text-tertiary'
                                    )}>
                                        {c.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Follow-up answers */}
                    {problem?.followUps?.length > 0 && (
                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-text-primary">
                                Follow-up Questions
                            </label>
                            {problem.followUps.map((fq, i) => (
                                <div key={fq.id}
                                    className="bg-surface-2 border border-border-default rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-3
                                     border border-border-default flex items-center
                                     justify-center text-xs font-bold text-text-tertiary mt-0.5">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-text-primary mb-2">
                                                {fq.question}
                                            </p>
                                            <textarea
                                                rows={2}
                                                value={formData.followUpAnswers[i] || ''}
                                                onChange={e => {
                                                    const updated = [...(formData.followUpAnswers || [])]
                                                    updated[i] = e.target.value
                                                    updateFormData({ followUpAnswers: updated })
                                                }}
                                                placeholder="Your answer…"
                                                className="w-full bg-surface-3 border border-border-strong rounded-xl
                                   text-sm text-text-primary placeholder:text-text-tertiary
                                   px-3 py-2 outline-none resize-none
                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Submit ────────────────────────────────── */}
                <div className="flex items-center justify-between pt-4 border-t border-border-default">
                    <Button type="button" variant="ghost" size="md"
                        onClick={() => navigate(`/problems/${id}`)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="primary" size="md"
                        loading={updateSolution.isPending}
                        onClick={onSubmit}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Save Changes
                    </Button>
                </div>
            </div>
        </div>
    )
}