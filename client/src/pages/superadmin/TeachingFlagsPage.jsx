// ============================================================================
// Teaching Flags — admin queue
// ============================================================================
//
// Mirrors the layout of VerdictsAuditPage. Default filter: status=OPEN.
// Two actions per row: Dismiss / Uphold (cancels the session). The
// uphold action also broadcasts teaching:ended over WS so any
// connected attendees see the room close.
//
// Visible to TEAM_ADMIN of the team the flagged session belongs to OR
// any SUPER_ADMIN — gated server-side via isTeamAdmin().
// ============================================================================
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    useTeachingFlags,
    useDismissTeachingFlag,
    useUpholdTeachingFlag,
} from '@hooks/useTeaching'
import { Spinner } from '@components/ui/Spinner'
import { useConfirm } from '@hooks/useConfirm'
import { cn } from '@utils/cn'

const STATUS_PILL = {
    OPEN: 'bg-warning-soft text-warning-fg border-warning-line',
    REVIEWED: 'bg-success-soft text-success-fg border-success-line',
    DISMISSED: 'bg-surface-3 text-text-disabled border-border-default',
}

function FlagRow({ flag, onDismiss, onUphold }) {
    const [expanded, setExpanded] = useState(false)
    const session = flag.session
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-xl overflow-hidden"
        >
            <div className="flex items-start gap-3 p-4">
                <span
                    className={cn(
                        'text-[9px] font-bold uppercase tracking-widest px-1.5 py-px rounded-full border flex-shrink-0',
                        STATUS_PILL[flag.status],
                    )}
                >
                    {flag.status}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Link
                            to={`/teaching/${session?.id}`}
                            className="text-xs font-bold text-text-primary truncate hover:underline"
                        >
                            {session?.title || '(deleted session)'}
                        </Link>
                        <span className="text-[10px] text-text-disabled">
                            host: {session?.host?.name || '—'}
                        </span>
                        {typeof session?.flagCount === 'number' &&
                            session.flagCount > 1 && (
                                <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-danger-soft text-danger-fg border border-danger-line">
                                    {session.flagCount} flags total
                                </span>
                            )}
                    </div>
                    <p className="text-xs text-text-secondary line-clamp-2">
                        {flag.reason}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-text-disabled mt-1">
                        <span>👤 reported by {flag.reporter?.name || 'Anonymous'}</span>
                        <span>🕓 {new Date(flag.createdAt).toLocaleString()}</span>
                    </div>
                    {expanded && (
                        <div className="mt-2 bg-surface-2 border border-border-default rounded-lg p-2.5 text-[11px] text-text-secondary whitespace-pre-wrap">
                            {flag.reason}
                        </div>
                    )}
                </div>

                {flag.status === 'OPEN' && (
                    <div className="flex flex-col items-stretch gap-1.5 flex-shrink-0">
                        <button
                            onClick={() => onUphold(flag)}
                            className="bg-danger-soft text-danger-fg border border-danger-line rounded-md px-2.5 py-1 text-[11px] font-bold hover:bg-danger-soft/80 transition-colors"
                        >
                            Uphold (cancel)
                        </button>
                        <button
                            onClick={() => onDismiss(flag)}
                            className="bg-surface-2 text-text-secondary border border-border-default rounded-md px-2.5 py-1 text-[11px] font-bold hover:bg-surface-3 transition-colors"
                        >
                            Dismiss
                        </button>
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className="text-[10px] text-text-disabled hover:text-text-secondary"
                        >
                            {expanded ? 'Less' : 'More'}
                        </button>
                    </div>
                )}
                {flag.status !== 'OPEN' && flag.resolutionNote && (
                    <div className="text-[10px] text-text-disabled italic max-w-[180px]">
                        “{flag.resolutionNote}”
                    </div>
                )}
            </div>
        </motion.div>
    )
}

export default function TeachingFlagsPage() {
    const [status, setStatus] = useState('OPEN')
    const [limit] = useState(25)
    const [offset, setOffset] = useState(0)

    const { data, isLoading, isError } = useTeachingFlags({ status, limit, offset })
    const dismiss = useDismissTeachingFlag()
    const uphold = useUpholdTeachingFlag()
    const confirm = useConfirm()

    const flags = data?.flags || []
    const pagination = data?.pagination || { total: 0 }
    const stats = data?.stats || { openCount: 0 }

    async function onUphold(flag) {
        const ok = await confirm({
            title: 'Uphold flag and cancel the session?',
            description:
                'The session will be CANCELLED and any connected attendees will see the room close. This cannot be undone.',
            confirmText: 'Uphold and cancel',
            tone: 'danger',
        })
        if (!ok) return
        uphold.mutate({ flagId: flag.id, data: {} })
    }

    function onDismiss(flag) {
        dismiss.mutate({ flagId: flag.id, data: {} })
    }

    return (
        <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                    🚩 Teaching Flags
                </h1>
                <p className="text-sm text-text-secondary mt-1">
                    Sessions reported by team members. Dismiss false positives;
                    uphold real issues to cancel the session and close the live room.
                </p>
            </motion.div>

            <div className="flex items-center gap-3">
                {['OPEN', 'REVIEWED', 'DISMISSED', 'ALL'].map((s) => (
                    <button
                        key={s}
                        onClick={() => {
                            setStatus(s)
                            setOffset(0)
                        }}
                        className={cn(
                            'text-xs font-bold px-3 py-1.5 rounded-full border transition-colors',
                            status === s
                                ? s === 'OPEN'
                                    ? 'bg-warning-soft text-warning-fg border-warning-line'
                                    : 'bg-brand-soft text-brand-fg-soft border-brand-line'
                                : 'bg-surface-1 text-text-tertiary border-border-default hover:bg-surface-2',
                        )}
                    >
                        {s}
                        {s === 'OPEN' && stats.openCount > 0 && (
                            <span className="ml-1.5 text-[10px] opacity-70">
                                ({stats.openCount})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" />
                </div>
            ) : isError ? (
                <p className="text-sm text-danger-fg">Failed to load flags.</p>
            ) : flags.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-12 text-center">
                    <p className="text-sm text-text-tertiary">
                        No {status === 'ALL' ? '' : status.toLowerCase() + ' '}flags right now.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {flags.map((f) => (
                        <FlagRow
                            key={f.id}
                            flag={f}
                            onDismiss={onDismiss}
                            onUphold={onUphold}
                        />
                    ))}
                </div>
            )}

            {pagination.total > limit && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-text-disabled">
                        Showing {offset + 1}–{Math.min(offset + limit, pagination.total)}{' '}
                        of {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-surface-1 text-text-secondary border-border-default hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ← Prev
                        </button>
                        <button
                            type="button"
                            disabled={offset + limit >= pagination.total}
                            onClick={() => setOffset(offset + limit)}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-surface-1 text-text-secondary border-border-default hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
