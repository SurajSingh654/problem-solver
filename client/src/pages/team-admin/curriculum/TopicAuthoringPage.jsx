// ============================================================================
// TopicAuthoringPage — TEAM_ADMIN topic editor with 4 tabs (W3.T9)
// ============================================================================
//
// The reviewer's main workspace after forking a template or creating a blank
// topic. Loads the topic + concepts + labs in one `useTopicDetail` call, then
// hands the tree down to four focused tabs:
//
//   Metadata — edit topic-level fields (name, description, category, hours,
//              cheatsheet). Owned by TopicMetadataTab.
//   Concepts — list of Concepts with per-row edit / review / publish flows.
//              Owned by ConceptsListTab.
//   Curriculum Review — trigger + render the topic-level AI validator.
//              Owned by CurriculumReviewTab. Shows the cached verdict from
//              `topic.curriculumReview` when no fresh run yet.
//   Publish — enforce publish gates and flip Topic.status → PUBLISHED.
//              Owned by PublishTab. Renders the server's gates[] response
//              inline via <PublishGateChecklist> on 400 PUBLISH_GATE_BLOCKED.
//
// The tab bar preserves the same tokens the ProductHealthPage uses (brand-soft
// pill on the active tab); resisting the temptation to hoist to a shared
// primitive until we have a third callsite — YAGNI.
//
// Feature-flag: registered under `import.meta.env.VITE_FEATURE_CURRICULUM`
// in App.jsx (see route registration). Flag OFF → the route isn't registered
// → 404. Server route is also gated behind FEATURE_CURRICULUM, so a hand-
// typed URL with the flag off fails at the network layer too.
// ============================================================================
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react'
import { VerdictBadge } from '@components/curriculum'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { useTopicDetail, useTemplateStatus } from '@hooks/useCurriculumAdmin'
import { formatShortDate } from '@utils/formatters'
import TopicMetadataTab from './TopicMetadataTab'
import ConceptsListTab from './ConceptsListTab'
import CurriculumReviewTab from './CurriculumReviewTab'
import PublishTab from './PublishTab'

const TABS = [
    { id: 'metadata', label: 'Metadata' },
    { id: 'concepts', label: 'Concepts' },
    { id: 'review',   label: 'Curriculum Review' },
    { id: 'publish',  label: 'Publish' },
]

// ────────────────────────────────────────────────────────────────
// TemplateUpdatedChip — small "template updated since fork" indicator.
// Renders nothing when the topic is not a fork or the source hasn't
// changed. Phase 2 will replace the "View diff" placeholder with a
// real diff surface — for T9 the chip is a signal, not an action.
// ────────────────────────────────────────────────────────────────
function TemplateUpdatedChip({ topicId }) {
    const { data } = useTemplateStatus(topicId)
    if (!data?.hasUpdate) return null
    return (
        <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-fg flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>
                Template updated on {formatShortDate(data.templateUpdatedAt)} —
                <span className="ml-1 opacity-60">View diff (Phase 2)</span>
            </span>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// TabBar — pill-style tab picker. Deliberately inline (not shared)
// until a third callsite justifies extraction.
// ────────────────────────────────────────────────────────────────
function TabBar({ active, onChange, tabs }) {
    return (
        <div
            role="tablist"
            className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1 overflow-x-auto"
        >
            {tabs.map((t) => (
                <button
                    key={t.id}
                    role="tab"
                    aria-selected={active === t.id}
                    onClick={() => onChange(t.id)}
                    className={cn(
                        'px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap',
                        active === t.id
                            ? 'bg-brand-soft text-brand-fg-soft'
                            : 'text-text-tertiary hover:text-text-primary',
                    )}
                >
                    {t.label}
                </button>
            ))}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────
export default function TopicAuthoringPage() {
    const { id: topicId } = useParams()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('metadata')

    const { data: topic, isLoading, isError, error } = useTopicDetail(topicId)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner size="lg" />
            </div>
        )
    }

    if (isError) {
        // Cross-team probe or missing id also lands here (server surfaces 404
        // TOPIC_NOT_FOUND, which axios throws through). We render a single
        // failure state; a bespoke 404 UI is overkill for a route only
        // reachable via the list page.
        return (
            <div className="p-8 space-y-3 max-w-2xl mx-auto">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/admin/curriculum')}
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </Button>
                <p className="text-sm text-danger-fg">
                    Failed to load topic: {error?.response?.data?.error?.message ?? error?.message ?? 'unknown error'}
                </p>
            </div>
        )
    }

    if (!topic) return null

    // Prefix the tab label with a count where useful. Kept per-tab (not in
    // TABS) so the number stays derived from the fetched tree.
    const tabsWithCounts = TABS.map((t) =>
        t.id === 'concepts'
            ? { ...t, label: `Concepts (${topic.concepts.length})` }
            : t,
    )

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
            {/* Header ─────────────────────────────────────────────── */}
            <header className="flex flex-col gap-4">
                <div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/admin/curriculum')}
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Button>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                                {topic.name}
                            </h1>
                            <VerdictBadge verdict={topic.status} />
                        </div>
                        <p className="text-xs font-mono text-text-tertiary mt-1">
                            {topic.slug}
                        </p>
                    </div>
                    {/* Preview-as-learner — opens the exact URL a member would
                        hit on /learn. Only enabled once the topic is
                        PUBLISHED; the learner surface 404s on DRAFT so a
                        DRAFT preview would misrender. */}
                    {topic.status === 'PUBLISHED' ? (
                        <a
                            href={`/learn/${topic.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-md border border-border-default bg-surface-2 text-text-secondary hover:text-text-primary hover:border-brand-400"
                            title="Open the learner view for this topic in a new tab"
                        >
                            Preview as learner
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    ) : (
                        <span
                            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-md border border-border-default bg-surface-2 text-text-disabled cursor-not-allowed"
                            title="Publish the topic to open a live learner preview"
                        >
                            Preview as learner
                            <ExternalLink className="w-3 h-3" />
                        </span>
                    )}
                </div>
                <TemplateUpdatedChip topicId={topicId} />
            </header>

            {/* Tab bar ────────────────────────────────────────────── */}
            <TabBar active={activeTab} onChange={setActiveTab} tabs={tabsWithCounts} />

            {/* Active tab ─────────────────────────────────────────── */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
            >
                {activeTab === 'metadata' && <TopicMetadataTab topic={topic} />}
                {activeTab === 'concepts' && <ConceptsListTab topic={topic} />}
                {activeTab === 'review'   && <CurriculumReviewTab topic={topic} />}
                {activeTab === 'publish'  && (
                    <PublishTab
                        topic={topic}
                        onGoToConcepts={() => setActiveTab('concepts')}
                        onGoToReview={() => setActiveTab('review')}
                    />
                )}
            </motion.div>
        </div>
    )
}
