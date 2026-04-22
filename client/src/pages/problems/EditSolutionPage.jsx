// ============================================================================
// ProbSolver v3.0 — Edit Solution Page
// ============================================================================
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProblem } from '@hooks/useProblems'
import { useProblemSolutions, useUpdateSolution } from '@hooks/useSolutions'
import { SolutionTabs } from '@components/features/solutions/SolutionTabs'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PATTERNS, CONFIDENCE_LEVELS, PROBLEM_CATEGORIES } from '@utils/constants'
import useAuthStore from '@store/useAuthStore'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

export default function EditSolutionPage() {
    const { problemId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const { data: problem, isLoading: problemLoading } = useProblem(problemId)
    const { data: solutionsData, isLoading: solutionsLoading } = useProblemSolutions(problemId)
    const updateSolution = useUpdateSolution()

    // Find current user's solution from the team solutions
    const solutions = solutionsData?.solutions || []
    const mySolution = solutions.find(s => s.userId === user?.id || s.isOwn)

    const category = problem?.category || 'CODING'
    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === category)

    // ── Form state (v3 field names) ────────────────────
    const [formData, setFormData] = useState({
        pattern: '',
        approach: '',
        keyInsight: '',
        feynmanExplanation: '',
        realWorldConnection: '',
        confidence: 3,
    })

    const [solutionTabs, setSolutionTabs] = useState([])
    const [commonNotes, setCommonNotes] = useState('')
    const [loaded, setLoaded] = useState(false)

    // ── Pre-fill form when solution loads ──────────────
    useEffect(() => {
        if (mySolution && !loaded) {
            const existingTabs = []

            // Add brute force tab if exists
            if (mySolution.bruteForce) {
                existingTabs.push({
                    type: 'BRUTE_FORCE',
                    approach: mySolution.bruteForce || '',
                    timeComplexity: '',
                    spaceComplexity: '',
                    code: '',
                    language: mySolution.language || 'PYTHON',
                })
            }

            // Add optimized / main solution tab
            existingTabs.push({
                type: mySolution.bruteForce ? 'OPTIMIZED' : 'BRUTE_FORCE',
                approach: mySolution.optimizedApproach || mySolution.approach || '',
                timeComplexity: mySolution.timeComplexity || '',
                spaceComplexity: mySolution.spaceComplexity || '',
                code: mySolution.code || '',
                language: mySolution.language || 'PYTHON',
            })

            // Fallback: ensure at least one tab
            if (existingTabs.length === 0) {
                existingTabs.push({
                    type: 'BRUTE_FORCE',
                    approach: '',
                    timeComplexity: '',
                    spaceComplexity: '',
                    code: '',
                    language: mySolution.language || 'PYTHON',
                })
            }

            setSolutionTabs(existingTabs)
            setCommonNotes(mySolution.realWorldConnection || '')

            setFormData({
                pattern: mySolution.pattern || '',
                approach: mySolution.approach || '',
                keyInsight: mySolution.keyInsight || '',
                feynmanExplanation: mySolution.feynmanExplanation || '',
                realWorldConnection: mySolution.realWorldConnection || '',
                confidence: mySolution.confidence || 3,
            })

            setLoaded(true)
        }
    }, [mySolution, loaded])

    function updateFormData(updates) {
        setFormData(prev => ({ ...prev, ...updates }))
    }

    async function onSubmit() {
        if (!mySolution) return

        const optimized = solutionTabs.find(s => s.type === 'OPTIMIZED')
        const brute = solutionTabs.find(s => s.type === 'BRUTE_FORCE')
        const bestSol = optimized || solutionTabs[0]
        const language = bestSol?.language || 'PYTHON'
        localStorage.setItem('ps_last_language', language)

        // v3.0: Map to v3 solution schema
        const data = {
            approach: formData.approach || optimized?.approach || bestSol?.approach || null,
            code: bestSol?.code || null,
            language,
            bruteForce: brute?.approach || null,
            optimizedApproach: optimized?.approach || null,
            timeComplexity: optimized?.timeComplexity || bestSol?.timeComplexity || null,
            spaceComplexity: optimized?.spaceComplexity || bestSol?.spaceComplexity || null,
            keyInsight: formData.keyInsight || null,
            feynmanExplanation: formData.feynmanExplanation || null,
            realWorldConnection: formData.realWorldConnection || commonNotes || null,
            confidence: formData.confidence || 3,
            pattern: formData.pattern || null,
        }

        try {
            await updateSolution.mutateAsync({
                solutionId: mySolution.id,
                data,
            })
            navigate(`/problems/${problemId}`)
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
                <Button variant="primary" onClick={() => navigate(`/problems/${problemId}/submit`)}>
                    Submit Solution
                </Button>
            </div>
        )
    }

    const selectedPattern = formData.pattern || ''

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Back */}
            <button
                type="button"
                onClick={() => navigate(`/problems/${problemId}`)}
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
                                    {problem.difficulty?.charAt(0) + problem.difficulty?.slice(1).toLowerCase()}
                                </Badge>
                                {catInfo && (
                                    <span className={cn(
                                        'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                        catInfo.bg
                                    )}>
                                        {catInfo.icon} {catInfo.label}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-base font-bold text-text-primary">{problem.title}</h2>
                        </div>
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
                                    pattern: selectedPattern === p.label ? '' : p.label
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
                    <input
                        type="text"
                        placeholder="Or type a custom pattern…"
                        value={!PATTERNS.some(p => p.label === selectedPattern) ? selectedPattern : ''}
                        onChange={e => updateFormData({ pattern: e.target.value })}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                         text-sm text-text-primary placeholder:text-text-tertiary
                         px-3.5 py-2.5 outline-none
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                    />
                </div>

                {/* ── Solutions section ──────────────────────── */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                        <span>💻</span> Solutions
                    </h3>
                    <SolutionTabs
                        solutions={solutionTabs}
                        onChange={setSolutionTabs}
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

                    {/* Feynman Explanation */}
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
                            content={formData.feynmanExplanation || ''}
                            onChange={val => updateFormData({ feynmanExplanation: val })}
                            minHeight="80px"
                        />
                    </div>

                    {/* Real World Connection */}
                    <div className="bg-surface-2 border border-border-default rounded-2xl p-5">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center
                              justify-center text-base flex-shrink-0 mt-0.5">
                                🌍
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-text-primary mb-0.5">
                                    Real World Connection
                                </h4>
                                <p className="text-xs text-text-tertiary">
                                    Where does this pattern appear in real software systems?
                                </p>
                            </div>
                        </div>
                        <RichTextEditor
                            placeholder="e.g. Hash maps are used in database indexing, DNS caching, load balancers..."
                            content={formData.realWorldConnection || ''}
                            onChange={val => updateFormData({ realWorldConnection: val })}
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
                                    onClick={() => updateFormData({ confidence: c.value })}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                                        'transition-all duration-150 min-w-[80px]',
                                        formData.confidence === c.value
                                            ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                                    )}
                                >
                                    <span className="text-2xl">{c.emoji}</span>
                                    <span className={cn(
                                        'text-[10px] font-bold text-center leading-tight',
                                        formData.confidence === c.value ? c.color : 'text-text-tertiary'
                                    )}>
                                        {c.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Follow-up questions (read-only display) */}
                    {problem?.followUpQuestions?.length > 0 && (
                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-text-primary">
                                Follow-up Questions
                            </label>
                            {problem.followUpQuestions.map((fq, i) => (
                                <div key={fq.id || i}
                                    className="bg-surface-2 border border-border-default rounded-xl p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-3
                                     border border-border-default flex items-center
                                     justify-center text-xs font-bold text-text-tertiary mt-0.5">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-sm font-medium text-text-primary">
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
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Submit ────────────────────────────────── */}
                <div className="flex items-center justify-between pt-4 border-t border-border-default">
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => navigate(`/problems/${problemId}`)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        size="md"
                        loading={updateSolution.isPending}
                        onClick={onSubmit}
                    >
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