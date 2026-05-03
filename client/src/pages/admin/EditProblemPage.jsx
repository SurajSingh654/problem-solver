// ============================================================================
// ProbSolver v3.0 — Edit Problem Page (Standalone, No ProblemForm dependency)
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Independent — does not use ProblemForm.jsx. That component was designed
//    for both creation and editing which made it complex and hard to maintain.
//    This page owns its entire form state and rendering.
//
// 2. Category is read-only — changing a problem's category after solutions
//    have been submitted would invalidate all existing solution data (wrong
//    tabs displayed, AI review rubric mismatch, 6D report dimension cross-feed
//    using wrong category signals). Show it but do not allow editing.
//
// 3. Follow-ups use existing FollowUpBuilder — the component is solid and
//    reusable. Added isHR prop for stakes label display.
//
// 4. HR-specific: difficulty renders as stakes (Common/Tricky/Sensitive),
//    hrQuestionCategory selector shows all 6 HR question categories.
//
// 5. Dirty state tracking — form tracks whether it has unsaved changes
//    and shows a visible indicator. Prevents accidental data loss.
//
// 6. Two-column layout — content (title, description, notes, follow-ups) on
//    the left, settings (difficulty, tags, visibility) on the right.
//    Mirrors standard CMS patterns.
//
// ============================================================================
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblem, useUpdateProblem, useDeleteProblem } from '@hooks/useProblems'
import { FollowUpBuilder } from '@components/features/admin/FollowUpBuilder'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import {
    PROBLEM_CATEGORIES,
    COMPANIES,
    PATTERNS,
    HR_STAKES,
    HR_QUESTION_CATEGORIES,
    HR_QUESTION_CATEGORY_MAP,
} from '@utils/constants'

// ── Constants ──────────────────────────────────────────
const DIFFICULTY_OPTIONS = [
    { id: 'EASY', label: 'Easy', color: 'bg-success/12 border-success/30 text-success' },
    { id: 'MEDIUM', label: 'Medium', color: 'bg-warning/12 border-warning/30 text-warning' },
    { id: 'HARD', label: 'Hard', color: 'bg-danger/12 border-danger/30 text-danger' },
]

const SOURCES = ['LEETCODE', 'GFG', 'CODECHEF', 'INTERVIEWBIT', 'HACKERRANK', 'CODEFORCES', 'OTHER']
const SOURCE_LABELS = {
    LEETCODE: 'LeetCode', GFG: 'GeeksForGeeks', CODECHEF: 'CodeChef',
    INTERVIEWBIT: 'InterviewBit', HACKERRANK: 'HackerRank', CODEFORCES: 'Codeforces', OTHER: 'Other',
}

// Categories where an external source URL is meaningful
const EXTERNAL_LINK_CATEGORIES = new Set(['CODING', 'SQL'])

// Category-specific description labels and placeholders
const DESCRIPTION_CONFIG = {
    CODING: {
        label: 'Problem Description',
        hint: 'Full problem statement with examples and constraints. Members solve on the external site — this provides context.',
        placeholder: 'Add extra context or constraints if needed...',
        rows: 6,
    },
    SYSTEM_DESIGN: {
        label: 'Design Brief',
        hint: 'This IS the problem. Include the system to design, scale requirements, and key constraints.',
        placeholder: 'Describe the system to design:\n• What the system does\n• Expected scale (users, requests)\n• Core features required\n• Specific constraints',
        rows: 10,
    },
    LOW_LEVEL_DESIGN: {
        label: 'Design Challenge',
        hint: 'This IS the problem. Be specific about scope, operations, and constraints.',
        placeholder: 'Describe the design challenge:\n• What is the core entity to design?\n• What operations must it support?\n• What are the constraints?\n• What follow-up requirements might arise?',
        rows: 8,
    },
    BEHAVIORAL: {
        label: 'Question & Context',
        hint: 'Write the behavioral question and add coaching context for what makes a strong answer.',
        placeholder: 'The behavioral question and any context that helps members understand what a great answer looks like...',
        rows: 6,
    },
    CS_FUNDAMENTALS: {
        label: 'Topic Description',
        hint: 'Describe the concept and expected depth of coverage.',
        placeholder: 'Describe the concept and expected depth:\n• Core concept to explain\n• Sub-topics to cover\n• Common misconceptions to address',
        rows: 6,
    },
    HR: {
        label: 'The Question',
        hint: 'Write the HR interview question exactly as it would be asked. Add any context that helps members understand what is really being assessed.',
        placeholder: 'Write the HR interview question here...\n\nOptionally add context about what makes a strong answer.',
        rows: 5,
    },
    SQL: {
        label: 'Problem Statement & Schema',
        hint: 'Describe the schema and what the query should return. External link is optional for additional test cases.',
        placeholder: 'Describe the SQL problem:\n• Table schemas with column types\n• What the query should return\n• Sample data if helpful',
        rows: 8,
    },
}

// ── Section card wrapper ───────────────────────────────
function Section({ title, icon, children, className }) {
    return (
        <div className={cn(
            'bg-surface-1 border border-border-default rounded-2xl p-5',
            className
        )}>
            {title && (
                <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                    {icon && <span>{icon}</span>}
                    {title}
                </h2>
            )}
            {children}
        </div>
    )
}

// ── Field label ────────────────────────────────────────
function FieldLabel({ children, hint, optional }) {
    return (
        <div className="mb-1.5">
            <label className="block text-xs font-semibold text-text-primary">
                {children}
                {optional && (
                    <span className="ml-1.5 font-normal text-text-disabled">optional</span>
                )}
            </label>
            {hint && (
                <p className="text-[11px] text-text-tertiary mt-0.5 leading-relaxed">{hint}</p>
            )}
        </div>
    )
}

// ── Chip input (tags / company tags) ──────────────────
function ChipInput({ label, hint, value, onChange, suggestions = [], placeholder }) {
    const [input, setInput] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)

    const filtered = input.trim()
        ? suggestions.filter(s =>
            s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s)
        ).slice(0, 8)
        : []

    function add(tag) {
        const trimmed = tag.trim()
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed])
        }
        setInput('')
        setShowSuggestions(false)
    }

    function remove(tag) {
        onChange(value.filter(t => t !== tag))
    }

    function handleKey(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            if (input.trim()) add(input)
        }
        if (e.key === 'Backspace' && !input && value.length > 0) {
            remove(value[value.length - 1])
        }
    }

    return (
        <div>
            <FieldLabel hint={hint} optional>{label}</FieldLabel>
            <div className="relative">
                <div className={cn(
                    'min-h-[42px] flex flex-wrap gap-1.5 items-center p-2',
                    'bg-surface-3 border border-border-strong rounded-xl',
                    'focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20'
                )}>
                    {value.map(tag => (
                        <span key={tag}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg
                                       bg-brand-400/15 border border-brand-400/25 text-brand-300
                                       text-xs font-semibold">
                            {tag}
                            <button
                                type="button"
                                onClick={() => remove(tag)}
                                className="text-brand-300/60 hover:text-danger transition-colors ml-0.5"
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </span>
                    ))}
                    <input
                        type="text"
                        value={input}
                        onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
                        onKeyDown={handleKey}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                        placeholder={value.length === 0 ? placeholder : ''}
                        className="flex-1 min-w-[120px] bg-transparent text-sm text-text-primary
                                   placeholder:text-text-tertiary outline-none"
                    />
                </div>
                {showSuggestions && filtered.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2
                                    border border-border-strong rounded-xl shadow-lg z-10
                                    overflow-hidden">
                        {filtered.map(s => (
                            <button
                                key={s}
                                type="button"
                                onMouseDown={() => add(s)}
                                className="w-full text-left px-3 py-2 text-xs text-text-secondary
                                           hover:bg-surface-3 hover:text-text-primary transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <p className="text-[10px] text-text-disabled mt-1">
                Press Enter or comma to add
            </p>
        </div>
    )
}

// ── Delete confirmation ────────────────────────────────
function DeleteConfirmation({ problemTitle, onConfirm, onCancel, isDeleting }) {
    const [confirmText, setConfirmText] = useState('')
    const matches = confirmText.trim().toLowerCase() === 'delete'

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-danger/5 border border-danger/25 rounded-2xl p-5"
        >
            <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-danger/15 flex items-center
                                justify-center text-lg flex-shrink-0">
                    🗑️
                </div>
                <div>
                    <p className="text-sm font-bold text-danger mb-1">
                        Delete "{problemTitle}"?
                    </p>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        This will permanently delete the problem, all submitted solutions,
                        follow-up answers, AI feedback, and clarity ratings.
                        This cannot be undone.
                    </p>
                </div>
            </div>
            <div className="mb-4">
                <FieldLabel hint='Type "delete" to confirm'>Confirm deletion</FieldLabel>
                <input
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder='Type "delete" to confirm'
                    className="w-full bg-surface-3 border border-danger/30 rounded-xl
                               text-sm text-text-primary placeholder:text-text-tertiary
                               px-3.5 py-2.5 outline-none
                               focus:border-danger focus:ring-2 focus:ring-danger/20"
                />
            </div>
            <div className="flex gap-3">
                <Button variant="ghost" size="md" onClick={onCancel} disabled={isDeleting}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="md"
                    disabled={!matches}
                    loading={isDeleting}
                    onClick={onConfirm}
                    className="bg-danger hover:bg-danger/90"
                >
                    Delete Problem
                </Button>
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function EditProblemPage() {
    const { problemId } = useParams()
    const navigate = useNavigate()
    const { data: problem, isLoading, isError } = useProblem(problemId)
    const updateProblem = useUpdateProblem()
    const deleteProblem = useDeleteProblem()

    // ── Form state ──────────────────────────────────────
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [adminNotes, setAdminNotes] = useState('')
    const [difficulty, setDifficulty] = useState('MEDIUM')
    const [tags, setTags] = useState([])
    const [companyTags, setCompanyTags] = useState([])
    const [sourceUrl, setSourceUrl] = useState('')
    const [platform, setPlatform] = useState('OTHER')
    const [isPinned, setIsPinned] = useState(false)
    const [isHidden, setIsHidden] = useState(false)
    const [followUps, setFollowUps] = useState([])
    const [hrQuestionCategory, setHrQuestionCategory] = useState('')
    const [realWorldContext, setRealWorldContext] = useState('')
    const [useCases, setUseCases] = useState('')

    // ── UI state ────────────────────────────────────────
    const [isDirty, setIsDirty] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [initialized, setInitialized] = useState(false)

    // ── Pre-fill form when problem loads ──────────────
    useEffect(() => {
        if (!problem || initialized) return

        setTitle(problem.title || '')
        setDescription(problem.description || '')
        setAdminNotes(problem.adminNotes || '')
        setDifficulty(problem.difficulty || 'MEDIUM')
        setTags(problem.tags || [])
        setCompanyTags(problem.categoryData?.companyTags || problem.companyTags || [])
        setSourceUrl(problem.categoryData?.sourceUrl || '')
        setPlatform(problem.categoryData?.platform || 'OTHER')
        setIsPinned(problem.isPinned || false)
        setIsHidden(problem.isHidden || false)
        setRealWorldContext(problem.realWorldContext || '')
        setUseCases(
            Array.isArray(problem.useCases)
                ? problem.useCases.join('\n')
                : problem.useCases || ''
        )
        // Follow-ups from the problem — include id for server upsert
        setFollowUps(
            (problem.followUpQuestions || []).map(fq => ({
                id: fq.id,
                question: fq.question || '',
                difficulty: fq.difficulty || 'MEDIUM',
                hint: fq.hint || '',
                order: fq.order || 0,
            }))
        )
        // HR question category stored in categoryData
        setHrQuestionCategory(problem.categoryData?.hrQuestionCategory || '')

        setInitialized(true)
        setIsDirty(false)
    }, [problem, initialized])

    // ── Mark dirty on any change ───────────────────────
    // We use a separate handler rather than useEffect on every field
    // to avoid false dirty on initial load.
    function markDirty() {
        if (initialized) setIsDirty(true)
    }

    function handleChange(setter) {
        return (value) => {
            setter(value)
            markDirty()
        }
    }

    // ── Save ───────────────────────────────────────────
    async function handleSave() {
        if (!title.trim()) {
            toast.error('Title is required')
            return
        }

        const data = {
            title: title.trim(),
            description: description.trim() || null,
            difficulty,
            adminNotes: adminNotes.trim() || null,
            realWorldContext: realWorldContext.trim() || null,
            useCases: useCases.trim() || null,
            tags,
            isPinned,
            isHidden,
            // Category data: source URL, platform, company tags, HR question category
            categoryData: {
                ...(problem.categoryData || {}),
                companyTags,
                ...(EXTERNAL_LINK_CATEGORIES.has(problem?.category) && {
                    sourceUrl: sourceUrl.trim() || '',
                    platform,
                }),
                ...(problem?.category === 'HR' && {
                    hrQuestionCategory: hrQuestionCategory || null,
                }),
            },
            // Follow-ups: sent as array, server handles upsert/delete
            followUps: followUps.map((fq, i) => ({
                ...(fq.id && { id: fq.id }),
                question: fq.question.trim(),
                difficulty: fq.difficulty,
                hint: fq.hint?.trim() || '',
                order: i,
            })).filter(fq => fq.question),
        }

        try {
            await updateProblem.mutateAsync({ problemId, data })
            toast.success('Problem saved.')
            setIsDirty(false)
        } catch {
            // error handled by mutation
        }
    }

    // ── Delete ─────────────────────────────────────────
    async function handleDelete() {
        try {
            await deleteProblem.mutateAsync(problemId)
            toast.success('Problem deleted.')
            navigate('/admin')
        } catch {
            // error handled by mutation
        }
    }

    // ── Loading / error states ─────────────────────────
    if (isLoading) return <PageSpinner />

    if (isError || !problem) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-text-secondary">Problem not found.</p>
                <Button variant="secondary" onClick={() => navigate('/admin')}>
                    Back to Admin
                </Button>
            </div>
        )
    }

    const category = problem.category
    const isHR = category === 'HR'
    const isSystemDesign = category === 'SYSTEM_DESIGN'
    const isLLD = category === 'LOW_LEVEL_DESIGN'
    const showExternalLink = EXTERNAL_LINK_CATEGORIES.has(category)
    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === category)
    const descConfig = DESCRIPTION_CONFIG[category] || DESCRIPTION_CONFIG.CODING
    const patternSuggestions = PATTERNS.map(p => p.label)

    return (
        <div className="p-6 max-w-[1100px] mx-auto">
            {/* ── Top bar ────────────────────────────── */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <button
                    onClick={() => navigate('/admin')}
                    className="flex items-center gap-1.5 text-sm text-text-tertiary
                               hover:text-text-primary transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Admin
                </button>
                <div className="flex items-center gap-3">
                    {isDirty && (
                        <motion.span
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-xs font-semibold text-warning flex items-center gap-1.5"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                            Unsaved changes
                        </motion.span>
                    )}
                    <Button
                        variant="primary"
                        size="md"
                        loading={updateProblem.isPending}
                        disabled={!isDirty}
                        onClick={handleSave}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* ── Page header ────────────────────────── */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h1 className="text-xl font-extrabold text-text-primary">Edit Problem</h1>
                    {catInfo && (
                        <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            catInfo.bg
                        )}>
                            {catInfo.icon} {catInfo.label}
                        </span>
                    )}
                    {/* Read-only notice */}
                    <span className="text-[10px] text-text-disabled bg-surface-3 border border-border-default
                                     rounded-full px-2 py-px">
                        Category locked — changing category invalidates existing solutions
                    </span>
                </div>
                <p className="text-xs text-text-tertiary">
                    {problem.teamSolutionCount > 0
                        ? `${problem.teamSolutionCount} team member${problem.teamSolutionCount !== 1 ? 's have' : ' has'} submitted solutions`
                        : 'No solutions submitted yet'
                    }
                    {problem.createdBy && ` · Added by ${problem.createdBy.name}`}
                </p>
            </div>

            {/* ── Two-column layout ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

                {/* ── LEFT COLUMN: Content ──────────── */}
                <div className="space-y-5">

                    {/* Title */}
                    <Section>
                        <FieldLabel hint="The problem title as shown to members">Title</FieldLabel>
                        <input
                            type="text"
                            value={title}
                            onChange={e => { setTitle(e.target.value); markDirty() }}
                            placeholder="e.g. Design a Messaging System like WhatsApp"
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                                       text-base font-bold text-text-primary placeholder:text-text-tertiary
                                       placeholder:font-normal px-3.5 py-3 outline-none
                                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </Section>

                    {/* Description / Problem Statement */}
                    <Section>
                        <FieldLabel hint={descConfig.hint}>
                            {descConfig.label}
                            {!isSystemDesign && !isLLD && !isHR && (
                                <span className="ml-1.5 font-normal text-text-disabled">optional</span>
                            )}
                        </FieldLabel>
                        <textarea
                            rows={descConfig.rows}
                            value={description}
                            onChange={e => { setDescription(e.target.value); markDirty() }}
                            placeholder={descConfig.placeholder}
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                                       text-sm text-text-primary placeholder:text-text-tertiary
                                       px-3.5 py-2.5 outline-none resize-y
                                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </Section>

                    {/* Real World Context — not for HR (no real-world context needed) */}
                    {!isHR && (
                        <Section title="Real World Context" icon="🌍">
                            <div className="space-y-4">
                                <div>
                                    <FieldLabel
                                        hint="2-3 sentences explaining where this pattern/concept appears in real production software."
                                        optional
                                    >
                                        Context
                                    </FieldLabel>
                                    <textarea
                                        rows={3}
                                        value={realWorldContext}
                                        onChange={e => { setRealWorldContext(e.target.value); markDirty() }}
                                        placeholder="e.g. This sliding window pattern is used by Netflix for rate limiting..."
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                                   text-sm text-text-primary placeholder:text-text-tertiary
                                                   px-3.5 py-2.5 outline-none resize-none
                                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                    />
                                </div>
                                <div>
                                    <FieldLabel
                                        hint="One use case per line. Format: Company/System — what they use it for"
                                        optional
                                    >
                                        Use Cases
                                    </FieldLabel>
                                    <textarea
                                        rows={4}
                                        value={useCases}
                                        onChange={e => { setUseCases(e.target.value); markDirty() }}
                                        placeholder="LinkedIn — rate limiting API endpoints&#10;Redis — LRU cache eviction&#10;Chrome — tab memory management"
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                                   text-sm text-text-primary placeholder:text-text-tertiary
                                                   px-3.5 py-2.5 outline-none resize-none
                                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                    />
                                </div>
                            </div>
                        </Section>
                    )}

                    {/* Admin Notes */}
                    <Section title="Admin Notes" icon="⚡">
                        <FieldLabel
                            hint={
                                isHR
                                    ? 'What a strong answer looks like. Common mistakes. Red flags. Unlocks for members after they submit.'
                                    : isSystemDesign || isLLD
                                        ? 'Expected approach, key trade-offs, what separates strong from weak answers. Unlocks for members after they submit.'
                                        : 'Internal teaching guide visible only to admins. Members never see this.'
                            }
                            optional
                        >
                            Teaching Notes
                        </FieldLabel>
                        <textarea
                            rows={8}
                            value={adminNotes}
                            onChange={e => { setAdminNotes(e.target.value); markDirty() }}
                            placeholder={
                                isHR
                                    ? 'What makes a strong answer:\n• Specific details (names real projects, numbers)\n• Company-specific evidence\n• Authentic, not rehearsed\n\nCommon mistakes:\n• Generic answers ("I love your innovative culture")\n• No specifics\n\nRed flags:\n• Badmouthing previous employers\n• No company research'
                                    : 'Teaching notes for this problem...\n\n1. Expected approach with complexity\n2. Key insight / aha moment\n3. Common mistakes\n4. Edge cases to cover'
                            }
                            className="w-full bg-warning/3 border border-warning/20 rounded-xl
                                       text-sm text-text-primary placeholder:text-text-tertiary
                                       px-3.5 py-2.5 outline-none resize-y
                                       focus:border-warning/40 focus:ring-2 focus:ring-warning/15"
                        />
                        <p className="text-[10px] text-text-disabled mt-1.5 flex items-center gap-1">
                            <span>🔒</span>
                            {isHR || isSystemDesign || isLLD
                                ? 'Unlocks for the member after they submit — used for post-submission comparison'
                                : 'Only visible to team admins'
                            }
                        </p>
                    </Section>

                    {/* Follow-up Questions */}
                    <Section title="Follow-up Questions" icon="🧠">
                        <p className="text-xs text-text-tertiary mb-4">
                            {isHR
                                ? 'Probing follow-ups a real HR interviewer would ask. Members answer these for extra AI feedback.'
                                : 'Progressive questions that deepen understanding. Members answer these when submitting solutions.'
                            }
                        </p>
                        <HRAwareFollowUpBuilder
                            value={followUps}
                            onChange={handleChange(setFollowUps)}
                            isHR={isHR}
                        />
                    </Section>

                    {/* Source URL — CODING and SQL only */}
                    {showExternalLink && (
                        <Section title="External Source" icon="🔗">
                            <div className="space-y-4">
                                <div>
                                    <FieldLabel hint="Direct link to the problem on the external platform" optional>
                                        Problem URL
                                    </FieldLabel>
                                    <input
                                        type="text"
                                        value={sourceUrl}
                                        onChange={e => { setSourceUrl(e.target.value); markDirty() }}
                                        placeholder="https://leetcode.com/problems/two-sum/"
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                                   text-sm text-text-primary placeholder:text-text-tertiary
                                                   px-3.5 py-2.5 outline-none
                                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Platform</FieldLabel>
                                    <div className="flex flex-wrap gap-2">
                                        {SOURCES.filter(s => {
                                            const cat = PROBLEM_CATEGORIES.find(c => c.id === category)
                                            return cat ? cat.sources.includes(s) : true
                                        }).map(s => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => { setPlatform(s); markDirty() }}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                                                    platform === s
                                                        ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                                        : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
                                                )}
                                            >
                                                {SOURCE_LABELS[s] || s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </Section>
                    )}

                    {/* Delete zone */}
                    {!showDeleteConfirm ? (
                        <div className="border border-danger/20 rounded-2xl p-4 flex items-center
                                        justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-sm font-bold text-text-primary">Delete Problem</p>
                                <p className="text-xs text-text-tertiary">
                                    Permanently removes this problem and all{' '}
                                    {problem.teamSolutionCount > 0
                                        ? `${problem.teamSolutionCount} submitted solution${problem.teamSolutionCount !== 1 ? 's' : ''}`
                                        : 'submitted solutions'
                                    }.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="text-xs font-bold text-danger hover:text-danger/80
                                           border border-danger/25 hover:border-danger/40
                                           px-4 py-2 rounded-xl transition-all"
                            >
                                Delete Problem
                            </button>
                        </div>
                    ) : (
                        <DeleteConfirmation
                            problemTitle={problem.title}
                            onConfirm={handleDelete}
                            onCancel={() => setShowDeleteConfirm(false)}
                            isDeleting={deleteProblem.isPending}
                        />
                    )}
                </div>

                {/* ── RIGHT COLUMN: Settings ─────────── */}
                <div className="space-y-5">

                    {/* Difficulty / Stakes */}
                    <Section
                        title={isHR ? 'Stakes Level' : 'Difficulty'}
                        icon={isHR ? '⚠️' : '📊'}
                    >
                        {isHR ? (
                            // HR: Stakes selector (Common/Tricky/Sensitive)
                            <div className="space-y-2">
                                {Object.values(HR_STAKES).map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => { setDifficulty(s.id); markDirty() }}
                                        className={cn(
                                            'w-full flex items-start gap-3 px-3 py-3 rounded-xl border',
                                            'text-left transition-all duration-150',
                                            difficulty === s.id
                                                ? `${s.bg} font-bold`
                                                : 'bg-surface-3 border-border-default hover:border-border-strong'
                                        )}
                                    >
                                        <span className="text-base mt-0.5">{s.icon}</span>
                                        <div>
                                            <p className={cn(
                                                'text-xs font-bold',
                                                difficulty === s.id ? s.color : 'text-text-secondary'
                                            )}>
                                                {s.label}
                                            </p>
                                            <p className="text-[10px] text-text-disabled leading-tight mt-0.5">
                                                {s.desc}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            // Standard: Easy/Medium/Hard
                            <div className="flex flex-col gap-2">
                                {DIFFICULTY_OPTIONS.map(d => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => { setDifficulty(d.id); markDirty() }}
                                        className={cn(
                                            'w-full py-2.5 rounded-xl border text-sm font-bold transition-all',
                                            difficulty === d.id
                                                ? d.color
                                                : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                        )}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Section>

                    {/* HR Question Category */}
                    {isHR && (
                        <Section title="Question Category" icon="🏷️">
                            <p className="text-[11px] text-text-tertiary mb-3 leading-relaxed">
                                Categorizing helps members understand what the interviewer is really checking
                                and enables tracking which HR question types have been practiced.
                            </p>
                            <div className="space-y-2">
                                {HR_QUESTION_CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => {
                                            setHrQuestionCategory(
                                                hrQuestionCategory === cat.id ? '' : cat.id
                                            )
                                            markDirty()
                                        }}
                                        className={cn(
                                            'w-full flex items-start gap-3 px-3 py-3 rounded-xl border',
                                            'text-left transition-all duration-150',
                                            hrQuestionCategory === cat.id
                                                ? `${cat.bg} font-bold`
                                                : 'bg-surface-3 border-border-default hover:border-border-strong'
                                        )}
                                    >
                                        <span className="text-base mt-0.5">{cat.icon}</span>
                                        <div className="min-w-0">
                                            <p className={cn(
                                                'text-xs font-bold leading-tight',
                                                hrQuestionCategory === cat.id ? cat.color : 'text-text-secondary'
                                            )}>
                                                {cat.label}
                                            </p>
                                            <p className="text-[10px] text-text-disabled leading-tight mt-0.5">
                                                {cat.desc}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Tags */}
                    {category !== 'HR' && (
                        <Section title="Tags" icon="🏷️">
                            <ChipInput
                                label={
                                    category === 'CODING' ? 'Algorithm Tags'
                                        : category === 'SQL' ? 'Query Patterns'
                                            : category === 'SYSTEM_DESIGN' ? 'Design Concepts'
                                                : category === 'LOW_LEVEL_DESIGN' ? 'Design Patterns'
                                                    : 'Topic Tags'
                                }
                                hint="Tag the patterns or concepts this problem covers"
                                value={tags}
                                onChange={handleChange(setTags)}
                                suggestions={patternSuggestions}
                                placeholder="Type a tag..."
                            />
                        </Section>
                    )}

                    {/* Company Tags — not for HR */}
                    {category !== 'HR' && (
                        <Section title="Company Tags" icon="🏢">
                            <ChipInput
                                label="Companies"
                                hint="Which companies ask this question?"
                                value={companyTags}
                                onChange={handleChange(setCompanyTags)}
                                suggestions={COMPANIES}
                                placeholder="Type a company..."
                            />
                        </Section>
                    )}

                    {/* Visibility & Pinning */}
                    <Section title="Visibility" icon="👁️">
                        <div className="space-y-3">
                            <ToggleRow
                                label="Pin Problem"
                                desc="Pinned problems appear at the top of the list"
                                value={isPinned}
                                onChange={handleChange(setIsPinned)}
                            />
                            <ToggleRow
                                label="Hide Problem"
                                desc="Hidden problems are not visible to members"
                                value={isHidden}
                                onChange={handleChange(setIsHidden)}
                                danger
                            />
                        </div>
                    </Section>

                    {/* Problem metadata (read-only) */}
                    <Section title="Problem Info" icon="ℹ️">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-disabled">Category</span>
                                {catInfo && (
                                    <span className={cn(
                                        'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                        catInfo.bg
                                    )}>
                                        {catInfo.icon} {catInfo.label}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-disabled">Source</span>
                                <span className="text-xs font-bold text-text-secondary">
                                    {problem.source === 'AI_GENERATED' ? '🤖 AI Generated' : '✏️ Manual'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-disabled">Solutions</span>
                                <span className="text-xs font-bold text-brand-300">
                                    {problem.teamSolutionCount || 0}
                                </span>
                            </div>
                            {problem.createdBy && (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-text-disabled">Created by</span>
                                    <span className="text-xs font-bold text-text-secondary">
                                        {problem.createdBy.name}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Section>
                </div>
            </div>

            {/* ── Sticky bottom save bar ─────────────── */}
            <AnimatePresence>
                {isDirty && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                                   bg-surface-1 border border-border-strong rounded-2xl
                                   shadow-xl px-6 py-3 flex items-center gap-4"
                    >
                        <span className="text-sm text-text-secondary">
                            You have unsaved changes
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setInitialized(false)
                                    setIsDirty(false)
                                }}
                            >
                                Discard
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                loading={updateProblem.isPending}
                                onClick={handleSave}
                            >
                                Save Changes
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ── Toggle row ─────────────────────────────────────────
function ToggleRow({ label, desc, value, onChange, danger }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div>
                <p className={cn('text-xs font-semibold', danger && value ? 'text-danger' : 'text-text-primary')}>
                    {label}
                </p>
                {desc && <p className="text-[10px] text-text-disabled mt-0.5">{desc}</p>}
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                className={cn(
                    'relative w-11 h-6 rounded-full border transition-all duration-300 flex-shrink-0',
                    value
                        ? danger ? 'bg-danger border-danger' : 'bg-brand-400 border-brand-400'
                        : 'bg-surface-4 border-border-strong'
                )}
            >
                <motion.div
                    animate={{ x: value ? 22 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                />
            </button>
        </div>
    )
}

// ── HR-aware FollowUpBuilder wrapper ──────────────────
// The existing FollowUpBuilder works for all categories.
// For HR, we need to display stakes labels (Common/Tricky/Sensitive)
// instead of Easy/Medium/Hard in the difficulty picker.
// We pass an isHR prop and override the difficulty display.
function HRAwareFollowUpBuilder({ value, onChange, isHR }) {
    if (!isHR) {
        return <FollowUpBuilder value={value} onChange={onChange} />
    }

    // For HR: we intercept the FollowUpBuilder's difficulty display
    // by passing a custom render. Since FollowUpBuilder doesn't support
    // custom difficulty labels, we use a wrapper that maps the values.
    // The stored values remain EASY/MEDIUM/HARD for DB compatibility.
    // The display is overridden here.
    return (
        <HRFollowUpBuilder value={value} onChange={onChange} />
    )
}

// ── HR-specific follow-up builder ─────────────────────
// Identical to FollowUpBuilder but uses stakes labels for difficulty.
// EASY = Common, MEDIUM = Tricky, HARD = Sensitive
function HRFollowUpBuilder({ value = [], onChange }) {
    function add() {
        onChange([...value, { question: '', difficulty: 'MEDIUM', hint: '' }])
    }

    function remove(index) {
        onChange(value.filter((_, i) => i !== index))
    }

    function update(index, field, val) {
        onChange(value.map((fq, i) => i === index ? { ...fq, [field]: val } : fq))
    }

    function move(from, to) {
        const arr = [...value]
        const [item] = arr.splice(from, 1)
        arr.splice(to, 0, item)
        onChange(arr)
    }

    return (
        <div className="space-y-2">
            <AnimatePresence mode="popLayout">
                {value.map((fq, i) => (
                    <HRFollowUpRow
                        key={i}
                        fq={fq}
                        index={i}
                        total={value.length}
                        onChange={update}
                        onRemove={remove}
                        onMove={move}
                    />
                ))}
            </AnimatePresence>
            <button
                type="button"
                onClick={add}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           border border-dashed border-border-strong text-text-tertiary
                           hover:border-brand-400/50 hover:text-brand-300
                           text-sm font-semibold transition-all duration-150"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Follow-up Question
            </button>
        </div>
    )
}

function HRFollowUpRow({ fq, index, total, onChange, onRemove, onMove }) {
    const [expanded, setExpanded] = useState(true)
    const stakes = HR_STAKES[fq.difficulty] || HR_STAKES.MEDIUM

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="bg-surface-2 border border-border-default rounded-xl overflow-hidden"
        >
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-1/50">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onMove(index, index - 1)}
                        className="text-text-disabled hover:text-text-primary disabled:opacity-30 transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        disabled={index === total - 1}
                        onClick={() => onMove(index, index + 1)}
                        className="text-text-disabled hover:text-text-primary disabled:opacity-30 transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>
                <span className="w-5 h-5 rounded-full bg-surface-3 border border-border-default
                                 flex items-center justify-center text-[11px] font-bold
                                 text-text-disabled flex-shrink-0">
                    {index + 1}
                </span>
                <p className="flex-1 text-sm font-medium text-text-primary truncate">
                    {fq.question || <span className="text-text-disabled italic">Untitled question</span>}
                </p>
                <span className={cn(
                    'text-[10px] font-bold px-2 py-px rounded-full border flex-shrink-0',
                    stakes.bg
                )}>
                    <span className={stakes.color}>{stakes.label}</span>
                </span>
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                >
                    <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </motion.div>
                </button>
                <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="text-text-disabled hover:text-danger transition-colors flex-shrink-0"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                </button>
            </div>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-3 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                    Question
                                </label>
                                <textarea
                                    rows={2}
                                    value={fq.question}
                                    onChange={e => onChange(index, 'question', e.target.value)}
                                    placeholder="e.g. What specifically attracted you to our mission — not our products?"
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                                               text-sm text-text-primary placeholder:text-text-tertiary
                                               px-3 py-2 outline-none resize-none
                                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>
                            {/* Stakes selector instead of Easy/Medium/Hard */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                    Stakes
                                </label>
                                <div className="flex gap-2">
                                    {Object.values(HR_STAKES).map(s => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => onChange(index, 'difficulty', s.id)}
                                            className={cn(
                                                'flex-1 px-3 py-2 rounded-xl border text-xs font-bold transition-all',
                                                fq.difficulty === s.id
                                                    ? s.bg
                                                    : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                            )}
                                        >
                                            <span className={fq.difficulty === s.id ? s.color : undefined}>
                                                {s.icon} {s.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                    Hint
                                    <span className="ml-1.5 font-normal text-text-disabled">optional</span>
                                </label>
                                <input
                                    type="text"
                                    value={fq.hint || ''}
                                    onChange={e => onChange(index, 'hint', e.target.value)}
                                    placeholder="A nudge toward a specific, authentic answer..."
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                                               text-sm text-text-primary placeholder:text-text-tertiary
                                               px-3 py-2 outline-none
                                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}