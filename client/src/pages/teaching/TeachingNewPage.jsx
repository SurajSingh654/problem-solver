// ============================================================================
// Team Teaching Sessions — create form (P0)
// ============================================================================
//
// Minimal form: title, topic, optional description, scheduledAt
// (datetime-local), external meeting link, capacity. On submit,
// navigate to the new session's detail page.
// ============================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useCreateTeachingSession } from '@hooks/useTeaching'
import { Spinner } from '@components/ui/Spinner'

// Convert a `datetime-local` value (no timezone) to an ISO string in
// the user's local timezone. Browsers serialize datetime-local in
// local time without offset; we let the JS Date parser interpret it
// in local time then convert to UTC ISO for the API.
function localToISO(local) {
    if (!local) return null
    const d = new Date(local)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Default scheduledAt — 1 hour from now, rounded up to the next 15 min,
// formatted for a datetime-local input.
function defaultScheduledLocal() {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TeachingNewPage() {
    const navigate = useNavigate()
    const create = useCreateTeachingSession()

    const [title, setTitle] = useState('')
    const [topic, setTopic] = useState('')
    const [description, setDescription] = useState('')
    const [externalMeetingLink, setExternalMeetingLink] = useState('')
    const [capacity, setCapacity] = useState(20)
    const [scheduledLocal, setScheduledLocal] = useState(defaultScheduledLocal())

    const canSubmit =
        title.trim().length > 0 &&
        topic.trim().length > 0 &&
        scheduledLocal &&
        !create.isPending

    function onSubmit(e) {
        e.preventDefault()
        if (!canSubmit) return
        const scheduledAt = localToISO(scheduledLocal)
        if (!scheduledAt) return
        create.mutate(
            {
                title: title.trim(),
                topic: topic.trim(),
                description: description.trim() || undefined,
                externalMeetingLink: externalMeetingLink.trim() || undefined,
                capacity: Number(capacity) || 20,
                scheduledAt,
            },
            {
                onSuccess: (res) => {
                    const id = res?.data?.data?.session?.id
                    if (id) navigate(`/teaching/${id}`)
                    else navigate('/teaching')
                },
            },
        )
    }

    return (
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                    📚 Schedule a teaching session
                </h1>
                <p className="text-sm text-text-secondary mt-1">
                    Pick a topic you want to teach your team. The actual meeting runs on
                    whatever video link you provide (Zoom, Meet, Discord). After the
                    session, post markdown notes — AI will generate a summary, a quiz,
                    and a topic-coverage check for attendees.
                </p>
            </motion.div>

            <form onSubmit={onSubmit} className="space-y-4">
                <div>
                    <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                        Title <span className="text-danger-fg">*</span>
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder='e.g. "Practical Postgres indexes"'
                        maxLength={140}
                        className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line"
                        required
                    />
                </div>

                <div>
                    <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                        Topic <span className="text-danger-fg">*</span>
                    </label>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder='e.g. "Database internals"'
                        maxLength={120}
                        className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line"
                        required
                    />
                    <p className="text-[10px] text-text-disabled mt-1">
                        High-level area. The AI topic-coverage check uses this to grade
                        whether your notes covered what you advertised.
                    </p>
                </div>

                <div>
                    <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="What will attendees learn? Two or three sentences."
                        className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line resize-y"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                            Scheduled at <span className="text-danger-fg">*</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledLocal}
                            onChange={(e) => setScheduledLocal(e.target.value)}
                            className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-line"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                            Capacity
                        </label>
                        <input
                            type="number"
                            min={2}
                            max={200}
                            value={capacity}
                            onChange={(e) => setCapacity(e.target.value)}
                            className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand-line"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                        External meeting link
                    </label>
                    <input
                        type="url"
                        value={externalMeetingLink}
                        onChange={(e) => setExternalMeetingLink(e.target.value)}
                        placeholder="https://meet.google.com/abc-defg-hij"
                        className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line"
                    />
                    <p className="text-[10px] text-text-disabled mt-1">
                        Optional. The actual video happens here; in-app room handles
                        attendance + Q&amp;A.
                    </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => navigate('/teaching')}
                        className="text-xs font-bold text-text-tertiary hover:text-text-primary px-3 py-2 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="flex items-center gap-2 bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-4 py-2 text-xs font-bold hover:bg-brand-soft/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {create.isPending && <Spinner size="sm" />}
                        Schedule session
                    </button>
                </div>
            </form>
        </div>
    )
}
