// ============================================================================
// ProbSolver v3.0 — Submit Solution Page (Redesigned)
// ============================================================================
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useSubmitSolution } from '@hooks/useSolutions'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { CodeEditor } from '@components/ui/CodeEditor'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import { PATTERNS, CONFIDENCE_LEVELS, PROBLEM_CATEGORIES } from '@utils/constants'
import { getCategoryForm } from '@utils/categoryForms'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Section wrapper ────────────────────────────────────
function FormSection({ icon, title, hint, badge, children, className }) {
    return (
        <div className={cn(
            'bg-surface-1 border border-border-default rounded-2xl p-5',
            className
        )}>
            <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center
                        justify-center text-base flex-shrink-0 mt-0.5">
                    {icon}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
                        {badge && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                   bg-brand-400/15 text-brand-300 border border-brand-400/25">
                                {badge}
                            </span>
                        )}
                    </div>
                    {hint && <p className="text-xs text-text-tertiary mt-0.5">{hint}</p>}
                </div>
            </div>
            {children}
        </div>
    )
}

// ── Pattern selector ───────────────────────────────────
function PatternSelector({ config, value, onChange }) {
    const suggestions = config.suggestions?.length > 0
        ? config.suggestions
        : PATTERNS.map(p => p.label)

    return (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
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
                                : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
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
                className="w-full bg-surface-3 border border-border-strong rounded-xl
                   text-sm text-text-primary placeholder:text-text-tertiary
                   px-3.5 py-2.5 outline-none
                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
            />
        </div>
    )
}

// ── Confidence picker ──────────────────────────────────
function ConfidencePicker({ value, onChange }) {
    return (
        <div className="flex gap-3 flex-wrap">
            {CONFIDENCE_LEVELS.map(c => (
                <button
                    key={c.value}
                    type="button"
                    onClick={() => onChange(c.value)}
                    className={cn(
                        'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                        'transition-all duration-150 min-w-[80px]',
                        value === c.value
                            ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                    )}
                >
                    <span className="text-2xl">{c.emoji}</span>
                    <span className={cn(
                        'text-[10px] font-bold text-center leading-tight',
                        value === c.value ? c.color : 'text-text-tertiary'
                    )}>
                        {c.label}
                    </span>
                </button>
            ))}
        </div>
    )
}

// ── Follow-up question with answer field ───────────────
function FollowUpWithAnswer({ followUp, index, answer, onAnswerChange }) {
    const [showHint, setShowHint] = useState(false)
    const hasAnswer = !!(answer?.trim())

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
                'rounded-xl border p-4 transition-colors',
                hasAnswer
                    ? 'bg-success/3 border-success/20'
                    : 'bg-surface-2 border-border-default'
            )}
        >
            {/* Question */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 flex-1">
                    <span className={cn(
                        'flex-shrink-0 w-5 h-5 rounded-full flex items-center',
                        'justify-center text-[10px] font-bold mt-0.5',
                        hasAnswer
                            ? 'bg-success/15 text-success'
                            : 'bg-surface-3 border border-border-default text-text-disabled'
                    )}>
                        {hasAnswer ? '✓' : index + 1}
                    </span>
                    <p className="text-xs font-semibold text-text-primary leading-relaxed">
                        {followUp.question}
                    </p>
                </div>
                <Badge variant={DIFF_VARIANT[followUp.difficulty] || 'brand'}
                    size="xs" className="flex-shrink-0">
                    {followUp.difficulty}
                </Badge>
            </div>

            {/* Hint */}
            {followUp.hint && (
                <div className="mb-3 ml-7">
                    <button
                        type="button"
                        onClick={() => setShowHint(!showHint)}
                        className="text-[10px] text-brand-300 hover:text-brand-200
                               transition-colors flex items-center gap-1"
                    >
                        💡 {showHint ? 'Hide hint' : 'Show hint'}
                    </button>
                    {showHint && (
                        <p className="text-[11px] text-text-tertiary mt-1.5
                               bg-surface-3 border border-border-subtle
                               rounded-lg p-2.5 leading-relaxed">
                            {followUp.hint}
                        </p>
                    )}
                </div>
            )}

            {/* Answer field */}
            <div className="ml-7">
                <textarea
                    rows={3}
                    value={answer || ''}
                    onChange={e => onAnswerChange(followUp.id, e.target.value)}
                    placeholder={
                        followUp.difficulty === 'EASY'
                            ? 'Answer this follow-up to earn bonus points...'
                            : followUp.difficulty === 'MEDIUM'
                                ? 'Challenge yourself — answer this for extra AI feedback...'
                                : 'Hard bonus question — attempt it to demonstrate mastery...'
                    }
                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                           text-xs text-text-primary placeholder:text-text-disabled
                           px-3 py-2.5 outline-none resize-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                           transition-all"
                />
                {!hasAnswer && (
                    <p className="text-[10px] text-text-disabled mt-1">
                        Optional — AI will note this was skipped
                    </p>
                )}
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function SubmitSolutionPage() {
    const { problemId } = useParams()
    const navigate = useNavigate()

    const { data: problem, isLoading } = useProblem(problemId)
    const submitSolution = useSubmitSolution()

    const category = problem?.category || 'CODING'
    const formConfig = getCategoryForm(category)
    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === category)
    const hasExternalLink = !!problem?.categoryData?.sourceUrl
    const fields = formConfig.fields

    // ── Form state ─────────────────────────────────────
    const [code, setCode] = useState('')
    const [language, setLanguage] = useState(localStorage.getItem('ps_last_language') || 'PYTHON')
    const [approach, setApproach] = useState('')
    const [pattern, setPattern] = useState('')
    const [keyInsight, setKeyInsight] = useState('')
    const [feynmanExplanation, setFeynmanExplanation] = useState('')
    const [realWorldConnection, setRealWorldConnection] = useState('')
    const [confidence, setConfidence] = useState(0)
    // followUpAnswers: { [followUpQuestionId]: answerText }
    const [followUpAnswers, setFollowUpAnswers] = useState({})

    function handleFollowUpAnswer(questionId, text) {
        setFollowUpAnswers(prev => ({ ...prev, [questionId]: text }))
    }

    const followUpCount = problem?.followUpQuestions?.length || 0
    const answeredCount = Object.values(followUpAnswers).filter(v => v?.trim()).length

    // ── Submit ─────────────────────────────────────────
    async function onSubmit() {
        if (confidence === 0) {
            toast.error('Please set your confidence level')
            return
        }

        localStorage.setItem('ps_last_language', language)

        // Build follow-up answers array (only answered ones)
        const followUpAnswersArray = Object.entries(followUpAnswers)
            .filter(([, text]) => text?.trim())
            .map(([questionId, text]) => ({
                followUpQuestionId: questionId,
                answerText: text.trim(),
            }))

        const data = {
            approach: approach || null,
            code: code || null,
            language: code ? language : null,
            pattern: pattern || null,
            keyInsight: keyInsight || null,
            feynmanExplanation: feynmanExplanation || null,
            realWorldConnection: realWorldConnection || null,
            confidence,
            timeComplexity: null,
            spaceComplexity: null,
            bruteForce: null,
            optimizedApproach: approach || null,
            followUpAnswers: followUpAnswersArray,
        }

        try {
            await submitSolution.mutateAsync({ problemId, data })
            toast.success('Solution submitted! AI will analyze it.')
            navigate(`/problems/${problemId}`)
        } catch {
            // error handled by mutation
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
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                    {problem.source && !['MANUAL', 'AI_GENERATED'].includes(problem.source) && (
                        <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                           border border-border-subtle rounded-full px-2 py-px">
                            {problem.source}
                        </span>
                    )}
                </div>
                <h2 className="text-base font-bold text-text-primary mb-2">
                    {problem.title}
                </h2>
                {hasExternalLink && (
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
                        Solve on {problem.source || 'External Site'} →
                    </a>
                )}
            </div>

            {/* Info banner for external-link problems */}
            {hasExternalLink && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-info/5 border border-info/20 rounded-xl p-4 mb-6
                     flex items-start gap-3"
                >
                    <span className="text-lg flex-shrink-0">💡</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">
                            Solve first, then reflect here
                        </p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Solve on {problem.source || 'the external site'}, then paste your code below.
                            AI will analyze complexity, correctness, and give specific feedback.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Form sections */}
            <div className="space-y-5">

                {/* Code section */}
                {(category === 'CODING' || category === 'SQL' || hasExternalLink) && (
                    <FormSection
                        icon="💻"
                        title={hasExternalLink ? "Paste Your Solution Code" : (formConfig.solutionTabConfig?.codeLabel || "Your Code")}
                        hint="AI will analyze correctness, complexity, and detect any issues"
                    >
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {['PYTHON', 'JAVASCRIPT', 'JAVA', 'CPP', 'TYPESCRIPT', 'GO', 'RUST', 'SQL'].map(lang => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => setLanguage(lang)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all',
                                        language === lang
                                            ? 'bg-brand-400/15 border-brand-400/35 text-brand-300'
                                            : 'bg-surface-3 border-border-default text-text-disabled hover:text-text-tertiary'
                                    )}
                                >
                                    {lang === 'CPP' ? 'C++' : lang === 'JAVASCRIPT' ? 'JS' : lang === 'TYPESCRIPT' ? 'TS' : lang}
                                </button>
                            ))}
                        </div>
                        <CodeEditor
                            value={code}
                            onChange={setCode}
                            language={language?.toLowerCase() === 'cpp' ? 'cpp' : language?.toLowerCase() || 'python'}
                            placeholder={formConfig.solutionTabConfig?.codePlaceholder || "// Paste your solution here..."}
                            minHeight="200px"
                        />
                        <p className="text-[10px] text-text-disabled mt-2">
                            🤖 AI will check correctness, detect edge cases, analyze complexity, and flag any issues
                        </p>
                    </FormSection>
                )}

                {/* Approach / Response */}
                <FormSection
                    icon={category === 'BEHAVIORAL' ? '🎯' : category === 'HR' ? '💬' : '📝'}
                    title={
                        category === 'BEHAVIORAL' ? (formConfig.actionField?.label || 'Your Response')
                            : category === 'HR' ? 'Your Answer'
                                : category === 'SYSTEM_DESIGN' ? 'Your Design'
                                    : category === 'CS_FUNDAMENTALS' ? 'Your Explanation'
                                        : 'Your Approach'
                    }
                    hint={
                        hasExternalLink
                            ? 'Explain your thought process. What pattern did you use and why? What alternatives did you consider?'
                            : category === 'BEHAVIORAL'
                                ? (formConfig.actionField?.hint || 'Use STAR format — be specific about YOUR actions.')
                                : 'Describe your approach step by step.'
                    }
                >
                    <RichTextEditor
                        content={approach}
                        onChange={setApproach}
                        placeholder={
                            hasExternalLink
                                ? 'Walk through your approach: pattern identification, why this approach, alternatives considered...'
                                : fields.patternReasoning?.placeholder || 'Write your approach here...'
                        }
                        minHeight={category === 'CODING' && hasExternalLink ? '120px' : '180px'}
                    />
                </FormSection>

                {/* Pattern identification */}
                {fields.patternIdentified?.show && (
                    <FormSection
                        icon="🧩"
                        title={fields.patternIdentified.label || 'Pattern Identified'}
                        hint="AI will verify if your identified pattern matches your solution"
                    >
                        <PatternSelector
                            config={fields.patternIdentified}
                            value={pattern}
                            onChange={setPattern}
                        />
                    </FormSection>
                )}

                {/* Key Insight */}
                {fields.keyInsight?.show && (
                    <FormSection
                        icon="💡"
                        title={fields.keyInsight.label || 'Key Insight'}
                        hint={fields.keyInsight.hint}
                        className="bg-brand-400/3 border-brand-400/20"
                    >
                        <textarea
                            rows={2}
                            value={keyInsight}
                            onChange={e => setKeyInsight(e.target.value)}
                            placeholder={fields.keyInsight.placeholder || 'The one thing that makes this click...'}
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                           text-sm text-text-primary placeholder:text-text-tertiary
                           px-3.5 py-2.5 outline-none resize-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </FormSection>
                )}

                {/* Feynman Explanation */}
                {fields.simpleExplanation?.show && (
                    <FormSection
                        icon="🗣"
                        title={fields.simpleExplanation.label || 'Explain It Simply'}
                        hint="Explain to someone who doesn't know the topic"
                    >
                        <RichTextEditor
                            content={feynmanExplanation}
                            onChange={setFeynmanExplanation}
                            placeholder={fields.simpleExplanation.placeholder || 'Explain in simple terms...'}
                            minHeight="100px"
                        />
                    </FormSection>
                )}

                {/* Challenges / Real-world */}
                {fields.challenges?.show && (
                    <FormSection
                        icon="🌍"
                        title={fields.challenges.label || 'Challenges & Real-World Connection'}
                    >
                        <RichTextEditor
                            content={realWorldConnection}
                            onChange={setRealWorldConnection}
                            placeholder={fields.challenges.placeholder || 'What was challenging? How does this connect to real-world software?'}
                            minHeight="80px"
                        />
                    </FormSection>
                )}

                {/* Confidence */}
                <FormSection
                    icon="📊"
                    title="Confidence Level"
                    hint="Be honest — AI will flag if your confidence doesn't match your solution quality"
                >
                    <ConfidencePicker value={confidence} onChange={setConfidence} />
                </FormSection>

                {/* Follow-up questions — INTERACTIVE */}
                {problem.followUpQuestions?.length > 0 && (
                    <FormSection
                        icon="🧠"
                        title="Follow-up Questions"
                        badge={answeredCount > 0 ? `${answeredCount}/${followUpCount} answered` : 'Optional — earn bonus points'}
                        hint="Each answer you provide earns bonus points in your AI review. Skipped questions are noted."
                    >
                        <div className="space-y-3">
                            {problem.followUpQuestions.map((fq, i) => (
                                <FollowUpWithAnswer
                                    key={fq.id}
                                    followUp={fq}
                                    index={i}
                                    answer={followUpAnswers[fq.id] || ''}
                                    onAnswerChange={handleFollowUpAnswer}
                                />
                            ))}
                        </div>

                        {/* Progress indicator */}
                        {followUpCount > 0 && (
                            <div className="mt-4 pt-4 border-t border-border-subtle">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="text-text-disabled">Follow-up progress</span>
                                    <span className={cn(
                                        'font-semibold',
                                        answeredCount === followUpCount ? 'text-success' :
                                            answeredCount > 0 ? 'text-brand-300' : 'text-text-disabled'
                                    )}>
                                        {answeredCount}/{followUpCount} answered
                                        {answeredCount > 0 && ` (+${Math.min(answeredCount * 0.5, 2).toFixed(1)} bonus)`}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                    <motion.div
                                        animate={{ width: `${followUpCount > 0 ? (answeredCount / followUpCount) * 100 : 0}%` }}
                                        transition={{ duration: 0.4 }}
                                        className={cn(
                                            'h-full rounded-full',
                                            answeredCount === followUpCount ? 'bg-success' : 'bg-brand-400'
                                        )}
                                    />
                                </div>
                            </div>
                        )}
                    </FormSection>
                )}
            </div>

            {/* Submit bar */}
            <div className="sticky bottom-0 bg-surface-0/90 backdrop-blur-lg border-t
                  border-border-default mt-6 -mx-6 px-6 py-4">
                <div className="max-w-[800px] mx-auto flex items-center justify-between">
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => navigate(`/problems/${problemId}`)}
                    >
                        Cancel
                    </Button>

                    <div className="flex items-center gap-3">
                        {confidence === 0 && (
                            <span className="text-xs text-text-disabled hidden sm:block">
                                Set confidence to submit
                            </span>
                        )}
                        <Button
                            type="button"
                            variant="primary"
                            size="lg"
                            loading={submitSolution.isPending}
                            disabled={confidence === 0}
                            onClick={onSubmit}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Submit Solution
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}