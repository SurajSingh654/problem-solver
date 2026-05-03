// ============================================================================
// ProbSolver v3.0 — Edit Solution Page
// ============================================================================
//
// ROUTING:
//   HR category      → HRWorkspace (4-section: Analyze/Answer/Tailor/Reflect)
//   All other cats   → existing generic form (Pattern, SolutionTabs, Reflection)
//
// HR-specific:
//   - Pre-fills from categorySpecificData (the structured HR fields)
//   - Falls back to mapped generic fields for old solutions without categorySpecificData
//   - Saves back to both categorySpecificData AND the generic mapped fields
//     so RAG, embeddings, and 6D report continue to work
//
// ============================================================================
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useProblemSolutions, useUpdateSolution } from '@hooks/useSolutions'
import { SolutionTabs } from '@components/features/solutions/SolutionTabs'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import {
    PATTERNS, CONFIDENCE_LEVELS, PROBLEM_CATEGORIES,
    HR_STAKES, HR_QUESTION_CATEGORIES, HR_QUESTION_CATEGORY_MAP,
} from '@utils/constants'
import { getCategoryForm } from '@utils/categoryForms'
import useAuthStore from '@store/useAuthStore'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Follow-up with answer (non-HR) ─────────────────────
function FollowUpWithAnswer({ followUp, index, answer, onAnswerChange, isHR = false }) {
    const [showHint, setShowHint] = useState(false)
    const hasAnswer = !!(answer?.trim())
    const stakes = isHR ? HR_STAKES[followUp.difficulty] : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
                'rounded-xl border p-4 transition-colors',
                hasAnswer ? 'bg-success/3 border-success/20' : 'bg-surface-2 border-border-default'
            )}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 flex-1">
                    <span className={cn(
                        'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5',
                        hasAnswer ? 'bg-success/15 text-success' : 'bg-surface-3 border border-border-default text-text-disabled'
                    )}>
                        {hasAnswer ? '✓' : index + 1}
                    </span>
                    <p className="text-xs font-semibold text-text-primary leading-relaxed">
                        {followUp.question}
                    </p>
                </div>
                {isHR && stakes ? (
                    <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0', stakes.bg)}>
                        <span className={stakes.color}>{stakes.label}</span>
                    </span>
                ) : (
                    <Badge variant={DIFF_VARIANT[followUp.difficulty] || 'brand'} size="xs" className="flex-shrink-0">
                        {followUp.difficulty}
                    </Badge>
                )}
            </div>
            {followUp.hint && (
                <div className="mb-3 ml-7">
                    <button type="button" onClick={() => setShowHint(!showHint)}
                        className="text-[10px] text-brand-300 hover:text-brand-200 transition-colors flex items-center gap-1">
                        💡 {showHint ? 'Hide hint' : 'Show hint'}
                    </button>
                    {showHint && (
                        <p className="text-[11px] text-text-tertiary mt-1.5 bg-surface-3 border border-border-subtle rounded-lg p-2.5 leading-relaxed">
                            {followUp.hint}
                        </p>
                    )}
                </div>
            )}
            <div className="ml-7">
                <textarea
                    rows={isHR ? 4 : 3}
                    value={answer || ''}
                    onChange={e => onAnswerChange(followUp.id, e.target.value)}
                    placeholder={isHR
                        ? 'Refine your answer to this follow-up question...'
                        : followUp.difficulty === 'EASY'
                            ? 'Update your answer to this follow-up...'
                            : 'Refine your answer for extra AI feedback...'
                    }
                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                               text-xs text-text-primary placeholder:text-text-disabled
                               px-3 py-2.5 outline-none resize-none
                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 transition-all"
                />
            </div>
        </motion.div>
    )
}

// ── HR Edit Workspace ──────────────────────────────────
// Mirrors HRWorkspace from SubmitSolutionPage but pre-fills from existing data.
// Renders the same 4-section layout (Analyze/Answer/Tailor/Reflect) + category selector.
function HREditWorkspace({ hrData, onHrDataChange, questionCategory, onQuestionCategoryChange }) {
    const [activeSection, setActiveSection] = useState('answer') // default to answer for edits

    function update(field, value) {
        onHrDataChange({ ...hrData, [field]: value })
    }

    const hrConfig = getCategoryForm('HR')
    const fieldConfigs = hrConfig.hrFields || {}

    const sections = [
        {
            key: 'underlyingConcern',
            label: 'Analyze',
            icon: '🔍',
            sublabel: 'What are they really checking?',
            color: 'text-danger',
            activeBg: 'bg-danger/10 border-danger/30',
            required: true,
        },
        {
            key: 'answer',
            label: 'Answer',
            icon: '💬',
            sublabel: 'Your complete polished response',
            color: 'text-brand-300',
            activeBg: 'bg-brand-400/10 border-brand-400/30',
            required: true,
        },
        {
            key: 'companyConnection',
            label: 'Tailor',
            icon: '🎯',
            sublabel: 'Make it specific to this company',
            color: 'text-success',
            activeBg: 'bg-success/10 border-success/30',
            required: false,
        },
        {
            key: 'selfAssessment',
            label: 'Reflect',
            icon: '🪞',
            sublabel: 'Honest self-assessment',
            color: 'text-warning',
            activeBg: 'bg-warning/10 border-warning/30',
            required: false,
        },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)

    const completedCount = sections.filter(s =>
        (hrData[s.key]?.trim?.()?.length ?? 0) > 20
    ).length

    return (
        <div className="space-y-4">
            {/* Progress header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🤝</span> HR Answer
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">
                        {completedCount}/{sections.length} sections filled
                    </span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className="h-full bg-danger rounded-full"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const isDone = (hrData[s.key]?.trim?.()?.length ?? 0) > 20
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn(
                                    'flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border',
                                    'transition-all duration-150 min-w-[72px]',
                                    isActive ? s.activeBg
                                        : isDone ? 'bg-success/5 border-success/20'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                                )}
                            >
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {s.required && !isDone && !isActive && (
                                        <span className="text-danger text-[9px] font-bold">*</span>
                                    )}
                                    {isDone && !isActive && (
                                        <span className="text-success text-[9px] font-bold">✓</span>
                                    )}
                                </div>
                                <span className={cn(
                                    'text-[9px] font-bold uppercase tracking-wider text-center leading-tight',
                                    isActive ? s.color : isDone ? 'text-success' : 'text-text-disabled'
                                )}>
                                    {s.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Active section */}
            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                <div className={cn('flex items-center gap-3 px-5 py-4 border-b border-border-default', activeSectionConfig.activeBg)}>
                    <span className="text-xl">{activeSectionConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className={cn('text-sm font-bold', activeSectionConfig.color)}>
                                {activeSectionConfig.label}
                            </p>
                            {activeSectionConfig.required && (
                                <span className="text-[9px] font-bold text-danger bg-danger/10 border border-danger/20 px-1.5 py-px rounded-full">
                                    Required
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-disabled">{activeSectionConfig.sublabel}</p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>
                <div className="p-5">
                    {fieldConfigs[activeSection]?.hint && (
                        <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 mb-3">
                            💡 {fieldConfigs[activeSection].hint}
                        </p>
                    )}
                    <textarea
                        rows={fieldConfigs[activeSection]?.rows || 10}
                        value={hrData[activeSection] || ''}
                        onChange={e => update(activeSection, e.target.value)}
                        placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                   text-sm text-text-primary placeholder:text-text-disabled
                                   px-3.5 py-2.5 outline-none resize-y leading-relaxed
                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 10) * 24}px` }}
                    />
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-border-default bg-surface-1/50">
                    <button type="button"
                        onClick={() => { if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key) }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        Previous
                    </button>
                    <button type="button"
                        onClick={() => { if (activeIndex < sections.length - 1) setActiveSection(sections[activeIndex + 1].key) }}
                        disabled={activeIndex === sections.length - 1}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        Next
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>
                </div>
            </motion.div>

            {/* Question Category selector */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <p className="text-xs font-bold text-text-primary mb-1 flex items-center gap-2">
                    <span>🏷️</span> Question Category
                    <span className="text-[9px] font-normal text-text-disabled">optional</span>
                </p>
                <p className="text-[11px] text-text-tertiary mb-3">
                    Categorizing helps track which types of HR questions you have prepared for.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {HR_QUESTION_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => onQuestionCategoryChange(questionCategory === cat.id ? '' : cat.id)}
                            className={cn(
                                'flex items-start gap-2 p-3 rounded-xl border text-left transition-all',
                                questionCategory === cat.id
                                    ? `${cat.bg} font-bold`
                                    : 'bg-surface-3 border-border-default hover:border-border-strong'
                            )}
                        >
                            <span className="text-base flex-shrink-0 mt-0.5">{cat.icon}</span>
                            <div className="min-w-0">
                                <p className={cn('text-[10px] font-bold block leading-tight', questionCategory === cat.id ? cat.color : 'text-text-secondary')}>
                                    {cat.label}
                                </p>
                                <p className="text-[9px] text-text-disabled leading-tight mt-0.5">
                                    {cat.desc}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}


// ── Technical Knowledge Edit Workspace ────────────────
// Mirrors TechnicalKnowledgeWorkspace from SubmitSolutionPage
// but defaults to coreExplanation section (the most likely edit target)
// and pre-fills from existing categorySpecificData.
function TechnicalKnowledgeEditWorkspace({ tkData, onTkDataChange }) {
    const [activeSection, setActiveSection] = useState('coreExplanation')

    function update(field, value) {
        onTkDataChange({ ...tkData, [field]: value })
    }

    const tkConfig = getCategoryForm('CS_FUNDAMENTALS')
    const fieldConfigs = tkConfig.technicalKnowledgeFields || {}

    const sections = [
        {
            key: 'subject',
            label: 'Subject',
            icon: '📚',
            sublabel: 'Topic area and concept',
            color: 'text-warning',
            activeBg: 'bg-warning/10 border-warning/30',
            required: true,
        },
        {
            key: 'coreExplanation',
            label: 'Mechanism',
            icon: '⚙️',
            sublabel: 'How it works — not the definition',
            color: 'text-brand-300',
            activeBg: 'bg-brand-400/10 border-brand-400/30',
            required: true,
        },
        {
            key: 'whyItExists',
            label: 'Design',
            icon: '🎯',
            sublabel: 'Why it was designed this way',
            color: 'text-info',
            activeBg: 'bg-info/10 border-info/30',
            required: false,
        },
        {
            key: 'tradeoffs',
            label: 'Trade-offs',
            icon: '⚖️',
            sublabel: 'What it sacrifices',
            color: 'text-danger',
            activeBg: 'bg-danger/10 border-danger/30',
            required: false,
        },
        {
            key: 'realWorldUsage',
            label: 'Production',
            icon: '🌍',
            sublabel: 'Real systems + misconceptions',
            color: 'text-success',
            activeBg: 'bg-success/10 border-success/30',
            required: false,
        },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)

    const minThresholds = {
        subject: 20,
        coreExplanation: 400,
        whyItExists: 200,
        tradeoffs: 200,
        realWorldUsage: 200,
    }

    const completedCount = sections.filter(s =>
        (tkData[s.key]?.trim?.()?.length ?? 0) >= (minThresholds[s.key] || 30)
    ).length

    return (
        <div className="space-y-4">
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🧠</span> Technical Knowledge
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">
                        {completedCount}/{sections.length} sections filled
                    </span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className="h-full bg-warning rounded-full"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const isDone = (tkData[s.key]?.trim?.()?.length ?? 0) >= (minThresholds[s.key] || 30)
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn(
                                    'flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border',
                                    'transition-all duration-150 min-w-[72px]',
                                    isActive ? s.activeBg
                                        : isDone ? 'bg-success/5 border-success/20'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                                )}
                            >
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {s.required && !isDone && !isActive && (
                                        <span className="text-danger text-[9px] font-bold">*</span>
                                    )}
                                    {isDone && !isActive && (
                                        <span className="text-success text-[9px] font-bold">✓</span>
                                    )}
                                </div>
                                <span className={cn(
                                    'text-[9px] font-bold uppercase tracking-wider text-center leading-tight',
                                    isActive ? s.color : isDone ? 'text-success' : 'text-text-disabled'
                                )}>
                                    {s.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                <div className={cn(
                    'flex items-center gap-3 px-5 py-4 border-b border-border-default',
                    activeSectionConfig.activeBg
                )}>
                    <span className="text-xl">{activeSectionConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className={cn('text-sm font-bold', activeSectionConfig.color)}>
                                {activeSectionConfig.label}
                            </p>
                            {activeSectionConfig.required && (
                                <span className="text-[9px] font-bold text-danger
                                                 bg-danger/10 border border-danger/20
                                                 px-1.5 py-px rounded-full">
                                    Required
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-disabled">{activeSectionConfig.sublabel}</p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>
                <div className="p-5 space-y-3">
                    {fieldConfigs[activeSection]?.hint && (
                        <p className="text-[11px] text-text-tertiary leading-relaxed
                                       bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                            💡 {fieldConfigs[activeSection].hint}
                        </p>
                    )}
                    <textarea
                        rows={fieldConfigs[activeSection]?.rows || 10}
                        value={tkData[activeSection] || ''}
                        onChange={e => update(activeSection, e.target.value)}
                        placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                   text-sm text-text-primary placeholder:text-text-disabled
                                   px-3.5 py-2.5 outline-none resize-y leading-relaxed
                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 10) * 24}px` }}
                    />
                </div>
                <div className="flex items-center justify-between px-5 py-3
                                border-t border-border-default bg-surface-1/50">
                    <button type="button"
                        onClick={() => { if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key) }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Previous
                    </button>
                    <button type="button"
                        onClick={() => { if (activeIndex < sections.length - 1) setActiveSection(sections[activeIndex + 1].key) }}
                        disabled={activeIndex === sections.length - 1}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1">
                        Next
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function EditSolutionPage() {
    const { problemId, solutionId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuthStore()

    const { data: problem, isLoading: problemLoading } = useProblem(problemId)
    const { data: solutionsData, isLoading: solutionsLoading } = useProblemSolutions(problemId)
    const updateSolution = useUpdateSolution()

    const solutions = solutionsData?.solutions || []
    const mySolution = solutions.find(s => s.id === solutionId) ||
        solutions.find(s => s.userId === user?.id || s.isOwn)

    const category = problem?.category || 'CODING'
    const formConfig = getCategoryForm(category)
    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === category)
    const isHR = category === 'HR'
    const isHRRound = formConfig.isHRRound === true
    const isTechnicalKnowledge = category === 'CS_FUNDAMENTALS'
    const isTKRound = formConfig.isTechnicalKnowledge === true

    // ── Technical Knowledge workspace state ───────────────
    const [tkData, setTkData] = useState({
        subject: '',
        coreExplanation: '',
        whyItExists: '',
        tradeoffs: '',
        realWorldUsage: '',
    })
    const [tkConfidence, setTkConfidence] = useState(3)

    // ── Generic form state (non-HR) ────────────────────
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
    const [followUpAnswers, setFollowUpAnswers] = useState({})

    // ── HR workspace state ─────────────────────────────
    const [hrData, setHrData] = useState({
        underlyingConcern: '',
        answer: '',
        companyConnection: '',
        selfAssessment: '',
    })
    const [hrQuestionCategory, setHrQuestionCategory] = useState('')
    const [hrConfidence, setHrConfidence] = useState(3)

    const [loaded, setLoaded] = useState(false)

    // ── Pre-fill when solution loads ───────────────────
    useEffect(() => {
        if (!mySolution || loaded) return

        if (isHRRound) {
            // HR: pre-fill from categorySpecificData first (new format)
            // Fall back to mapped generic fields for old solutions
            const csd = mySolution.categorySpecificData

            if (csd && (csd.underlyingConcern || csd.answer)) {
                // New format — structured data exists
                setHrData({
                    underlyingConcern: csd.underlyingConcern || '',
                    answer: csd.answer || '',
                    companyConnection: csd.companyConnection || '',
                    selfAssessment: csd.selfAssessment || '',
                })
                setHrQuestionCategory(
                    csd.questionCategory || mySolution.pattern || ''
                )
            } else {
                // Old format — map generic fields back to HR fields
                // approach → underlyingConcern, keyInsight → answer,
                // feynmanExplanation → companyConnection, realWorldConnection → selfAssessment
                setHrData({
                    underlyingConcern: mySolution.approach || '',
                    answer: mySolution.keyInsight || '',
                    companyConnection: mySolution.feynmanExplanation || '',
                    selfAssessment: mySolution.realWorldConnection || '',
                })
                setHrQuestionCategory(mySolution.pattern || '')
            }

            setHrConfidence(mySolution.confidence || 3)

            // Pre-fill follow-up answers
            if (mySolution.followUpAnswers?.length > 0) {
                const prefilled = {}
                mySolution.followUpAnswers.forEach(a => {
                    prefilled[a.followUpQuestionId] = a.answerText
                })
                setFollowUpAnswers(prefilled)
            }
        } else if (isTKRound) {
            // TK: pre-fill from categorySpecificData first (new format)
            // Fall back to mapped generic fields for old solutions
            const csd = mySolution.categorySpecificData
            if (csd && (csd.subject !== undefined || csd.coreExplanation !== undefined)) {
                setTkData({
                    subject: csd.subject || '',
                    coreExplanation: csd.coreExplanation || '',
                    whyItExists: csd.whyItExists || '',
                    tradeoffs: csd.tradeoffs || '',
                    realWorldUsage: csd.realWorldUsage || '',
                })
            } else {
                // Old format — map generic fields back to TK fields
                // approach → coreExplanation, optimizedApproach → whyItExists,
                // keyInsight → tradeoffs, feynmanExplanation → realWorldUsage,
                // pattern → subject
                setTkData({
                    subject: mySolution.pattern || '',
                    coreExplanation: mySolution.approach || '',
                    whyItExists: mySolution.optimizedApproach || '',
                    tradeoffs: mySolution.keyInsight || '',
                    realWorldUsage: mySolution.feynmanExplanation || '',
                })
            }
            setTkConfidence(mySolution.confidence || 3)
            if (mySolution.followUpAnswers?.length > 0) {
                const prefilled = {}
                mySolution.followUpAnswers.forEach(a => {
                    prefilled[a.followUpQuestionId] = a.answerText
                })
                setFollowUpAnswers(prefilled)
            }
        } else {
            // Non-HR: existing logic unchanged
            const existingTabs = []
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
            existingTabs.push({
                type: mySolution.bruteForce ? 'OPTIMIZED' : 'BRUTE_FORCE',
                approach: mySolution.optimizedApproach || mySolution.approach || '',
                timeComplexity: mySolution.timeComplexity || '',
                spaceComplexity: mySolution.spaceComplexity || '',
                code: mySolution.code || '',
                language: mySolution.language || 'PYTHON',
            })
            if (existingTabs.length === 0) {
                existingTabs.push({
                    type: 'BRUTE_FORCE',
                    approach: '',
                    timeComplexity: '',
                    spaceComplexity: '',
                    code: '',
                    language: 'PYTHON',
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
            if (mySolution.followUpAnswers?.length > 0) {
                const prefilled = {}
                mySolution.followUpAnswers.forEach(a => {
                    prefilled[a.followUpQuestionId] = a.answerText
                })
                setFollowUpAnswers(prefilled)
            }
        }

        setLoaded(true)
    }, [mySolution, loaded, isHRRound])

    function updateFormData(updates) {
        setFormData(prev => ({ ...prev, ...updates }))
    }

    function handleFollowUpAnswer(questionId, text) {
        setFollowUpAnswers(prev => ({ ...prev, [questionId]: text }))
    }

    const followUpCount = problem?.followUpQuestions?.length || 0
    const answeredCount = Object.values(followUpAnswers).filter(v => v?.trim()).length

    // ── Save ───────────────────────────────────────────
    async function onSubmit() {
        if (!mySolution) return

        const followUpAnswersArray = Object.entries(followUpAnswers)
            .filter(([, text]) => text?.trim())
            .map(([questionId, text]) => ({
                followUpQuestionId: questionId,
                answerText: text.trim(),
            }))

        let data

        if (isHRRound) {
            // HR: save structured data to categorySpecificData
            // AND map back to generic fields for RAG/embeddings/6D report
            data = {
                approach: hrData.underlyingConcern || null,
                keyInsight: hrData.answer || null,
                feynmanExplanation: hrData.companyConnection || null,
                realWorldConnection: hrData.selfAssessment || null,
                pattern: hrQuestionCategory || null,
                code: null,
                language: null,
                confidence: hrConfidence,
                categorySpecificData: {
                    ...hrData,
                    questionCategory: hrQuestionCategory,
                },
                followUpAnswers: followUpAnswersArray,
            }
        } else if (isTKRound) {
            data = {
                approach: tkData.coreExplanation || null,
                optimizedApproach: tkData.whyItExists || null,
                keyInsight: tkData.tradeoffs || null,
                feynmanExplanation: tkData.realWorldUsage || null,
                realWorldConnection: null,
                pattern: tkData.subject?.trim() || null,
                code: null,
                language: null,
                confidence: tkConfidence,
                categorySpecificData: { ...tkData },
                followUpAnswers: followUpAnswersArray,
            }
        } else {
            // Non-HR: existing logic unchanged
            const optimized = solutionTabs.find(s => s.type === 'OPTIMIZED')
            const brute = solutionTabs.find(s => s.type === 'BRUTE_FORCE')
            const bestSol = optimized || solutionTabs[0]
            const language = bestSol?.language || 'PYTHON'
            localStorage.setItem('ps_last_language', language)

            data = {
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
                followUpAnswers: followUpAnswersArray,
            }
        }

        try {
            await updateSolution.mutateAsync({ solutionId: mySolution.id, data })
            toast.success(isHR ? 'Answer updated.' : 'Solution updated.')
            navigate(`/problems/${problemId}`)
        } catch {
            // error handled by mutation
        }
    }

    if (problemLoading || solutionsLoading) return <PageSpinner />

    if (!mySolution) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="text-4xl">🤔</div>
                <p className="text-text-secondary text-sm">
                    {isHR ? "You haven't submitted an answer yet." : "You haven't submitted a solution yet."}
                </p>
                <Button variant="primary" onClick={() => navigate(`/problems/${problemId}/submit`)}>
                    {isHR ? 'Submit Answer' : 'Submit Solution'}
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
            {problem && (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {/* HR: stakes badge */}
                        {isHR ? (
                            <span className={cn(
                                'text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1',
                                HR_STAKES[problem.difficulty]?.bg
                            )}>
                                <span>{HR_STAKES[problem.difficulty]?.icon}</span>
                                <span className={HR_STAKES[problem.difficulty]?.color}>
                                    {HR_STAKES[problem.difficulty]?.label}
                                </span>
                            </span>
                        ) : (
                            <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="xs">
                                {problem.difficulty?.charAt(0) + problem.difficulty?.slice(1).toLowerCase()}
                            </Badge>
                        )}
                        {catInfo && (
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', catInfo.bg)}>
                                {catInfo.icon} {catInfo.label}
                            </span>
                        )}
                    </div>
                    <h2 className="text-base font-bold text-text-primary">{problem.title}</h2>
                </div>
            )}

            {/* Edit form */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-8">
                <div className="flex items-center gap-2 pb-4 border-b border-border-default">
                    <span className="text-xl">✏️</span>
                    <h2 className="text-lg font-bold text-text-primary">
                        {isHR ? 'Edit Answer' : 'Edit Solution'}
                    </h2>
                </div>

                {isHRRound ? (
                    // ── HR: structured workspace ───────────────────────
                    <>
                        <HREditWorkspace
                            hrData={hrData}
                            onHrDataChange={setHrData}
                            questionCategory={hrQuestionCategory}
                            onQuestionCategoryChange={setHrQuestionCategory}
                        />

                        {/* Confidence for HR */}
                        <div>
                            <label className="block text-sm font-semibold text-text-primary mb-1">
                                Confidence Level
                            </label>
                            <p className="text-xs text-text-tertiary mb-3">
                                How authentic and specific does this answer feel now?
                            </p>
                            <div className="flex gap-3 flex-wrap">
                                {CONFIDENCE_LEVELS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setHrConfidence(c.value)}
                                        className={cn(
                                            'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                                            'transition-all duration-150 min-w-[80px]',
                                            hrConfidence === c.value
                                                ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                                : 'bg-surface-3 border-border-default hover:border-border-strong'
                                        )}
                                    >
                                        <span className="text-2xl">{c.emoji}</span>
                                        <span className={cn(
                                            'text-[10px] font-bold text-center leading-tight',
                                            hrConfidence === c.value ? c.color : 'text-text-tertiary'
                                        )}>
                                            {c.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                ) : isTKRound ? (
                    <>
                        <TechnicalKnowledgeEditWorkspace
                            tkData={tkData}
                            onTkDataChange={setTkData}
                        />
                        {/* Confidence for TK */}
                        <div>
                            <label className="block text-sm font-semibold text-text-primary mb-1">
                                Confidence Level
                            </label>
                            <p className="text-xs text-text-tertiary mb-3">
                                How deep is your understanding? Could you answer a follow-up on the mechanism without notes?
                            </p>
                            <div className="flex gap-3 flex-wrap">
                                {CONFIDENCE_LEVELS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setTkConfidence(c.value)}
                                        className={cn(
                                            'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border',
                                            'transition-all duration-150 min-w-[80px]',
                                            tkConfidence === c.value
                                                ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                                : 'bg-surface-3 border-border-default hover:border-border-strong'
                                        )}
                                    >
                                        <span className="text-2xl">{c.emoji}</span>
                                        <span className={cn(
                                            'text-[10px] font-bold text-center leading-tight',
                                            tkConfidence === c.value ? c.color : 'text-text-tertiary'
                                        )}>
                                            {c.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    // ── Non-HR: existing generic form ──────────────────
                    <>
                        {/* Pattern */}
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
                                            pattern: formData.pattern === p.label ? '' : p.label
                                        })}
                                        className={cn(
                                            'text-left px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                                            formData.pattern === p.label
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
                                value={!PATTERNS.some(p => p.label === formData.pattern) ? formData.pattern : ''}
                                onChange={e => updateFormData({ pattern: e.target.value })}
                                className="w-full bg-surface-3 border border-border-strong rounded-xl
                                           text-sm text-text-primary placeholder:text-text-tertiary
                                           px-3.5 py-2.5 outline-none
                                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                        </div>

                        {/* Solutions */}
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

                        {/* Reflection */}
                        <div className="space-y-5">
                            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                <span>🔬</span> Reflection
                            </h3>
                            <div className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5">
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center justify-center text-base flex-shrink-0 mt-0.5">💡</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-text-primary mb-0.5">Key Insight</h4>
                                        <p className="text-xs text-text-tertiary">In one sentence — what makes this problem click?</p>
                                    </div>
                                </div>
                                <textarea
                                    rows={2}
                                    value={formData.keyInsight || ''}
                                    onChange={e => updateFormData({ keyInsight: e.target.value })}
                                    placeholder="e.g. The trick is realizing you only need to track the running max..."
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-tertiary px-3.5 py-2.5 outline-none resize-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>
                            <div className="bg-surface-2 border border-border-default rounded-2xl p-5">
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center text-base flex-shrink-0 mt-0.5">🗣</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-text-primary mb-0.5">Explain It Simply</h4>
                                        <p className="text-xs text-text-tertiary">Explain to a non-programmer.</p>
                                    </div>
                                </div>
                                <RichTextEditor
                                    placeholder="e.g. Imagine you're looking for two people..."
                                    content={formData.feynmanExplanation || ''}
                                    onChange={val => updateFormData({ feynmanExplanation: val })}
                                    minHeight="80px"
                                />
                            </div>
                            <div className="bg-surface-2 border border-border-default rounded-2xl p-5">
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center text-base flex-shrink-0 mt-0.5">🌍</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-text-primary mb-0.5">Real World Connection</h4>
                                        <p className="text-xs text-text-tertiary">Where does this pattern appear in real systems?</p>
                                    </div>
                                </div>
                                <RichTextEditor
                                    placeholder="e.g. Hash maps are used in database indexing..."
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
                                                'flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border transition-all duration-150 min-w-[80px]',
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
                        </div>
                    </>
                )}

                {/* Follow-up questions — all categories */}
                {problem?.followUpQuestions?.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                <span>{isHR ? '💬' : '🧠'}</span>
                                {isHR ? 'Probing Follow-ups' : 'Follow-up Questions'}
                            </h3>
                            <span className={cn(
                                'text-[9px] font-bold px-1.5 py-px rounded-full border',
                                answeredCount > 0
                                    ? 'bg-success/10 text-success border-success/25'
                                    : 'bg-brand-400/10 text-brand-300 border-brand-400/25'
                            )}>
                                {answeredCount > 0 ? `${answeredCount}/${followUpCount} answered` : 'Optional'}
                            </span>
                        </div>
                        {isHR && (
                            <p className="text-xs text-text-tertiary">
                                Your previous answers are pre-filled. Refine them to improve your AI review.
                            </p>
                        )}
                        <div className="space-y-3">
                            {problem.followUpQuestions.map((fq, i) => (
                                <FollowUpWithAnswer
                                    key={fq.id}
                                    followUp={fq}
                                    index={i}
                                    answer={followUpAnswers[fq.id] || ''}
                                    onAnswerChange={handleFollowUpAnswer}
                                    isHR={isHR}
                                />
                            ))}
                        </div>
                        {followUpCount > 0 && (
                            <div className="pt-3 border-t border-border-subtle">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="text-text-disabled">Progress</span>
                                    <span className={cn(
                                        'font-semibold',
                                        answeredCount === followUpCount ? 'text-success'
                                            : answeredCount > 0 ? 'text-brand-300'
                                                : 'text-text-disabled'
                                    )}>
                                        {answeredCount}/{followUpCount} answered
                                        {!isHR && answeredCount > 0 && ` (+${Math.min(answeredCount * 0.5, 2).toFixed(1)} bonus)`}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                    <motion.div
                                        animate={{ width: `${followUpCount > 0 ? (answeredCount / followUpCount) * 100 : 0}%` }}
                                        transition={{ duration: 0.4 }}
                                        className={cn('h-full rounded-full', answeredCount === followUpCount ? 'bg-success' : 'bg-brand-400')}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Submit */}
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
                        {isHR ? 'Save Answer' : isTechnicalKnowledge ? 'Save Explanation' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </div>
    )
}