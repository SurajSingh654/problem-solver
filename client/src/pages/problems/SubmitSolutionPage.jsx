// ============================================================================
// ProbSolver v3.0 — Submit Solution Page
// ============================================================================
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useSubmitSolution } from '@hooks/useSolutions'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { CodeEditor, SUBMIT_LANGUAGES } from '@components/ui/CodeEditor'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'
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

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── External link categories ───────────────────────────
// Only CODING and SQL have external canonical problem sources.
// All other categories are self-contained.
const EXTERNAL_LINK_CATEGORIES = ['CODING', 'SQL']

// ── Section wrapper ────────────────────────────────────
function FormSection({ icon, title, hint, badge, required, children, className }) {
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
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
                        {required && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                             bg-danger/10 text-danger border border-danger/20">
                                Required
                            </span>
                        )}
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
function FollowUpWithAnswer({ followUp, index, answer, onAnswerChange, isHR = false }) {
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
                {/* HR: show stakes label instead of Easy/Medium/Hard */}
                {isHR ? (
                    <span className={cn(
                        'text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0',
                        HR_STAKES[followUp.difficulty]?.bg
                    )}>
                        <span className={HR_STAKES[followUp.difficulty]?.color}>
                            {HR_STAKES[followUp.difficulty]?.label || followUp.difficulty}
                        </span>
                    </span>
                ) : (
                    <Badge
                        variant={DIFF_VARIANT[followUp.difficulty] || 'brand'}
                        size="xs"
                        className="flex-shrink-0"
                    >
                        {followUp.difficulty}
                    </Badge>
                )}
            </div>
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
            <div className="ml-7">
                <textarea
                    rows={isHR ? 4 : 3}
                    value={answer || ''}
                    onChange={e => onAnswerChange(followUp.id, e.target.value)}
                    placeholder={
                        isHR
                            ? 'Prepare your specific answer to this follow-up question...'
                            : followUp.difficulty === 'EASY'
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
// HR WORKSPACE
//
// Replaces the generic form entirely for HR category.
// Four purposeful sections matching real HR interview prep:
//   Analyze → Answer → Tailor → Reflect
//
// No code editor. No pattern chips. No algorithm suggestions.
// No difficulty badge (replaced by stakes on the view page).
//
// Research basis: HR answers fail when candidates answer the surface
// question without understanding the real concern. The form forces
// the metacognitive step before writing.
// ══════════════════════════════════════════════════════
function HRWorkspace({ hrData, onHrDataChange, questionCategory, onQuestionCategoryChange }) {
    const [activeSection, setActiveSection] = useState('underlyingConcern')

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

    const requiredComplete = sections
        .filter(s => s.required)
        .every(s => (hrData[s.key]?.trim?.()?.length ?? 0) > 20)

    return (
        <div className="space-y-4">
            {/* Progress header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🤝</span> HR Answer Workspace
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
                {/* Section navigation */}
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
                                    isActive
                                        ? s.activeBg
                                        : isDone
                                            ? 'bg-success/5 border-success/20'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong'
                                )}
                            >
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {s.required && !isDone && (
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
            {/* Warning when required sections empty but user has scrolled past them */}
            {completedCount === 0 && (
                <p className="text-[10px] text-warning flex items-center gap-1.5 mt-2">
                    <span>⚠️</span>
                    Fill in <strong>Analyze</strong> or <strong>Answer</strong> sections above before submitting
                </p>
            )}

            {/* Active section panel */}
            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                {/* Section header */}
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
                        <p className="text-[11px] text-text-disabled">
                            {activeSectionConfig.sublabel}
                        </p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>

                {/* Section content */}
                <div className="p-5">
                    {fieldConfigs[activeSection]?.hint && (
                        <p className="text-[11px] text-text-tertiary leading-relaxed
                                       bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 mb-3">
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

                {/* Prev / Next footer */}
                <div className="flex items-center justify-between px-5 py-3
                                border-t border-border-default bg-surface-1/50">
                    <button
                        type="button"
                        onClick={() => {
                            if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key)
                        }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Previous
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (activeIndex < sections.length - 1) {
                                setActiveSection(sections[activeIndex + 1].key)
                            }
                        }}
                        disabled={activeIndex === sections.length - 1}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1"
                    >
                        Next
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>
                </div>
            </motion.div>

            {/* Question Category selector — separate from the main workspace sections */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <p className="text-xs font-bold text-text-primary mb-1 flex items-center gap-2">
                    <span>🏷️</span> Question Category
                    <span className="text-[9px] font-normal text-text-disabled">optional — for tracking</span>
                </p>
                <p className="text-[11px] text-text-tertiary mb-3">
                    Categorizing this question helps track which types of HR questions you have prepared for.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {HR_QUESTION_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => onQuestionCategoryChange(
                                questionCategory === cat.id ? '' : cat.id
                            )}
                            className={cn(
                                'flex items-start gap-2 p-3 rounded-xl border text-left transition-all',
                                questionCategory === cat.id
                                    ? `${cat.bg} font-bold`
                                    : 'bg-surface-3 border-border-default hover:border-border-strong'
                            )}
                        >
                            <span className="text-base flex-shrink-0 mt-0.5">{cat.icon}</span>
                            <div className="min-w-0">
                                <p className={cn(
                                    'text-[10px] font-bold block leading-tight',
                                    questionCategory === cat.id ? cat.color : 'text-text-secondary'
                                )}>
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

// ══════════════════════════════════════════════════════
// SYSTEM DESIGN WORKSPACE
// ══════════════════════════════════════════════════════
function SystemDesignWorkspace({ sdData, onSdDataChange, diagramData, onDiagramChange }) {
    const [activeSection, setActiveSection] = useState('functionalRequirements')

    function update(field, value) {
        onSdDataChange({ ...sdData, [field]: value })
    }

    const sdConfig = getCategoryForm('SYSTEM_DESIGN')
    const fieldConfigs = sdConfig.sdFields || {}

    const sections = [
        { key: 'functionalRequirements', label: 'Requirements', icon: '📋', sublabel: 'What the system must do', color: 'text-brand-300', activeBg: 'bg-brand-400/10 border-brand-400/30' },
        { key: 'nonFunctionalRequirements', label: 'Non-Functional', icon: '⚙️', sublabel: 'Scale, latency, availability', color: 'text-info', activeBg: 'bg-info/10 border-info/30' },
        { key: 'capacityEstimation', label: 'Estimation', icon: '🔢', sublabel: 'Back-of-envelope math', color: 'text-warning', activeBg: 'bg-warning/10 border-warning/30' },
        { key: 'apiDesign', label: 'API Design', icon: '🔌', sublabel: 'Endpoints and contracts', color: 'text-success', activeBg: 'bg-success/10 border-success/30' },
        { key: 'schemaDesign', label: 'Schema', icon: '🗄️', sublabel: 'Database tables/collections', color: 'text-purple-400', activeBg: 'bg-purple-400/10 border-purple-400/30' },
        { key: 'architecture', label: 'Architecture', icon: '🏗️', sublabel: 'Diagram + description', color: 'text-orange-400', activeBg: 'bg-orange-400/10 border-orange-400/30' },
        { key: 'tradeoffReasoning', label: 'Trade-offs', icon: '⚖️', sublabel: 'Decisions and why', color: 'text-danger', activeBg: 'bg-danger/10 border-danger/30' },
        { key: 'failureModes', label: 'Failure Modes', icon: '🔥', sublabel: 'What breaks and mitigations', color: 'text-warning', activeBg: 'bg-warning/10 border-warning/30' },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)

    const completedCount = sections.filter(s =>
        s.key === 'architecture'
            ? diagramData && (diagramData?.elements?.length > 0 || Object.keys(diagramData || {}).length > 0)
            : (sdData[s.key]?.trim?.()?.length ?? 0) > 30
    ).length

    return (
        <div className="space-y-4">
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🏗️</span> System Design Workspace
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">
                        {completedCount}/{sections.length} sections filled
                    </span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className="h-full bg-brand-400 rounded-full"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const isDone = s.key === 'architecture'
                            ? diagramData && (diagramData?.elements?.length > 0 || Object.keys(diagramData || {}).length > 0)
                            : (sdData[s.key]?.trim?.()?.length ?? 0) > 30
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn(
                                    'flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border',
                                    'transition-all duration-150 min-w-[72px]',
                                    isActive ? s.activeBg : isDone ? 'bg-success/5 border-success/20' : 'bg-surface-3 border-border-default hover:border-border-strong'
                                )}
                            >
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {isDone && !isActive && <span className="text-success text-[9px] font-bold">✓</span>}
                                </div>
                                <span className={cn('text-[9px] font-bold uppercase tracking-wider text-center leading-tight', isActive ? s.color : isDone ? 'text-success' : 'text-text-disabled')}>
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
                <div className={cn('flex items-center gap-3 px-5 py-4 border-b border-border-default', activeSectionConfig.activeBg)}>
                    <span className="text-xl">{activeSectionConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-bold', activeSectionConfig.color)}>{activeSectionConfig.label}</p>
                        <p className="text-[11px] text-text-disabled">{activeSectionConfig.sublabel}</p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">{activeIndex + 1} / {sections.length}</span>
                </div>
                <div className="p-5">
                    {activeSection === 'architecture' ? (
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-bold text-text-primary mb-1">Architecture Diagram</p>
                                <p className="text-[11px] text-text-tertiary mb-3">Draw your system components, data flows, and service boundaries. Label every box.</p>
                                <div className="h-[420px] border border-border-default rounded-xl overflow-hidden bg-surface-0">
                                    <ExcalidrawEditor onChange={onDiagramChange} initialData={diagramData} />
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-text-primary mb-1">
                                    Architecture Description
                                    <span className="ml-1.5 text-text-disabled font-normal text-[10px]">optional</span>
                                </p>
                                {fieldConfigs.architectureNotes?.hint && (
                                    <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2 mb-2">
                                        💡 {fieldConfigs.architectureNotes.hint}
                                    </p>
                                )}
                                <textarea
                                    rows={6}
                                    value={sdData.architectureNotes || ''}
                                    onChange={e => update('architectureNotes', e.target.value)}
                                    placeholder={fieldConfigs.architectureNotes?.placeholder || 'Describe your architecture...'}
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                    style={{ minHeight: '120px' }}
                                />
                            </div>
                        </div>
                    ) : fieldConfigs[activeSection]?.isCode ? (
                        <div className="space-y-3">
                            {fieldConfigs[activeSection]?.hint && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                    💡 {fieldConfigs[activeSection].hint}
                                </p>
                            )}
                            <textarea
                                rows={fieldConfigs[activeSection]?.rows || 12}
                                value={sdData[activeSection] || ''}
                                onChange={e => update(activeSection, e.target.value)}
                                placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                                className="w-full bg-surface-0 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled font-mono px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                style={{ minHeight: '280px' }}
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {fieldConfigs[activeSection]?.hint && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                    💡 {fieldConfigs[activeSection].hint}
                                </p>
                            )}
                            <textarea
                                rows={fieldConfigs[activeSection]?.rows || 8}
                                value={sdData[activeSection] || ''}
                                onChange={e => update(activeSection, e.target.value)}
                                placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                                className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 8) * 24}px` }}
                            />
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-border-default bg-surface-1/50">
                    <button type="button" onClick={() => { if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key) }} disabled={activeIndex === 0} className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        Previous
                    </button>
                    <button type="button" onClick={() => { if (activeIndex < sections.length - 1) setActiveSection(sections[activeIndex + 1].key) }} disabled={activeIndex === sections.length - 1} className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        Next
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// LOW-LEVEL DESIGN WORKSPACE
// ══════════════════════════════════════════════════════
function LLDWorkspace({ lldData, onLldDataChange, code, onCodeChange, language, onLanguageChange }) {
    const [activeSection, setActiveSection] = useState('entities')

    function update(field, value) {
        onLldDataChange({ ...lldData, [field]: value })
    }

    const lldConfig = getCategoryForm('LOW_LEVEL_DESIGN')
    const fieldConfigs = lldConfig.lldFields || {}

    const sections = [
        { key: 'entities', label: 'Entities', icon: '📦', sublabel: 'Classes, interfaces, responsibilities', color: 'text-purple-400', activeBg: 'bg-purple-400/10 border-purple-400/30' },
        { key: 'classHierarchy', label: 'Hierarchy', icon: '🗂️', sublabel: 'Inheritance, composition, interfaces', color: 'text-brand-300', activeBg: 'bg-brand-400/10 border-brand-400/30' },
        { key: 'implementation', label: 'Code', icon: '💻', sublabel: 'Class implementations', color: 'text-success', activeBg: 'bg-success/10 border-success/30' },
        { key: 'designPattern', label: 'Patterns', icon: '🧩', sublabel: 'Which pattern and why', color: 'text-warning', activeBg: 'bg-warning/10 border-warning/30' },
        { key: 'solidAnalysis', label: 'SOLID', icon: '🏛️', sublabel: 'Principles satisfied and violated', color: 'text-info', activeBg: 'bg-info/10 border-info/30' },
        { key: 'extensibilityAnalysis', label: 'Extensibility', icon: '🔬', sublabel: 'Follow-up requirement analysis', color: 'text-danger', activeBg: 'bg-danger/10 border-danger/30' },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)

    const completedCount = sections.filter(s => {
        if (s.key === 'implementation') return (code?.trim?.()?.length ?? 0) > 30
        return (lldData[s.key]?.trim?.()?.length ?? 0) > 30
    }).length

    return (
        <div className="space-y-4">
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🔧</span> Low-Level Design Workspace
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">
                        {completedCount}/{sections.length} sections filled
                    </span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className="h-full bg-purple-400 rounded-full"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const isDone = s.key === 'implementation'
                            ? (code?.trim?.()?.length ?? 0) > 30
                            : (lldData[s.key]?.trim?.()?.length ?? 0) > 30
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn('flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all duration-150 min-w-[72px]', isActive ? s.activeBg : isDone ? 'bg-success/5 border-success/20' : 'bg-surface-3 border-border-default hover:border-border-strong')}
                            >
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {isDone && !isActive && <span className="text-success text-[9px] font-bold">✓</span>}
                                </div>
                                <span className={cn('text-[9px] font-bold uppercase tracking-wider text-center leading-tight', isActive ? s.color : isDone ? 'text-success' : 'text-text-disabled')}>
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
                <div className={cn('flex items-center gap-3 px-5 py-4 border-b border-border-default', activeSectionConfig.activeBg)}>
                    <span className="text-xl">{activeSectionConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-bold', activeSectionConfig.color)}>{activeSectionConfig.label}</p>
                        <p className="text-[11px] text-text-disabled">{activeSectionConfig.sublabel}</p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">{activeIndex + 1} / {sections.length}</span>
                </div>
                <div className="p-5">
                    {activeSection === 'implementation' ? (
                        <div className="space-y-3">
                            <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                💡 Write your key class implementations. Focus on constructors, core methods, and relationships. You don't need every method — focus on the design-critical parts.
                            </p>
                            <CodeEditor
                                code={code}
                                onChange={onCodeChange}
                                language={language}
                                onLanguageChange={lang => { onLanguageChange(lang); localStorage.setItem('ps_last_language', lang) }}
                                selectorStyle="dropdown"
                                languages={SUBMIT_LANGUAGES}
                                height="400px"
                                showLanguageSelector
                            />
                        </div>
                    ) : fieldConfigs[activeSection]?.isCode ? (
                        <div className="space-y-3">
                            {fieldConfigs[activeSection]?.hint && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                    💡 {fieldConfigs[activeSection].hint}
                                </p>
                            )}
                            <textarea rows={fieldConfigs[activeSection]?.rows || 12} value={lldData[activeSection] || ''} onChange={e => update(activeSection, e.target.value)} placeholder={fieldConfigs[activeSection]?.placeholder || ''} className="w-full bg-surface-0 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled font-mono px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20" style={{ minHeight: '280px' }} />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {fieldConfigs[activeSection]?.hint && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                    💡 {fieldConfigs[activeSection].hint}
                                </p>
                            )}
                            <textarea rows={fieldConfigs[activeSection]?.rows || 10} value={lldData[activeSection] || ''} onChange={e => update(activeSection, e.target.value)} placeholder={fieldConfigs[activeSection]?.placeholder || ''} className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20" style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 10) * 24}px` }} />
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-border-default bg-surface-1/50">
                    <button type="button" onClick={() => { if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key) }} disabled={activeIndex === 0} className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        Previous
                    </button>
                    <button type="button" onClick={() => { if (activeIndex < sections.length - 1) setActiveSection(sections[activeIndex + 1].key) }} disabled={activeIndex === sections.length - 1} className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        Next
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// BEHAVIORAL WORKSPACE
//
// Replaces the generic form for BEHAVIORAL category.
// Five sections following the STAR framework — each section
// is a named, purposeful step grounded in behavioral psychology.
//
// Key structural difference from the old generic form:
//   The Action field (showActionSection / actionField) was defined
//   in categoryForms.js but never rendered in the generic path.
//   Every behavioral submission on this platform has been evaluated
//   without the Action component of STAR. This workspace fixes that.
//
// Data stored in categorySpecificData JSON column:
//   { competency, situation, action, result, reflection }
//
// The `pattern` Solution column stores the competency value —
// consistent with HR using `pattern` for hrQuestionCategory.
// This preserves leaderboard, RAG, and 6D dimension signals.
// ══════════════════════════════════════════════════════
function BehavioralWorkspace({ behavioralData, onBehavioralDataChange }) {
    const [activeSection, setActiveSection] = useState('competency')

    function update(field, value) {
        onBehavioralDataChange({ ...behavioralData, [field]: value })
    }

    const behavioralConfig = getCategoryForm('BEHAVIORAL')
    const fieldConfigs = behavioralConfig.behavioralFields || {}

    // Section definitions — order matters.
    // Competency is forced first: metacognitive framing before narrative.
    // Reflection is last: synthesis only happens after the full story is told.
    const sections = [
        {
            key: 'competency',
            label: 'Competency',
            icon: '🎯',
            sublabel: 'What is this question really testing?',
            color: 'text-success',
            activeBg: 'bg-success/10 border-success/30',
            required: true,
        },
        {
            key: 'situation',
            label: 'Situation',
            icon: '📖',
            sublabel: 'Set the scene — specific and scoped',
            color: 'text-brand-300',
            activeBg: 'bg-brand-400/10 border-brand-400/30',
            required: true,
        },
        {
            key: 'action',
            label: 'Action',
            icon: '⚡',
            sublabel: 'What YOU did — use "I" not "we"',
            color: 'text-warning',
            activeBg: 'bg-warning/10 border-warning/30',
            required: true,
        },
        {
            key: 'result',
            label: 'Result',
            icon: '📊',
            sublabel: 'Quantified outcome and impact',
            color: 'text-info',
            activeBg: 'bg-info/10 border-info/30',
            required: false,
        },
        {
            key: 'reflection',
            label: 'Reflection',
            icon: '🔬',
            sublabel: 'Learning and what you\'d change',
            color: 'text-purple-400',
            activeBg: 'bg-purple-400/10 border-purple-400/30',
            required: false,
        },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)

    // A section is "done" when it has meaningful content.
    // 30-char threshold matches HR and LLD workspace consistency.
    const completedCount = sections.filter(s =>
        (behavioralData[s.key]?.trim?.()?.length ?? 0) > 30
    ).length

    const requiredSections = sections.filter(s => s.required)
    const requiredComplete = requiredSections.every(s =>
        (behavioralData[s.key]?.trim?.()?.length ?? 0) > 30
    )

    // Character count for the active section — coaching signal
    const activeCharCount = (behavioralData[activeSection]?.trim?.()?.length ?? 0)

    // Minimum viable answer thresholds by section (characters)
    // Grounded in average spoken word count for strong STAR answers:
    //   Competency: 100–300 chars (2–5 sentences of analysis)
    //   Situation:  300–600 chars (sets real context)
    //   Action:     600–1200 chars (step-by-step, most substance)
    //   Result:     150–400 chars (quantified, concise)
    //   Reflection: 200–500 chars (genuine, not performative)
    const minThresholds = {
        competency: 100,
        situation: 300,
        action: 600,
        result: 150,
        reflection: 200,
    }

    const threshold = minThresholds[activeSection] || 100
    const isShort = activeCharCount > 0 && activeCharCount < threshold
    const progressPct = Math.min(100, (activeCharCount / threshold) * 100)

    return (
        <div className="space-y-4">
            {/* Progress header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🗣️</span> STAR Workspace
                    </p>
                    <div className="flex items-center gap-2">
                        {requiredComplete && (
                            <span className="text-[10px] font-bold text-success flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="3"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Core complete
                            </span>
                        )}
                        <span className="text-[10px] font-bold text-text-disabled">
                            {completedCount}/{sections.length} sections
                        </span>
                    </div>
                </div>

                {/* Overall progress bar */}
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className="h-full bg-success rounded-full"
                    />
                </div>

                {/* Section navigation tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const isDone = (behavioralData[s.key]?.trim?.()?.length ?? 0) > 30
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn(
                                    'flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border',
                                    'transition-all duration-150 min-w-[72px]',
                                    isActive
                                        ? s.activeBg
                                        : isDone
                                            ? 'bg-success/5 border-success/20'
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

            {/* STAR framework reminder — collapses once all required sections are touched */}
            {!requiredComplete && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-success/3 border border-success/15 rounded-xl px-4 py-3
                               flex items-start gap-3"
                >
                    <span className="text-base flex-shrink-0 mt-0.5">💡</span>
                    <div>
                        <p className="text-xs font-semibold text-text-primary mb-1">
                            Fill sections in order for the strongest answer
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            Naming the <strong>Competency</strong> first is the most important step — it prevents you
                            from answering the surface question instead of the real one. Most candidates skip it and
                            give generic answers as a result.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Active section panel */}
            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                {/* Section header */}
                <div className={cn(
                    'flex items-center gap-3 px-5 py-4 border-b border-border-default',
                    activeSectionConfig.activeBg
                )}>
                    <span className="text-xl">{activeSectionConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
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
                            {!activeSectionConfig.required && (
                                <span className="text-[9px] font-bold text-text-disabled
                                                 bg-surface-3 border border-border-default
                                                 px-1.5 py-px rounded-full">
                                    High signal
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-disabled">
                            {activeSectionConfig.sublabel}
                        </p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>

                <div className="p-5 space-y-3">
                    {/* Coaching hint */}
                    {fieldConfigs[activeSection]?.hint && (
                        <p className="text-[11px] text-text-tertiary leading-relaxed
                                       bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                            💡 {fieldConfigs[activeSection].hint}
                        </p>
                    )}

                    {/* Text area */}
                    <textarea
                        rows={fieldConfigs[activeSection]?.rows || 10}
                        value={behavioralData[activeSection] || ''}
                        onChange={e => update(activeSection, e.target.value)}
                        placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                   text-sm text-text-primary placeholder:text-text-disabled
                                   px-3.5 py-2.5 outline-none resize-y leading-relaxed
                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 10) * 24}px` }}
                    />

                    {/* Per-section depth indicator */}
                    {activeCharCount > 0 && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className={cn(
                                    'font-semibold',
                                    activeCharCount >= threshold
                                        ? 'text-success'
                                        : isShort
                                            ? 'text-warning'
                                            : 'text-text-disabled'
                                )}>
                                    {activeCharCount >= threshold
                                        ? '✓ Good depth'
                                        : isShort
                                            ? `Still shallow — aim for ${threshold - activeCharCount} more chars`
                                            : 'Keep going...'}
                                </span>
                                <span className="text-text-disabled tabular-nums">
                                    {activeCharCount} / ~{threshold}
                                </span>
                            </div>
                            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                <motion.div
                                    animate={{ width: `${progressPct}%` }}
                                    transition={{ duration: 0.3 }}
                                    className={cn(
                                        'h-full rounded-full',
                                        activeCharCount >= threshold
                                            ? 'bg-success'
                                            : 'bg-warning'
                                    )}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Prev / Next navigation footer */}
                <div className="flex items-center justify-between px-5 py-3
                                border-t border-border-default bg-surface-1/50">
                    <button
                        type="button"
                        onClick={() => {
                            if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key)
                        }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Previous
                    </button>

                    {/* Jump to next incomplete required section shortcut */}
                    {activeIndex < sections.length - 1 && (
                        <button
                            type="button"
                            onClick={() => setActiveSection(sections[activeIndex + 1].key)}
                            className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                       transition-colors flex items-center gap-1"
                        >
                            Next
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// TECHNICAL KNOWLEDGE WORKSPACE
//
// Replaces the generic form for CS_FUNDAMENTALS category.
// Five sections enforcing the three evaluation dimensions
// that interviewers use for Technical Knowledge questions:
//   Mechanism Depth → Trade-off Awareness → Real-world Anchoring
//
// Data stored in categorySpecificData JSON column:
//   { subject, coreExplanation, whyItExists, tradeoffs, realWorldUsage }
//
// The `pattern` Solution column stores the subject value —
// consistent with Behavioral using `pattern` for competency
// and HR using `pattern` for hrQuestionCategory.
// This preserves RAG retrieval and 6D dimension signals.
//
// Subject suggestions cover all seven TK domains grounded in
// what tier-1 companies actually test in Technical Knowledge rounds.
// ══════════════════════════════════════════════════════
const TK_SUBJECT_SUGGESTIONS = [
    // Operating Systems
    { label: 'Process vs Thread', subject: 'Operating Systems' },
    { label: 'Virtual Memory & Page Faults', subject: 'Operating Systems' },
    { label: 'Deadlocks & Prevention', subject: 'Operating Systems' },
    { label: 'CPU Scheduling', subject: 'Operating Systems' },
    { label: 'Concurrency Primitives', subject: 'Operating Systems' },
    // Computer Networking
    { label: 'TCP vs UDP', subject: 'Networking' },
    { label: 'TCP 3-Way Handshake', subject: 'Networking' },
    { label: 'HTTP/HTTPS/HTTP2/HTTP3', subject: 'Networking' },
    { label: 'DNS Resolution', subject: 'Networking' },
    { label: 'Load Balancing Strategies', subject: 'Networking' },
    { label: 'CDN Architecture', subject: 'Networking' },
    { label: 'TLS Handshake', subject: 'Networking' },
    // Database Internals
    { label: 'ACID Properties', subject: 'Database Internals' },
    { label: 'Transaction Isolation Levels', subject: 'Database Internals' },
    { label: 'B-Tree Index Mechanics', subject: 'Database Internals' },
    { label: 'CAP Theorem', subject: 'Database Internals' },
    { label: 'Sharding vs Replication', subject: 'Database Internals' },
    { label: 'NoSQL Trade-offs', subject: 'Database Internals' },
    // DSA Conceptual
    { label: 'Why HashMap is O(1) Amortized', subject: 'DSA Concepts' },
    { label: 'Consistent Hashing', subject: 'DSA Concepts' },
    { label: 'Bloom Filters', subject: 'DSA Concepts' },
    { label: 'LRU Cache Implementation', subject: 'DSA Concepts' },
    // Distributed Systems
    { label: 'Consistency Models', subject: 'Distributed Systems' },
    { label: 'Consensus (Raft/Paxos)', subject: 'Distributed Systems' },
    { label: 'Idempotency', subject: 'Distributed Systems' },
    { label: 'Rate Limiting Algorithms', subject: 'Distributed Systems' },
    { label: 'Message Queue Delivery Guarantees', subject: 'Distributed Systems' },
    // AI/ML
    { label: 'Gradient Descent & Learning Rate', subject: 'AI/ML' },
    { label: 'Overfitting vs Underfitting', subject: 'AI/ML' },
    { label: 'Vector Embeddings', subject: 'AI/ML' },
    { label: 'Transformer Architecture', subject: 'AI/ML' },
    // Data Engineering
    { label: 'Batch vs Stream Processing', subject: 'Data Engineering' },
    { label: 'ETL vs ELT', subject: 'Data Engineering' },
    { label: 'Columnar Storage (Parquet)', subject: 'Data Engineering' },
    { label: 'Apache Kafka Architecture', subject: 'Data Engineering' },
]

// Group suggestions by subject for display
const TK_SUBJECT_GROUPS = TK_SUBJECT_SUGGESTIONS.reduce((acc, item) => {
    if (!acc[item.subject]) acc[item.subject] = []
    acc[item.subject].push(item.label)
    return acc
}, {})

function TechnicalKnowledgeWorkspace({ tkData, onTkDataChange }) {
    const [activeSection, setActiveSection] = useState('subject')
    const [showSubjectPicker, setShowSubjectPicker] = useState(true)

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
            sublabel: 'What it sacrifices, when to choose differently',
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

    // Completion threshold per section in characters
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

    const activeCharCount = (tkData[activeSection]?.trim?.()?.length ?? 0)
    const threshold = minThresholds[activeSection] || 200
    const isShort = activeCharCount > 0 && activeCharCount < threshold
    const progressPct = Math.min(100, (activeCharCount / threshold) * 100)

    // Subject picker only shown when subject section is active
    const isSubjectActive = activeSection === 'subject'

    return (
        <div className="space-y-4">
            {/* Progress header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>🧠</span> Technical Knowledge Workspace
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">
                        {completedCount}/{sections.length} sections
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
                                    isActive
                                        ? s.activeBg
                                        : isDone
                                            ? 'bg-success/5 border-success/20'
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

            {/* Depth reminder — collapses once mechanism section is filled */}
            {!(tkData.coreExplanation?.trim?.()?.length > 100) && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-warning/3 border border-warning/15 rounded-xl px-4 py-3
                               flex items-start gap-3"
                >
                    <span className="text-base flex-shrink-0 mt-0.5">⚙️</span>
                    <div>
                        <p className="text-xs font-semibold text-text-primary mb-1">
                            Explain the mechanism, not the definition
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            Definitions come from textbooks. Mechanisms come from understanding.
                            Interviewers probe until you hit your ceiling — start deep.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Active section panel */}
            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                {/* Section header */}
                <div className={cn(
                    'flex items-center gap-3 px-5 py-4 border-b border-border-default',
                    activeSectionConfig.activeBg
                )}>
                    <span className="text-xl">{activeSectionConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
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
                            {!activeSectionConfig.required && (
                                <span className="text-[9px] font-bold text-text-disabled
                                                 bg-surface-3 border border-border-default
                                                 px-1.5 py-px rounded-full">
                                    High signal
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-disabled">
                            {activeSectionConfig.sublabel}
                        </p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>

                <div className="p-5 space-y-3">
                    {/* Coaching hint */}
                    {fieldConfigs[activeSection]?.hint && (
                        <p className="text-[11px] text-text-tertiary leading-relaxed
                                       bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                            💡 {fieldConfigs[activeSection].hint}
                        </p>
                    )}

                    {/* Subject quick-pick — only on subject section */}
                    {isSubjectActive && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    Quick pick a topic
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setShowSubjectPicker(v => !v)}
                                    className="text-[10px] text-brand-300 hover:text-brand-200 transition-colors"
                                >
                                    {showSubjectPicker ? 'Hide' : 'Show topics'}
                                </button>
                            </div>
                            {showSubjectPicker && (
                                <div className="space-y-3">
                                    {Object.entries(TK_SUBJECT_GROUPS).map(([group, items]) => (
                                        <div key={group}>
                                            <p className="text-[9px] font-bold text-text-disabled
                                                           uppercase tracking-widest mb-1.5">
                                                {group}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {items.map(item => (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        onClick={() => {
                                                            update('subject', `${group} — ${item}`)
                                                            setShowSubjectPicker(false)
                                                            setActiveSection('coreExplanation')
                                                        }}
                                                        className={cn(
                                                            'text-[10px] font-semibold px-2.5 py-1 rounded-lg border',
                                                            'transition-all duration-150',
                                                            tkData.subject === `${group} — ${item}`
                                                                ? 'bg-warning/15 border-warning/40 text-warning'
                                                                : 'bg-surface-3 border-border-default text-text-secondary hover:border-warning/30 hover:text-warning'
                                                        )}
                                                    >
                                                        {item}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="border-t border-border-subtle pt-3">
                                <p className="text-[10px] text-text-disabled mb-2">
                                    Or type your own:
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Text area */}
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

                    {/* Per-section depth indicator (not shown on subject section) */}
                    {!isSubjectActive && activeCharCount > 0 && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className={cn(
                                    'font-semibold',
                                    activeCharCount >= threshold
                                        ? 'text-success'
                                        : isShort
                                            ? 'text-warning'
                                            : 'text-text-disabled'
                                )}>
                                    {activeCharCount >= threshold
                                        ? '✓ Good depth'
                                        : isShort
                                            ? `Shallow — aim for ${threshold - activeCharCount} more chars`
                                            : 'Keep going...'}
                                </span>
                                <span className="text-text-disabled tabular-nums">
                                    {activeCharCount} / ~{threshold}
                                </span>
                            </div>
                            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                <motion.div
                                    animate={{ width: `${progressPct}%` }}
                                    transition={{ duration: 0.3 }}
                                    className={cn(
                                        'h-full rounded-full',
                                        activeCharCount >= threshold ? 'bg-success' : 'bg-warning'
                                    )}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Prev / Next navigation */}
                <div className="flex items-center justify-between px-5 py-3
                                border-t border-border-default bg-surface-1/50">
                    <button
                        type="button"
                        onClick={() => {
                            if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key)
                        }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Previous
                    </button>
                    {activeIndex < sections.length - 1 && (
                        <button
                            type="button"
                            onClick={() => setActiveSection(sections[activeIndex + 1].key)}
                            className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                       transition-colors flex items-center gap-1"
                        >
                            Next
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// DATABASE WORKSPACE
//
// Replaces the generic form for SQL/Database category.
// Two modes determined by problem.categoryData.problemType:
//   'QUERY'         → SQL editor + approach + indexing + optimization
//   'SCHEMA_DESIGN' → schema definition + design reasoning + index design
//
// Data stored in categorySpecificData JSON column:
//   Query mode:   { problemType, queryApproach, sqlQuery, indexStrategy, optimizationNotes }
//   Schema mode:  { problemType, schemaDesign, normalizationReasoning, indexDesign, noSQLConsideration }
//
// The `pattern` Solution column stores the query pattern or design pattern
// for RAG retrieval and 6D dimension signals — consistent with other categories.
//
// Schema reference (table definitions + sample data) lives in
// problem.categoryData.schemaDefinition — read-only, set by admin.
// ══════════════════════════════════════════════════════
function DatabaseWorkspace({ dbData, onDbDataChange, problemType, schemaReference }) {
    const [activeSection, setActiveSection] = useState(
        problemType === 'SCHEMA_DESIGN' ? 'schemaDesign' : 'queryApproach'
    )
    const [code, setCode] = useState(dbData.sqlQuery || '')
    const [language, setLanguage] = useState('SQL')
    const [showSchema, setShowSchema] = useState(true)

    function update(field, value) {
        onDbDataChange({ ...dbData, [field]: value })
    }

    function updateCode(val) {
        setCode(val)
        onDbDataChange({ ...dbData, sqlQuery: val })
    }

    const dbConfig = getCategoryForm('SQL')
    const fieldConfigs = dbConfig.databaseFields || {}

    const isQueryMode = problemType !== 'SCHEMA_DESIGN'

    // Sections adapt based on problem type
    const sections = isQueryMode ? [
        {
            key: 'queryApproach',
            label: 'Approach',
            icon: '🧠',
            sublabel: 'Schema analysis and query plan',
            color: 'text-brand-300',
            activeBg: 'bg-brand-400/10 border-brand-400/30',
            required: true,
        },
        {
            key: 'sqlEditor',
            label: 'Query',
            icon: '🗄️',
            sublabel: 'Write your SQL',
            color: 'text-success',
            activeBg: 'bg-success/10 border-success/30',
            required: true,
        },
        {
            key: 'indexStrategy',
            label: 'Indexing',
            icon: '⚡',
            sublabel: 'What indexes you would add and why',
            color: 'text-warning',
            activeBg: 'bg-warning/10 border-warning/30',
            required: false,
        },
        {
            key: 'optimizationNotes',
            label: 'Optimization',
            icon: '⚖️',
            sublabel: 'Performance and edge cases',
            color: 'text-info',
            activeBg: 'bg-info/10 border-info/30',
            required: false,
        },
    ] : [
        {
            key: 'schemaDesign',
            label: 'Schema',
            icon: '🗄️',
            sublabel: 'Table definitions and constraints',
            color: 'text-brand-300',
            activeBg: 'bg-brand-400/10 border-brand-400/30',
            required: true,
        },
        {
            key: 'normalizationReasoning',
            label: 'Decisions',
            icon: '🧠',
            sublabel: 'Normalization and design choices',
            color: 'text-success',
            activeBg: 'bg-success/10 border-success/30',
            required: false,
        },
        {
            key: 'indexDesign',
            label: 'Indexes',
            icon: '⚡',
            sublabel: 'Index design per access pattern',
            color: 'text-warning',
            activeBg: 'bg-warning/10 border-warning/30',
            required: false,
        },
        {
            key: 'noSQLConsideration',
            label: 'NoSQL?',
            icon: '⚖️',
            sublabel: 'Would any part benefit from NoSQL?',
            color: 'text-info',
            activeBg: 'bg-info/10 border-info/30',
            required: false,
        },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)

    const minThresholds = {
        queryApproach: 200,
        sqlEditor: 20,
        indexStrategy: 150,
        optimizationNotes: 150,
        schemaDesign: 300,
        normalizationReasoning: 200,
        indexDesign: 150,
        noSQLConsideration: 100,
    }

    function getSectionValue(key) {
        if (key === 'sqlEditor') return code
        return dbData[key] || ''
    }

    const completedCount = sections.filter(s => {
        const val = getSectionValue(s.key)
        return (val?.trim?.()?.length ?? 0) >= (minThresholds[s.key] || 30)
    }).length

    const activeValue = getSectionValue(activeSection)
    const threshold = minThresholds[activeSection] || 150
    const activeCharCount = activeValue?.trim?.()?.length ?? 0
    const isShort = activeCharCount > 0 && activeCharCount < threshold
    const progressPct = Math.min(100, (activeCharCount / threshold) * 100)

    return (
        <div className="space-y-4">
            {/* Schema reference panel — read-only, visible while solving */}
            {schemaReference && (
                <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowSchema(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-3.5
                                   hover:bg-surface-2/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm">📋</span>
                            <span className="text-xs font-bold text-text-primary">
                                Schema Reference
                            </span>
                            <span className="text-[10px] text-text-disabled bg-surface-3
                                             border border-border-default rounded-full px-2 py-px">
                                Read-only
                            </span>
                        </div>
                        <motion.div
                            animate={{ rotate: showSchema ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-text-disabled"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                        {showSchema && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="px-5 pb-5 border-t border-border-default pt-4">
                                    <pre className="bg-surface-0 border border-border-default
                                                    rounded-xl p-4 text-xs font-mono text-text-secondary
                                                    whitespace-pre-wrap overflow-x-auto leading-relaxed
                                                    max-h-[300px]">
                                        {schemaReference}
                                    </pre>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Progress header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>{isQueryMode ? '🗄️' : '📐'}</span>
                        {isQueryMode ? 'Query Workspace' : 'Schema Design Workspace'}
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">
                        {completedCount}/{sections.length} sections
                    </span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className="h-full bg-brand-300 rounded-full"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const val = getSectionValue(s.key)
                        const isDone = (val?.trim?.()?.length ?? 0) >= (minThresholds[s.key] || 30)
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn(
                                    'flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border',
                                    'transition-all duration-150 min-w-[72px]',
                                    isActive
                                        ? s.activeBg
                                        : isDone
                                            ? 'bg-success/5 border-success/20'
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

            {/* Active section panel */}
            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                {/* Section header */}
                <div className={cn(
                    'flex items-center gap-3 px-5 py-4 border-b border-border-default',
                    activeSectionConfig?.activeBg
                )}>
                    <span className="text-xl">{activeSectionConfig?.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn('text-sm font-bold', activeSectionConfig?.color)}>
                                {activeSectionConfig?.label}
                            </p>
                            {activeSectionConfig?.required && (
                                <span className="text-[9px] font-bold text-danger
                                                 bg-danger/10 border border-danger/20
                                                 px-1.5 py-px rounded-full">
                                    Required
                                </span>
                            )}
                            {!activeSectionConfig?.required && (
                                <span className="text-[9px] font-bold text-text-disabled
                                                 bg-surface-3 border border-border-default
                                                 px-1.5 py-px rounded-full">
                                    High signal
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-disabled">
                            {activeSectionConfig?.sublabel}
                        </p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>

                <div className="p-5 space-y-3">
                    {/* SQL Editor section */}
                    {activeSection === 'sqlEditor' ? (
                        <div className="space-y-2">
                            <p className="text-[11px] text-text-tertiary leading-relaxed
                                           bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                💡 Write your SQL query. The schema reference above is available while you work.
                                AI will evaluate correctness, JOIN logic, NULL handling, index alignment, and optimization.
                            </p>
                            <CodeEditor
                                code={code}
                                onChange={updateCode}
                                language="SQL"
                                onLanguageChange={() => { }}
                                selectorStyle="none"
                                languages={[{ id: 'SQL', label: 'SQL' }]}
                                height="300px"
                                showLanguageSelector={false}
                            />
                            {code.trim().length > 0 && (
                                <p className="text-[10px] text-success flex items-center gap-1">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="3"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Query written — AI will review for correctness, optimization, and edge cases
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Coaching hint */}
                            {fieldConfigs[activeSection]?.hint && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed
                                               bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                    💡 {fieldConfigs[activeSection].hint}
                                </p>
                            )}
                            {/* Text area */}
                            <textarea
                                rows={fieldConfigs[activeSection]?.rows || 8}
                                value={dbData[activeSection] || ''}
                                onChange={e => update(activeSection, e.target.value)}
                                placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                                className={cn(
                                    'w-full border border-border-strong rounded-xl',
                                    'text-sm text-text-primary placeholder:text-text-disabled',
                                    'px-3.5 py-2.5 outline-none resize-y leading-relaxed',
                                    'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
                                    // Schema fields use monospace font — they contain code-like content
                                    (activeSection === 'schemaDesign' || activeSection === 'indexDesign' || activeSection === 'indexStrategy')
                                        ? 'bg-surface-0 font-mono text-xs'
                                        : 'bg-surface-3'
                                )}
                                style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 8) * 24}px` }}
                            />
                            {/* Depth indicator */}
                            {activeCharCount > 0 && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className={cn(
                                            'font-semibold',
                                            activeCharCount >= threshold ? 'text-success'
                                                : isShort ? 'text-warning' : 'text-text-disabled'
                                        )}>
                                            {activeCharCount >= threshold
                                                ? '✓ Good depth'
                                                : isShort
                                                    ? `Shallow — aim for ${threshold - activeCharCount} more chars`
                                                    : 'Keep going...'}
                                        </span>
                                        <span className="text-text-disabled tabular-nums">
                                            {activeCharCount} / ~{threshold}
                                        </span>
                                    </div>
                                    <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                        <motion.div
                                            animate={{ width: `${progressPct}%` }}
                                            transition={{ duration: 0.3 }}
                                            className={cn(
                                                'h-full rounded-full',
                                                activeCharCount >= threshold ? 'bg-success' : 'bg-warning'
                                            )}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Prev / Next navigation */}
                <div className="flex items-center justify-between px-5 py-3
                                border-t border-border-default bg-surface-1/50">
                    <button
                        type="button"
                        onClick={() => {
                            if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key)
                        }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                   flex items-center gap-1"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Previous
                    </button>
                    {activeIndex < sections.length - 1 && (
                        <button
                            type="button"
                            onClick={() => setActiveSection(sections[activeIndex + 1].key)}
                            className="text-xs font-semibold text-text-tertiary hover:text-text-primary
                                       transition-colors flex items-center gap-1"
                        >
                            Next
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
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
    const fields = formConfig.fields || {}

    // Category flags
    const isSystemDesign = category === 'SYSTEM_DESIGN'
    const isLowLevelDesign = category === 'LOW_LEVEL_DESIGN'
    const isHR = category === 'HR'
    const isBehavioral = category === 'BEHAVIORAL'
    const isTechnicalKnowledge = category === 'CS_FUNDAMENTALS'
    const isDatabase = category === 'SQL'
    const dbProblemType = problem?.categoryData?.problemType || 'QUERY'
    const dbSchemaReference = problem?.categoryData?.schemaDefinition || problem?.description || null

    // External links only for CODING and SQL
    const hasExternalLink = !!problem?.categoryData?.sourceUrl &&
        EXTERNAL_LINK_CATEGORIES.includes(category)

    // ── Generic form state ──────────────────────────────
    const [code, setCode] = useState('')
    const [language, setLanguage] = useState(
        localStorage.getItem('ps_last_language') || 'PYTHON'
    )
    const [approach, setApproach] = useState('')
    const [pattern, setPattern] = useState('')
    const [keyInsight, setKeyInsight] = useState('')
    const [feynmanExplanation, setFeynmanExplanation] = useState('')
    const [realWorldConnection, setRealWorldConnection] = useState('')
    const [confidence, setConfidence] = useState(0)
    const [followUpAnswers, setFollowUpAnswers] = useState({})

    // ── System Design workspace state ──────────────────
    const [sdData, setSdData] = useState({
        functionalRequirements: '',
        nonFunctionalRequirements: '',
        capacityEstimation: '',
        apiDesign: '',
        schemaDesign: '',
        architectureNotes: '',
        tradeoffReasoning: '',
        failureModes: '',
    })
    const [sdDiagram, setSdDiagram] = useState(null)

    // ── Low-Level Design workspace state ───────────────
    const [lldData, setLldData] = useState({
        entities: '',
        classHierarchy: '',
        designPattern: '',
        solidAnalysis: '',
        extensibilityAnalysis: '',
    })

    // ── Behavioral workspace state ─────────────────────
    // Stored in categorySpecificData JSON column — same pattern as HR/SD/LLD.
    // `pattern` Solution column stores the competency value for RAG + 6D signals.
    const [behavioralData, setBehavioralData] = useState({
        competency: '',
        situation: '',
        action: '',
        result: '',
        reflection: '',
    })

    // ── HR workspace state ─────────────────────────────
    // Stored in categorySpecificData JSON column on Solution.
    const [hrData, setHrData] = useState({
        underlyingConcern: '',
        answer: '',
        companyConnection: '',
        selfAssessment: '',
    })


    // ── Technical Knowledge workspace state ────────────────
    // Stored in categorySpecificData JSON column.
    // `pattern` Solution column stores the subject value for RAG + 6D signals.
    const [tkData, setTkData] = useState({
        subject: '',
        coreExplanation: '',
        whyItExists: '',
        tradeoffs: '',
        realWorldUsage: '',
    })


    // ── Database workspace state ───────────────────────
    const [dbData, setDbData] = useState({
        queryApproach: '',
        sqlQuery: '',
        indexStrategy: '',
        optimizationNotes: '',
        schemaDesign: '',
        normalizationReasoning: '',
        indexDesign: '',
        noSQLConsideration: '',
    })
    const [hrQuestionCategory, setHrQuestionCategory] = useState('')

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

        // SD validation
        if (isSystemDesign) {
            const hasMinContent =
                (sdData.functionalRequirements?.trim().length ?? 0) > 20 ||
                (sdData.architectureNotes?.trim().length ?? 0) > 20
            if (!hasMinContent) {
                toast.error('Fill in Functional Requirements or Architecture before submitting.')
                return
            }
        }

        // LLD validation
        if (isLowLevelDesign) {
            const hasMinContent =
                (lldData.entities?.trim().length ?? 0) > 20 ||
                (code?.trim().length ?? 0) > 20
            if (!hasMinContent) {
                toast.error('Fill in Entity Identification or write some implementation code before submitting.')
                return
            }
        }

        // HR validation: at least the analysis and answer must be filled
        if (isHR) {
            // Require at least one character in either the analysis or the answer.
            // We do not enforce a length threshold here — the AI reviewer will assess quality.
            // Validation only blocks completely empty submissions to prevent accidental submits.
            const hasAnalysis = (hrData.underlyingConcern?.trim().length ?? 0) > 0
            const hasAnswer = (hrData.answer?.trim().length ?? 0) > 0
            if (!hasAnalysis && !hasAnswer) {
                toast.error(
                    'Your answer workspace is empty. Fill in at least one section before submitting.',
                    { duration: 5000 }
                )
                return
            }
        }

        // Behavioral validation: require at minimum situation OR action.
        // Competency is the ideal first step but we don't hard-block on it —
        // the AI reviewer will flag its absence in the evaluation.
        // We block only fully empty submissions.
        if (isBehavioral) {
            const hasSituation = (behavioralData.situation?.trim().length ?? 0) > 0
            const hasAction = (behavioralData.action?.trim().length ?? 0) > 0
            if (!hasSituation && !hasAction) {
                toast.error(
                    'Your STAR workspace is empty. Fill in at least Situation or Action before submitting.',
                    { duration: 5000 }
                )
                return
            }
        }

        // Technical Knowledge validation: require at minimum subject OR coreExplanation.
        // Block only fully empty submissions — the AI reviewer assesses depth.
        if (isTechnicalKnowledge) {
            const hasSubject = (tkData.subject?.trim().length ?? 0) > 0
            const hasExplanation = (tkData.coreExplanation?.trim().length ?? 0) > 0
            if (!hasSubject && !hasExplanation) {
                toast.error(
                    'Your Technical Knowledge workspace is empty. Fill in at least Subject or Mechanism before submitting.',
                    { duration: 5000 }
                )
                return
            }
        }

        if (isDatabase) {
            const isQueryMode = dbProblemType !== 'SCHEMA_DESIGN'
            const hasQuery = isQueryMode
                ? (dbData.sqlQuery?.trim().length ?? 0) > 0 || (dbData.queryApproach?.trim().length ?? 0) > 0
                : (dbData.schemaDesign?.trim().length ?? 0) > 0
            if (!hasQuery) {
                toast.error(
                    isQueryMode
                        ? 'Write your SQL query or at least the query approach before submitting.'
                        : 'Design your schema before submitting.',
                    { duration: 5000 }
                )
                return
            }
        }

        const followUpAnswersArray = Object.entries(followUpAnswers)
            .filter(([, text]) => text?.trim())
            .map(([questionId, text]) => ({
                followUpQuestionId: questionId,
                answerText: text.trim(),
            }))

        // Field mapping into Solution columns for backward compat and RAG.
        // HR field mapping:
        //   approach           → underlyingConcern (primary analytical input)
        //   keyInsight         → answer (the actual polished response — most important)
        //   feynmanExplanation → companyConnection (company-specific evidence)
        //   realWorldConnection→ selfAssessment (reflection on the answer)
        const data = {
            approach: isSystemDesign
                ? sdData.functionalRequirements
                : isLowLevelDesign ? lldData.entities
                    : isHR ? hrData.underlyingConcern
                        : isBehavioral ? behavioralData.situation
                            : isTechnicalKnowledge ? tkData.coreExplanation
                                : isDatabase
                                    ? (dbProblemType === 'SCHEMA_DESIGN'
                                        ? dbData.schemaDesign       // Schema → approach for RAG embedding
                                        : dbData.queryApproach)     // Query analysis → approach
                                    : (approach || null),

            code: isSystemDesign
                ? sdData.apiDesign
                : isHR ? null
                    : isBehavioral ? null
                        : isTechnicalKnowledge ? null
                            : isDatabase
                                ? (dbData.sqlQuery || null)    // SQL query → code field
                                : (code || null),

            language: isSystemDesign
                ? 'plaintext'
                : isHR ? null
                    : isBehavioral ? null
                        : isTechnicalKnowledge ? null
                            : isDatabase
                                ? (dbData.sqlQuery ? 'SQL' : null)
                                : (code ? language : null),

            pattern: isHR
                ? (hrQuestionCategory || null)
                : isBehavioral ? (behavioralData.competency?.trim() || null)
                    : isTechnicalKnowledge ? (tkData.subject?.trim() || null)
                        : isDatabase
                            ? (dbProblemType || null)      // problem type stored in pattern for RAG signals
                            : (pattern || null),

            keyInsight: isSystemDesign
                ? sdData.tradeoffReasoning
                : isLowLevelDesign ? lldData.designPattern
                    : isHR ? hrData.answer
                        : isBehavioral ? behavioralData.result
                            : isTechnicalKnowledge ? tkData.tradeoffs
                                : isDatabase
                                    ? (dbProblemType === 'SCHEMA_DESIGN'
                                        ? dbData.normalizationReasoning
                                        : dbData.indexStrategy)
                                    : (keyInsight || null),

            feynmanExplanation: isSystemDesign
                ? sdData.architectureNotes
                : isLowLevelDesign ? lldData.solidAnalysis
                    : isHR ? hrData.companyConnection
                        : isBehavioral ? behavioralData.reflection
                            : isTechnicalKnowledge ? tkData.realWorldUsage
                                : isDatabase
                                    ? (dbProblemType === 'SCHEMA_DESIGN'
                                        ? dbData.indexDesign
                                        : dbData.optimizationNotes)
                                    : (feynmanExplanation || null),

            realWorldConnection: isSystemDesign
                ? sdData.capacityEstimation
                : isLowLevelDesign ? lldData.extensibilityAnalysis
                    : isHR ? hrData.selfAssessment
                        : (isBehavioral || isTechnicalKnowledge || isDatabase)
                            ? null
                            : (realWorldConnection || null),

            categorySpecificData: isSystemDesign
                ? { ...sdData, diagramData: sdDiagram }
                : isLowLevelDesign ? { ...lldData, implementationCode: code }
                    : isHR ? { ...hrData, questionCategory: hrQuestionCategory }
                        : isBehavioral ? { ...behavioralData }
                            : isTechnicalKnowledge ? { ...tkData }
                                : isDatabase
                                    ? { ...dbData, problemType: dbProblemType }
                                    : undefined,
            followUpAnswers: followUpAnswersArray,
        }

        try {
            await submitSolution.mutateAsync({ problemId, data })
            toast.success(
                isSystemDesign
                    ? 'Design submitted! AI will analyze your architecture.'
                    : isHR
                        ? 'Answer submitted! AI will review your authenticity and specificity.'
                        : 'Solution submitted! AI will analyze it.'
            )
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
                    {/* HR: stakes badge instead of difficulty */}
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
                    {/* Platform — CODING/SQL only */}
                    {problem.categoryData?.platform &&
                        problem.categoryData.platform !== 'OTHER' &&
                        EXTERNAL_LINK_CATEGORIES.includes(category) && (
                            <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                             border border-border-subtle rounded-full px-2 py-px">
                                {problem.categoryData.platform}
                            </span>
                        )}
                </div>
                <h2 className="text-base font-bold text-text-primary mb-2">
                    {problem.title}
                </h2>

                {/* External link — CODING/SQL only */}
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
                        Solve on {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER'
                            ? problem.categoryData.platform
                            : 'External Site'} →
                    </a>
                )}

                {/* SD: inline design brief */}
                {isSystemDesign && problem.description && (
                    <div className="mt-3 p-3 bg-surface-2 border border-border-default rounded-xl text-xs text-text-tertiary leading-relaxed">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">Design Brief</p>
                        <p className="whitespace-pre-wrap">{problem.description}</p>
                    </div>
                )}

                {/* LLD: inline design challenge */}
                {isLowLevelDesign && problem.description && (
                    <div className="mt-3 p-3 bg-surface-2 border border-border-default rounded-xl text-xs text-text-tertiary leading-relaxed">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">Design Challenge</p>
                        <p className="whitespace-pre-wrap">{problem.description}</p>
                    </div>
                )}
            </div>

            {/* Banners — category-specific tips */}
            {hasExternalLink && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-info/5 border border-info/20 rounded-xl p-4 mb-6 flex items-start gap-3"
                >
                    <span className="text-lg flex-shrink-0">💡</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Solve first, then reflect here</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Solve on {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER'
                                ? problem.categoryData.platform
                                : 'the external site'}, then paste your code below.
                            AI will analyze complexity, correctness, and give specific feedback.
                        </p>
                    </div>
                </motion.div>
            )}
            {isSystemDesign && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🎯</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Work through it like a real interview</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">Start with requirements — never jump to architecture first. Fill each section in order. Interviewers score each dimension independently.</p>
                    </div>
                </motion.div>
            )}
            {isLowLevelDesign && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-purple-400/5 border border-purple-400/20 rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🔧</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Start with entities, not code</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">The most common LLD mistake is jumping straight to implementation. Identify your classes and their single responsibilities first.</p>
                    </div>
                </motion.div>
            )}
            {isHR && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-danger/5 border border-danger/20 rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🤝</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Analyze before you answer</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            HR interviews are not tests of knowledge — they are risk assessments. Before writing your answer,
                            identify what the interviewer is really checking. Generic answers fail because they answer
                            the surface question, not the real concern.
                        </p>
                    </div>
                </motion.div>
            )}

            {isBehavioral && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-success/5 border border-success/20 rounded-xl p-4 mb-6 flex items-start gap-3"
                >
                    <span className="text-lg flex-shrink-0">🗣️</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">
                            Name the competency before writing your story
                        </p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Every behavioral question is testing a specific competency.
                            Candidates who identify it first write targeted, specific answers.
                            Candidates who skip it write good-sounding answers that miss
                            what the interviewer was actually measuring.
                        </p>
                    </div>
                </motion.div>
            )}

            {isTechnicalKnowledge && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-warning/5 border border-warning/20 rounded-xl p-4 mb-6 flex items-start gap-3"
                >
                    <span className="text-lg flex-shrink-0">🧠</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">
                            Explain the mechanism, not the definition
                        </p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Definitions come from textbooks. Mechanisms come from understanding.
                            Start with how it works at the lowest level you understand,
                            then trade-offs, then where you've seen it in real systems.
                            Interviewers probe until you hit your ceiling — start deep.
                        </p>
                    </div>
                </motion.div>
            )}

            {isDatabase && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4 mb-6 flex items-start gap-3"
                >
                    <span className="text-lg flex-shrink-0">🗄️</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">
                            {dbProblemType === 'SCHEMA_DESIGN'
                                ? 'Design the schema before writing any SQL'
                                : 'Analyze the schema before writing the query'}
                        </p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            {dbProblemType === 'SCHEMA_DESIGN'
                                ? 'Strong schema design explains WHY each type, constraint, and index decision was made. Interviewers evaluate the reasoning, not just whether the tables exist.'
                                : 'Understanding which tables, which JOIN type, and which columns to filter is 50% of writing a correct query. Write the analysis first.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* ── Form sections ──────────────────────────── */}
            <div className="space-y-5">
                {isSystemDesign ? (
                    <SystemDesignWorkspace
                        sdData={sdData}
                        onSdDataChange={setSdData}
                        diagramData={sdDiagram}
                        onDiagramChange={setSdDiagram}
                    />
                ) : isLowLevelDesign ? (
                    <LLDWorkspace
                        lldData={lldData}
                        onLldDataChange={setLldData}
                        code={code}
                        onCodeChange={setCode}
                        language={language}
                        onLanguageChange={setLanguage}
                    />
                ) : isHR ? (
                    <HRWorkspace
                        hrData={hrData}
                        onHrDataChange={setHrData}
                        questionCategory={hrQuestionCategory}
                        onQuestionCategoryChange={setHrQuestionCategory}
                    />
                ) : isBehavioral ? (
                    <BehavioralWorkspace
                        behavioralData={behavioralData}
                        onBehavioralDataChange={setBehavioralData}
                    />
                ) : isTechnicalKnowledge ? (
                    <TechnicalKnowledgeWorkspace
                        tkData={tkData}
                        onTkDataChange={setTkData}
                    />
                ) : isDatabase ? (
                    <DatabaseWorkspace
                        dbData={dbData}
                        onDbDataChange={setDbData}
                        problemType={dbProblemType}
                        schemaReference={dbSchemaReference}
                    />
                ) : (
                    // ── All other categories: generic form ─────────────
                    <>
                        {/* Code section — Monaco editor (CODING, SQL only) */}
                        {(category === 'CODING' || category === 'SQL' || hasExternalLink) && (
                            <FormSection
                                icon="💻"
                                title={hasExternalLink
                                    ? 'Paste Your Solution Code'
                                    : (formConfig.solutionTabConfig?.codeLabel || 'Your Code')}
                                hint="AI will analyze correctness, complexity, and detect any issues"
                            >
                                <CodeEditor
                                    code={code}
                                    onChange={setCode}
                                    language={language}
                                    onLanguageChange={lang => {
                                        setLanguage(lang)
                                        localStorage.setItem('ps_last_language', lang)
                                    }}
                                    selectorStyle="dropdown"
                                    languages={SUBMIT_LANGUAGES}
                                    height="320px"
                                    showLanguageSelector
                                />
                                <p className="text-[10px] text-text-disabled mt-2">
                                    🤖 AI will check correctness, detect edge cases, analyze complexity, and flag any issues
                                </p>
                            </FormSection>
                        )}
                        {/* Approach / Response */}
                        <FormSection
                            icon={category === 'BEHAVIORAL' ? '🎯' : category === 'LOW_LEVEL_DESIGN' ? '📐' : '📝'}
                            title={
                                category === 'BEHAVIORAL' ? (formConfig.actionField?.label || 'Your Response')
                                    : category === 'CS_FUNDAMENTALS' ? 'Your Explanation'
                                        : category === 'LOW_LEVEL_DESIGN' ? 'Your Design Approach'
                                            : 'Your Approach'
                            }
                            hint={
                                hasExternalLink
                                    ? 'Explain your thought process. What pattern did you use and why?'
                                    : category === 'BEHAVIORAL'
                                        ? (formConfig.actionField?.hint || 'Use STAR format — be specific about YOUR actions.')
                                        : category === 'LOW_LEVEL_DESIGN'
                                            ? 'Walk through your entity identification and class hierarchy.'
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
                    </>
                )}

                {/* Confidence — shown for ALL categories with category-appropriate hint */}
                <FormSection
                    icon="📊"
                    title="Confidence Level"
                    hint={
                        isSystemDesign
                            ? 'How confident are you in this design?'
                            : isLowLevelDesign
                                ? 'How confident are you in your object design?'
                                : isHR
                                    ? 'How authentic and specific does this answer feel?'
                                    : isBehavioral
                                        ? 'How strong is your story? Does your Action section show clear ownership?'
                                        : isTechnicalKnowledge
                                            ? 'How deep is your understanding? Could you answer a follow-up on the mechanism without notes?'
                                            : isDatabase
                                                ? 'How confident are you in this solution? Would it handle NULL values, empty tables, and large datasets correctly?'
                                                : "Be honest — AI will flag if your confidence doesn't match your solution quality"
                    }
                >
                    <ConfidencePicker value={confidence} onChange={setConfidence} />
                </FormSection>

                {/* Follow-up questions */}
                {problem.followUpQuestions?.length > 0 && (
                    <FormSection
                        icon={isHR ? '💬' : '🧠'}
                        title={isHR ? 'Probing Follow-up Questions' : 'Follow-up Questions'}
                        badge={answeredCount > 0
                            ? `${answeredCount}/${followUpCount} answered`
                            : 'Optional — earn bonus points'}
                        hint={isHR
                            ? 'These are the follow-up questions a real HR interviewer would ask. Preparing specific responses is what separates good candidates from great ones.'
                            : 'Each answer earns bonus points in your AI review. Skipped questions are noted.'
                        }
                    >
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
                            <div className="mt-4 pt-4 border-t border-border-subtle">
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

            {/* Sticky submit bar */}
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
                        {(() => {
                            // HR: show workspace empty warning when follow-ups are filled but workspace is not
                            if (isHR) {
                                const workspaceEmpty = (hrData.underlyingConcern?.trim().length ?? 0) === 0 &&
                                    (hrData.answer?.trim().length ?? 0) === 0
                                if (workspaceEmpty) {
                                    return (
                                        <span className="text-xs text-warning hidden sm:block font-semibold">
                                            Fill in the Answer workspace above first
                                        </span>
                                    )
                                }
                            }
                            if (confidence === 0) {
                                return (
                                    <span className="text-xs text-text-disabled hidden sm:block">
                                        Set confidence to submit
                                    </span>
                                )
                            }
                            return null
                        })()}
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
                            {isSystemDesign ? 'Submit Design'
                                : isLowLevelDesign ? 'Submit Design'
                                    : isHR ? 'Submit My Answer'
                                        : isBehavioral ? 'Submit My Story'
                                            : isTechnicalKnowledge ? 'Submit Explanation'
                                                : isDatabase
                                                    ? (dbProblemType === 'SCHEMA_DESIGN' ? 'Submit Schema Design' : 'Submit Query')
                                                    : 'Submit Solution'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}