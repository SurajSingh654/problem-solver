// ============================================================================
// ConceptQATab — per-concept Q&A (questions + threaded replies)
// ============================================================================
import { useState } from 'react'
import { MessageSquare, CheckCircle2, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import useAuthStore from '@store/useAuthStore'
import {
    useConceptQuestions,
    usePostConceptQuestion,
    usePostConceptQuestionReply,
    useResolveConceptQuestion,
} from '@hooks/useCurriculumLearn'

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function formatDate(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1)  return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24)   return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7)    return `${diffD}d ago`
    return d.toLocaleDateString()
}

function Avatar({ user, size = 7 }) {
    const cls = `w-${size} h-${size} rounded-full`
    if (user?.avatarUrl) {
        return <img src={user.avatarUrl} alt="" className={cn(cls, 'object-cover')} />
    }
    return (
        <div className={cn(cls, 'bg-brand-soft flex items-center justify-center text-[10px] font-bold text-brand-fg-soft')}>
            {user?.name?.[0]?.toUpperCase() ?? '?'}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// ReplyThread
// ────────────────────────────────────────────────────────────────

function ReplyThread({ replies, conceptSlug, questionId }) {
    const [open, setOpen] = useState(replies.length > 0)
    const [replyText, setReplyText] = useState('')
    const postReply = usePostConceptQuestionReply(conceptSlug)

    async function handleReply(e) {
        e.preventDefault()
        if (!replyText.trim()) return
        try {
            await postReply.mutateAsync({ questionId, body: replyText.trim() })
            setReplyText('')
        } catch { /* toast already fired */ }
    }

    return (
        <div className="mt-3 pl-3 border-l-2 border-border-subtle space-y-3">
            {replies.length > 0 && (
                <button
                    onClick={() => setOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                    {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </button>
            )}

            {open && replies.map((r) => (
                <div key={r.id} className="flex gap-2">
                    <Avatar user={r.user} size={6} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-text-primary">{r.user?.name}</span>
                            <span className="text-[11px] text-text-tertiary">{formatDate(r.createdAt)}</span>
                        </div>
                        <p className="text-sm text-text-secondary whitespace-pre-wrap break-words mt-0.5">
                            {r.body}
                        </p>
                    </div>
                </div>
            ))}

            <form onSubmit={handleReply} className="flex gap-2 items-end">
                <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(e) }
                    }}
                    placeholder="Write a reply… (Enter to send)"
                    rows={1}
                    maxLength={5000}
                    className={cn(
                        'flex-1 resize-none rounded-lg border border-border-default bg-surface-1',
                        'px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary',
                        'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
                    )}
                />
                <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    disabled={!replyText.trim() || postReply.isPending}
                    className="shrink-0"
                >
                    {postReply.isPending ? <Spinner size="xs" /> : <Send className="w-4 h-4" />}
                </Button>
            </form>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// QuestionCard
// ────────────────────────────────────────────────────────────────

function QuestionCard({ q, conceptSlug, currentUserId, userTeamRole }) {
    const resolve = useResolveConceptQuestion(conceptSlug)
    const canResolve = !q.isResolved && (q.userId === currentUserId || userTeamRole === 'TEAM_ADMIN')

    return (
        <div className={cn(
            'rounded-2xl border bg-surface-1 p-4 space-y-2',
            q.isResolved ? 'border-success-line opacity-70' : 'border-border-default',
        )}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={q.user} />
                    <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-text-primary truncate">{q.user?.name}</span>
                            <span className="text-xs text-text-tertiary">{formatDate(q.createdAt)}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {q.isResolved && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-fg bg-success-soft border border-success-line rounded-full px-2 py-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                    )}
                    {canResolve && (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => resolve.mutate(q.id)}
                            disabled={resolve.isPending}
                            className="text-text-tertiary hover:text-success-fg text-xs"
                        >
                            Mark resolved
                        </Button>
                    )}
                </div>
            </div>

            {/* Body */}
            <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                {q.body}
            </p>

            {/* Replies */}
            <ReplyThread
                replies={q.replies ?? []}
                conceptSlug={conceptSlug}
                questionId={q.id}
            />
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// AskForm
// ────────────────────────────────────────────────────────────────

function AskForm({ conceptSlug }) {
    const [text, setText] = useState('')
    const post = usePostConceptQuestion(conceptSlug)

    async function handleSubmit(e) {
        e.preventDefault()
        if (!text.trim()) return
        try {
            await post.mutateAsync({ body: text.trim() })
            setText('')
        } catch { /* toast already fired */ }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask a question about this concept…"
                rows={3}
                maxLength={5000}
                className={cn(
                    'w-full resize-none rounded-xl border border-border-default bg-surface-1',
                    'px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary',
                    'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
                )}
            />
            <div className="flex items-center justify-between">
                <p className="text-xs text-text-tertiary">{text.length}/5000</p>
                <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!text.trim() || post.isPending}
                >
                    {post.isPending ? <Spinner size="xs" /> : null}
                    Post question
                </Button>
            </div>
        </form>
    )
}

// ────────────────────────────────────────────────────────────────
// ConceptQATab
// ────────────────────────────────────────────────────────────────

export default function ConceptQATab({ concept }) {
    const { slug } = concept
    const questionsQ = useConceptQuestions(slug)
    const currentUser = useAuthStore((s) => s.user)
    const currentUserId = currentUser?.id
    const userTeamRole = currentUser?.teamRole

    const questions = questionsQ.data ?? []
    const openQ = questions.filter((q) => !q.isResolved)
    const resolvedQ = questions.filter((q) => q.isResolved)

    return (
        <div className="space-y-6">
            {/* Framing */}
            <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4">
                <MessageSquare className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-text-primary">Team Q&A</p>
                    <p className="text-xs text-text-secondary">
                        Ask anything about this concept. Teammates can reply and
                        mark questions resolved.
                    </p>
                </div>
            </div>

            {/* Ask form */}
            <AskForm conceptSlug={slug} />

            {/* Questions */}
            {questionsQ.isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner size="md" />
                </div>
            ) : questions.length === 0 ? (
                <div className="rounded-2xl border border-border-default bg-surface-2 p-8 text-center space-y-1">
                    <p className="text-sm font-semibold text-text-primary">No questions yet</p>
                    <p className="text-xs text-text-tertiary">Be the first to ask something about this concept.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {openQ.map((q) => (
                        <QuestionCard
                            key={q.id}
                            q={q}
                            conceptSlug={slug}
                            currentUserId={currentUserId}
                            userTeamRole={userTeamRole}
                        />
                    ))}
                    {resolvedQ.length > 0 && (
                        <details className="space-y-3">
                            <summary className="cursor-pointer text-xs text-text-tertiary font-semibold select-none py-1">
                                {resolvedQ.length} resolved question{resolvedQ.length === 1 ? '' : 's'}
                            </summary>
                            <div className="space-y-3 pt-1">
                                {resolvedQ.map((q) => (
                                    <QuestionCard
                                        key={q.id}
                                        q={q}
                                        conceptSlug={slug}
                                        currentUserId={currentUserId}
                                        userTeamRole={userTeamRole}
                                    />
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            )}
        </div>
    )
}
