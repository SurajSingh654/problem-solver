// ============================================================================
// TopicDetailPage — single-topic overview + concept tree (W4.T6)
// ============================================================================
//
// Reads `useTopicDetail(slug)` (W4.T5) which returns the shaped topic —
// { ...topic, concepts: [{ ...c, mastery, lab }], enrollment: {...}|null }.
// Server filters to PUBLISHED concepts under a PUBLISHED topic; no DRAFT
// content leaks here.
//
// Enrollment UX:
//   - Not enrolled  → target-outcome select + primary Enroll button.
//     `useEnrollInTopic` is an idempotent upsert; sending only preferences
//     is enough (server defaults status to ACTIVE).
//   - Enrolled      → shows the current targetOutcome + Change-goal
//     affordance (an inline select + save) + Continue CTA that navigates
//     to the next-pending concept (first row with mastery.score null or
//     < 80). No pause/resume — W4.T5 doesn't expose that mutation; the
//     scaffold's status-transition UI is dropped.
// ============================================================================
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, Clock, GitFork } from 'lucide-react'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { VerdictBadge } from '@components/curriculum'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { useTopicDetail, useEnrollInTopic } from '@hooks/useCurriculumLearn'
import { cn } from '@utils/cn'

// TargetOutcome enum lifted from the plan spec (matches the server-side
// `TopicEnrollment.preferences.targetOutcome` values documented in the
// controller). Kept inline — this is the sole consumer.
const TARGET_OUTCOMES = [
    { value: 'INTERVIEW_PASS',   label: 'Pass an interview' },
    { value: 'TEACH_TO_TEAM',    label: 'Teach my team' },
    { value: 'BUILD_PRODUCTION', label: 'Build production systems' },
    { value: 'RESEARCH',         label: 'Deep research' },
]

const DEFAULT_TARGET = 'INTERVIEW_PASS'

// Score → tone for the per-concept mastery pill. Mirrors the palette in
// VerdictBadge (semantic *-soft / *-fg / *-line tokens) so light+dark both
// pass WCAG. `null` (untouched) uses the neutral gray tokens.
function masteryTone(score) {
    if (score == null)  return 'bg-surface-3 text-text-tertiary border-border-default'
    if (score >= 80)    return 'bg-success-soft text-success-fg border-success-line'
    if (score >= 50)    return 'bg-warning-soft text-warning-fg border-warning-line'
    return 'bg-danger-soft text-danger-fg border-danger-line'
}

function humanTargetLabel(value) {
    return TARGET_OUTCOMES.find((t) => t.value === value)?.label ?? value
}

export default function TopicDetailPage() {
    const { slug } = useParams()
    const navigate = useNavigate()
    const topicQ = useTopicDetail(slug)

    // Compute the "next pending" concept up front — memoized so it's stable
    // across re-renders and the memo runs regardless of loading state
    // (rules-of-hooks). The `concepts` array may be undefined during
    // loading; the reducer handles that safely.
    const nextPendingConcept = useMemo(() => {
        const concepts = topicQ.data?.concepts ?? []
        return concepts.find((c) => {
            const score = c.mastery?.score
            return score == null || score < 80
        }) ?? concepts[0] ?? null
    }, [topicQ.data?.concepts])

    if (topicQ.isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner size="lg" />
            </div>
        )
    }

    if (topicQ.isError || !topicQ.data) {
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-4">
                <Button variant="ghost" size="sm" onClick={() => navigate('/learn')}>
                    <ArrowLeft className="w-4 h-4" />
                    Back to Learn
                </Button>
                <div className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm text-danger-fg">
                    Topic not found or no longer published.
                </div>
            </div>
        )
    }

    const topic = topicQ.data
    const concepts = topic.concepts ?? []
    const enrollment = topic.enrollment
    const enrolled = !!enrollment

    return (
        <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-8">
            {/* Back nav */}
            <Button variant="ghost" size="sm" onClick={() => navigate('/learn')}>
                <ArrowLeft className="w-4 h-4" />
                Back to Learn
            </Button>

            {/* Header — name + description + category badge */}
            <header className="space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                            {topic.name}
                        </h1>
                        <p className="text-xs font-mono text-text-tertiary">
                            {topic.slug}
                        </p>
                    </div>
                    <VerdictBadge verdict={topic.category} />
                </div>
                {topic.description && (
                    <MarkdownRenderer
                        content={topic.description}
                        size="sm"
                        className="max-w-3xl"
                    />
                )}
            </header>

            {/* Enrollment card */}
            <EnrollmentCard
                slug={slug}
                enrollment={enrollment}
                onContinue={() => {
                    if (nextPendingConcept) {
                        navigate(`/learn/${slug}/concepts/${nextPendingConcept.slug}`)
                    }
                }}
                canContinue={enrolled && !!nextPendingConcept}
            />

            {/* Concept tree */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                        Concepts
                    </h2>
                    <p className="text-xs text-text-tertiary">
                        {concepts.length} published
                    </p>
                </div>

                {concepts.length === 0 ? (
                    <div className="rounded-2xl border border-border-default bg-surface-2 p-8 text-center text-sm text-text-tertiary">
                        No concepts published yet for this topic. Check back
                        after your team admin publishes the first one.
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {concepts.map((c, i) => (
                            <ConceptRow
                                key={c.id}
                                topicSlug={slug}
                                concept={c}
                                index={i}
                                enrolled={enrolled}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Info footer */}
            <footer className="rounded-2xl border border-border-subtle bg-surface-1 p-4 flex items-center gap-4 flex-wrap text-xs text-text-tertiary">
                {topic.estimatedHoursToMastery != null && (
                    <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        ~{topic.estimatedHoursToMastery}h to mastery
                    </span>
                )}
                <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {concepts.length} concept{concepts.length === 1 ? '' : 's'}
                </span>
                {topic.publishedAt && (
                    <span>
                        Published {new Date(topic.publishedAt).toLocaleDateString()}
                    </span>
                )}
                {topic.forkedFromTemplate && (
                    <span className="inline-flex items-center gap-1">
                        <GitFork className="w-3.5 h-3.5" />
                        Forked from template
                    </span>
                )}
            </footer>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// Enrollment card — pre-enroll + post-enroll variants
// ────────────────────────────────────────────────────────────────

function EnrollmentCard({ slug, enrollment, onContinue, canContinue }) {
    const enroll = useEnrollInTopic(slug)
    const enrolled = !!enrollment
    const currentTarget = enrollment?.preferences?.targetOutcome ?? DEFAULT_TARGET
    const [target, setTarget] = useState(currentTarget)
    const [editingGoal, setEditingGoal] = useState(false)

    async function handleEnroll() {
        try {
            await enroll.mutateAsync({ preferences: { targetOutcome: target } })
        } catch {
            /* toast already fired */
        }
    }

    async function handleSaveGoal() {
        try {
            await enroll.mutateAsync({ preferences: { targetOutcome: target } })
            setEditingGoal(false)
        } catch {
            /* toast already fired */
        }
    }

    if (!enrolled) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-brand-line bg-brand-soft/30 p-5 space-y-4"
            >
                <div className="space-y-1">
                    <h3 className="text-base font-bold text-text-primary">
                        Start this track
                    </h3>
                    <p className="text-sm text-text-secondary">
                        Pick your target outcome. You can change it any time.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <label className="block flex-1">
                        <span className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1">
                            Target outcome
                        </span>
                        <select
                            className="w-full bg-surface-2 border border-border-default rounded-lg text-sm text-text-primary px-3 py-2 focus:outline-none focus:border-brand-400"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                        >
                            {TARGET_OUTCOMES.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <Button
                        variant="primary"
                        size="md"
                        loading={enroll.isPending}
                        onClick={handleEnroll}
                    >
                        Enroll
                    </Button>
                </div>
            </motion.div>
        )
    }

    // Enrolled path — show current stats + change-goal affordance.
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-success-line bg-success-soft/40 p-5 space-y-4"
        >
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-text-primary">
                            Enrolled
                        </h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-success-soft text-success-fg border-success-line">
                            Active
                        </span>
                    </div>
                    <p className="text-sm text-text-secondary">
                        Goal:{' '}
                        <span className="font-semibold text-text-primary">
                            {humanTargetLabel(currentTarget)}
                        </span>
                    </p>
                    {enrollment?.startedAt && (
                        <p className="text-xs text-text-tertiary">
                            Started {new Date(enrollment.startedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!editingGoal && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingGoal(true)}
                        >
                            Change goal
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={!canContinue}
                        onClick={onContinue}
                    >
                        Continue
                    </Button>
                </div>
            </div>

            {editingGoal && (
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end pt-3 border-t border-success-line/40">
                    <label className="block flex-1">
                        <span className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1">
                            Target outcome
                        </span>
                        <select
                            className="w-full bg-surface-2 border border-border-default rounded-lg text-sm text-text-primary px-3 py-2 focus:outline-none focus:border-brand-400"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                        >
                            {TARGET_OUTCOMES.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => {
                                setTarget(currentTarget)
                                setEditingGoal(false)
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            loading={enroll.isPending}
                            onClick={handleSaveGoal}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            )}

        </motion.div>
    )
}

// ────────────────────────────────────────────────────────────────
// Concept row
// ────────────────────────────────────────────────────────────────

function ConceptRow({ topicSlug, concept, index, enrolled }) {
    // Mastery score may be null when only `primer_read` signals exist (per
    // W4.T4: primer_read has weight 0 — reading is logged but does not
    // move the score). Render null as "untouched".
    const score = concept.mastery?.score
    const teachingReady = concept.mastery?.teachingReady
    const scoreLabel = score == null ? 'Untouched' : `${Math.round(score)}%`

    // Progress bar width: 0-100 clamped. null → 0.
    const barWidth = Math.max(0, Math.min(100, score ?? 0))

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.02, 0.3) }}
        >
            <Link
                to={`/learn/${topicSlug}/concepts/${concept.slug}`}
                className={cn(
                    'block rounded-xl border border-border-default bg-surface-2 p-4',
                    'transition-all hover:border-brand-400 hover:-translate-y-px',
                    'focus:outline-none focus-visible:border-brand-400',
                )}
            >
                <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-surface-3 border border-border-default flex items-center justify-center text-xs font-bold text-text-secondary shrink-0">
                        {concept.order ?? index + 1}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-text-primary">
                                {concept.name}
                            </h4>
                            {enrolled && (
                                <span
                                    className={cn(
                                        'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                                        masteryTone(score),
                                    )}
                                >
                                    {scoreLabel}
                                </span>
                            )}
                            {teachingReady && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-brand-soft text-brand-fg-soft border-brand-line">
                                    Ready to teach
                                </span>
                            )}
                        </div>

                        {/* Progress bar — visible only when enrolled and we have
                            a score signal. Untouched concepts get nothing (a
                            zero-width bar would look like a bug). */}
                        {enrolled && score != null && (
                            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${barWidth}%` }}
                                    transition={{ duration: 0.4, delay: 0.1 }}
                                    className={cn(
                                        'h-full',
                                        score >= 80 ? 'bg-success' :
                                            score >= 50 ? 'bg-warning' :
                                                'bg-danger',
                                    )}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}
