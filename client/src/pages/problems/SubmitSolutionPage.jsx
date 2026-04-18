import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useCreateSolution } from '@hooks/useSolutions'
import { SolutionTabs } from '@components/features/solutions/SolutionTabs'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { CodeEditor } from '@components/ui/CodeEditor'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PATTERNS, CONFIDENCE_LEVELS, PROBLEM_CATEGORIES } from '@utils/constants'
import { getCategoryForm } from '@utils/categoryForms'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const SOURCE_LABELS = {
    LEETCODE: 'LeetCode', GFG: 'GFG', CODECHEF: 'CodeChef',
    INTERVIEWBIT: 'InterviewBit', HACKERRANK: 'HackerRank',
    CODEFORCES: 'Codeforces', OTHER: 'Other',
}

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

// ── Pattern / Topic selector ───────────────────────────
function PatternSelector({ config, value, onChange }) {
    const hasSuggestions = config.suggestions?.length > 0
    const suggestions = hasSuggestions ? config.suggestions : PATTERNS.map(p => p.label)

    return (
        <div>
            <label className="block text-sm font-semibold text-text-primary mb-1.5">
                {config.label}
            </label>
            <p className="text-xs text-text-tertiary mb-3">
                {config.placeholder}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suggestions.map(s => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => onChange(value === s ? '' : s)}
                        className={cn(
                            'text-left px-3 py-2.5 rounded-xl border text-xs font-semibold',
                            'transition-all duration-150',
                            value === s
                                ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30 hover:text-text-primary'
                        )}
                    >
                        {s}
                    </button>
                ))}
            </div>
            <input
                type="text"
                placeholder="Or type custom..."
                value={!suggestions.includes(value) ? value : ''}
                onChange={e => onChange(e.target.value)}
                className="w-full mt-3 bg-surface-3 border border-border-strong rounded-xl
                   text-sm text-text-primary placeholder:text-text-tertiary
                   px-3.5 py-2.5 outline-none
                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                   transition-all duration-150"
            />
        </div>
    )
}

// ── Rich field with icon header ────────────────────────
function RichField({ icon, label, hint, placeholder, content, onChange, minHeight = '100px' }) {
    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center
                        justify-center text-base flex-shrink-0 mt-0.5">
                    {icon}
                </div>
                <div>
                    <h3 className="text-sm font-bold text-text-primary mb-0.5">{label}</h3>
                    {hint && <p className="text-xs text-text-tertiary leading-relaxed">{hint}</p>}
                </div>
            </div>
            <RichTextEditor
                placeholder={placeholder}
                content={content}
                onChange={onChange}
                minHeight={minHeight}
            />
        </div>
    )
}

// ── Step 1: Category-aware first step ──────────────────
function StepOne({ formConfig, data, onChange, category }) {
    const fields = formConfig.fields
    return (
        <div className="space-y-6">
            {fields.patternIdentified?.show && (
                <PatternSelector
                    config={formConfig.fields.patternIdentified}
                    value={data.patternIdentified || ''}
                    onChange={val => onChange({ ...data, patternIdentified: val })}
                />
            )}
            {fields.patternReasoning?.show && (
                <RichTextEditor
                    label={fields.patternReasoning.label}
                    hint={fields.patternReasoning.hint}
                    placeholder={fields.patternReasoning.placeholder}
                    content={data.patternReasoning || ''}
                    onChange={val => onChange({ ...data, patternReasoning: val })}
                    minHeight="120px"
                    optional
                />
            )}
        </div>
    )
}

// ── Step 2: Solutions or Action or Detail ──────────────
function StepTwo({ formConfig, data, onChange, solutions, setSolutions, commonNotes, setCommonNotes, category }) {
    // For categories with SolutionTabs (CODING, SYSTEM_DESIGN, SQL)
    if (formConfig.showSolutionTabs) {
        return (
            <SolutionTabs
                solutions={solutions}
                onChange={setSolutions}
                commonNotes={commonNotes}
                onNotesChange={setCommonNotes}
                config={formConfig.solutionTabConfig}
            />
        )
    }

    // For BEHAVIORAL — show the Action field
    if (formConfig.showActionSection) {
        const actionConfig = formConfig.actionField
        return (
            <div className="space-y-5">
                <RichField
                    icon="🎯"
                    label={actionConfig.label}
                    hint={actionConfig.hint}
                    placeholder={actionConfig.placeholder}
                    content={data.actionContent || ''}
                    onChange={val => onChange({ ...data, actionContent: val })}
                    minHeight="200px"
                />
                {/* Common notes */}
                <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                    <RichTextEditor
                        label="Additional Notes"
                        optional
                        placeholder="Any extra context, links, or thoughts..."
                        content={commonNotes || ''}
                        onChange={setCommonNotes}
                        minHeight="80px"
                    />
                </div>
            </div>
        )
    }

    // For CS_FUNDAMENTALS — show the Detail field
    if (formConfig.showDetailSection) {
        const detailConfig = formConfig.detailField
        return (
            <div className="space-y-5">
                <RichField
                    icon="🔍"
                    label={detailConfig.label}
                    hint={detailConfig.hint}
                    placeholder={detailConfig.placeholder}
                    content={data.detailContent || ''}
                    onChange={val => onChange({ ...data, detailContent: val })}
                    minHeight="200px"
                />
                <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                    <RichTextEditor
                        label="Additional Notes"
                        optional
                        placeholder="Any extra context, references, or thoughts..."
                        content={commonNotes || ''}
                        onChange={setCommonNotes}
                        minHeight="80px"
                    />
                </div>
            </div>
        )
    }

    // For HR — show the response field
    return (
        <div className="space-y-5">
            <RichField
                icon="💬"
                label="Your Response"
                hint="Write your complete, polished answer. Be authentic and specific."
                placeholder="Write your answer here..."
                content={data.actionContent || ''}
                onChange={val => onChange({ ...data, actionContent: val })}
                minHeight="200px"
            />
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <RichTextEditor
                    label="Preparation Notes"
                    optional
                    placeholder="Research notes, key points to remember..."
                    content={commonNotes || ''}
                    onChange={setCommonNotes}
                    minHeight="80px"
                />
            </div>
        </div>
    )
}

// ── Step 3: Reflection ─────────────────────────────────
function StepThree({ formConfig, data, onChange, followUps }) {
    const fields = formConfig.fields
    const followUpAnswers = data.followUpAnswers || []

    function setAnswer(i, val) {
        const updated = [...followUpAnswers]
        updated[i] = val
        onChange({ ...data, followUpAnswers: updated })
    }

    return (
        <div className="space-y-6">
            {/* Key Insight / Trade-off / Learning */}
            {fields.keyInsight?.show && (
                <div className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center
                            justify-center text-base flex-shrink-0 mt-0.5">
                            💡
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-text-primary mb-0.5">
                                {fields.keyInsight.label}
                            </h3>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                {fields.keyInsight.hint}
                            </p>
                        </div>
                    </div>
                    <textarea
                        rows={2}
                        value={data.keyInsight || ''}
                        onChange={e => onChange({ ...data, keyInsight: e.target.value })}
                        placeholder={fields.keyInsight.placeholder}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                       text-sm text-text-primary placeholder:text-text-tertiary
                       px-3.5 py-2.5 outline-none resize-none
                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                       transition-all duration-150"
                    />
                </div>
            )}

            {/* Simple explanation / Scaling / Result */}
            {fields.simpleExplanation?.show && (
                <RichField
                    icon="🗣"
                    label={fields.simpleExplanation.label}
                    placeholder={fields.simpleExplanation.placeholder}
                    content={data.simpleExplanation || ''}
                    onChange={val => onChange({ ...data, simpleExplanation: val })}
                />
            )}

            {/* Challenges / Bottlenecks / What differently */}
            {fields.challenges?.show && (
                <RichField
                    icon="🤔"
                    label={fields.challenges.label}
                    placeholder={fields.challenges.placeholder}
                    content={data.challenges || ''}
                    onChange={val => onChange({ ...data, challenges: val })}
                    minHeight="80px"
                />
            )}

            {/* Confidence */}
            <div>
                <label className="block text-sm font-semibold text-text-primary mb-1">
                    Confidence Level
                </label>
                <p className="text-xs text-text-tertiary mb-3">
                    How well do you understand this right now?
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
            {formConfig.showFollowUps && followUps?.length > 0 && (
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
                                            {fq.difficulty?.charAt(0) + fq.difficulty?.slice(1).toLowerCase()}
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

    // Get the category-specific form config
    const category = problem?.category || 'CODING'
    const formConfig = getCategoryForm(category)
    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === category)

    // ── Form state ─────────────────────────────────────
    const [formData, setFormData] = useState({
        patternIdentified: '',
        patternReasoning: '',
        keyInsight: '',
        simpleExplanation: '',
        challenges: '',
        confidenceLevel: 0,
        followUpAnswers: [],
        actionContent: '',   // for BEHAVIORAL
        detailContent: '',   // for CS_FUNDAMENTALS
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
        if (step < formConfig.steps.length) {
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
        const optimized = solutions.find(s => s.type === 'OPTIMIZED' || s.type === 'DEEP_DIVE')
        const brute = solutions.find(s => s.type === 'BRUTE_FORCE' || s.type === 'HIGH_LEVEL')
        const bestSol = optimized || solutions[0]
        const language = bestSol?.language || 'PYTHON'

        localStorage.setItem('ps_last_language', language)

        // Map form data to existing Solution fields based on category
        const payload = {
            problemId: id,
            patternIdentified: formData.patternIdentified || null,
            firstInstinct: formData.patternReasoning || formData.actionContent || formData.detailContent || null,
            whyThisPattern: null,
            bruteForceApproach: brute?.approach || formData.actionContent || formData.detailContent || null,
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

    const isLastStep = step === formConfig.steps.length
    const currentStepMeta = formConfig.steps[step - 1]

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
                            {catInfo && (
                                <span className={cn(
                                    'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                    catInfo.bg
                                )}>
                                    {catInfo.icon} {catInfo.label}
                                </span>
                            )}
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
                {/* Step indicator — uses category-specific steps */}
                <StepIndicator
                    current={step}
                    steps={formConfig.steps}
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

                {/* Dynamic step content */}
                <div className="relative">
                    {step === 1 && (
                        <StepOne
                            formConfig={formConfig}
                            data={formData}
                            onChange={updateFormData}
                            category={category}
                        />
                    )}
                    {step === 2 && (
                        <StepTwo
                            formConfig={formConfig}
                            data={formData}
                            onChange={updateFormData}
                            solutions={solutions}
                            setSolutions={setSolutions}
                            commonNotes={commonNotes}
                            setCommonNotes={setCommonNotes}
                            category={category}
                        />
                    )}
                    {step === 3 && (
                        <StepThree
                            formConfig={formConfig}
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
                        {formConfig.steps.map(s => (
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