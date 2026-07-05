// ============================================================================
// LearnPage — team-scoped catalog of published curricula (W4.T6)
// ============================================================================
//
// Reads `useLearnCatalog()` (W4.T5) which returns the shaped topics array
// from GET /curriculum/topics. Server side filters to `status: "PUBLISHED"`
// under the caller's team, and includes the caller's `enrollment` row if
// any. DRAFT / REVIEWED topics never reach the client.
//
// The Enroll button here uses the idempotent `useEnrollInTopic(slug)` upsert
// — sending it with no body defaults to `preferences: {}`. Users who want
// to configure their goal do that on TopicDetailPage instead; the catalog
// is a low-friction one-click enrollment surface.
// ============================================================================
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock } from 'lucide-react'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { EmptyState } from '@components/ui/EmptyState'
import { VerdictBadge } from '@components/curriculum'
import { useLearnCatalog, useEnrollInTopic } from '@hooks/useCurriculumLearn'
import { cn } from '@utils/cn'

// Truncate description at ~200 chars for the card body — full description
// lives on the detail page. line-clamp-3 handles overflow visually; the
// hard slice is a defense against admin-authored blobs that skew the grid.
function truncate(str, n = 200) {
    if (!str) return ''
    return str.length > n ? `${str.slice(0, n - 1).trimEnd()}…` : str
}

export default function LearnPage() {
    const navigate = useNavigate()
    const { data: topics, isLoading, isError, error } = useLearnCatalog()

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner size="lg" />
            </div>
        )
    }

    if (isError) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <div className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm text-danger-fg">
                    Couldn&rsquo;t load curricula: {error?.message ?? 'unknown error'}
                </div>
            </div>
        )
    }

    const rows = topics ?? []

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
            <header>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Learn
                </h1>
                <p className="text-sm text-text-tertiary mt-1 max-w-2xl">
                    Discover curricula published by your team&rsquo;s admins.
                    Each track pairs an admin-reviewed primer with a code lab
                    and a check-in — no AI-invented content reaches you until
                    a human has vetted it.
                </p>
            </header>

            {rows.length === 0 ? (
                <EmptyState
                    icon="📚"
                    title="No published curricula yet"
                    description="Ask your team admin to fork a template and publish it. Curricula stay in DRAFT until human-reviewed — the safety gate against hallucinated content."
                />
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((topic, i) => (
                        <TopicCard
                            key={topic.id}
                            topic={topic}
                            index={i}
                            onOpen={() => navigate(`/learn/${topic.slug}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// Single topic card
// ────────────────────────────────────────────────────────────────

function TopicCard({ topic, index, onOpen }) {
    const navigate = useNavigate()
    const enroll = useEnrollInTopic(topic.slug)
    const enrolled = !!topic.enrollment
    const conceptCount = topic._count?.concepts ?? 0

    // One-click enroll on the catalog. Stop propagation so the whole-card
    // click doesn't fire — button owns the interaction.
    async function handleEnroll(e) {
        e.stopPropagation()
        try {
            await enroll.mutateAsync({})
            // On success the hook invalidates the catalog query; the card
            // re-renders as Enrolled. Then navigate to the detail page so
            // the user lands on the goal-setting UI.
            navigate(`/learn/${topic.slug}`)
        } catch {
            // useToastingMutation already surfaced the error toast.
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.04, 0.4) }}
            onClick={onOpen}
            className={cn(
                'rounded-2xl border border-border-default bg-surface-2 p-5',
                'flex flex-col gap-4 cursor-pointer',
                'transition-all hover:border-brand-400 hover:-translate-y-px',
                'focus-within:border-brand-400',
            )}
        >
            {/* Header — name + category badge */}
            <div>
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-text-primary leading-tight">
                        {topic.name}
                    </h3>
                    <VerdictBadge verdict={topic.category} />
                </div>
                <p className="text-xs font-mono text-text-tertiary mt-1">
                    {topic.slug}
                </p>
            </div>

            {/* Description */}
            <p className="text-sm text-text-secondary line-clamp-3 flex-1">
                {truncate(topic.description)}
            </p>

            {/* Meta row — concept count + estimated hours */}
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {conceptCount} concept{conceptCount === 1 ? '' : 's'}
                </span>
                {topic.estimatedHoursToMastery != null && (
                    <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        ~{topic.estimatedHoursToMastery}h
                    </span>
                )}
            </div>

            {/* Footer — enrollment chip + primary CTA */}
            <div className="flex items-center gap-2 pt-3 border-t border-border-subtle">
                {enrolled ? (
                    <>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-success-soft text-success-fg border-success-line">
                            Enrolled
                        </span>
                        <Button
                            variant="primary"
                            size="sm"
                            className="ml-auto"
                            onClick={(e) => {
                                e.stopPropagation()
                                onOpen()
                            }}
                        >
                            Continue
                        </Button>
                    </>
                ) : (
                    <>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-surface-3 text-text-tertiary border-border-default">
                            Not enrolled
                        </span>
                        <Button
                            variant="primary"
                            size="sm"
                            className="ml-auto"
                            loading={enroll.isPending}
                            onClick={handleEnroll}
                        >
                            Enroll
                        </Button>
                    </>
                )}
            </div>
        </motion.div>
    )
}
