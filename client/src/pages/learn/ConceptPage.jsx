// ============================================================================
// ConceptPage — curriculum learner 5-tab shell (W4.T7)
// ============================================================================
//
// Reads `useConceptDetail(conceptSlug)` (W4.T5) which returns the shaped
// concept — { ...concept, topic, lab, latestAttempt, mastery }. Server
// filters to PUBLISHED concepts under a PUBLISHED topic; no DRAFT content
// leaks here.
//
// Layout: sticky-ish page header + pill-style tab bar (5 tabs) with tab
// state URL-synced via `?tab=` so deep-links land on the right tab and
// browser back/forward flip tabs. Follows the inline-TabBar pattern from
// W3.T9's TopicAuthoringPage (deliberately not extracted to a shared
// component until a third callsite justifies it — YAGNI).
//
// Tab contents live in `./tabs/Concept<Name>Tab.jsx` — each keeps its own
// hooks + local state so the page-level render stays a light shell.
//
// The URL param `slug` is the TOPIC slug (route
// `/learn/:slug/concepts/:conceptSlug`); we call the concept API with
// `conceptSlug`. Back-nav uses the topic slug.
// ============================================================================
import { useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { VerdictBadge } from '@components/curriculum'
import { useConceptDetail } from '@hooks/useCurriculumLearn'
import { cn } from '@utils/cn'
import ConceptPrimerTab from './tabs/ConceptPrimerTab'
import ConceptLabTab from './tabs/ConceptLabTab'
import ConceptCheckInTab from './tabs/ConceptCheckInTab'
import ConceptNotesTab from './tabs/ConceptNotesTab'
import ConceptTeachTab from './tabs/ConceptTeachTab'

const TABS = [
    { id: 'primer',  label: 'Primer'   },
    { id: 'lab',     label: 'Lab'      },
    { id: 'checkin', label: 'Check-in' },
    { id: 'notes',   label: 'Notes'    },
    { id: 'teach',   label: 'Teach'    },
]

const VALID_TAB_IDS = new Set(TABS.map((t) => t.id))

// ────────────────────────────────────────────────────────────────
// TabBar — pill-style tab picker with optional badge suffix. Same
// visual grammar as TopicAuthoringPage (W3.T9); copied inline rather
// than extracted (see file header — YAGNI until 3rd callsite).
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
                        'flex items-center gap-2',
                        active === t.id
                            ? 'bg-brand-soft text-brand-fg-soft'
                            : 'text-text-tertiary hover:text-text-primary',
                    )}
                >
                    <span>{t.label}</span>
                    {t.badge && (
                        <span
                            aria-hidden="true"
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success-soft text-success-fg border border-success-line"
                        >
                            {t.badge}
                        </span>
                    )}
                </button>
            ))}
        </div>
    )
}

// Score → tone for the header mastery pill. Mirrors TopicDetailPage.
function masteryTone(score) {
    if (score == null)  return 'bg-surface-3    text-text-tertiary  border-border-default'
    if (score >= 80)    return 'bg-success-soft text-success-fg     border-success-line'
    if (score >= 50)    return 'bg-warning-soft text-warning-fg     border-warning-line'
    return                     'bg-danger-soft  text-danger-fg      border-danger-line'
}

export default function ConceptPage() {
    // Route: /learn/:slug/concepts/:conceptSlug — `slug` is the TOPIC slug,
    // used for back-nav; `conceptSlug` drives the concept detail query.
    const { slug: topicSlug, conceptSlug } = useParams()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    // Tab state URL-synced. Falls back to 'primer' when the ?tab= param
    // is missing OR contains a value we don't recognise (guards against
    // typos + link-rot from renamed tabs).
    const requestedTab = searchParams.get('tab')
    const activeTab = requestedTab && VALID_TAB_IDS.has(requestedTab)
        ? requestedTab
        : 'primer'

    const setActiveTab = (tabId) => {
        const next = new URLSearchParams(searchParams)
        next.set('tab', tabId)
        setSearchParams(next, { replace: true })
    }

    const conceptQ = useConceptDetail(conceptSlug)

    // Tab-list decoration: check-in tab gets a ✓ badge when the user
    // has reached teachingReady (mastery gate cleared). Memoised so the
    // TabBar prop identity is stable across renders.
    const tabsWithBadges = useMemo(() => {
        const teachingReady = conceptQ.data?.mastery?.teachingReady === true
        return TABS.map((t) =>
            t.id === 'checkin' && teachingReady ? { ...t, badge: '✓' } : t,
        )
    }, [conceptQ.data?.mastery?.teachingReady])

    if (conceptQ.isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner size="lg" />
            </div>
        )
    }

    if (conceptQ.isError || !conceptQ.data) {
        const status = conceptQ.error?.response?.status
        const message =
            status === 404
                ? "This concept isn't available yet — it may not be published, or you may not be enrolled."
                : 'Failed to load concept. Try again in a moment.'
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-4">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/learn/${topicSlug}`)}>
                    <ArrowLeft className="w-4 h-4" />
                    Back to topic
                </Button>
                <div className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm text-danger-fg">
                    {message}
                </div>
            </div>
        )
    }

    const concept = conceptQ.data
    const mastery = concept.mastery
    // Prefer the concept's own topic.slug (server-provided) — falls back to
    // the URL param only if the payload is missing it. This makes the back
    // link resilient to route-shape changes.
    const backTopicSlug = concept.topic?.slug ?? topicSlug

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
            {/* Breadcrumb + back nav ──────────────────────────────── */}
            <nav className="text-xs text-text-tertiary flex items-center gap-2">
                <Link to="/learn" className="hover:text-text-primary transition-colors">
                    Learn
                </Link>
                <span>/</span>
                <Link
                    to={`/learn/${backTopicSlug}`}
                    className="hover:text-text-primary transition-colors"
                >
                    {concept.topic?.name ?? 'Topic'}
                </Link>
                <span>/</span>
                <span className="text-text-secondary">{concept.name}</span>
            </nav>

            {/* Header ─────────────────────────────────────────────── */}
            <header className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                            {concept.name}
                        </h1>
                        <VerdictBadge verdict={concept.status} />
                    </div>
                    <p className="text-xs text-text-secondary">
                        Part of{' '}
                        <Link
                            to={`/learn/${backTopicSlug}`}
                            className="font-semibold hover:text-text-primary transition-colors"
                        >
                            {concept.topic?.name ?? 'this topic'}
                        </Link>
                    </p>
                </div>

                {mastery?.score != null && (
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                'text-xs font-bold px-2 py-0.5 rounded-full border font-mono',
                                masteryTone(mastery.score),
                            )}
                        >
                            Mastery {Math.round(mastery.score)}%
                        </span>
                        {mastery.teachingReady && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-success-soft text-success-fg border-success-line">
                                teaching-ready
                            </span>
                        )}
                    </div>
                )}
            </header>

            {/* Tab bar ────────────────────────────────────────────── */}
            <TabBar
                active={activeTab}
                onChange={setActiveTab}
                tabs={tabsWithBadges}
            />

            {/* Active tab body ────────────────────────────────────── */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
            >
                {activeTab === 'primer'  && (
                    <ConceptPrimerTab
                        concept={concept}
                        onGoToLab={() => setActiveTab('lab')}
                    />
                )}
                {activeTab === 'lab'     && <ConceptLabTab     concept={concept} />}
                {activeTab === 'checkin' && <ConceptCheckInTab concept={concept} onGoToLab={() => setActiveTab('lab')} />}
                {activeTab === 'notes'   && <ConceptNotesTab   concept={concept} />}
                {activeTab === 'teach'   && <ConceptTeachTab   concept={concept} onGoToLab={() => setActiveTab('lab')} onGoToCheckIn={() => setActiveTab('checkin')} />}
            </motion.div>
        </div>
    )
}
