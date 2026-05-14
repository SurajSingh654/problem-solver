// ============================================================================
// Team Teaching Sessions — detail page (P1 baseline)
// ============================================================================
//
// Layout:
//   • Header: title + topic + status pill + scheduledAt + host
//   • Host actions: Start (when SCHEDULED) / End (when LIVE) / Cancel
//   • Live room: mounted when status === LIVE
//   • External link button (always visible if set)
//   • Tabs scaffold for Notes / Summary / Quiz / Coverage / Attendees /
//     Ratings / Flags — content fills in across P2-P3 phases
//
// P0 had only list + new pages. This page is the user-facing landing
// surface for everything teaching-related per session.
// ============================================================================
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect } from 'react'
import {
    useTeachingSession,
    useStartTeachingSession,
    useEndTeachingSession,
    useCancelTeachingSession,
} from '@hooks/useTeaching'
import useAuthStore from '@store/useAuthStore'
import { Spinner } from '@components/ui/Spinner'
import { useConfirm } from '@hooks/useConfirm'
import { cn } from '@utils/cn'
import LiveTeachingRoom from '@components/teaching/LiveTeachingRoom'
import AttachedNotesPanel from '@components/notes/AttachedNotesPanel'
import TeachingRatingForm from '@components/teaching/TeachingRatingForm'
import TeachingFlagModal from '@components/teaching/TeachingFlagModal'

const STATUS_PILL = {
    DRAFT: 'bg-surface-3 text-text-disabled border-border-default',
    SCHEDULED: 'bg-info-soft text-info-fg border-info-line',
    LIVE: 'bg-success-soft text-success-fg border-success-line',
    COMPLETED: 'bg-purple-400/10 text-purple-300 border-purple-400/25',
    CANCELLED: 'bg-surface-3 text-text-disabled border-border-default',
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

const TABS = [
    { id: 'notes', label: 'Notes' },
    { id: 'summary', label: 'AI Summary' },
    { id: 'quiz', label: 'Quiz' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'attendees', label: 'Attendees' },
    { id: 'ratings', label: 'Ratings' },
]

export default function TeachingDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const confirm = useConfirm()
    const user = useAuthStore((s) => s.user)
    const [activeTab, setActiveTab] = useState('notes')
    const [showRate, setShowRate] = useState(false)
    const [showFlag, setShowFlag] = useState(false)

    // After the host submits notes, the server runs three AI prompts
    // in the background. We poll the detail endpoint every 3s for up
    // to 30s so the artifacts appear without a manual refresh. The
    // session.aiGeneratedAt timestamp is the signal that all three
    // artifacts have landed.
    const [pollAi, setPollAi] = useState(false)
    const { data: session, isLoading, isError } = useTeachingSession(id, {
        pollAi,
    })

    // Auto-poll when notes exist but artifacts haven't been generated yet,
    // for up to 60s. Stops the moment aiGeneratedAt fills in.
    useEffect(() => {
        if (!session) return
        const needsAi =
            session.status === 'COMPLETED' &&
            !!session.notes &&
            !session.aiGeneratedAt
        if (needsAi && !pollAi) setPollAi(true)
        if (!needsAi && pollAi) setPollAi(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.aiGeneratedAt, session?.notes, session?.status])
    const start = useStartTeachingSession()
    const end = useEndTeachingSession()
    const cancel = useCancelTeachingSession()

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Spinner size="lg" />
            </div>
        )
    }
    if (isError || !session) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-8">
                <p className="text-sm text-danger-fg">Failed to load teaching session.</p>
                <Link to="/teaching" className="text-xs text-brand-fg-soft underline">
                    ← Back to teaching
                </Link>
            </div>
        )
    }

    const isHost = session.hostId === user?.id
    const isLive = session.status === 'LIVE'
    const isScheduled = session.status === 'SCHEDULED' || session.status === 'DRAFT'
    const isCompleted = session.status === 'COMPLETED'
    const isPast = isCompleted || session.status === 'CANCELLED'

    // Rating eligibility: completed session + viewer is not the host +
    // viewer is in the attendee list + hasn't already rated.
    const myAttendeeRow = (session.attendees || []).find(
        (a) => a.userId === user?.id,
    )
    const myExistingRating = (session.ratings || []).find(
        (r) => r.raterId === user?.id,
    )
    const canRate =
        isCompleted && !isHost && !!myAttendeeRow && !myExistingRating

    async function onCancel() {
        const ok = await confirm({
            title: 'Cancel session?',
            description:
                'Attendees will be notified. This cannot be undone — but you can schedule a new session.',
            confirmText: 'Cancel session',
            tone: 'danger',
        })
        if (!ok) return
        cancel.mutate(session.id, {
            onSuccess: () => navigate('/teaching'),
        })
    }

    return (
        <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-5">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <Link
                    to="/teaching"
                    className="text-[11px] text-text-disabled hover:text-text-primary"
                >
                    ← All sessions
                </Link>
                <div className="flex items-start justify-between gap-3 mt-1">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                                {session.title}
                            </h1>
                            <span
                                className={cn(
                                    'text-[10px] font-bold uppercase tracking-widest px-1.5 py-px rounded-full border',
                                    STATUS_PILL[session.status],
                                )}
                            >
                                {session.status}
                            </span>
                        </div>
                        <p className="text-sm text-text-tertiary mt-1">{session.topic}</p>
                        <div className="flex items-center gap-3 text-[11px] text-text-disabled mt-1">
                            <span>📅 {formatWhen(session.scheduledAt)}</span>
                            {session.host?.name && <span>👤 {session.host.name}</span>}
                            {session.capacity && <span>👥 {session.capacity} max</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {isHost && isScheduled && (
                            <button
                                onClick={() => start.mutate(session.id)}
                                disabled={start.isPending}
                                className="bg-success-soft text-success-fg border border-success-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-success-soft/80 transition-colors"
                            >
                                ▶ Start session
                            </button>
                        )}
                        {isHost && isLive && (
                            <button
                                onClick={() => end.mutate(session.id)}
                                disabled={end.isPending}
                                className="bg-warning-soft text-warning-fg border border-warning-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-warning-soft/80 transition-colors"
                            >
                                ⏹ End session
                            </button>
                        )}
                        {isHost && !isPast && (
                            <button
                                onClick={onCancel}
                                disabled={cancel.isPending}
                                className="bg-danger-soft text-danger-fg border border-danger-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-danger-soft/80 transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                        {canRate && (
                            <button
                                onClick={() => setShowRate(true)}
                                className="bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-brand-soft/80 transition-colors"
                            >
                                ⭐ Rate
                            </button>
                        )}
                        {!isHost && !isPast && (
                            <button
                                onClick={() => setShowFlag(true)}
                                className="text-xs font-bold text-text-tertiary hover:text-warning-fg px-2 py-2 transition-colors"
                                title="Flag for admin review"
                            >
                                🚩 Flag
                            </button>
                        )}
                    </div>
                </div>
                {session.description && (
                    <p className="text-xs text-text-secondary mt-3 max-w-2xl whitespace-pre-wrap">
                        {session.description}
                    </p>
                )}
            </motion.div>

            {/* ── Live room (only when LIVE) ───────────────── */}
            {isLive && <LiveTeachingRoom session={session} currentUserId={user?.id} />}

            {/* ── Pre-live external link CTA ──────────────── */}
            {isScheduled && session.externalMeetingLink && (
                <div className="bg-surface-1 border border-border-default rounded-xl p-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-text-tertiary">
                        Meeting link is ready. Attendees see this when the session starts.
                    </p>
                    <a
                        href={session.externalMeetingLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs font-bold text-brand-fg-soft hover:underline"
                    >
                        {session.externalMeetingLink}
                    </a>
                </div>
            )}

            {/* ── Tabs (P1 baseline; content lands across phases) ── */}
            <div>
                <div className="flex items-center gap-1 border-b border-border-default mb-3 overflow-x-auto">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={cn(
                                'text-xs font-bold px-3 py-2 border-b-2 transition-colors whitespace-nowrap',
                                activeTab === t.id
                                    ? 'border-brand-line text-text-primary'
                                    : 'border-transparent text-text-tertiary hover:text-text-secondary',
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="bg-surface-1 border border-border-default rounded-xl p-5 min-h-[120px]">
                    {activeTab === 'notes' && (
                        <NotesPanel session={session} isHost={isHost} />
                    )}
                    {activeTab === 'summary' && (
                        <SummaryPanel
                            summary={session.summary}
                            hasNotes={!!session.notes}
                            isHost={isHost}
                            pending={pollAi}
                        />
                    )}
                    {activeTab === 'quiz' && (
                        <QuizPanel
                            quiz={session.quiz}
                            hasNotes={!!session.notes}
                            isHost={isHost}
                            pending={pollAi}
                        />
                    )}
                    {activeTab === 'coverage' && (
                        <CoveragePanel
                            coverage={session.topicCoverage}
                            hasNotes={!!session.notes}
                            isHost={isHost}
                            pending={pollAi}
                        />
                    )}
                    {activeTab === 'attendees' && (
                        <AttendeesPanel attendees={session.attendees} />
                    )}
                    {activeTab === 'ratings' && (
                        <RatingsPanel
                            ratings={session.ratings}
                            avgRating={session.avgRating}
                        />
                    )}
                </div>
            </div>

            <AttachedNotesPanel entityType="TEACHING_SESSION" entityId={session.id} />

            {showRate && (
                <TeachingRatingForm
                    sessionId={session.id}
                    onClose={() => setShowRate(false)}
                />
            )}
            {showFlag && (
                <TeachingFlagModal
                    sessionId={session.id}
                    onClose={() => setShowFlag(false)}
                />
            )}
        </div>
    )
}

function AttendeesPanel({ attendees }) {
    if (!attendees || attendees.length === 0) {
        return <p className="text-xs text-text-tertiary">No attendees yet.</p>
    }
    return (
        <ul className="space-y-1.5 text-xs">
            {attendees.map((a) => (
                <li
                    key={a.id}
                    className="flex items-center justify-between font-mono text-[11px]"
                >
                    <span className="text-text-primary">
                        {a.userName || a.userId.slice(0, 8) + '…'}
                    </span>
                    <span className="text-text-disabled">
                        {a.leftAt ? `left after ${Math.round((a.durationMs || 0) / 60_000)}m` : 'still in'}
                    </span>
                </li>
            ))}
        </ul>
    )
}

// ── Notes panel ──────────────────────────────────────────────
function NotesPanel({ session, isHost }) {
    const isCompleted = session.status === 'COMPLETED'
    if (session.notes) {
        return (
            <div className="space-y-3">
                <div className="text-xs text-text-secondary whitespace-pre-wrap font-mono">
                    {session.notes}
                </div>
                {isHost && isCompleted && (
                    <Link
                        to={`/teaching/${session.id}/notes`}
                        className="inline-block text-[11px] font-bold text-brand-fg-soft hover:underline"
                    >
                        ✏️ Edit notes
                    </Link>
                )}
            </div>
        )
    }
    if (isHost && isCompleted) {
        return (
            <div className="text-center py-6 space-y-2">
                <p className="text-xs text-text-tertiary">
                    You haven't posted notes yet. Add them to unlock the AI summary,
                    quiz, and topic-coverage check.
                </p>
                <Link
                    to={`/teaching/${session.id}/notes`}
                    className="inline-block bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-brand-soft/80 transition-colors"
                >
                    📝 Post notes
                </Link>
            </div>
        )
    }
    return (
        <p className="text-xs text-text-tertiary">
            Notes will appear here after the host posts them.
        </p>
    )
}

function FallbackBanner({ artifact }) {
    if (!artifact?._fallback) return null
    return (
        <div className="bg-warning-soft text-warning-fg border border-warning-line rounded-lg px-3 py-2 text-[11px] mb-3">
            ⚠️ AI generation fell back to a placeholder for this artifact. Re-submit notes
            to retry.
        </div>
    )
}

function PendingState({ kind }) {
    return (
        <p className="text-xs text-text-tertiary">
            Generating AI {kind}… this usually takes a few seconds.
        </p>
    )
}

function NoNotesState({ isHost }) {
    return (
        <p className="text-xs text-text-tertiary">
            {isHost
                ? 'Post notes to generate this artifact.'
                : 'Available once the host posts notes.'}
        </p>
    )
}

function SummaryPanel({ summary, hasNotes, isHost, pending }) {
    if (!hasNotes) return <NoNotesState isHost={isHost} />
    if (!summary) {
        return pending ? <PendingState kind="summary" /> : <NoNotesState isHost={isHost} />
    }
    return (
        <div className="space-y-4">
            <FallbackBanner artifact={summary} />
            {summary.tldr && (
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                        TL;DR
                    </p>
                    <p className="text-sm text-text-primary">{summary.tldr}</p>
                </div>
            )}
            {Array.isArray(summary.keyTakeaways) && summary.keyTakeaways.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                        Key takeaways
                    </p>
                    <ul className="space-y-1.5">
                        {summary.keyTakeaways.map((b, i) => (
                            <li key={i} className="text-xs text-text-secondary flex gap-2">
                                <span className="text-brand-fg-soft flex-shrink-0">•</span>
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {Array.isArray(summary.definitions) && summary.definitions.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                        Definitions
                    </p>
                    <ul className="space-y-1.5">
                        {summary.definitions.map((d, i) => (
                            <li key={i} className="text-xs">
                                <span className="font-bold text-text-primary">{d.term}</span>
                                <span className="text-text-tertiary"> — {d.definition}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {Array.isArray(summary.openQuestions) && summary.openQuestions.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                        Open questions
                    </p>
                    <ul className="space-y-1.5">
                        {summary.openQuestions.map((q, i) => (
                            <li key={i} className="text-xs text-text-secondary italic">
                                ? {q}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

function QuizPanel({ quiz, hasNotes, isHost, pending }) {
    if (!hasNotes) return <NoNotesState isHost={isHost} />
    if (!quiz) {
        return pending ? <PendingState kind="quiz" /> : <NoNotesState isHost={isHost} />
    }
    const questions = Array.isArray(quiz.questions) ? quiz.questions : []
    return (
        <div className="space-y-3">
            <FallbackBanner artifact={quiz} />
            {questions.map((q, i) => (
                <QuizCard key={i} q={q} idx={i + 1} />
            ))}
        </div>
    )
}

function QuizCard({ q, idx }) {
    const [revealed, setRevealed] = useState(false)
    return (
        <div className="bg-surface-2 border border-border-default rounded-lg p-3">
            <p className="text-xs font-bold text-text-primary mb-2">
                <span className="text-text-disabled mr-1">Q{idx}.</span>
                {q.question}
            </p>
            {q.type === 'MCQ' && Array.isArray(q.options) && (
                <ol className="space-y-1 text-xs text-text-secondary mb-2 list-[upper-alpha] ml-5">
                    {q.options.map((o, i) => (
                        <li
                            key={i}
                            className={
                                revealed && o === q.answer
                                    ? 'text-success-fg font-bold'
                                    : ''
                            }
                        >
                            {o}
                        </li>
                    ))}
                </ol>
            )}
            <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="text-[11px] font-bold text-brand-fg-soft hover:underline"
            >
                {revealed ? 'Hide answer' : 'Reveal answer'}
            </button>
            {revealed && (
                <div className="mt-2 bg-surface-1 border border-border-default rounded p-2 space-y-1">
                    {q.type === 'SHORT' && q.answer && (
                        <p className="text-xs">
                            <span className="font-bold text-success-fg">A:</span>{' '}
                            <span className="text-text-secondary">{q.answer}</span>
                        </p>
                    )}
                    {q.explanation && (
                        <p className="text-[11px] text-text-tertiary italic">
                            {q.explanation}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

const COVERAGE_TONES = {
    FULL: 'bg-success-soft text-success-fg border-success-line',
    PARTIAL: 'bg-warning-soft text-warning-fg border-warning-line',
    OFF_TOPIC: 'bg-danger-soft text-danger-fg border-danger-line',
}

function CoveragePanel({ coverage, hasNotes, isHost, pending }) {
    if (!hasNotes) return <NoNotesState isHost={isHost} />
    if (!coverage) {
        return pending ? <PendingState kind="coverage" /> : <NoNotesState isHost={isHost} />
    }
    return (
        <div className="space-y-3">
            <FallbackBanner artifact={coverage} />
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        'text-[11px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border',
                        COVERAGE_TONES[coverage.verdict] || COVERAGE_TONES.PARTIAL,
                    )}
                >
                    {coverage.verdict}
                </span>
                <span className="text-2xl font-extrabold font-mono text-text-primary">
                    {coverage.coverageScore}/100
                </span>
            </div>
            {coverage.rationale && (
                <p className="text-xs text-text-secondary">{coverage.rationale}</p>
            )}
            {Array.isArray(coverage.coveredAspects) && coverage.coveredAspects.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-success-fg uppercase tracking-widest mb-1">
                        ✓ Covered
                    </p>
                    <ul className="space-y-1 text-xs text-text-secondary list-disc ml-5">
                        {coverage.coveredAspects.map((a, i) => (
                            <li key={i}>{a}</li>
                        ))}
                    </ul>
                </div>
            )}
            {Array.isArray(coverage.missingAspects) && coverage.missingAspects.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-warning-fg uppercase tracking-widest mb-1">
                        ✗ Missing
                    </p>
                    <ul className="space-y-1 text-xs text-text-secondary list-disc ml-5">
                        {coverage.missingAspects.map((a, i) => (
                            <li key={i}>{a}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

function RatingsPanel({ ratings, avgRating }) {
    if (!ratings || ratings.length === 0) {
        return (
            <p className="text-xs text-text-tertiary">
                No ratings yet. Peer ratings unlock once the session is COMPLETED.
            </p>
        )
    }
    return (
        <div className="space-y-2">
            <p className="text-xs font-bold text-text-primary">
                ⭐ {avgRating} avg ({ratings.length} ratings)
            </p>
            <ul className="space-y-2">
                {ratings.map((r) => (
                    <li
                        key={r.id}
                        className="bg-surface-2 border border-border-default rounded-lg p-2.5 text-xs"
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-text-primary">{r.rating}/5</span>
                            <span className="text-[10px] text-text-disabled">
                                {r.raterName || 'Anonymous'}
                            </span>
                        </div>
                        {r.comment && (
                            <p className="text-text-secondary mt-1">{r.comment}</p>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}
