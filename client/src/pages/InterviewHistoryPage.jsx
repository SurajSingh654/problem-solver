import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatRelativeDate, formatDuration } from '@utils/formatters'
import api from '@services/api'

// ── Verdict badge ──────────────────────────────────────
function VerdictBadge({ verdict }) {
    const config = {
        'STRONG_HIRE': { color: 'bg-success/15 text-success border-success/30', icon: '🏆', label: 'Strong Hire' },
        'HIRE': { color: 'bg-success/15 text-success border-success/30', icon: '✅', label: 'Hire' },
        'LEAN_HIRE': { color: 'bg-brand-400/15 text-brand-300 border-brand-400/30', icon: '🤔', label: 'Lean Hire' },
        'LEAN_NO_HIRE': { color: 'bg-warning/15 text-warning border-warning/30', icon: '📈', label: 'Lean No Hire' },
        'NO_HIRE': { color: 'bg-danger/15 text-danger border-danger/30', icon: '💪', label: 'No Hire' },
    }
    const c = config[verdict] || config['LEAN_HIRE'] || { color: 'bg-surface-3 text-text-tertiary border-border-default', icon: '—', label: verdict }
    return (
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', c.color)}>
            {c.icon} {c.label}
        </span>
    )
}

// ── Score ring (small) ─────────────────────────────────
function MiniScore({ score, size = 36 }) {
    const r = (size / 2) - 4
    const circumf = 2 * Math.PI * r
    const dashOffset = circumf - (score / 10) * circumf
    const color = score >= 7 ? '#22c55e' : score >= 5 ? '#eab308' : '#ef4444'

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={color} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={circumf} strokeDashoffset={dashOffset} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-extrabold font-mono text-text-primary">{score}</span>
            </div>
        </div>
    )
}

// ── Session card ───────────────────────────────────────
function SessionCard({ session, onClick }) {
    const debrief = session.debrief
    const scores = session.scores
    const problem = session.problem
    const overallScore = debrief?.overallScore || scores?.approach || null

    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onClick}
            className="w-full flex items-center gap-4 p-4 rounded-xl border
                 bg-surface-1 border-border-default text-left
                 hover:border-brand-400/30 hover:-translate-y-0.5
                 hover:shadow-md transition-all duration-200"
        >
            {overallScore ? (
                <MiniScore score={overallScore} />
            ) : (
                <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center
                        text-xs text-text-disabled flex-shrink-0">
                    —
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-text-primary truncate">
                        {problem?.title || `${session.category?.replace('_', ' ')} Interview`}
                    </span>
                    {debrief?.verdict && <VerdictBadge verdict={debrief.verdict} />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-text-tertiary">
                        {session.interviewStyle || 'Standard'}
                    </span>
                    <span className="text-text-disabled text-[11px]">·</span>
                    <span className="text-[11px] text-text-tertiary">
                        {session.difficulty}
                    </span>
                    <span className="text-text-disabled text-[11px]">·</span>
                    <span className="text-[11px] text-text-disabled">
                        {formatRelativeDate(session.startedAt)}
                    </span>
                </div>
            </div>

            <Badge
                variant={session.status === 'COMPLETED' ? 'success' :
                    session.status === 'ABANDONED' ? 'danger' : 'warning'}
                size="xs"
            >
                {session.status}
            </Badge>

            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-text-disabled flex-shrink-0">
                <polyline points="9 18 15 12 9 6" />
            </svg>
        </motion.button>
    )
}

// ── Session detail — transcript view ───────────────────
function SessionDetail({ sessionId, onBack }) {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                const res = await api.get(`/interview-v2/${sessionId}`)
                // v3.0 returns { success, session }
                setSession(res.data.data.session)
            } catch (err) {
                console.error('Failed to load session:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [sessionId])

    if (loading) return (
        <div className="flex items-center justify-center h-[50vh]">
            <Spinner size="lg" />
        </div>
    )

    if (!session) return (
        <div className="text-center py-20">
            <p className="text-text-tertiary">Session not found</p>
            <Button variant="ghost" size="sm" onClick={onBack} className="mt-3">← Back</Button>
        </div>
    )

    const debrief = session.debrief
    const messages = (session.messages || []).filter(m =>
        m.role === 'USER' || m.role === 'ASSISTANT' ||
        m.role === 'user' || m.role === 'assistant'
    )

    return (
        <div className="max-w-[800px] mx-auto">
            <button onClick={onBack}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                         hover:text-text-primary transition-colors mb-6">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to History
            </button>

            {/* Session header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex-1">
                        <h2 className="text-base font-bold text-text-primary">
                            {session.problem?.title || `${session.category?.replace('_', ' ')} Interview`}
                        </h2>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                            <span className="text-xs text-text-tertiary">{session.interviewStyle || 'Standard'}</span>
                            <span className="text-text-disabled text-xs">·</span>
                            <span className="text-xs text-text-tertiary">{session.difficulty}</span>
                            <span className="text-text-disabled text-xs">·</span>
                            <span className="text-xs text-text-disabled">{formatRelativeDate(session.startedAt)}</span>
                            {debrief?.verdict && <VerdictBadge verdict={debrief.verdict} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Debrief summary */}
            {debrief && (
                <div className="bg-surface-1 border border-brand-400/20 rounded-2xl p-5 mb-6">
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>📊</span> Debrief
                    </h3>

                    {debrief.scores && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                            {Object.entries(debrief.scores).map(([key, score]) => (
                                <div key={key} className="text-center bg-surface-2 rounded-xl p-2.5">
                                    <div className={cn(
                                        'text-lg font-extrabold font-mono',
                                        score >= 7 ? 'text-success' :
                                            score >= 5 ? 'text-warning' : 'text-danger'
                                    )}>
                                        {score}
                                    </div>
                                    <p className="text-[9px] text-text-disabled uppercase tracking-wider mt-0.5 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {debrief.strengths?.length > 0 && (
                            <div className="bg-success/5 border border-success/15 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-2">Strengths</p>
                                {debrief.strengths.map((s, i) => (
                                    <p key={i} className="text-xs text-text-secondary mb-1 flex gap-2">
                                        <span className="text-success flex-shrink-0">→</span> {s}
                                    </p>
                                ))}
                            </div>
                        )}
                        {debrief.improvements?.length > 0 && (
                            <div className="bg-warning/5 border border-warning/15 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-2">Improve</p>
                                {debrief.improvements.map((s, i) => (
                                    <p key={i} className="text-xs text-text-secondary mb-1 flex gap-2">
                                        <span className="text-warning flex-shrink-0">→</span> {s}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    {debrief.summary && (
                        <div className="bg-brand-400/5 border border-brand-400/15 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-1">Summary</p>
                            <p className="text-xs text-text-secondary leading-relaxed">{debrief.summary}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Conversation transcript */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                    <span>💬</span> Transcript
                    <span className="text-xs font-normal text-text-disabled">({messages.length} messages)</span>
                </h3>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                    {messages.map((msg, i) => {
                        const isUser = msg.role === 'USER' || msg.role === 'user'
                        return (
                            <div key={i} className={cn(
                                'flex gap-3',
                                isUser ? 'flex-row-reverse' : ''
                            )}>
                                <div className={cn(
                                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-1',
                                    isUser
                                        ? 'bg-brand-400/20 text-brand-300'
                                        : 'bg-surface-4 text-text-secondary'
                                )}>
                                    {isUser ? '👤' : '🤖'}
                                </div>
                                <div className={cn(
                                    'max-w-[80%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed',
                                    isUser
                                        ? 'bg-brand-400/10 border border-brand-400/20 text-text-primary rounded-tr-md'
                                        : 'bg-surface-2 border border-border-default text-text-secondary rounded-tl-md'
                                )}>
                                    {msg.content}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function InterviewHistoryPage() {
    const navigate = useNavigate()
    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState(null)

    useEffect(() => {
        async function loadSessions() {
            try {
                const res = await api.get('/interview-v2/history/list')
                // v3.0 returns { success, sessions, pagination }
                setSessions(res.data.data.sessions || [])
            } catch (err) {
                console.error('Failed to load sessions:', err)
            } finally {
                setLoading(false)
            }
        }
        loadSessions()
    }, [])

    if (selectedId) {
        return (
            <div className="p-6">
                <SessionDetail sessionId={selectedId} onBack={() => setSelectedId(null)} />
            </div>
        )
    }

    const completed = sessions.filter(s => s.status === 'COMPLETED')
    const avgScore = completed.length
        ? (completed.reduce((sum, s) => sum + (s.debrief?.overallScore || 0), 0) / completed.length).toFixed(1)
        : null

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between mb-6 flex-wrap gap-4"
            >
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Interview History
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Review past interviews and track your improvement
                    </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => navigate('/mock-interview')}>
                    New Interview
                </Button>
            </motion.div>

            {completed.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-3 gap-3 mb-6"
                >
                    <div className="bg-surface-1 border border-border-default rounded-xl p-4 text-center">
                        <div className="text-2xl font-extrabold font-mono text-brand-300">{sessions.length}</div>
                        <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">Total</div>
                    </div>
                    <div className="bg-surface-1 border border-border-default rounded-xl p-4 text-center">
                        <div className="text-2xl font-extrabold font-mono text-success">{completed.length}</div>
                        <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">Completed</div>
                    </div>
                    <div className="bg-surface-1 border border-border-default rounded-xl p-4 text-center">
                        <div className={cn(
                            'text-2xl font-extrabold font-mono',
                            avgScore >= 7 ? 'text-success' : avgScore >= 5 ? 'text-warning' : 'text-danger'
                        )}>
                            {avgScore || '—'}
                        </div>
                        <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">Avg Score</div>
                    </div>
                </motion.div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : sessions.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-12 text-center">
                    <div className="text-4xl mb-4">💬</div>
                    <h2 className="text-lg font-bold text-text-primary mb-2">No interviews yet</h2>
                    <p className="text-sm text-text-tertiary mb-5">
                        Start your first AI mock interview to begin tracking your progress.
                    </p>
                    <Button variant="primary" size="md" onClick={() => navigate('/mock-interview')}>
                        Start Interview
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {sessions.map((session) => (
                        <SessionCard
                            key={session.id}
                            session={session}
                            onClick={() => setSelectedId(session.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}