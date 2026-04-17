import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useCreateSolution } from '@hooks/useSolutions'
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

const STEPS = [
    { id: 1, label: 'Pattern', icon: '🧩', desc: 'Identify the algorithm pattern' },
    { id: 2, label: 'Solutions', icon: '💻', desc: 'Your approaches with code and complexity' },
    { id: 3, label: 'Reflection', icon: '🔬', desc: 'Insights, explanations, and self-assessment' },
]

// ── Step indicator ─────────────────────────────────────
function StepIndicator({ current, steps, onStepClick, completedSteps }) {
    return (
        <div className="flex items-center gap-0 mb-8">
            {steps.map((step, i) => {
                const isActive = step.id === current
                const isCompleted = completedSteps.has(step.id)
                const isPast = step.id < current
                const isClickable = isPast || isCompleted

                return (
                    <div key={step.id} className="flex items-center flex-1">
                        <button
                            type="button"
                            onClick={() => isClickable && onStepClick(step.id)}
                            disabled={!isClickable && !isActive}
                            className={cn(
                                'flex flex-col items-center gap-1.5 flex-1 transition-all',
                                isClickable ? 'cursor-pointer' : 'cursor-default'
                            )}
                        >
                            <div className={cn(
                                'w-9 h-9 rounded-full flex items-center justify-center',
                                'text-sm font-bold border-2 transition-all duration-200',
                                isActive
                                    ? 'bg-brand-400 border-brand-400 text-white shadow-glow-sm scale-110'
                                    : isCompleted || isPast
                                        ? 'bg-success/15 border-success text-success'
                                        : 'bg-surface-3 border-border-default text-text-disabled'
                            )}>
                                {isCompleted && !isActive ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="3"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    <span>{step.icon}</span>
                                )}
                            </div>
                            <span className={cn(
                                'text-[11px] font-semibold hidden sm:block',
                                isActive ? 'text-brand-300' :
                                    isPast || isCompleted ? 'text-success' : 'text-text-disabled'
                            )}>
                                {step.label}
                            </span>
                        </button>
                        {i < steps.length - 1 && (
                            <div className={cn(
                                'h-0.5 flex-1 mx-1 rounded-full transition-all duration-300',
                                step.id < current ? 'bg-success' : 'bg-surface-4'
                            )} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ── Step 1: Pattern ────────────────────────────────────
function StepPattern({ data, onChange }) {
    const selectedPattern = data.patternIdentified || ''

    function setPattern(val) {
        onChange({ ...data, patternIdentified: val })
    }

    return (
        <div className="space-y-6">
            {/* Pattern grid */}
            <div>
                <label className="block text-sm font-semibold text-text-primary mb-1.5">
                    Pattern Identified
                </label>
                <p className="text-xs text-text-tertiary mb-3">
                    What algorithm pattern does this problem use?
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PATTERNS.map(p => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setPattern(selectedPattern === p.label ? '' : p.label)}
                            className={cn(
                                'text-left px-3 py-2.5 rounded-xl border text-xs font-semibold',
                                'transition-all duration-150',
                                selectedPattern === p.label
                                    ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                    : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30 hover:text-text-primary'
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="mt-3">
                    <input
                        type="text"
                        placeholder="Or type a custom pattern…"
                        value={!PATTERNS.some(p => p.label === selectedPattern) ? selectedPattern : ''}
                        onChange={e => setPattern(e.target.value)}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                       text-sm text-text-primary placeholder:text-text-tertiary
                       px-3.5 py-2.5 outline-none
                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                       transition-all duration-150"
                    />
                </div>
            </div>

            {/* How did you identify this pattern */}
            <RichTextEditor
                label="How did you identify this pattern?"
                optional
                hint="What clues in the problem pointed you to this approach? What was your first instinct?"
                placeholder="e.g. The problem asks for a subarray sum — I immediately thought sliding window because..."
                content={data.patternReasoning || ''}
                onChange={val => onChange({ ...data, patternReasoning: val })}
                minHeight="120px"
            />
        </div>
    )
}

// ── Step 3: Reflection ─────────────────────────────────
function StepReflection({ data, onChange, followUps }) {
    const followUpAnswers = data.followUpAnswers || []

    function setAnswer(i, val) {
        const updated = [...followUpAnswers]
        updated[i] = val
        onChange({ ...data, followUpAnswers: updated })
    }

    return (
        <div className="space-y-6">

            {/* Key Insight */}
            <div className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center
                          justify-center text-base flex-shrink-0 mt-0.5">
                        💡
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary mb-0.5">
                            Key Insight
                        </h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            In one sentence — what's the single thing that makes this problem click?
                            The "aha!" moment that unlocks the solution.
                        </p>
                    </div>
                </div>
                <textarea
                    rows={2}
                    value={data.keyInsight || ''}
                    onChange={e => onChange({ ...data, keyInsight: e.target.value })}
                    placeholder="e.g. The trick is realizing you only need to track the running max from the left..."
                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                     text-sm text-text-primary placeholder:text-text-tertiary
                     px-3.5 py-2.5 outline-none resize-none
                     focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                     transition-all duration-150"
                />
            </div>

            {/* Explain it simply */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center
                          justify-center text-base flex-shrink-0 mt-0.5">
                        🗣
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary mb-0.5">
                            Explain It Simply
                        </h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Explain to someone with no programming background. Where does this
                            pattern appear in real software?
                        </p>
                    </div>
                </div>
                <RichTextEditor
                    placeholder="e.g. Imagine you're looking for two people in a room whose heights add up to 10 feet. Instead of comparing everyone with everyone..."
                    content={data.simpleExplanation || ''}
                    onChange={val => onChange({ ...data, simpleExplanation: val })}
                    minHeight="100px"
                />
            </div>

            {/* What was challenging */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center
                          justify-center text-base flex-shrink-0 mt-0.5">
                        🤔
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary mb-0.5">
                            What Was Challenging?
                        </h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Where did you get stuck? What made this harder than expected?
                            These are your best learning opportunities.
                        </p>
                    </div>
                </div>
                <RichTextEditor
                    placeholder="e.g. I struggled with the off-by-one error in the window boundary. The edge case where..."
                    content={data.challenges || ''}
                    onChange={val => onChange({ ...data, challenges: val })}
                    minHeight="80px"
                    optional
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
                            onClick={() => onChange({ ...data, confidenceLevel: c.value })}
                            className={cn(
                                'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                                'transition-all duration-150 min-w-[80px]',
                                data.confidenceLevel === c.value
                                    ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                    : 'bg-surface-3 border-border-default hover:border-border-strong'
                            )}
                        >
                            <span className="text-2xl">{c.emoji}</span>
                            <span className={cn(
                                'text-[10px] font-bold text-center leading-tight',
                                data.confidenceLevel === c.value ? c.color : 'text-text-tertiary'
                            )}>
                                {c.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Follow-up questions */}
            {followUps?.length > 0 && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-0.5">
                            Follow-up Questions
                        </label>
                        <p className="text-xs text-text-tertiary">
                            Answer as many as you can — these deepen your understanding.
                        </p>
                    </div>
                    {followUps.map((fq, i) => (
                        <div key={fq.id}
                            className="bg-surface-2 border border-border-default rounded-xl p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-3
                                 border border-border-default flex items-center
                                 justify-center text-xs font-bold text-text-tertiary mt-0.5">
                                    {i + 1}
                                </span>
                                <div className="flex-1">
                                    <div className="flex items-start justify-between gap-2 mb-1">
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
                                        <details className="mb-2">
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
                                    <textarea
                                        rows={2}
                                        value={followUpAnswers[i] || ''}
                                        onChange={e => setAnswer(i, e.target.value)}
                                        placeholder="Your answer…"
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                               text-sm text-text-primary placeholder:text-text-tertiary
                               px-3 py-2 outline-none resize-none
                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                               transition-all duration-150 mt-1"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function SubmitSolutionPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [step, setStep] = useState(1)
    const [completedSteps, setCompleted] = useState(new Set())

    const { data: problem, isLoading } = useProblem(id)
    const createSolution = useCreateSolution()

    // ── Form state ─────────────────────────────────────
    const [formData, setFormData] = useState({
        // Step 1
        patternIdentified: '',
        patternReasoning: '',
        // Step 2 — managed by SolutionTabs
        // Step 3
        keyInsight: '',
        simpleExplanation: '',
        challenges: '',
        confidenceLevel: 0,
        followUpAnswers: [],
    })

    const [solutions, setSolutions] = useState([{
        type: 'BRUTE_FORCE',
        approach: '',
        timeComplexity: '',
        spaceComplexity: '',
        code: '',
        language: localStorage.getItem('ps_last_language') || 'PYTHON',
    }])
    const [commonNotes, setCommonNotes] = useState('')

    function updateFormData(updates) {
        setFormData(prev => ({ ...prev, ...updates }))
    }

    function markComplete(stepId) {
        setCompleted(prev => new Set([...prev, stepId]))
    }

    function goNext() {
        markComplete(step)
        if (step < STEPS.length) {
            setStep(s => s + 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    function goPrev() {
        if (step > 1) {
            setStep(s => s - 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    async function onSubmit() {
        // Find the best solution (optimized > alternative > brute force)
        const optimized = solutions.find(s => s.type === 'OPTIMIZED')
        const brute = solutions.find(s => s.type === 'BRUTE_FORCE')
        const bestSol = optimized || solutions[0]
        const language = bestSol?.language || 'PYTHON'

        // Save preferred language
        localStorage.setItem('ps_last_language', language)

        const payload = {
            problemId: id,
            patternIdentified: formData.patternIdentified || null,
            firstInstinct: null,
            whyThisPattern: null,
            // Map patternReasoning to firstInstinct for backward compat
            ...(formData.patternReasoning && {
                firstInstinct: formData.patternReasoning,
            }),
            // Brute force
            bruteForceApproach: brute?.approach || null,
            bruteForceTime: brute?.timeComplexity || null,
            bruteForceSpace: brute?.spaceComplexity || null,
            // Optimized
            optimizedApproach: optimized?.approach || bestSol?.approach || null,
            optimizedTime: optimized?.timeComplexity || bestSol?.timeComplexity || null,
            optimizedSpace: optimized?.spaceComplexity || bestSol?.spaceComplexity || null,
            // Code from best solution
            code: bestSol?.code || null,
            language,
            // Reflection
            keyInsight: formData.keyInsight || null,
            feynmanExplanation: formData.simpleExplanation || null,
            realWorldConnection: commonNotes || null,
            stuckPoints: formData.challenges || null,
            followUpAnswers: formData.followUpAnswers || [],
            confidenceLevel: formData.confidenceLevel || 0,
            hintsUsed: false,
        }

        try {
            await createSolution.mutateAsync(payload)
            navigate(`/problems/${id}`)
        } catch {
            // error toast handled by mutation
        }
    }

    if (isLoading) return <PageSpinner />

    if (!problem) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-text-secondary">Problem not found.</p>
                <Button variant="secondary" onClick={() => navigate('/problems')}>
                    Back to Problems
                </Button>
            </div>
        )
    }

    const isLastStep = step === STEPS.length
    const currentStepMeta = STEPS[step - 1]

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
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="xs">
                                {problem.difficulty.charAt(0) + problem.difficulty.slice(1).toLowerCase()}
                            </Badge>
                            <span className="text-xs text-text-tertiary">
                                {SOURCE_LABELS[problem.source] || problem.source}
                            </span>
                        </div>
                        <h2 className="text-base font-bold text-text-primary">
                            {problem.title}
                        </h2>
                    </div>
                    {problem.sourceUrl && (
                        <a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0">
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

            {/* Form card */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-6">
                {/* Step indicator */}
                <StepIndicator
                    current={step}
                    steps={STEPS}
                    onStepClick={setStep}
                    completedSteps={completedSteps}
                />

                {/* Step title */}
                <div className="mb-6">
                    <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <span>{currentStepMeta.icon}</span>
                        {currentStepMeta.label}
                    </h2>
                    <p className="text-sm text-text-tertiary mt-0.5">
                        {currentStepMeta.desc}
                    </p>
                </div>

                {/* Step content */}
                <div className="relative">
                    {step === 1 && (
                        <StepPattern
                            data={formData}
                            onChange={updateFormData}
                        />
                    )}
                    {step === 2 && (
                        <SolutionTabs
                            solutions={solutions}
                            onChange={setSolutions}
                            commonNotes={commonNotes}
                            onNotesChange={setCommonNotes}
                        />
                    )}
                    {step === 3 && (
                        <StepReflection
                            data={formData}
                            onChange={updateFormData}
                            followUps={problem.followUps}
                        />
                    )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between mt-8 pt-6
                        border-t border-border-default">
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={goPrev}
                        disabled={step === 1}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Back
                    </Button>

                    <div className="flex items-center gap-2">
                        {STEPS.map(s => (
                            <div key={s.id} className={cn(
                                'rounded-full transition-all duration-200',
                                s.id === step
                                    ? 'w-6 h-2 bg-brand-400'
                                    : completedSteps.has(s.id)
                                        ? 'w-2 h-2 bg-success'
                                        : 'w-2 h-2 bg-surface-4'
                            )} />
                        ))}
                    </div>

                    {isLastStep ? (
                        <Button
                            type="button"
                            variant="primary"
                            size="md"
                            loading={createSolution.isPending}
                            onClick={onSubmit}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Save Solution
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="primary"
                            size="md"
                            onClick={goNext}
                        >
                            Next
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}