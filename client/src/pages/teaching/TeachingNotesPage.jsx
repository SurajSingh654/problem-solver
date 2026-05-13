// ============================================================================
// Team Teaching Sessions — post-session notes editor (P3)
// ============================================================================
//
// Hosts post markdown notes after the session. Submitting kicks off
// three AI surfaces server-side (summary / quiz / topic-coverage),
// fired in parallel via Promise.allSettled. The detail page polls
// for those artifacts so the host doesn't wait on the round-trip.
// ============================================================================
import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    useTeachingSession,
    useSubmitTeachingNotes,
} from '@hooks/useTeaching'
import useAuthStore from '@store/useAuthStore'
import { Spinner } from '@components/ui/Spinner'

const MIN_LENGTH = 50
const MAX_LENGTH = 20_000

export default function TeachingNotesPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const { data: session, isLoading, isError } = useTeachingSession(id)
    const submit = useSubmitTeachingNotes()

    const [notes, setNotes] = useState('')

    // Seed with existing notes once.
    useEffect(() => {
        if (session?.notes && notes === '') {
            setNotes(session.notes)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.notes])

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
                <p className="text-sm text-danger-fg">Failed to load session.</p>
                <Link to="/teaching" className="text-xs text-brand-fg-soft underline">
                    ← Back to teaching
                </Link>
            </div>
        )
    }

    const isHost = session.hostId === user?.id
    const isCompleted = session.status === 'COMPLETED'

    if (!isHost) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-8">
                <p className="text-sm text-warning-fg">
                    Only the host can submit notes for this session.
                </p>
                <Link
                    to={`/teaching/${id}`}
                    className="text-xs text-brand-fg-soft underline"
                >
                    ← Back to session
                </Link>
            </div>
        )
    }
    if (!isCompleted) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-8">
                <p className="text-sm text-warning-fg">
                    End the session first — notes can only be submitted on COMPLETED sessions.
                </p>
                <Link
                    to={`/teaching/${id}`}
                    className="text-xs text-brand-fg-soft underline"
                >
                    ← Back to session
                </Link>
            </div>
        )
    }

    const trimmedLen = notes.trim().length
    const canSubmit =
        trimmedLen >= MIN_LENGTH && trimmedLen <= MAX_LENGTH && !submit.isPending

    function onSubmit(e) {
        e.preventDefault()
        if (!canSubmit) return
        submit.mutate(
            { id, notes },
            {
                onSuccess: () => navigate(`/teaching/${id}`),
            },
        )
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <Link
                    to={`/teaching/${id}`}
                    className="text-[11px] text-text-disabled hover:text-text-primary"
                >
                    ← Back to session
                </Link>
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight mt-1">
                    📝 Post session notes
                </h1>
                <p className="text-sm text-text-secondary mt-1">
                    Write the notes you'd want a teammate who missed the session to read.
                    AI generates a TL;DR, a 3-5 question review quiz, and a topic-coverage
                    check from these notes — make them substantive.
                </p>
            </motion.div>

            <div className="bg-info-soft border border-info-line rounded-xl p-3">
                <p className="text-xs text-info-fg">
                    <span className="font-bold">Topic:</span> {session.topic}
                </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
                <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                    Notes (markdown)
                </label>
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={20}
                    placeholder={`# Title

Walk through what you taught.

## Sub-section
Key concept 1
Key concept 2

## Trade-offs
What did you NOT cover and why?
`}
                    className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line resize-y font-mono"
                />
                <div className="flex items-center justify-between text-[10px] text-text-disabled">
                    <span>
                        {trimmedLen}/{MAX_LENGTH} chars
                        {trimmedLen < MIN_LENGTH && (
                            <span className="ml-2 text-warning-fg">
                                (need at least {MIN_LENGTH})
                            </span>
                        )}
                    </span>
                    <span>Markdown supported. Headings (#, ##) help the AI summary.</span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => navigate(`/teaching/${id}`)}
                        className="text-xs font-bold text-text-tertiary hover:text-text-primary px-3 py-2 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="flex items-center gap-2 bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-4 py-2 text-xs font-bold hover:bg-brand-soft/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submit.isPending && <Spinner size="sm" />}
                        Submit notes & generate AI artifacts
                    </button>
                </div>
            </form>
        </div>
    )
}
