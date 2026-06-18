// ============================================================================
// ProbSolver v3.0 — Submit Solution Page
// ============================================================================
import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useSubmitSolution } from '@hooks/useSolutions'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { CodeEditor, SUBMIT_LANGUAGES } from '@components/ui/CodeEditor'
import { WorkspaceEditor } from '@components/features/solutions/WorkspaceEditor'
import { SolutionTabs } from '@components/features/solutions/SolutionTabs'
import { PatternSelector } from '@components/features/solutions/PatternSelector'

// Feature flag — when on, the CODING path renders the same SolutionTabs
// editor that EditSolutionPage uses (BRUTE_FORCE / OPTIMIZED tabs). When
// off, the legacy single-textarea + single-code-editor flow is restored.
// Triple-declaration: `client/.env`, `client/Dockerfile` ARG/ENV, here.
const SUBMIT_TABBED_ENABLED = import.meta.env.VITE_FEATURE_SUBMIT_TABBED !== 'false'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import {
    CONFIDENCE_LEVELS, PROBLEM_CATEGORIES,
    HR_STAKES, HR_QUESTION_CATEGORIES,
} from '@utils/constants'
import { getCategoryForm } from '@utils/categoryForms'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const EXTERNAL_LINK_CATEGORIES = ['CODING', 'SQL']

// ── Section wrapper ────────────────────────────────────
function FormSection({ icon, title, hint, badge, required, children, className }) {
    return (
        <div className={cn(
            'bg-surface-1 border border-border-default rounded-2xl p-5',
            className
        )}>
            <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center
                                justify-center text-base flex-shrink-0 mt-0.5">
                    {icon}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
                        {required && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                             bg-danger-soft text-danger-fg border border-danger-line">
                                Required
                            </span>
                        )}
                        {badge && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                             bg-brand-soft text-brand-fg-soft border border-brand-line">
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

// ── Solve method picker ────────────────────────────────
// Three-way radio: COLD / HINTS / SAW_APPROACH. Stored on the Solution
// row and read by AI review (confidence calibration) and the Coding
// Pattern Mastery dim (only COLD solves count toward WORKING transitions).
const SOLVE_METHODS = [
    { value: 'COLD',         label: 'Cold',         hint: 'No hints, no peeking',           icon: '🧊' },
    { value: 'HINTS',        label: 'With hints',   hint: 'Used a small nudge',             icon: '💡' },
    { value: 'SAW_APPROACH', label: 'Saw approach', hint: 'Looked at the canonical answer', icon: '👀' },
]
function SolveMethodPicker({ value, onChange }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SOLVE_METHODS.map(m => (
                <button key={m.value} type="button" onClick={() => onChange(m.value)}
                    className={cn(
                        'border rounded-xl px-3 py-2.5 text-left transition-all',
                        value === m.value
                            ? 'bg-brand-soft border-brand-line scale-[1.01]'
                            : 'bg-surface-3 border-border-default hover:border-border-strong',
                    )}>
                    <div className="flex items-center gap-2">
                        <span className="text-sm">{m.icon}</span>
                        <span className={cn('text-xs font-bold',
                            value === m.value ? 'text-brand-fg-soft' : 'text-text-primary')}>
                            {m.label}
                        </span>
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1 leading-tight">{m.hint}</p>
                </button>
            ))}
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
                            ? 'bg-brand-soft border-brand-line scale-105'
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
                hasAnswer ? 'bg-success-soft border-success-line' : 'bg-surface-2 border-border-default'
            )}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 flex-1">
                    <span className={cn(
                        'flex-shrink-0 w-5 h-5 rounded-full flex items-center',
                        'justify-center text-[10px] font-bold mt-0.5',
                        hasAnswer
                            ? 'bg-success-soft text-success-fg'
                            : 'bg-surface-3 border border-border-default text-text-disabled'
                    )}>
                        {hasAnswer ? '✓' : index + 1}
                    </span>
                    <p className="text-xs font-semibold text-text-primary leading-relaxed">
                        {followUp.question}
                    </p>
                </div>
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
                        className="text-[10px] text-brand-fg-soft hover:text-brand-200
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
// ══════════════════════════════════════════════════════
const HR_SECTIONS = [
    { key: 'underlyingConcern', label: 'Analyze', icon: '🔍', sublabel: 'What are they really checking?', color: 'text-danger-fg', activeBg: 'bg-danger-soft border-danger-line', required: true, tabDoneThreshold: 21 },
    { key: 'answer', label: 'Answer', icon: '💬', sublabel: 'Your complete polished response', color: 'text-brand-fg-soft', activeBg: 'bg-brand-soft border-brand-line', required: true, tabDoneThreshold: 21 },
    { key: 'companyConnection', label: 'Tailor', icon: '🎯', sublabel: 'Make it specific to this company', color: 'text-success-fg', activeBg: 'bg-success-soft border-success-line', required: false, tabDoneThreshold: 21 },
    { key: 'selfAssessment', label: 'Reflect', icon: '🪞', sublabel: 'Honest self-assessment', color: 'text-warning-fg', activeBg: 'bg-warning-soft border-warning-line', required: false, tabDoneThreshold: 21 },
]

function HRWorkspace({ hrData, onHrDataChange, questionCategory, onQuestionCategoryChange }) {
    const hrConfig = getCategoryForm('HR')

    return (
        <div className="space-y-4">
            <WorkspaceEditor
                headerIcon="🤝"
                headerLabel="HR Answer Workspace"
                progressColorClass="bg-danger"
                sections={HR_SECTIONS}
                fieldConfigs={hrConfig.hrFields || {}}
                values={hrData}
                onChange={onHrDataChange}
                defaultActiveSection="underlyingConcern"
                banner={({ completedCount }) => completedCount === 0 ? (
                    <p className="text-[10px] text-warning-fg flex items-center gap-1.5 mt-2">
                        <span>⚠️</span>
                        Fill in <strong>Analyze</strong> or <strong>Answer</strong> sections above before submitting
                    </p>
                ) : null}
            />

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
                        <button key={cat.id} type="button"
                            onClick={() => onQuestionCategoryChange(questionCategory === cat.id ? '' : cat.id)}
                            className={cn('flex items-start gap-2 p-3 rounded-xl border text-left transition-all',
                                questionCategory === cat.id ? `${cat.bg} font-bold` : 'bg-surface-3 border-border-default hover:border-border-strong')}>
                            <span className="text-base flex-shrink-0 mt-0.5">{cat.icon}</span>
                            <div className="min-w-0">
                                <p className={cn('text-[10px] font-bold block leading-tight', questionCategory === cat.id ? cat.color : 'text-text-secondary')}>{cat.label}</p>
                                <p className="text-[9px] text-text-disabled leading-tight mt-0.5">{cat.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}


// ══════════════════════════════════════════════════════
// BEHAVIORAL WORKSPACE
// ══════════════════════════════════════════════════════
const BEHAVIORAL_SECTIONS = [
    { key: 'competency', label: 'Competency', icon: '🎯', sublabel: 'What is this question really testing?', color: 'text-success-fg', activeBg: 'bg-success-soft border-success-line', required: true, tabDoneThreshold: 31, charThreshold: 100 },
    { key: 'situation', label: 'Situation', icon: '📖', sublabel: 'Set the scene — specific and scoped', color: 'text-brand-fg-soft', activeBg: 'bg-brand-soft border-brand-line', required: true, tabDoneThreshold: 31, charThreshold: 300 },
    { key: 'action', label: 'Action', icon: '⚡', sublabel: 'What YOU did — use "I" not "we"', color: 'text-warning-fg', activeBg: 'bg-warning-soft border-warning-line', required: true, tabDoneThreshold: 31, charThreshold: 600 },
    { key: 'result', label: 'Result', icon: '📊', sublabel: 'Quantified outcome and impact', color: 'text-info-fg', activeBg: 'bg-info-soft border-info-line', required: false, tabDoneThreshold: 31, charThreshold: 150 },
    { key: 'reflection', label: 'Reflection', icon: '🔬', sublabel: "Learning and what you'd change", color: 'text-purple-400', activeBg: 'bg-purple-400/10 border-purple-400/30', required: false, tabDoneThreshold: 31, charThreshold: 200 },
]

function BehavioralWorkspace({ behavioralData, onBehavioralDataChange }) {
    const behavioralConfig = getCategoryForm('BEHAVIORAL')

    return (
        <WorkspaceEditor
            headerIcon="🗣️"
            headerLabel="STAR Workspace"
            progressColorClass="bg-success"
            sections={BEHAVIORAL_SECTIONS}
            fieldConfigs={behavioralConfig.behavioralFields || {}}
            values={behavioralData}
            onChange={onBehavioralDataChange}
            defaultActiveSection="competency"
            nonRequiredBadgeLabel="High signal"
            showCoreCompleteBadge
            banner={({ requiredComplete }) => !requiredComplete ? (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-success-soft border border-success-line rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">💡</span>
                    <div>
                        <p className="text-xs font-semibold text-text-primary mb-1">Fill sections in order for the strongest answer</p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">Naming the <strong>Competency</strong> first is the most important step.</p>
                    </div>
                </motion.div>
            ) : null}
        />
    )
}

// ══════════════════════════════════════════════════════
// TECHNICAL KNOWLEDGE WORKSPACE
// ══════════════════════════════════════════════════════
const TK_SUBJECT_SUGGESTIONS = [
    { label: 'Process vs Thread', subject: 'Operating Systems' },
    { label: 'Virtual Memory & Page Faults', subject: 'Operating Systems' },
    { label: 'Deadlocks & Prevention', subject: 'Operating Systems' },
    { label: 'CPU Scheduling', subject: 'Operating Systems' },
    { label: 'Concurrency Primitives', subject: 'Operating Systems' },
    { label: 'TCP vs UDP', subject: 'Networking' },
    { label: 'TCP 3-Way Handshake', subject: 'Networking' },
    { label: 'HTTP/HTTPS/HTTP2/HTTP3', subject: 'Networking' },
    { label: 'DNS Resolution', subject: 'Networking' },
    { label: 'Load Balancing Strategies', subject: 'Networking' },
    { label: 'CDN Architecture', subject: 'Networking' },
    { label: 'TLS Handshake', subject: 'Networking' },
    { label: 'ACID Properties', subject: 'Database Internals' },
    { label: 'Transaction Isolation Levels', subject: 'Database Internals' },
    { label: 'B-Tree Index Mechanics', subject: 'Database Internals' },
    { label: 'CAP Theorem', subject: 'Database Internals' },
    { label: 'Sharding vs Replication', subject: 'Database Internals' },
    { label: 'NoSQL Trade-offs', subject: 'Database Internals' },
    { label: 'Why HashMap is O(1) Amortized', subject: 'DSA Concepts' },
    { label: 'Consistent Hashing', subject: 'DSA Concepts' },
    { label: 'Bloom Filters', subject: 'DSA Concepts' },
    { label: 'LRU Cache Implementation', subject: 'DSA Concepts' },
    { label: 'Consistency Models', subject: 'Distributed Systems' },
    { label: 'Consensus (Raft/Paxos)', subject: 'Distributed Systems' },
    { label: 'Idempotency', subject: 'Distributed Systems' },
    { label: 'Rate Limiting Algorithms', subject: 'Distributed Systems' },
    { label: 'Message Queue Delivery Guarantees', subject: 'Distributed Systems' },
    { label: 'Gradient Descent & Learning Rate', subject: 'AI/ML' },
    { label: 'Overfitting vs Underfitting', subject: 'AI/ML' },
    { label: 'Vector Embeddings', subject: 'AI/ML' },
    { label: 'Transformer Architecture', subject: 'AI/ML' },
    { label: 'Batch vs Stream Processing', subject: 'Data Engineering' },
    { label: 'ETL vs ELT', subject: 'Data Engineering' },
    { label: 'Columnar Storage (Parquet)', subject: 'Data Engineering' },
    { label: 'Apache Kafka Architecture', subject: 'Data Engineering' },
]

const TK_SUBJECT_GROUPS = TK_SUBJECT_SUGGESTIONS.reduce((acc, item) => {
    if (!acc[item.subject]) acc[item.subject] = []
    acc[item.subject].push(item.label)
    return acc
}, {})

// Subject picker for TK — renders above the textarea on the subject section,
// then advances to coreExplanation on selection.
function TKSubjectPicker({ tkData, update, setActiveSection }) {
    const [showSubjectPicker, setShowSubjectPicker] = useState(true)
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Quick pick a topic</p>
                <button type="button" onClick={() => setShowSubjectPicker(v => !v)} className="text-[10px] text-brand-fg-soft hover:text-brand-200 transition-colors">
                    {showSubjectPicker ? 'Hide' : 'Show topics'}
                </button>
            </div>
            {showSubjectPicker && (
                <div className="space-y-3">
                    {Object.entries(TK_SUBJECT_GROUPS).map(([group, items]) => (
                        <div key={group}>
                            <p className="text-[9px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">{group}</p>
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
                                            'text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all duration-150',
                                            tkData.subject === `${group} — ${item}`
                                                ? 'bg-warning-soft border-warning-line text-warning-fg'
                                                : 'bg-surface-3 border-border-default text-text-secondary hover:border-warning-line hover:text-warning-fg',
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
                <p className="text-[10px] text-text-disabled mb-2">Or type your own:</p>
            </div>
        </div>
    )
}

// Subject intentionally has no charThreshold — typing past the 20-char
// threshold flips the tab to "done" but we don't want a depth progress bar
// for what is essentially a single-line label.
const TK_SECTIONS = [
    { key: 'subject', label: 'Subject', icon: '📚', sublabel: 'Topic area and concept', color: 'text-warning-fg', activeBg: 'bg-warning-soft border-warning-line', required: true, tabDoneThreshold: 20 },
    { key: 'coreExplanation', label: 'Mechanism', icon: '⚙️', sublabel: 'How it works — not the definition', color: 'text-brand-fg-soft', activeBg: 'bg-brand-soft border-brand-line', required: true, tabDoneThreshold: 400, charThreshold: 400 },
    { key: 'whyItExists', label: 'Design', icon: '🎯', sublabel: 'Why it was designed this way', color: 'text-info-fg', activeBg: 'bg-info-soft border-info-line', required: false, tabDoneThreshold: 200, charThreshold: 200 },
    { key: 'tradeoffs', label: 'Trade-offs', icon: '⚖️', sublabel: 'What it sacrifices, when to choose differently', color: 'text-danger-fg', activeBg: 'bg-danger-soft border-danger-line', required: false, tabDoneThreshold: 200, charThreshold: 200 },
    { key: 'realWorldUsage', label: 'Production', icon: '🌍', sublabel: 'Real systems + misconceptions', color: 'text-success-fg', activeBg: 'bg-success-soft border-success-line', required: false, tabDoneThreshold: 200, charThreshold: 200 },
]

function TechnicalKnowledgeWorkspace({ tkData, onTkDataChange }) {
    const tkConfig = getCategoryForm('CS_FUNDAMENTALS')

    return (
        <WorkspaceEditor
            headerIcon="🧠"
            headerLabel="Technical Knowledge Workspace"
            progressColorClass="bg-warning"
            sections={TK_SECTIONS}
            fieldConfigs={tkConfig.technicalKnowledgeFields || {}}
            values={tkData}
            onChange={onTkDataChange}
            defaultActiveSection="subject"
            nonRequiredBadgeLabel="High signal"
            banner={({ values }) => !(values.coreExplanation?.trim?.()?.length > 100) ? (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-warning-soft border border-warning-line rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-base flex-shrink-0 mt-0.5">⚙️</span>
                    <div>
                        <p className="text-xs font-semibold text-text-primary mb-1">Explain the mechanism, not the definition</p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">Definitions come from textbooks. Mechanisms come from understanding.</p>
                    </div>
                </motion.div>
            ) : null}
            renderSectionAbove={(activeKey, { values, update, setActiveSection }) => (
                activeKey === 'subject'
                    ? <TKSubjectPicker tkData={values} update={update} setActiveSection={setActiveSection} />
                    : null
            )}
        />
    )
}

// ══════════════════════════════════════════════════════
// DATABASE WORKSPACE
// ══════════════════════════════════════════════════════
function DatabaseWorkspace({ dbData, onDbDataChange, problemType, schemaReference }) {
    const [activeSection, setActiveSection] = useState(
        problemType === 'SCHEMA_DESIGN' ? 'schemaDesign' : 'queryApproach'
    )
    const [code, setCode] = useState(dbData.sqlQuery || '')
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

    const sections = isQueryMode ? [
        { key: 'queryApproach', label: 'Approach', icon: '🧠', sublabel: 'Schema analysis and query plan', color: 'text-brand-fg-soft', activeBg: 'bg-brand-soft border-brand-line', required: true },
        { key: 'sqlEditor', label: 'Query', icon: '🗄️', sublabel: 'Write your SQL', color: 'text-success-fg', activeBg: 'bg-success-soft border-success-line', required: true },
        { key: 'indexStrategy', label: 'Indexing', icon: '⚡', sublabel: 'What indexes you would add and why', color: 'text-warning-fg', activeBg: 'bg-warning-soft border-warning-line', required: false },
        { key: 'optimizationNotes', label: 'Optimization', icon: '⚖️', sublabel: 'Performance and edge cases', color: 'text-info-fg', activeBg: 'bg-info-soft border-info-line', required: false },
    ] : [
        { key: 'schemaDesign', label: 'Schema', icon: '🗄️', sublabel: 'Table definitions and constraints', color: 'text-brand-fg-soft', activeBg: 'bg-brand-soft border-brand-line', required: true },
        { key: 'normalizationReasoning', label: 'Decisions', icon: '🧠', sublabel: 'Normalization and design choices', color: 'text-success-fg', activeBg: 'bg-success-soft border-success-line', required: false },
        { key: 'indexDesign', label: 'Indexes', icon: '⚡', sublabel: 'Index design per access pattern', color: 'text-warning-fg', activeBg: 'bg-warning-soft border-warning-line', required: false },
        { key: 'noSQLConsideration', label: 'NoSQL?', icon: '⚖️', sublabel: 'Would any part benefit from NoSQL?', color: 'text-info-fg', activeBg: 'bg-info-soft border-info-line', required: false },
    ]

    const activeSectionConfig = sections.find(s => s.key === activeSection)
    const activeIndex = sections.findIndex(s => s.key === activeSection)
    const minThresholds = { queryApproach: 200, sqlEditor: 20, indexStrategy: 150, optimizationNotes: 150, schemaDesign: 300, normalizationReasoning: 200, indexDesign: 150, noSQLConsideration: 100 }

    function getSectionValue(key) {
        if (key === 'sqlEditor') return code
        return dbData[key] || ''
    }

    const completedCount = sections.filter(s => (getSectionValue(s.key)?.trim?.()?.length ?? 0) >= (minThresholds[s.key] || 30)).length
    const activeValue = getSectionValue(activeSection)
    const threshold = minThresholds[activeSection] || 150
    const activeCharCount = activeValue?.trim?.()?.length ?? 0
    const isShort = activeCharCount > 0 && activeCharCount < threshold
    const progressPct = Math.min(100, (activeCharCount / threshold) * 100)

    return (
        <div className="space-y-4">
            {schemaReference && (
                <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
                    <button type="button" onClick={() => setShowSchema(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-2/50 transition-colors">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">📋</span>
                            <span className="text-xs font-bold text-text-primary">Schema Reference</span>
                            <span className="text-[10px] text-text-disabled bg-surface-3 border border-border-default rounded-full px-2 py-px">Read-only</span>
                        </div>
                        <motion.div animate={{ rotate: showSchema ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-text-disabled">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                        </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                        {showSchema && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                <div className="px-5 pb-5 border-t border-border-default pt-4">
                                    <pre className="bg-surface-0 border border-border-default rounded-xl p-4 text-xs font-mono text-text-secondary whitespace-pre-wrap overflow-x-auto leading-relaxed max-h-[300px]">
                                        {schemaReference}
                                    </pre>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>{isQueryMode ? '🗄️' : '📐'}</span>
                        {isQueryMode ? 'Query Workspace' : 'Schema Design Workspace'}
                    </p>
                    <span className="text-[10px] font-bold text-text-disabled">{completedCount}/{sections.length} sections</span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div animate={{ width: `${(completedCount / sections.length) * 100}%` }} transition={{ duration: 0.4 }} className="h-full bg-brand-300 rounded-full" />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const val = getSectionValue(s.key)
                        const isDone = (val?.trim?.()?.length ?? 0) >= (minThresholds[s.key] || 30)
                        const isActive = activeSection === s.key
                        return (
                            <button key={s.key} onClick={() => setActiveSection(s.key)}
                                className={cn('flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all duration-150 min-w-[72px]',
                                    isActive ? s.activeBg : isDone ? 'bg-success-soft border-success-line' : 'bg-surface-3 border-border-default hover:border-border-strong')}>
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {s.required && !isDone && !isActive && <span className="text-danger-fg text-[9px] font-bold">*</span>}
                                    {isDone && !isActive && <span className="text-success-fg text-[9px] font-bold">✓</span>}
                                </div>
                                <span className={cn('text-[9px] font-bold uppercase tracking-wider text-center leading-tight', isActive ? s.color : isDone ? 'text-success-fg' : 'text-text-disabled')}>{s.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <motion.div key={activeSection} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
                <div className={cn('flex items-center gap-3 px-5 py-4 border-b border-border-default', activeSectionConfig?.activeBg)}>
                    <span className="text-xl">{activeSectionConfig?.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn('text-sm font-bold', activeSectionConfig?.color)}>{activeSectionConfig?.label}</p>
                            {activeSectionConfig?.required && <span className="text-[9px] font-bold text-danger-fg bg-danger-soft border border-danger-line px-1.5 py-px rounded-full">Required</span>}
                            {!activeSectionConfig?.required && <span className="text-[9px] font-bold text-text-disabled bg-surface-3 border border-border-default px-1.5 py-px rounded-full">High signal</span>}
                        </div>
                        <p className="text-[11px] text-text-disabled">{activeSectionConfig?.sublabel}</p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">{activeIndex + 1} / {sections.length}</span>
                </div>
                <div className="p-5 space-y-3">
                    {activeSection === 'sqlEditor' ? (
                        <div className="space-y-2">
                            <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                                💡 Write your SQL query. AI will evaluate correctness, JOIN logic, NULL handling, index alignment, and optimization.
                            </p>
                            <CodeEditor code={code} onChange={updateCode} language="SQL" onLanguageChange={() => { }}
                                selectorStyle="none" languages={[{ id: 'SQL', label: 'SQL' }]} height="300px" showLanguageSelector={false} />
                            {code.trim().length > 0 && (
                                <p className="text-[10px] text-success-fg flex items-center gap-1">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    Query written — AI will review for correctness, optimization, and edge cases
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            {fieldConfigs[activeSection]?.hint && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">💡 {fieldConfigs[activeSection].hint}</p>
                            )}
                            <textarea rows={fieldConfigs[activeSection]?.rows || 8} value={dbData[activeSection] || ''} onChange={e => update(activeSection, e.target.value)} placeholder={fieldConfigs[activeSection]?.placeholder || ''}
                                className={cn('w-full border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
                                    (activeSection === 'schemaDesign' || activeSection === 'indexDesign' || activeSection === 'indexStrategy') ? 'bg-surface-0 font-mono text-xs' : 'bg-surface-3')}
                                style={{ minHeight: `${(fieldConfigs[activeSection]?.rows || 8) * 24}px` }} />
                            {activeCharCount > 0 && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className={cn('font-semibold', activeCharCount >= threshold ? 'text-success-fg' : isShort ? 'text-warning-fg' : 'text-text-disabled')}>
                                            {activeCharCount >= threshold ? '✓ Good depth' : isShort ? `Shallow — aim for ${threshold - activeCharCount} more chars` : 'Keep going...'}
                                        </span>
                                        <span className="text-text-disabled tabular-nums">{activeCharCount} / ~{threshold}</span>
                                    </div>
                                    <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                        <motion.div animate={{ width: `${progressPct}%` }} transition={{ duration: 0.3 }} className={cn('h-full rounded-full', activeCharCount >= threshold ? 'bg-success' : 'bg-warning')} />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-border-default bg-surface-1/50">
                    <button type="button" onClick={() => { if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key) }} disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        Previous
                    </button>
                    {activeIndex < sections.length - 1 && (
                        <button type="button" onClick={() => setActiveSection(sections[activeIndex + 1].key)}
                            className="text-xs font-semibold text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1">
                            Next
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
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

    const isSystemDesign = category === 'SYSTEM_DESIGN'
    const isLowLevelDesign = category === 'LOW_LEVEL_DESIGN'
    const isHR = category === 'HR'
    const isBehavioral = category === 'BEHAVIORAL'
    const isTechnicalKnowledge = category === 'CS_FUNDAMENTALS'
    const isDatabase = category === 'SQL'

    const dbProblemType = problem?.categoryData?.problemType || 'QUERY'
    const dbSchemaReference = problem?.categoryData?.schemaDefinition || problem?.description || null
    const hasExternalLink = !!problem?.categoryData?.sourceUrl && EXTERNAL_LINK_CATEGORIES.includes(category)

    // ── State ──────────────────────────────────────────────
    const [code, setCode] = useState('')
    const [language, setLanguage] = useState(localStorage.getItem('ps_last_language') || 'PYTHON')
    const [approach, setApproach] = useState('')
    // Tabbed-Submit state. Pre-seeds with two empty tabs (BRUTE_FORCE +
    // OPTIMIZED) so the user immediately sees the structure Edit will
    // also use. User can add an Alternative or remove BruteForce manually.
    const [solutionTabs, setSolutionTabs] = useState([
        { type: 'BRUTE_FORCE', approach: '', timeComplexity: '', spaceComplexity: '', code: '', language: localStorage.getItem('ps_last_language') || 'PYTHON' },
        { type: 'OPTIMIZED', approach: '', timeComplexity: '', spaceComplexity: '', code: '', language: localStorage.getItem('ps_last_language') || 'PYTHON' },
    ])
    // Bug 2 fix: patterns is now string[] for multi-select
    const [patterns, setPatterns] = useState([])
    const [keyInsight, setKeyInsight] = useState('')
    const [feynmanExplanation, setFeynmanExplanation] = useState('')
    const [realWorldConnection, setRealWorldConnection] = useState('')
    // Default to COLD on new submissions. AI review uses this to discount
    // confidence (SAW_APPROACH ⇒ heavy discount); leaving it null on a
    // freshly-typed solution is almost always wrong.
    const [solveMethod, setSolveMethod] = useState('COLD')
    // Confidence is null until the user picks a level. The server rejects
    // anything outside 1-5, so we gate submission on a real value.
    const [confidence, setConfidence] = useState(null)
    const confidenceRef = useRef(null)
    const [followUpAnswers, setFollowUpAnswers] = useState({})

    // SD/LLD state removed — those categories are fully handled by the migration
    // banner below (users route to Design Studio for design practice).

    const [behavioralData, setBehavioralData] = useState({
        competency: '', situation: '', action: '', result: '', reflection: '',
    })

    const [hrData, setHrData] = useState({
        underlyingConcern: '', answer: '', companyConnection: '', selfAssessment: '',
    })

    const [tkData, setTkData] = useState({
        subject: '', coreExplanation: '', whyItExists: '', tradeoffs: '', realWorldUsage: '',
    })

    const [dbData, setDbData] = useState({
        queryApproach: '', sqlQuery: '', indexStrategy: '', optimizationNotes: '',
        schemaDesign: '', normalizationReasoning: '', indexDesign: '', noSQLConsideration: '',
    })

    const [hrQuestionCategory, setHrQuestionCategory] = useState('')

    // ── Helpers ────────────────────────────────────────────
    function handleFollowUpAnswer(questionId, text) {
        setFollowUpAnswers(prev => ({ ...prev, [questionId]: text }))
    }

    // Bug 3 fix: sync ref on every confidence change
    function handleConfidenceChange(val) {
        setConfidence(val)
        confidenceRef.current = val
    }

    const followUpCount = problem?.followUpQuestions?.length || 0
    const answeredCount = Object.values(followUpAnswers).filter(v => v?.trim()).length

    // ── Submit ─────────────────────────────────────────────
    async function onSubmit() {
        if (confidenceRef.current == null) {
            toast.error('Please set your confidence level')
            return
        }

        // SD/LLD validation removed — banner gate redirects users to Design Studio.

        if (isHR) {
            const hasAnalysis = (hrData.underlyingConcern?.trim().length ?? 0) > 0
            const hasAnswer = (hrData.answer?.trim().length ?? 0) > 0
            if (!hasAnalysis && !hasAnswer) { toast.error('Your answer workspace is empty. Fill in at least one section before submitting.', { duration: 5000 }); return }
        }

        if (isBehavioral) {
            const hasSituation = (behavioralData.situation?.trim().length ?? 0) > 0
            const hasAction = (behavioralData.action?.trim().length ?? 0) > 0
            if (!hasSituation && !hasAction) { toast.error('Your STAR workspace is empty. Fill in at least Situation or Action before submitting.', { duration: 5000 }); return }
        }

        if (isTechnicalKnowledge) {
            const hasSubject = (tkData.subject?.trim().length ?? 0) > 0
            const hasExplanation = (tkData.coreExplanation?.trim().length ?? 0) > 0
            if (!hasSubject && !hasExplanation) { toast.error('Your Technical Knowledge workspace is empty. Fill in at least Subject or Mechanism before submitting.', { duration: 5000 }); return }
        }

        if (isDatabase) {
            const isQueryMode = dbProblemType !== 'SCHEMA_DESIGN'
            const hasQuery = isQueryMode
                ? (dbData.sqlQuery?.trim().length ?? 0) > 0 || (dbData.queryApproach?.trim().length ?? 0) > 0
                : (dbData.schemaDesign?.trim().length ?? 0) > 0
            if (!hasQuery) { toast.error(isQueryMode ? 'Write your SQL query or at least the query approach before submitting.' : 'Design your schema before submitting.', { duration: 5000 }); return }
        }

        const followUpAnswersArray = Object.entries(followUpAnswers)
            .filter(([, text]) => text?.trim())
            .map(([questionId, text]) => ({ followUpQuestionId: questionId, answerText: text.trim() }))

        // For non-CODING categories, categorySpecificData is the sole source
        // of truth. Generic columns (approach, keyInsight, etc.) are always
        // null so the DB can't silently desync. CODING keeps using the
        // generic columns as its native shape. (SD/LLD route to Design
        // Studio via the banner above, never reaching this code.)
        const base = {
            confidence: confidenceRef.current,
            followUpAnswers: followUpAnswersArray,
        }
        let data
        if (isHR) {
            data = {
                ...base,
                approach: null, code: null, language: null,
                keyInsight: null, feynmanExplanation: null, realWorldConnection: null,
                bruteForce: null, optimizedApproach: null,
                timeComplexity: null, spaceComplexity: null,
                patterns: hrQuestionCategory ? [hrQuestionCategory] : [],
                categorySpecificData: { ...hrData, questionCategory: hrQuestionCategory },
            }
        } else if (isBehavioral) {
            data = {
                ...base,
                approach: null, code: null, language: null,
                keyInsight: null, feynmanExplanation: null, realWorldConnection: null,
                bruteForce: null, optimizedApproach: null,
                timeComplexity: null, spaceComplexity: null,
                patterns: behavioralData.competency?.trim() ? [behavioralData.competency.trim()] : [],
                categorySpecificData: { ...behavioralData },
            }
        } else if (isTechnicalKnowledge) {
            data = {
                ...base,
                approach: null, code: null, language: null,
                keyInsight: null, feynmanExplanation: null, realWorldConnection: null,
                bruteForce: null, optimizedApproach: null,
                timeComplexity: null, spaceComplexity: null,
                patterns: tkData.subject?.trim() ? [tkData.subject.trim()] : [],
                categorySpecificData: { ...tkData },
            }
        } else if (isDatabase) {
            data = {
                ...base,
                approach: null, code: null, language: null,
                keyInsight: null, feynmanExplanation: null, realWorldConnection: null,
                bruteForce: null, optimizedApproach: null,
                timeComplexity: null, spaceComplexity: null,
                patterns: dbProblemType ? [dbProblemType] : [],
                categorySpecificData: { ...dbData, problemType: dbProblemType },
            }
        } else if (SUBMIT_TABBED_ENABLED && (category === 'CODING' || hasExternalLink)) {
            // CODING (tabbed) — write back the legacy `approach` column
            // (back-compat with old readers) AND the structured columns:
            // `bruteForce` / `optimizedApproach` for the Optimized + BF
            // tab approach text, plus the per-tab JSON metadata columns
            // (`bruteForceMeta`, `alternativeMeta`) so each tab's
            // code / language / timeComplexity / spaceComplexity round-trip.
            // Mirrors the flatten logic in EditSolutionPage.jsx (single
            // source of truth — tabs array → flat DB columns).
            const optimized = solutionTabs.find(s => s.type === 'OPTIMIZED')
            const brute = solutionTabs.find(s => s.type === 'BRUTE_FORCE')
            const alt = solutionTabs.find(s => s.type === 'ALTERNATIVE')
            const bestSol = optimized || solutionTabs[0]
            const tabsLanguage = bestSol?.language || 'PYTHON'
            if (bestSol?.code) localStorage.setItem('ps_last_language', tabsLanguage)
            // Pack per-tab metadata. Null when the tab has nothing meaningful
            // beyond approach text — keeps the column null, not {}.
            const packMeta = (s) => (s && (s.code || s.timeComplexity || s.spaceComplexity)
                ? {
                    code: s.code || null,
                    language: s.language || null,
                    timeComplexity: s.timeComplexity || null,
                    spaceComplexity: s.spaceComplexity || null,
                }
                : null)
            data = {
                ...base,
                approach: optimized?.approach || bestSol?.approach || null,
                code: bestSol?.code || null,
                language: bestSol?.code ? tabsLanguage : null,
                bruteForce: brute?.approach || null,
                bruteForceMeta: packMeta(brute),
                optimizedApproach: optimized?.approach || null,
                alternativeApproach: alt?.approach || null,
                alternativeMeta: packMeta(alt),
                timeComplexity: optimized?.timeComplexity || bestSol?.timeComplexity || null,
                spaceComplexity: optimized?.spaceComplexity || bestSol?.spaceComplexity || null,
                keyInsight: keyInsight || null,
                feynmanExplanation: feynmanExplanation || null,
                realWorldConnection: realWorldConnection || null,
                patterns,
                solveMethod,
            }
        } else {
            // CODING (legacy) or any non-tabbed path — generic columns canonical.
            data = {
                ...base,
                approach: approach || null,
                code: code || null,
                language: code ? language : null,
                keyInsight: keyInsight || null,
                feynmanExplanation: feynmanExplanation || null,
                realWorldConnection: realWorldConnection || null,
                patterns,
                solveMethod,
                // categorySpecificData omitted for CODING
            }
        }

        try {
            await submitSolution.mutateAsync({ problemId, data })
            toast.success(
                isHR
                    ? 'Answer submitted — AI is analyzing in the background.'
                    : 'Solution submitted — AI is analyzing in the background.'
            )
            // Bug fix: was navigate`...` — correct function call syntax
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
                <Button variant="secondary" onClick={() => navigate('/problems')}>Back to Problems</Button>
            </div>
        )
    }

    // SD/LLD practice moved to Design Studio (richer phase-based flow with
    // AI coaching, scenarios, and scored evaluation). Show a migration banner
    // instead of the old single-shot workspace for these categories.
    if (isSystemDesign || isLowLevelDesign) {
        return (
            <div className="p-6 max-w-[600px] mx-auto">
                <button type="button" onClick={() => navigate(`/problems/${problemId}`)}
                    className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors mb-6">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to problem
                </button>

                <div className="bg-brand-soft border border-brand-line rounded-2xl p-6">
                    <div className="flex items-start gap-3 mb-4">
                        <span className="text-3xl flex-shrink-0 mt-1">
                            {isSystemDesign ? '🏗️' : '🔧'}
                        </span>
                        <div>
                            <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest mb-1">
                                This problem now uses Design Studio
                            </p>
                            <h2 className="text-lg font-extrabold text-text-primary mb-1">{problem.title}</h2>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                {isSystemDesign ? 'System design' : 'Low-level design'} practice moved from a single-shot submission
                                to a richer phase-based workspace with AI coaching at every step, scenario-based validation, scale
                                analysis, flow simulation, and a scored evaluation across 10 dimensions.
                            </p>
                        </div>
                    </div>

                    <div className="bg-surface-1 border border-border-default rounded-xl p-4 mb-4">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                            What you get instead
                        </p>
                        <ul className="text-xs text-text-secondary space-y-1.5">
                            <li className="flex items-start gap-2"><span className="text-success-fg flex-shrink-0">✓</span>AI coach at every phase (Validate / Guide / Teach)</li>
                            <li className="flex items-start gap-2"><span className="text-success-fg flex-shrink-0">✓</span>AI-generated scenarios tailored to YOUR design</li>
                            <li className="flex items-start gap-2"><span className="text-success-fg flex-shrink-0">✓</span>Scale analysis (1x / 10x / 100x / failure)</li>
                            <li className="flex items-start gap-2"><span className="text-success-fg flex-shrink-0">✓</span>Flow simulation with latency tracing</li>
                            <li className="flex items-start gap-2"><span className="text-success-fg flex-shrink-0">✓</span>Comprehensive scored evaluation (GPT-4o, 10 dimensions)</li>
                            <li className="flex items-start gap-2"><span className="text-success-fg flex-shrink-0">✓</span>Multiple attempts tracked per problem</li>
                        </ul>
                    </div>

                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        onClick={() => navigate(`/design-studio?problemId=${problemId}`)}
                    >
                        Open in Design Studio →
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Back — Bug fix: correct navigate syntax */}
            <button type="button" onClick={() => navigate(`/problems/${problemId}`)}
                className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors mb-6">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Problem
            </button>

            {/* Problem header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {isHR ? (
                        <span className={cn('text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1', HR_STAKES[problem.difficulty]?.bg)}>
                            <span>{HR_STAKES[problem.difficulty]?.icon}</span>
                            <span className={HR_STAKES[problem.difficulty]?.color}>{HR_STAKES[problem.difficulty]?.label}</span>
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
                    {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER' && EXTERNAL_LINK_CATEGORIES.includes(category) && (
                        <span className="text-[10px] font-bold text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-2 py-px">
                            {problem.categoryData.platform}
                        </span>
                    )}
                </div>
                <h2 className="text-base font-bold text-text-primary mb-2">{problem.title}</h2>
                {hasExternalLink && (
                    <a href={problem.categoryData.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-soft border border-brand-line text-sm font-semibold text-brand-fg-soft hover:text-brand-200 hover:bg-brand-soft transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        Solve on {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER' ? problem.categoryData.platform : 'External Site'} →
                    </a>
                )}
                {/* SD/LLD description blocks removed — handled by Design Studio flow. */}
            </div>

            {/* Banners */}
            {hasExternalLink && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-info-soft border border-info-line rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">💡</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Solve first, then reflect here</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">Solve on {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER' ? problem.categoryData.platform : 'the external site'}, then paste your code below.</p>
                    </div>
                </motion.div>
            )}
            {/* SD/LLD instructional banners removed — those categories never reach this code. */}
            {isHR && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-danger-soft border border-danger-line rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🤝</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Analyze before you answer</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">Identify what the interviewer is really checking before writing your answer.</p>
                    </div>
                </motion.div>
            )}
            {isBehavioral && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-success-soft border border-success-line rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🗣️</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Name the competency before writing your story</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">Candidates who identify the competency first write targeted, specific answers.</p>
                    </div>
                </motion.div>
            )}
            {isTechnicalKnowledge && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-warning-soft border border-warning-line rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🧠</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">Explain the mechanism, not the definition</p>
                        <p className="text-xs text-text-tertiary leading-relaxed">Interviewers probe until you hit your ceiling — start deep.</p>
                    </div>
                </motion.div>
            )}
            {isDatabase && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-brand-soft border border-brand-line rounded-xl p-4 mb-6 flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">🗄️</span>
                    <div>
                        <p className="text-sm font-semibold text-text-primary mb-0.5">
                            {dbProblemType === 'SCHEMA_DESIGN' ? 'Design the schema before writing any SQL' : 'Analyze the schema before writing the query'}
                        </p>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            {dbProblemType === 'SCHEMA_DESIGN' ? 'Interviewers evaluate the reasoning, not just whether the tables exist.' : 'Understanding the schema is 50% of writing a correct query.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Form sections */}
            <div className="space-y-5">
                {isHR ? (
                    <HRWorkspace hrData={hrData} onHrDataChange={setHrData} questionCategory={hrQuestionCategory} onQuestionCategoryChange={setHrQuestionCategory} />
                ) : isBehavioral ? (
                    <BehavioralWorkspace behavioralData={behavioralData} onBehavioralDataChange={setBehavioralData} />
                ) : isTechnicalKnowledge ? (
                    <TechnicalKnowledgeWorkspace tkData={tkData} onTkDataChange={setTkData} />
                ) : isDatabase ? (
                    <DatabaseWorkspace dbData={dbData} onDbDataChange={setDbData} problemType={dbProblemType} schemaReference={dbSchemaReference} />
                ) : (
                    <>
                        {SUBMIT_TABBED_ENABLED && (category === 'CODING' || hasExternalLink) ? (
                            // Tabbed editor — same component Edit uses. Submit ↔ Edit
                            // are now structurally identical for CODING.
                            <FormSection icon="💻" title="Solutions"
                                hint="Add a Brute Force first, then your Optimized approach. AI reviews both.">
                                <SolutionTabs
                                    solutions={solutionTabs}
                                    onChange={setSolutionTabs}
                                />
                                <p className="text-[10px] text-text-disabled mt-2">🤖 AI will check correctness, detect edge cases, analyze complexity, and flag any issues</p>
                            </FormSection>
                        ) : (
                            <>
                                {(category === 'CODING' || category === 'SQL' || hasExternalLink) && (
                                    <FormSection icon="💻" title={hasExternalLink ? 'Paste Your Solution Code' : (formConfig.solutionTabConfig?.codeLabel || 'Your Code')}
                                        hint="AI will analyze correctness, complexity, and detect any issues">
                                        <CodeEditor code={code} onChange={setCode} language={language}
                                            onLanguageChange={lang => { setLanguage(lang); localStorage.setItem('ps_last_language', lang) }}
                                            selectorStyle="dropdown" languages={SUBMIT_LANGUAGES} height="320px" showLanguageSelector />
                                        <p className="text-[10px] text-text-disabled mt-2">🤖 AI will check correctness, detect edge cases, analyze complexity, and flag any issues</p>
                                    </FormSection>
                                )}

                                <FormSection
                                    icon={category === 'BEHAVIORAL' ? '🎯' : category === 'LOW_LEVEL_DESIGN' ? '📐' : '📝'}
                                    title={category === 'BEHAVIORAL' ? (formConfig.actionField?.label || 'Your Response') : category === 'CS_FUNDAMENTALS' ? 'Your Explanation' : category === 'LOW_LEVEL_DESIGN' ? 'Your Design Approach' : 'Your Approach'}
                                    hint={hasExternalLink ? 'Explain your thought process. What pattern did you use and why?' : category === 'BEHAVIORAL' ? (formConfig.actionField?.hint || 'Use STAR format — be specific about YOUR actions.') : category === 'LOW_LEVEL_DESIGN' ? 'Walk through your entity identification and class hierarchy.' : 'Describe your approach step by step. Tab to indent pseudocode.'}
                                >
                                    <RichTextEditor content={approach} onChange={setApproach}
                                        placeholder={hasExternalLink ? 'Walk through your approach: pattern identification, why this approach, alternatives considered...' : fields.patternReasoning?.placeholder || 'Write your approach here...'}
                                        minHeight={category === 'CODING' && hasExternalLink ? '120px' : '180px'}
                                        tabInserts={category === 'CODING' || category === 'LOW_LEVEL_DESIGN' || hasExternalLink} />
                                </FormSection>
                            </>
                        )}


                        {fields.patternIdentified?.show && (
                            <FormSection icon="🧩" title={fields.patternIdentified.label || 'Pattern Identified'}
                                hint="AI will verify if your identified pattern matches your solution">
                                <PatternSelector
                                    value={patterns}
                                    onChange={setPatterns}
                                    suggestions={fields.patternIdentified?.suggestions}
                                />
                            </FormSection>
                        )}

                        {fields.patternIdentified?.show && (
                            <FormSection icon="🧭" title="How did you solve it?"
                                hint="Honest signal for AI calibration. SAW_APPROACH heavily discounts confidence; only solves marked COLD count toward Pattern Mastery progression.">
                                <SolveMethodPicker value={solveMethod} onChange={setSolveMethod} />
                            </FormSection>
                        )}

                        {fields.keyInsight?.show && (
                            <FormSection icon="💡" title={fields.keyInsight.label || 'Key Insight'} hint={fields.keyInsight.hint} className="bg-brand-soft border-brand-line">
                                <textarea rows={4} value={keyInsight} onChange={e => setKeyInsight(e.target.value)}
                                    placeholder={fields.keyInsight.placeholder || 'The one thing that makes this click...'}
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-tertiary px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20" />
                            </FormSection>
                        )}

                        {fields.simpleExplanation?.show && (
                            <FormSection icon="🗣" title={fields.simpleExplanation.label || 'Explain It Simply'} hint="Explain to someone who doesn't know the topic">
                                <RichTextEditor content={feynmanExplanation} onChange={setFeynmanExplanation}
                                    placeholder={fields.simpleExplanation.placeholder || 'Explain in simple terms...'} minHeight="100px" />
                            </FormSection>
                        )}

                        {fields.challenges?.show && (
                            <FormSection icon="🤔" title={fields.challenges.label || 'What Was Challenging?'}>
                                <RichTextEditor content={realWorldConnection} onChange={setRealWorldConnection}
                                    placeholder={fields.challenges.placeholder || 'Where did you get stuck? What made this harder than expected?'} minHeight="80px" />
                            </FormSection>
                        )}
                    </>
                )}

                {/* Confidence — all categories */}
                <FormSection icon="📊" title="Confidence Level"
                    hint={
                        isHR ? 'How authentic and specific does this answer feel?'
                            : isBehavioral ? 'How strong is your story? Does your Action section show clear ownership?'
                                : isTechnicalKnowledge ? 'How deep is your understanding? Could you answer a follow-up without notes?'
                                    : isDatabase ? 'Would your solution handle NULL values, empty tables, and large datasets correctly?'
                                        : "Be honest — AI will flag if your confidence doesn't match your solution quality"
                    }>
                    {/* Bug 3 fix: use handleConfidenceChange instead of setConfidence directly */}
                    <ConfidencePicker value={confidence} onChange={handleConfidenceChange} />
                </FormSection>

                {/* Follow-up questions */}
                {problem.followUpQuestions?.length > 0 && (
                    <FormSection icon={isHR ? '💬' : '🧠'}
                        title={isHR ? 'Probing Follow-up Questions' : 'Follow-up Questions'}
                        badge={answeredCount > 0 ? `${answeredCount}/${followUpCount} answered` : 'Optional — earn bonus points'}
                        hint={isHR ? 'These are the follow-up questions a real HR interviewer would ask.' : 'Each answer earns bonus points in your AI review. Skipped questions are noted.'}>
                        <div className="space-y-3">
                            {problem.followUpQuestions.map((fq, i) => (
                                <FollowUpWithAnswer key={fq.id} followUp={fq} index={i}
                                    answer={followUpAnswers[fq.id] || ''} onAnswerChange={handleFollowUpAnswer} isHR={isHR} />
                            ))}
                        </div>
                        {followUpCount > 0 && (
                            <div className="mt-4 pt-4 border-t border-border-subtle">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="text-text-disabled">Progress</span>
                                    <span className={cn('font-semibold', answeredCount === followUpCount ? 'text-success-fg' : answeredCount > 0 ? 'text-brand-fg-soft' : 'text-text-disabled')}>
                                        {answeredCount}/{followUpCount} answered
                                        {!isHR && answeredCount > 0 && `(+${Math.min(answeredCount * 0.5, 2).toFixed(1)} bonus)`}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                    <motion.div animate={{ width: `${followUpCount > 0 ? (answeredCount / followUpCount) * 100 : 0}%` }} transition={{ duration: 0.4 }}
                                        className={cn('h-full rounded-full', answeredCount === followUpCount ? 'bg-success' : 'bg-brand-400')} />
                                </div>
                            </div>
                        )}
                    </FormSection>
                )}
            </div>

            {/* Sticky submit bar */}
            <div className="sticky bottom-0 bg-surface-0/90 backdrop-blur-lg border-t border-border-default mt-6 -mx-6 px-6 py-4">
                <div className="max-w-[800px] mx-auto flex items-center justify-between">
                    {/* Bug fix: correct navigate syntax */}
                    <Button type="button" variant="ghost" size="md" onClick={() => navigate(`/problems/${problemId}`)}>
                        Cancel
                    </Button>
                    <div className="flex items-center gap-3">
                        {(() => {
                            if (isHR) {
                                const workspaceEmpty = (hrData.underlyingConcern?.trim().length ?? 0) === 0 && (hrData.answer?.trim().length ?? 0) === 0
                                if (workspaceEmpty) return <span className="text-xs text-warning-fg hidden sm:block font-semibold">Fill in the Answer workspace above first</span>
                            }
                            if (confidence == null) return <span className="text-xs text-text-disabled hidden sm:block">Set confidence to submit</span>
                            return null
                        })()}
                        <Button type="button" variant="primary" size="lg" loading={submitSolution.isPending} disabled={confidence == null} onClick={onSubmit}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {isHR ? 'Submit My Answer'
                                : isBehavioral ? 'Submit My Story'
                                    : isTechnicalKnowledge ? 'Submit Explanation'
                                        : isDatabase ? (dbProblemType === 'SCHEMA_DESIGN' ? 'Submit Schema Design' : 'Submit Query')
                                            : 'Submit Solution'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}