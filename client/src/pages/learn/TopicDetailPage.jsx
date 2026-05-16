// ============================================================================
// Learn — Topic Detail (v1 scaffold)
// ============================================================================
//
// Renders the published concept graph for a Topic + the user's enrollment
// state and per-concept mastery scores. v1 = read-only graph view +
// enrollment lifecycle. The Mentor Orchestrator (planNextAction, mentor
// chat, calibration quiz) lands in a follow-up commit.
// ============================================================================
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { useTopic, useTopicState, useEnrollInTopic, useUpdateEnrollment } from '@hooks/useTopics'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'

export default function TopicDetailPage() {
    const { slug } = useParams()
    const navigate = useNavigate()
    const topicQ = useTopic(slug)
    const stateQ = useTopicState(slug)

    // Hook order is invariant — compute the mastery map up front so the
    // early returns below don't trip the rules-of-hooks linter. `masteries`
    // may be undefined while loading; the memo handles that.
    const masteryByConcept = useMemo(() => {
        const m = new Map()
        for (const row of stateQ.data?.masteries ?? []) m.set(row.conceptId, row)
        return m
    }, [stateQ.data?.masteries])

    if (topicQ.isLoading || stateQ.isLoading) {
        return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
    }
    if (topicQ.isError || !topicQ.data) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <div className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm text-danger-fg">
                    Topic not found. <button className="underline" onClick={() => navigate('/learn')}>Back to topics</button>
                </div>
            </div>
        )
    }

    const { topic, concepts } = topicQ.data
    const { enrolled, enrollment } = stateQ.data ?? {}

    return (
        <div className="p-6 max-w-[1100px] mx-auto space-y-6">
            <button
                type="button"
                onClick={() => navigate('/learn')}
                className="text-xs font-semibold text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1"
            >
                ← All topics
            </button>

            <header className="space-y-2">
                <h1 className="text-2xl font-extrabold text-text-primary">{topic.name}</h1>
                <p className="text-sm text-text-tertiary leading-relaxed max-w-3xl">
                    {topic.description}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-text-disabled">
                    <span>📖 {concepts.length} concepts published</span>
                    {topic.estimatedHoursToMastery != null && (
                        <span>⏱ ~{topic.estimatedHoursToMastery}h to mastery</span>
                    )}
                    {topic.mockInterviewCategory && (
                        <span>🎯 Validates via {topic.mockInterviewCategory.replace(/_/g, ' ')} Mock Interview</span>
                    )}
                </div>
            </header>

            {!enrolled ? (
                <EnrollPanel slug={slug} />
            ) : (
                <EnrollmentPanel slug={slug} enrollment={enrollment} />
            )}

            <section className="space-y-3">
                <h2 className="text-xs font-bold text-text-disabled uppercase tracking-widest">
                    Concept graph
                </h2>
                {concepts.length === 0 ? (
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-8 text-center text-sm text-text-tertiary">
                        No published concepts yet — admin needs to review and publish DRAFT content.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        {concepts.map((c, i) => (
                            <ConceptRow
                                key={c.id}
                                concept={c}
                                index={i}
                                mastery={masteryByConcept.get(c.id)}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

// ── Enroll panel — shown when not yet enrolled ───────────────────────

function EnrollPanel({ slug }) {
    const [open, setOpen] = useState(false)
    return (
        <div className="bg-brand-soft/30 border border-brand-line rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand-line flex items-center justify-center text-xl">
                    🚀
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-text-primary">Start this track</h3>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        Tell the mentor your goal and timeline. The path personalizes to
                        your skill baseline (Day-1 calibration quiz coming in v2) and
                        your target companies.
                    </p>
                </div>
                {!open && (
                    <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
                        Enroll
                    </Button>
                )}
            </div>
            {open && <EnrollForm slug={slug} onCancel={() => setOpen(false)} />}
        </div>
    )
}

const DEFAULT_PREFERENCES = {
    targetOutcome: 'INTERVIEW_PASS',
    timelineWeeks: 12,
    hoursPerWeek: 7,
    targetCompanies: [],
    targetLevels: [],
    learningStyle: ['reading'],
    energyBudget: 'MEDIUM',
    frictionTolerance: 'HIGH',
}

function EnrollForm({ slug, onCancel }) {
    const enroll = useEnrollInTopic()
    const [prefs, setPrefs] = useState(DEFAULT_PREFERENCES)
    const [companiesInput, setCompaniesInput] = useState('')
    const [levelsInput, setLevelsInput] = useState('')

    function update(patch) {
        setPrefs((p) => ({ ...p, ...patch }))
    }

    async function handleSubmit() {
        const preferences = {
            ...prefs,
            targetCompanies: companiesInput
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            targetLevels: levelsInput
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        }
        try {
            await enroll.mutateAsync({ slug, preferences })
            toast.success('Enrolled. Path is personalizing to you.')
        } catch (err) {
            const message = err?.response?.data?.error?.message || 'Enrollment failed.'
            toast.error(message)
        }
    }

    return (
        <div className="space-y-3 pt-3 border-t border-brand-line/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Target outcome">
                    <select
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={prefs.targetOutcome}
                        onChange={(e) => update({ targetOutcome: e.target.value })}
                    >
                        <option value="INTERVIEW_PASS">Pass an interview</option>
                        <option value="TEACH_TO_TEAM">Teach my team</option>
                        <option value="BUILD_PRODUCTION">Build production systems</option>
                        <option value="RESEARCH">Deep research</option>
                    </select>
                </Field>
                <Field label="Energy budget">
                    <select
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={prefs.energyBudget}
                        onChange={(e) => update({ energyBudget: e.target.value })}
                    >
                        <option value="HIGH">High (push me)</option>
                        <option value="MEDIUM">Medium (steady)</option>
                        <option value="LOW">Low (gentle)</option>
                    </select>
                </Field>
                <Field label="Timeline (weeks)">
                    <input
                        type="number" min={1} max={104}
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={prefs.timelineWeeks}
                        onChange={(e) => update({ timelineWeeks: Number(e.target.value) })}
                    />
                </Field>
                <Field label="Hours per week">
                    <input
                        type="number" min={1} max={80}
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={prefs.hoursPerWeek}
                        onChange={(e) => update({ hoursPerWeek: Number(e.target.value) })}
                    />
                </Field>
                <Field label="Target companies (comma-separated)">
                    <input
                        type="text"
                        placeholder="Google, Stripe"
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={companiesInput}
                        onChange={(e) => setCompaniesInput(e.target.value)}
                    />
                </Field>
                <Field label="Target levels (comma-separated)">
                    <input
                        type="text"
                        placeholder="L4, Senior"
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={levelsInput}
                        onChange={(e) => setLevelsInput(e.target.value)}
                    />
                </Field>
                <Field label="Friction tolerance">
                    <select
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                        value={prefs.frictionTolerance}
                        onChange={(e) => update({ frictionTolerance: e.target.value })}
                    >
                        <option value="HIGH">High (hard problems early)</option>
                        <option value="LOW">Low (more scaffolding)</option>
                    </select>
                </Field>
            </div>
            <div className="flex items-center gap-2 justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
                <Button variant="primary" size="sm" loading={enroll.isPending} onClick={handleSubmit}>
                    Enroll
                </Button>
            </div>
        </div>
    )
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="block text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                {label}
            </span>
            {children}
        </label>
    )
}

// ── Enrollment panel — shown when already enrolled ───────────────────

function EnrollmentPanel({ slug, enrollment }) {
    const update = useUpdateEnrollment()
    const status = enrollment.status
    const prefs = enrollment.preferences || {}

    async function transition(nextStatus) {
        try {
            await update.mutateAsync({ slug, status: nextStatus })
            toast.success(`Track ${nextStatus.toLowerCase()}.`)
        } catch (err) {
            const message = err?.response?.data?.error?.message || 'Update failed.'
            toast.error(message)
        }
    }

    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-3">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-success-soft border border-success-line flex items-center justify-center text-xl">
                    🎓
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-text-primary">Enrolled</h3>
                        <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            status === 'ACTIVE'    && 'bg-success-soft text-success-fg border-success-line',
                            status === 'PAUSED'    && 'bg-warning-soft text-warning-fg border-warning-line',
                            status === 'COMPLETED' && 'bg-purple-400/10 text-purple-300 border-purple-400/25',
                            status === 'ABANDONED' && 'bg-surface-3 text-text-disabled border-border-default',
                        )}>
                            {status}
                        </span>
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5">
                        Goal: {prefs.targetOutcome?.replace(/_/g, ' ').toLowerCase() || '—'} ·
                        {' '}{prefs.timelineWeeks || '—'}w timeline ·
                        {' '}{prefs.hoursPerWeek || '—'}h/week
                        {prefs.targetCompanies?.length > 0 && (
                            <> · targeting {prefs.targetCompanies.join(', ')}</>
                        )}
                    </p>
                </div>
                {status === 'ACTIVE' && (
                    <Button variant="ghost" size="sm" onClick={() => transition('PAUSED')}>
                        Pause
                    </Button>
                )}
                {status === 'PAUSED' && (
                    <Button variant="primary" size="sm" onClick={() => transition('ACTIVE')}>
                        Resume
                    </Button>
                )}
            </div>
            <p className="text-[11px] text-text-disabled italic">
                Mentor orchestration (next-action, calibration quiz, mentor chat,
                mastery graph) lands in v2.
            </p>
        </div>
    )
}

// ── Concept row — minimal v1 ─────────────────────────────────────────

function ConceptRow({ concept, index, mastery }) {
    const score = mastery?.score
    const tone =
        score == null            ? 'text-text-disabled' :
        score >= 80              ? 'text-success-fg'    :
        score >= 50              ? 'text-warning-fg'    :
                                   'text-danger-fg'

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.02 }}
            className="bg-surface-1 border border-border-default rounded-xl p-4"
        >
            <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-tertiary flex-shrink-0">
                    {concept.order}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-text-primary">{concept.name}</h4>
                        <span className={cn('text-[10px] font-bold font-mono', tone)}>
                            {score == null ? 'untouched' : `${score}/100`}
                        </span>
                        {mastery?.teachingReady && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full border bg-purple-400/10 text-purple-300 border-purple-400/25">
                                ready to teach
                            </span>
                        )}
                    </div>
                    {concept.canonicalSources?.length > 0 && (
                        <p className="text-[10px] text-text-disabled mt-1">
                            {concept.canonicalSources.length} canonical source{concept.canonicalSources.length === 1 ? '' : 's'}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
