import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { FollowUpBuilder } from './FollowUpBuilder'
import { ChipInput } from '@components/ui/ChipInput'
import { Input } from '@components/ui/Input'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { useAIGenerateProblemContent, useAIStatus } from '@hooks/useAI'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import { COMPANIES, PATTERNS, SOURCE_LABELS, PROBLEM_CATEGORIES } from '@utils/constants'

const schema = z.object({
    title: z.string().min(2, 'Title is required').max(200),
    source: z.enum(['LEETCODE', 'GFG', 'CODECHEF', 'INTERVIEWBIT',
        'HACKERRANK', 'CODEFORCES', 'OTHER']),
    sourceUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')).default(''),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    category: z.enum(['CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL',
        'CS_FUNDAMENTALS', 'HR', 'SQL']).default('CODING'),
    description: z.string().optional().default(''),
    realWorldContext: z.string().optional().default(''),
    adminNotes: z.string().optional().default(''),
})

// Fields to show/hide per category
const CATEGORY_FIELD_CONFIG = {
    CODING: { showUrl: true, showDifficulty: true, showCompanyTags: true, showUseCases: true },
    SYSTEM_DESIGN: { showUrl: false, showDifficulty: true, showCompanyTags: true, showUseCases: true },
    BEHAVIORAL: { showUrl: false, showDifficulty: false, showCompanyTags: true, showUseCases: false },
    CS_FUNDAMENTALS: { showUrl: false, showDifficulty: true, showCompanyTags: false, showUseCases: true },
    HR: { showUrl: false, showDifficulty: false, showCompanyTags: false, showUseCases: false },
    SQL: { showUrl: true, showDifficulty: true, showCompanyTags: true, showUseCases: true },
}

const CATEGORY_DESCRIPTION_CONFIG = {
    CODING: {
        label: 'Problem Description',
        placeholder: 'Optional — the external link is the primary resource for coding problems.',
        hint: 'Add extra context if the external problem statement needs clarification.',
        required: false,
        rows: 3,
    },
    SYSTEM_DESIGN: {
        label: 'Problem Statement',
        placeholder: 'Describe what to design:\n• What the system does\n• Expected scale (users, QPS, storage)\n• Core features vs nice-to-have\n• Specific constraints',
        hint: 'This IS the problem — members will read this and design the system.',
        required: true,
        rows: 8,
    },
    BEHAVIORAL: {
        label: 'Question & Context',
        placeholder: 'Write the behavioral question and add context:\n• What is the interviewer really assessing?\n• What makes a strong answer?\n• Example scenarios to consider',
        hint: 'Help members understand what a great answer looks like.',
        required: true,
        rows: 6,
    },
    CS_FUNDAMENTALS: {
        label: 'Topic Description',
        placeholder: 'Describe the topic and expected depth:\n• Core concept to explain\n• Sub-topics to cover\n• Common misconceptions to address',
        hint: 'Guide members on how deep they should go.',
        required: true,
        rows: 6,
    },
    HR: {
        label: 'Question & Guidance',
        placeholder: 'Write the HR question and add guidance:\n• What is the interviewer really asking?\n• Tips for an authentic answer\n• What to research about the company',
        hint: 'Help members prepare thoughtful, specific responses.',
        required: true,
        rows: 6,
    },
    SQL: {
        label: 'Problem Statement & Schema',
        placeholder: 'Describe the SQL problem:\n• Table schemas (column names, types)\n• What the query should return\n• Sample data if helpful\n• Any constraints',
        hint: 'Describe the schema and requirements. External link is optional.',
        required: false,
        rows: 8,
    },
}

const DIFF_COLORS = {
    EASY: 'bg-success/12  border-success/30  text-success',
    MEDIUM: 'bg-warning/12  border-warning/30  text-warning',
    HARD: 'bg-danger/12   border-danger/30   text-danger',
}

const SOURCES = ['LEETCODE', 'GFG', 'CODECHEF', 'INTERVIEWBIT',
    'HACKERRANK', 'CODEFORCES', 'OTHER']

// ── Toggle switch ──────────────────────────────────────
function Toggle({ label, desc, value, onChange }) {
    return (
        <div className="flex items-center justify-between py-3
                    border-b border-border-subtle last:border-0">
            <div>
                <p className="text-sm font-semibold text-text-primary">{label}</p>
                {desc && <p className="text-xs text-text-tertiary mt-0.5">{desc}</p>}
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                className={cn(
                    'relative w-11 h-6 rounded-full border transition-all duration-300',
                    value
                        ? 'bg-brand-400 border-brand-400'
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

// ── Section wrapper ────────────────────────────────────
function FormSection({ title, icon, children }) {
    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span>{icon}</span>{title}
            </h3>
            {children}
        </div>
    )
}

// ── Textarea ───────────────────────────────────────────
function Textarea({ label, optional, hint, rows = 3, ...props }) {
    return (
        <div>
            {label && (
                <label className="block text-sm font-semibold text-text-primary mb-1.5">
                    {label}
                    {optional && (
                        <span className="ml-1.5 text-xs font-normal text-text-disabled">
                            optional
                        </span>
                    )}
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

// ── Main form ──────────────────────────────────────────
export function ProblemForm({ initialData, onSubmit, isSubmitting, submitLabel }) {
    const {
        register, handleSubmit, formState: { errors }, setValue, watch,
    } = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            title: initialData?.title || '',
            source: initialData?.source || 'LEETCODE',
            sourceUrl: initialData?.sourceUrl || '',
            difficulty: initialData?.difficulty || 'MEDIUM',
            category: initialData?.category || 'CODING',
            description: initialData?.description || '',
            realWorldContext: initialData?.realWorldContext || '',
            adminNotes: initialData?.adminNotes || '',
        },
    })

    // Uncontrolled state
    const [tags, setTags] = useState(initialData?.tags || [])
    const [companyTags, setCompanyTags] = useState(initialData?.companyTags || [])
    const [useCases, setUseCases] = useState(initialData?.useCases || [])
    const [followUps, setFollowUps] = useState(initialData?.followUps || [])
    const [isPinned, setIsPinned] = useState(initialData?.isPinned || false)
    const [isBlindChallenge, setIsBlindChallenge] = useState(initialData?.isBlindChallenge || false)

    const aiGenerate = useAIGenerateProblemContent()
    const { data: aiStatus } = useAIStatus()
    const aiEnabled = aiStatus?.enabled

    // THESE MUST COME FIRST — watch values
    const selectedSource = watch('source')
    const selectedDifficulty = watch('difficulty')
    const selectedCategory = watch('category')

    // THEN use selectedCategory
    const fieldConfig = CATEGORY_FIELD_CONFIG[selectedCategory] || CATEGORY_FIELD_CONFIG.CODING
    const descConfig = CATEGORY_DESCRIPTION_CONFIG[selectedCategory] || CATEGORY_DESCRIPTION_CONFIG.CODING
    const patternSuggestions = PATTERNS.map(p => p.label)

    function onFormSubmit(data) {
        onSubmit({
            ...data,
            sourceUrl: data.sourceUrl || `https://probsolver.app/${(data.category || 'coding').toLowerCase()}`,
            tags,
            companyTags: fieldConfig.showCompanyTags ? companyTags : [],
            useCases: fieldConfig.showUseCases ? useCases : [],
            followUps: followUps.map((fq, i) => ({ ...fq, order: i })),
            isPinned,
            isBlindChallenge,
        })
    }

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
            {/* ── Core info ─────────────────────────────── */}
            <FormSection title="Problem Info" icon="📋">

                {/* Category selector — ADD THIS */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Category
                    </label>
                    <p className="text-xs text-text-tertiary mb-3">
                        Determines the submission form members will see
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {PROBLEM_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                    setValue('category', cat.id)
                                    // Auto-set source to OTHER for non-coding categories
                                    if (!cat.sources.includes(selectedSource)) {
                                        setValue('source', 'OTHER')
                                    }
                                }}
                                className={cn(
                                    'flex items-center gap-2.5 px-3 py-3 rounded-xl border',
                                    'text-left transition-all duration-150',
                                    selectedCategory === cat.id
                                        ? `${cat.bg} ${cat.color} font-bold`
                                        : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary'
                                )}
                            >
                                <span className="text-lg flex-shrink-0">{cat.icon}</span>
                                <div>
                                    <span className="text-xs font-semibold block">{cat.label}</span>
                                    <span className="text-[10px] opacity-60 block leading-tight">
                                        {cat.desc}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title  */}

                <Input
                    label="Title"
                    placeholder="e.g. Two Sum"
                    error={errors.title?.message}
                    {...register('title')}
                />

                {/* Problem Description — category-aware */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-1.5">
                        {descConfig.label}
                        {descConfig.required && <span className="ml-1 text-danger text-xs">*</span>}
                        {!descConfig.required && (
                            <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>
                        )}
                    </label>
                    <p className="text-xs text-text-tertiary mb-2">{descConfig.hint}</p>
                    <textarea
                        rows={descConfig.rows}
                        placeholder={descConfig.placeholder}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                   text-sm text-text-primary placeholder:text-text-tertiary
                   px-3.5 py-2.5 outline-none resize-y
                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                   transition-all duration-150"
                        {...register('description')}
                    />
                </div>

                {/* Source */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Source Platform
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SOURCES.filter(s => {
                            // Show only sources valid for the selected category
                            const cat = PROBLEM_CATEGORIES.find(c => c.id === selectedCategory)
                            return cat ? cat.sources.includes(s) : true
                        }).map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setValue('source', s)}
                                className={cn(
                                    'px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all',
                                    selectedSource === s
                                        ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                        : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
                                )}
                            >
                                {SOURCE_LABELS[s] || s}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Problem URL — only for categories with external links */}
                {fieldConfig.showUrl && (
                    <Input
                        label="Problem URL"
                        placeholder="https://leetcode.com/problems/two-sum/"
                        error={errors.sourceUrl?.message}
                        leftIcon={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                        }
                        {...register('sourceUrl')}
                    />
                )}
                {/* Difficulty */}
                {fieldConfig.showDifficulty && (
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-2">
                            Difficulty
                        </label>
                        <div className="flex gap-2">
                            {['EASY', 'MEDIUM', 'HARD'].map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setValue('difficulty', d)}
                                    className={cn(
                                        'flex-1 py-2 rounded-xl border text-xs font-bold transition-all',
                                        selectedDifficulty === d
                                            ? DIFF_COLORS[d]
                                            : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                        {errors.difficulty && (
                            <p className="text-xs text-danger mt-1">{errors.difficulty.message}</p>
                        )}
                    </div>
                )}
            </FormSection>

            {/* ── Tags ──────────────────────────────────── */}
            <FormSection title="Tags & Companies" icon="🏷️">
                <ChipInput
                    label="Algorithm Tags"
                    hint="Select from suggestions or type a custom tag"
                    value={tags}
                    onChange={setTags}
                    suggestions={patternSuggestions}
                    placeholder="Type a tag or pick from suggestions…"
                />

                {/* Company Tags — conditional */}
                {fieldConfig.showCompanyTags && (
                    <ChipInput
                        label="Company Tags"
                        hint="Which companies ask this problem?"
                        value={companyTags}
                        onChange={setCompanyTags}
                        suggestions={COMPANIES}
                        placeholder="Type a company or pick from suggestions…"
                    />
                )}
            </FormSection>

            {/* ── Learning content ───────────────────────── */}
            <FormSection title="Learning Content" icon="🌍">
                {/* AI Generate button */}
                {aiEnabled && (
                    <div className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">🤖</span>
                                <div>
                                    <p className="text-sm font-bold text-text-primary">
                                        Generate with AI
                                    </p>
                                    <p className="text-xs text-text-tertiary">
                                        AI fills in context, use cases, notes, and follow-ups
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                loading={aiGenerate.isPending}
                                onClick={async () => {
                                    const title = watch('title')
                                    const source = watch('source')
                                    const sourceUrl = watch('sourceUrl')
                                    const difficulty = watch('difficulty')

                                    if (!title) {
                                        toast.warning('Enter a problem title first')
                                        return
                                    }

                                    // Check if any fields already have content
                                    const hasExisting =
                                        watch('realWorldContext') ||
                                        watch('adminNotes') ||
                                        useCases.length > 0 ||
                                        followUps.length > 0

                                    if (hasExisting) {
                                        const confirmed = window.confirm(
                                            'AI-generated content will replace your current entries for:\n\n' +
                                            '• Real World Context\n' +
                                            '• Use Cases\n' +
                                            '• Admin Notes\n' +
                                            '• Follow-up Questions\n\n' +
                                            'Continue?'
                                        )
                                        if (!confirmed) return
                                    }

                                    try {
                                        const res = await aiGenerate.mutateAsync({
                                            title, source, sourceUrl, difficulty, tags,
                                            category: watch('category'),
                                        })
                                        const content = res.data.data

                                        if (content.realWorldContext) {
                                            setValue('realWorldContext', content.realWorldContext)
                                        }
                                        if (content.adminNotes) {
                                            setValue('adminNotes', content.adminNotes)
                                        }
                                        if (content.useCases?.length) {
                                            setUseCases(content.useCases)
                                        }
                                        if (content.followUps?.length) {
                                            setFollowUps(content.followUps.map((fq) => ({
                                                question: fq.question,
                                                difficulty: fq.difficulty,
                                                hint: fq.hint || '',
                                            })))
                                        }

                                        toast.success('AI generated content! Review and edit as needed.')
                                    } catch {
                                        // error handled by hook
                                    }
                                }}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                                {aiGenerate.isPending ? 'Generating...' : 'Generate with AI'}
                            </Button>
                        </div>
                    </div>
                )}
                <Textarea
                    label="Real World Context"
                    optional
                    hint="Where does this problem pattern appear in real software?"
                    placeholder="e.g. Hash maps are used in database indexing to achieve O(1) lookups…"
                    rows={3}
                    {...register('realWorldContext')}   // ← add this
                />

                {/* Use Cases — conditional */}
                {fieldConfig.showUseCases && (
                    <ChipInput
                        label="Use Cases"
                        optional
                        hint="Specific real-world use cases (press Enter to add)"
                        value={useCases}
                        onChange={setUseCases}
                        placeholder="e.g. DNS lookup caching…"
                    />
                )}

                <Textarea
                    label="Admin Notes"
                    optional
                    hint="Internal notes visible only to admins"
                    placeholder="Teaching notes, common mistakes, hints for review…"
                    rows={2}
                    {...register('adminNotes')}   // ← add this
                />
            </FormSection>

            {/* ── Options ───────────────────────────────── */}
            <FormSection title="Options" icon="⚙️">
                <Toggle
                    label="Pin Problem"
                    desc="Pinned problems appear at the top of the list"
                    value={isPinned}
                    onChange={setIsPinned}
                />
                <Toggle
                    label="Blind Challenge"
                    desc="Hides the problem source — simulates a real interview"
                    value={isBlindChallenge}
                    onChange={setIsBlindChallenge}
                />
            </FormSection>

            {/* ── Follow-up questions ────────────────────── */}
            <FormSection title="Follow-up Questions" icon="🧠">
                <p className="text-xs text-text-tertiary">
                    Follow-ups deepen understanding. Members answer these when submitting solutions.
                </p>
                <FollowUpBuilder value={followUps} onChange={setFollowUps} />
            </FormSection>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2">
                <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={isSubmitting}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {submitLabel || 'Save Problem'}
                </Button>
            </div>
        </form>
    )
}