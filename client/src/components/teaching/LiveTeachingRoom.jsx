// ============================================================================
// LiveTeachingRoom — presence + Q&A over the existing WebSocket
// ============================================================================
//
// Mounted on TeachingDetailPage when `session.status === 'LIVE'`. Opens
// the same WS server the Mock Interview uses (path is purely client-side
// convention; the server's setupWebSocket accepts any upgrade URL).
//
// On mount:  POST /teaching/:id/join (REST safety net)
//            send teaching:join over WS
// On unmount: send teaching:leave + POST /teaching/:id/leave
//
// Listens for: teaching:joined, teaching:attendee_joined,
// teaching:attendee_left, teaching:question, teaching:answer,
// teaching:ended.
//
// Q&A queue is in-memory only (v1 — not persisted server-side).
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { useJoinTeachingSession, useLeaveTeachingSession } from '@hooks/useTeaching'

function getWsUrl() {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl.includes('railway.app')) {
        return apiUrl.replace('https://', 'wss://').replace('/api', '') + '/ws/teaching'
    }
    return 'ws://localhost:5000/ws/teaching'
}

export default function LiveTeachingRoom({ session, currentUserId }) {
    const sessionId = session.id
    const isHost = session.hostId === currentUserId

    const [connected, setConnected] = useState(false)
    const [errorBanner, setErrorBanner] = useState(null)
    const [attendeeIds, setAttendeeIds] = useState(() => new Set())
    const [questions, setQuestions] = useState([])
    const [draft, setDraft] = useState('')
    const wsRef = useRef(null)

    const join = useJoinTeachingSession()
    const leave = useLeaveTeachingSession()

    // ── Connect WS + REST join (parallel safety net) ──────
    useEffect(() => {
        // Fire REST join — captures attendance even if the socket fails.
        join.mutate(sessionId)

        const token = localStorage.getItem('token')
        const url = `${getWsUrl()}?token=${token}`
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
            setConnected(true)
            setErrorBanner(null)
            ws.send(JSON.stringify({ type: 'teaching:join', sessionId }))
        }

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                switch (msg.type) {
                    case 'teaching:joined':
                        // Confirmed by server; nothing to do beyond connected=true.
                        break
                    case 'teaching:attendee_joined':
                        setAttendeeIds((prev) => {
                            const next = new Set(prev)
                            next.add(msg.userId)
                            return next
                        })
                        break
                    case 'teaching:attendee_left':
                        setAttendeeIds((prev) => {
                            const next = new Set(prev)
                            next.delete(msg.userId)
                            return next
                        })
                        break
                    case 'teaching:question':
                        if (msg.sessionId === sessionId) {
                            setQuestions((prev) => [
                                ...prev,
                                {
                                    id: msg.questionId,
                                    askerId: msg.askerId,
                                    text: msg.text,
                                    askedAt: msg.askedAt,
                                    answers: [],
                                },
                            ])
                        }
                        break
                    case 'teaching:answer':
                        if (msg.sessionId === sessionId) {
                            setQuestions((prev) =>
                                prev.map((q) =>
                                    q.id === msg.questionId
                                        ? {
                                              ...q,
                                              answers: [
                                                  ...q.answers,
                                                  {
                                                      answererId: msg.answererId,
                                                      text: msg.text,
                                                      answeredAt: msg.answeredAt,
                                                  },
                                              ],
                                          }
                                        : q,
                                ),
                            )
                        }
                        break
                    case 'teaching:ended':
                        if (msg.sessionId === sessionId) {
                            setErrorBanner('Host ended the session.')
                        }
                        break
                    case 'error':
                        setErrorBanner(msg.error || 'WebSocket error.')
                        break
                    default:
                        break
                }
            } catch {
                /* ignore parse errors */
            }
        }

        ws.onerror = () => {
            setErrorBanner('Live connection failed. Attendance still recorded.')
        }
        ws.onclose = () => {
            setConnected(false)
        }

        return () => {
            try {
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({ type: 'teaching:leave', sessionId }))
                }
                ws.close()
            } catch {
                /* ignore */
            }
            // REST leave runs in parallel so the row gets durationMs.
            leave.mutate(sessionId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])

    // ── Send question/answer ──────────────────────────────
    function sendQuestion(e) {
        e.preventDefault()
        const text = draft.trim()
        if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(
            JSON.stringify({ type: 'teaching:question', sessionId, text }),
        )
        setDraft('')
    }

    function sendAnswer(questionId, text) {
        if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(
            JSON.stringify({
                type: 'teaching:answer',
                sessionId,
                questionId,
                text: text.trim(),
            }),
        )
    }

    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span
                        className={
                            connected
                                ? 'inline-flex w-2 h-2 rounded-full bg-success-fg animate-pulse'
                                : 'inline-flex w-2 h-2 rounded-full bg-text-disabled'
                        }
                    />
                    <h3 className="text-sm font-bold text-text-primary">
                        Live Room {connected ? '' : '(reconnecting…)'}
                    </h3>
                </div>
                {session.externalMeetingLink && (
                    <a
                        href={session.externalMeetingLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-3 py-2 text-xs font-bold hover:bg-brand-soft/80 transition-colors"
                    >
                        🎥 Join via meeting link →
                    </a>
                )}
            </div>

            {errorBanner && (
                <div className="bg-warning-soft text-warning-fg border border-warning-line rounded-lg px-3 py-2 text-xs">
                    {errorBanner}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* ── Attendees pane ──────────────────────────── */}
                <div className="bg-surface-2 border border-border-default rounded-xl p-3">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        In room ({attendeeIds.size + 1})
                    </p>
                    <ul className="space-y-1 text-xs text-text-secondary">
                        <li className="font-bold text-text-primary">
                            you {isHost && <span className="text-brand-fg-soft">· host</span>}
                        </li>
                        {[...attendeeIds].map((uid) => (
                            <li key={uid} className="font-mono text-[11px]">
                                {uid.slice(0, 8)}…
                            </li>
                        ))}
                    </ul>
                </div>

                {/* ── Q&A pane ───────────────────────────────── */}
                <div className="sm:col-span-2 bg-surface-2 border border-border-default rounded-xl p-3 flex flex-col gap-2">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                        Q&amp;A
                    </p>
                    {questions.length === 0 ? (
                        <p className="text-xs text-text-tertiary text-center py-6">
                            No questions yet. Ask one to get the conversation started.
                        </p>
                    ) : (
                        <ul className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                            {questions.map((q) => (
                                <QnaRow
                                    key={q.id}
                                    q={q}
                                    isHost={isHost}
                                    onAnswer={sendAnswer}
                                />
                            ))}
                        </ul>
                    )}
                    <form onSubmit={sendQuestion} className="flex items-center gap-2 mt-1">
                        <input
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Ask a question…"
                            disabled={!connected}
                            className="flex-1 bg-surface-1 border border-border-default rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!connected || !draft.trim()}
                            className="bg-brand-soft text-brand-fg-soft border border-brand-line rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Ask
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

function QnaRow({ q, isHost, onAnswer }) {
    const [draft, setDraft] = useState('')
    return (
        <li className="bg-surface-1 border border-border-default rounded-lg p-2.5">
            <p className="text-xs text-text-primary mb-1">
                <span className="font-bold mr-1">Q:</span>
                {q.text}
            </p>
            {q.answers.length > 0 && (
                <ul className="ml-3 space-y-1 mb-2">
                    {q.answers.map((a, i) => (
                        <li key={i} className="text-xs text-text-secondary">
                            <span className="font-bold mr-1 text-success-fg">A:</span>
                            {a.text}
                        </li>
                    ))}
                </ul>
            )}
            {isHost && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        onAnswer(q.id, draft)
                        setDraft('')
                    }}
                    className="flex items-center gap-2"
                >
                    <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Answer…"
                        className="flex-1 bg-surface-2 border border-border-default rounded-md px-2 py-1 text-[11px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand-line"
                    />
                    <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="text-[10px] font-bold text-brand-fg-soft px-2 py-1 disabled:opacity-50"
                    >
                        Reply
                    </button>
                </form>
            )}
        </li>
    )
}
