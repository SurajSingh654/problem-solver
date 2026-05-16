// ============================================================================
// Learn — Topic Mastery Tracks landing (v1 scaffold)
// ============================================================================
//
// Lists PUBLISHED topics. Until an admin publishes a Topic, this page
// renders an "Empty — coming soon" state. The DRAFT/PUBLISHED gate is
// the architectural anti-hallucination defense — content cannot reach
// users until human-reviewed.
// ============================================================================
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { useTopics } from '@hooks/useTopics'
import { cn } from '@utils/cn'

const CATEGORY_META = {
    SYSTEM_DESIGN:    { icon: '🏛️', tone: 'text-info-fg' },
    LOW_LEVEL_DESIGN: { icon: '🧱', tone: 'text-info-fg' },
    DBMS:             { icon: '🗄️', tone: 'text-warning-fg' },
    OS:               { icon: '⚙️', tone: 'text-text-secondary' },
    NETWORKS:         { icon: '🌐', tone: 'text-text-secondary' },
    DSA:              { icon: '🧮', tone: 'text-brand-fg-soft' },
    BEHAVIORAL:       { icon: '💬', tone: 'text-success-fg' },
    HR:               { icon: '🤝', tone: 'text-success-fg' },
    CS_FUNDAMENTALS:  { icon: '📚', tone: 'text-text-secondary' },
}

export default function LearnPage() {
    const navigate = useNavigate()
    const { data, isLoading, isError } = useTopics()

    if (isLoading) {
        return (
            <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
        )
    }

    const topics = data?.topics ?? []

    return (
        <div className="p-6 max-w-[1200px] mx-auto space-y-6">
            <header>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Learn → Reflect → Teach → Validate
                </h1>
                <p className="text-sm text-text-tertiary max-w-2xl leading-relaxed">
                    Master a topic with an AI mentor that knows your goal, your timeline,
                    and your skill baseline. Each track guides you through the five-stage
                    loop using the tools you already have — Notes, Design Studio,
                    Teaching Sessions, Mock Interviews. Trust earned by architecture, not
                    promised by model.
                </p>
            </header>

            {isError && (
                <div className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm text-danger-fg">
                    Couldn&rsquo;t load topics. Refresh to retry.
                </div>
            )}

            {!isError && topics.length === 0 && (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center space-y-3">
                    <div className="text-5xl">📚</div>
                    <h2 className="text-lg font-bold text-text-primary">
                        No topics published yet
                    </h2>
                    <p className="text-sm text-text-tertiary max-w-md mx-auto leading-relaxed">
                        Topic Mastery Tracks are scaffolded but content is in DRAFT until
                        an admin reviews and publishes each concept. This is the
                        anti-hallucination safety gate — user-facing content is
                        human-reviewed before it goes live.
                    </p>
                </div>
            )}

            {topics.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {topics.map((t, i) => (
                        <TopicCard key={t.id} topic={t} index={i} onOpen={() => navigate(`/learn/${t.slug}`)} />
                    ))}
                </div>
            )}
        </div>
    )
}

function TopicCard({ topic, index, onOpen }) {
    const meta = CATEGORY_META[topic.category] ?? { icon: '📘', tone: 'text-text-secondary' }
    const enrolled = !!topic.enrollment
    const status = topic.enrollment?.status

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-3 flex flex-col"
        >
            <div className="flex items-start gap-3">
                <span className="text-2xl">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-text-primary">{topic.name}</h3>
                    <p className={cn('text-[10px] font-bold uppercase tracking-widest', meta.tone)}>
                        {topic.category.replace(/_/g, ' ')}
                    </p>
                </div>
            </div>

            <p className="text-xs text-text-tertiary leading-relaxed flex-1">
                {topic.description}
            </p>

            <div className="flex items-center gap-3 text-[11px] text-text-disabled">
                <span>📖 {topic.publishedConceptCount} concepts</span>
                {topic.estimatedHoursToMastery != null && (
                    <span>⏱ ~{topic.estimatedHoursToMastery}h to mastery</span>
                )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                {enrolled ? (
                    <>
                        <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            status === 'ACTIVE'    && 'bg-success-soft text-success-fg border-success-line',
                            status === 'PAUSED'    && 'bg-warning-soft text-warning-fg border-warning-line',
                            status === 'COMPLETED' && 'bg-purple-400/10 text-purple-300 border-purple-400/25',
                            status === 'ABANDONED' && 'bg-surface-3 text-text-disabled border-border-default',
                        )}>
                            {status}
                        </span>
                        <Button variant="primary" size="sm" onClick={onOpen} className="ml-auto">
                            Resume
                        </Button>
                    </>
                ) : (
                    <Button variant="primary" size="sm" onClick={onOpen} className="ml-auto">
                        Start track
                    </Button>
                )}
            </div>
        </motion.div>
    )
}
