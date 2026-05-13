// ============================================================================
// Team Teaching Sessions — list view (P0)
// ============================================================================
//
// Two sections:
//   • Upcoming  — status SCHEDULED or LIVE, scheduledAt asc
//   • Past      — status COMPLETED, scheduledAt desc
//
// CANCELLED sessions are server-side filtered (deletedAt-based). Visible
// to all team members; the host's notes are hidden until the session
// is COMPLETED (the controller's DTO enforces this).
//
// P1 will add the live-room "Join now" CTA and post-end "rate" CTA.
// P2 will add the flag button. P3 will surface AI artifacts on rows.
// ============================================================================
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTeachingSessions } from '@hooks/useTeaching'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'

const STATUS_PILL = {
    DRAFT: 'bg-surface-3 text-text-disabled border-border-default',
    SCHEDULED: 'bg-info-soft text-info-fg border-info-line',
    LIVE: 'bg-success-soft text-success-fg border-success-line',
    COMPLETED: 'bg-purple-400/10 text-purple-300 border-purple-400/25',
    CANCELLED: 'bg-surface-3 text-text-disabled border-border-default',
}

function StatusPill({ status }) {
    return (
        <span
            className={cn(
                'text-[9px] font-bold uppercase tracking-widest px-1.5 py-px rounded-full border',
                STATUS_PILL[status] || STATUS_PILL.DRAFT,
            )}
        >
            {status}
        </span>
    )
}

function formatWhen(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

function SessionRow({ session }) {
    return (
        <Link
            to={`/teaching/${session.id}`}
            className="block bg-surface-1 border border-border-default rounded-xl p-4 hover:border-brand-line transition-colors"
        >
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-bold text-text-primary truncate">
                            {session.title}
                        </h3>
                        <StatusPill status={session.status} />
                    </div>
                    <p className="text-xs text-text-tertiary truncate mb-1">
                        {session.topic}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-text-disabled">
                        <span>📅 {formatWhen(session.scheduledAt)}</span>
                        {session.host?.name && (
                            <span>👤 {session.host.name}</span>
                        )}
                        {session.avgRating != null && (
                            <span>⭐ {session.avgRating}</span>
                        )}
                        {typeof session.attendeesCount === 'number' && (
                            <span>👥 {session.attendeesCount}</span>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    )
}

export default function TeachingListPage() {
    const { data, isLoading, isError } = useTeachingSessions({ limit: 100 })

    const { upcoming, past } = useMemo(() => {
        const sessions = data?.sessions || []
        const upcomingStatuses = new Set(['SCHEDULED', 'LIVE'])
        return {
            upcoming: sessions
                .filter((s) => upcomingStatuses.has(s.status))
                .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
            past: sessions
                .filter((s) => s.status === 'COMPLETED')
                .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)),
        }
    }, [data])

    return (
        <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between gap-3"
            >
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                        📚 Teaching
                    </h1>
                    <p className="text-sm text-text-secondary mt-1 max-w-xl">
                        Schedule peer-to-peer teaching sessions. Host explains a topic on
                        a meeting link of your choice; peers attend, rate, and learn from
                        each other. Hosts earn Teaching Contributions in the Intelligence
                        Report.
                    </p>
                </div>
                <Link
                    to="/teaching/new"
                    className="bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-brand-soft/80 transition-colors whitespace-nowrap"
                >
                    + New session
                </Link>
            </motion.div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" />
                </div>
            ) : isError ? (
                <p className="text-sm text-danger-fg">Failed to load teaching sessions.</p>
            ) : (
                <>
                    <section className="space-y-2">
                        <h2 className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                            Upcoming
                        </h2>
                        {upcoming.length === 0 ? (
                            <div className="bg-surface-1 border border-border-default rounded-xl p-6 text-center">
                                <p className="text-xs text-text-tertiary">
                                    No upcoming sessions.{' '}
                                    <Link
                                        to="/teaching/new"
                                        className="text-brand-fg-soft underline"
                                    >
                                        Schedule one
                                    </Link>
                                    .
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {upcoming.map((s) => (
                                    <SessionRow key={s.id} session={s} />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                            Past
                        </h2>
                        {past.length === 0 ? (
                            <div className="bg-surface-1 border border-border-default rounded-xl p-6 text-center">
                                <p className="text-xs text-text-tertiary">
                                    No completed sessions yet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {past.map((s) => (
                                    <SessionRow key={s.id} session={s} />
                                ))}
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    )
}
