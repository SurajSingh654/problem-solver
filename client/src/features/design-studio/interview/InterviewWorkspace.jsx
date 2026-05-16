import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'
import { cn } from '@utils/cn'
import { toast } from '@store/useUIStore'
import {
    useSavePhase,
    useSaveDiagram,
} from '@hooks/useDesignStudio'
import { SD_PHASES, LLD_PHASES } from '../constants/phases'
import { INTERVIEW_STYLES } from './interviewStyles'

// Total interview budget by category. Mirrors the server's
// INTERVIEW_PHASES[category].defaultDuration values in
// server/src/services/interview.phases.js. Duplicated rather than imported
// across the workspace boundary; if the server changes its budget, update
// here too.
const TOTAL_DURATION_SEC = {
    SYSTEM_DESIGN: 2700,    // 45 min
    LOW_LEVEL_DESIGN: 2700, // 45 min
    CODING: 2700,
    BEHAVIORAL: 1800,
    SQL: 1800,
}
const DEFAULT_DURATION_SEC = 45 * 60

function getWsUrl() {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl.includes('railway.app')) {
        return apiUrl.replace('https://', 'wss://').replace('/api', '') + '/ws/interview'
    }
    return 'ws://localhost:8080/ws/interview'
}

function formatMmSs(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds))
    const m = Math.floor(safe / 60).toString().padStart(2, '0')
    const s = (safe % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

// ── Single chat bubble ──────────────────────────────────────
function MessageBubble({ message }) {
    const isUser = message.role === 'user'
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('flex gap-2 max-w-[92%] min-w-0', isUser ? 'ml-auto flex-row-reverse' : '')}
        >
            <div
                className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 mt-1',
                    isUser ? 'bg-brand-soft text-brand-fg-soft' : 'bg-surface-4 text-text-secondary',
                )}
            >
                {isUser ? '👤' : '🤖'}
            </div>
            <div
                className={cn(
                    'px-3 py-2 rounded-2xl text-xs leading-relaxed',
                    'break-words whitespace-pre-wrap min-w-0 overflow-hidden',
                    isUser
                        ? 'bg-brand-soft border border-brand-line text-text-primary rounded-tr-md'
                        : 'bg-surface-2 border border-border-default text-text-secondary rounded-tl-md',
                )}
            >
                {message.content}
            </div>
        </motion.div>
    )
}

function TypingIndicator() {
    return (
        <div className="flex gap-2 max-w-[92%]">
            <div className="w-6 h-6 rounded-full bg-surface-4 flex items-center justify-center text-[11px] flex-shrink-0">
                🤖
            </div>
            <div className="bg-surface-2 border border-border-default rounded-2xl rounded-tl-md px-3 py-2">
                <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                            className="w-1.5 h-1.5 rounded-full bg-text-disabled"
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// INTERVIEW WORKSPACE — design-studio canvas paired with a live AI
// interviewer chat. WebSocket lifecycle copied from MockInterviewPage; if
// either side gains another consumer, lift it into a shared hook.
// ══════════════════════════════════════════════════════════════════════════
export default function InterviewWorkspace({ session, interviewSession, onEnd }) {
    const phases = session?.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES
    const persona = INTERVIEW_STYLES.find((s) => s.id === interviewSession?.interviewStyle)
    const personaName = persona?.label || interviewSession?.interviewStyle || 'AI Interviewer'

    // Derived total budget. Server controls the actual cutoff via the
    // interview engine; the timer here is purely advisory for the candidate.
    const totalSeconds =
        TOTAL_DURATION_SEC[interviewSession?.category] || DEFAULT_DURATION_SEC

    // ── Chat state ──────────────────────────────────────────
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [connected, setConnected] = useState(false)
    const [streamingMsg, setStreamingMsg] = useState('')
    const [showEndConfirm, setShowEndConfirm] = useState(false)

    // ── Canvas + phase state — local mirrors of the design session ──
    const [diagramData, setDiagramData] = useState(session?.diagramData || null)
    const [phaseContent, setPhaseContent] = useState(session?.phases || {})
    const [activePhaseIdx, setActivePhaseIdx] = useState(0)

    // ── Layout split (canvas vs phase editor) ──────────────
    const [panelHeight, setPanelHeight] = useState(35)
    const dragRef = useRef(null)

    // ── Timer ──────────────────────────────────────────────
    const startedAtMs = useMemo(() => {
        const raw = interviewSession?.startedAt
        return raw ? new Date(raw).getTime() : Date.now()
    }, [interviewSession?.startedAt])
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])
    const elapsedSec = Math.max(0, Math.floor((now - startedAtMs) / 1000))
    const remainingSec = Math.max(0, totalSeconds - elapsedSec)
    const timeIsLow = remainingSec <= 300
    const timeIsCritical = remainingSec <= 60

    // ── Persistence hooks (the same mutations DesignWorkspace uses for
    // self-paced; direct + simple for short-lived interview, no save
    // coordinator). ───────────────────────────────────────
    const savePhase = useSavePhase()
    const saveDiagram = useSaveDiagram()

    // ── WebSocket refs ─────────────────────────────────────
    const wsRef = useRef(null)
    const chatEndRef = useRef(null)
    const inputRef = useRef(null)
    const streamingMsgRef = useRef('')
    const typingTimeoutRef = useRef(null)
    const endedRef = useRef(false)

    // Keep streaming ref in sync so onmessage closures see latest text.
    useEffect(() => {
        streamingMsgRef.current = streamingMsg
    }, [streamingMsg])

    function setTypingWithTimeout() {
        setIsTyping(true)
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false)
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: '[No response received. Please try sending your message again.]',
                },
            ])
        }, 30000)
    }

    // ── WebSocket lifecycle (mirror of MockInterviewPage) ──
    useEffect(() => {
        const interviewId = interviewSession?.id
        if (!interviewId) return

        const token = localStorage.getItem('token')
        const url = `${getWsUrl()}?sessionId=${interviewId}`
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
            setConnected(true)
            // Auth as the first frame — token never travels in the URL.
            ws.send(JSON.stringify({ type: 'auth', token }))
            ws.send(
                JSON.stringify({
                    type: 'interview:start',
                    sessionId: interviewId,
                }),
            )
        }

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                switch (msg.type) {
                    case 'interview:started':
                        setIsTyping(true)
                        break
                    case 'interview:token':
                        clearTimeout(typingTimeoutRef.current)
                        setIsTyping(false)
                        setStreamingMsg((prev) => prev + (msg.content || ''))
                        break
                    case 'interview:done':
                        clearTimeout(typingTimeoutRef.current)
                        if (streamingMsgRef.current) {
                            const finalContent = streamingMsgRef.current
                            setMessages((prev) => [
                                ...prev,
                                { role: 'assistant', content: finalContent },
                            ])
                        }
                        setStreamingMsg('')
                        streamingMsgRef.current = ''
                        setIsTyping(false)
                        break
                    case 'interview:debrief_generating':
                        setIsTyping(true)
                        break
                    case 'interview:debrief':
                        setIsTyping(false)
                        // Hand off to parent; debrief screen / navigation lives there.
                        if (!endedRef.current) {
                            endedRef.current = true
                            onEnd?.(msg.debrief)
                        }
                        break
                    case 'error':
                        clearTimeout(typingTimeoutRef.current)
                        setIsTyping(false)
                        if (msg.error) toast.error(msg.error)
                        break
                    default:
                        // Unhandled — ignore.
                        break
                }
            } catch {
                // Malformed frame — ignore.
            }
        }

        ws.onclose = () => {
            setConnected(false)
        }

        ws.onerror = () => {
            // Browser surfaces these as opaque events; rely on close handler.
        }

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close()
            }
            clearTimeout(typingTimeoutRef.current)
        }
    }, [interviewSession?.id, onEnd])

    // ── Auto-scroll chat ───────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingMsg])

    // ── Sending messages ───────────────────────────────────
    const sendMessage = useCallback(() => {
        const ws = wsRef.current
        const content = input.trim()
        if (!content || !ws || ws.readyState !== WebSocket.OPEN) return
        setMessages((prev) => [...prev, { role: 'user', content }])
        ws.send(
            JSON.stringify({
                type: 'interview:message',
                content,
                // The real workspace lives in the DesignSession; engine pulls
                // the live canvas via its getDesignWorkspace tool. Send a
                // small snapshot for the stale-fallback path so the engine
                // has something if the tool can't fetch.
                workspace: {
                    activePhaseId: phases[activePhaseIdx]?.id,
                    activePhaseLabel: phases[activePhaseIdx]?.label,
                },
            }),
        )
        setInput('')
        setTypingWithTimeout()
        inputRef.current?.focus()
    }, [input, activePhaseIdx, phases])

    // ── Ending the interview ───────────────────────────────
    function requestEnd() {
        setShowEndConfirm(true)
    }
    function confirmEnd() {
        setShowEndConfirm(false)
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'interview:end' }))
            // Server will respond with debrief; close ws on receipt.
            setTypingWithTimeout()
        } else {
            // Already disconnected — bail out anyway.
            if (!endedRef.current) {
                endedRef.current = true
                onEnd?.()
            }
        }
    }

    // ── Canvas + phase edit handlers (direct mutations) ────
    function handleDiagramChange(data) {
        setDiagramData(data)
        saveDiagram.mutate({
            sessionId: session.id,
            diagramData: data,
            componentAnnotations: session.componentAnnotations || [],
            dataFlowDescription: session.dataFlowDescription || '',
        })
    }

    function handlePhaseTextChange(value) {
        const id = phases[activePhaseIdx]?.id
        if (!id) return
        setPhaseContent((prev) => ({ ...prev, [id]: value }))
    }

    function handlePhaseTextBlur() {
        const id = phases[activePhaseIdx]?.id
        if (!id) return
        savePhase.mutate({
            sessionId: session.id,
            phaseId: id,
            content: phaseContent[id] || '',
        })
    }

    // ── Resize handle (canvas / phase editor split) ────────
    function handleDragStart(e) {
        e.preventDefault()
        dragRef.current = { startY: e.clientY, startHeight: panelHeight }
        function onMove(ev) {
            const deltaY = dragRef.current.startY - ev.clientY
            setPanelHeight(
                Math.min(70, Math.max(15, dragRef.current.startHeight + (deltaY / window.innerHeight) * 100)),
            )
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    const activePhase = phases[activePhaseIdx]

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {/* ── Top bar: title + countdown + end button ───────── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-brand-soft border border-brand-line flex items-center justify-center text-sm flex-shrink-0">
                        🎤
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-text-primary truncate">
                            {session?.title || 'Interview'}
                        </h2>
                        <p className="text-[10px] text-text-disabled truncate">
                            {personaName}
                            {' · '}
                            {session?.designType === 'SYSTEM_DESIGN' ? 'System Design' : 'LLD'}
                            {connected ? (
                                <span className="ml-2 inline-flex items-center gap-1 text-success-fg">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
                                    Live
                                </span>
                            ) : (
                                <span className="ml-2 text-text-disabled">Connecting…</span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <div
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold',
                            timeIsCritical
                                ? 'bg-danger-soft text-danger-fg animate-pulse'
                                : timeIsLow
                                    ? 'bg-warning-soft text-warning-fg'
                                    : 'bg-surface-3 text-text-primary',
                        )}
                        title="Time remaining"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {formatMmSs(remainingSec)}
                    </div>
                    <Button variant="secondary" size="sm" onClick={requestEnd}>
                        End Interview
                    </Button>
                </div>
            </div>

            {/* ── Body: 2-column with left canvas+phases, right chat ── */}
            <div className="flex-1 min-h-0 flex">
                {/* LEFT: canvas (top) + phase editor (bottom), resizable */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Canvas */}
                    <div style={{ height: `${100 - panelHeight}%` }} className="flex-shrink-0 relative">
                        <ExcalidrawEditor
                            onChange={handleDiagramChange}
                            initialData={diagramData}
                        />
                    </div>

                    {/* Resize handle */}
                    <div
                        onMouseDown={handleDragStart}
                        className="h-2 bg-surface-2 border-y border-border-default cursor-row-resize flex items-center justify-center hover:bg-brand-soft transition-colors flex-shrink-0 group"
                        title="Drag to resize canvas / notes"
                    >
                        <div className="w-8 h-0.5 bg-border-strong group-hover:bg-brand-400 rounded-full transition-colors" />
                    </div>

                    {/* Phase tabs + textarea */}
                    <div
                        style={{ height: `${panelHeight}%` }}
                        className="flex flex-col overflow-hidden bg-surface-1"
                    >
                        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-default flex-shrink-0 overflow-x-auto">
                            {phases.map((p, idx) => {
                                const filled = (phaseContent[p.id] || '').trim().length > 20
                                const isActive = idx === activePhaseIdx
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setActivePhaseIdx(idx)}
                                        title={p.hint}
                                        className={cn(
                                            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex-shrink-0',
                                            isActive
                                                ? 'bg-brand-soft text-brand-fg-soft border border-brand-line'
                                                : filled
                                                    ? 'bg-success-soft text-success-fg border border-success-line hover:border-success'
                                                    : 'bg-surface-3 text-text-tertiary border border-border-default hover:border-brand-line',
                                        )}
                                    >
                                        <span>{p.icon}</span>
                                        <span>{p.label}</span>
                                    </button>
                                )
                            })}
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                            <textarea
                                value={phaseContent[activePhase?.id] || ''}
                                onChange={(e) => handlePhaseTextChange(e.target.value)}
                                onBlur={handlePhaseTextBlur}
                                placeholder={`Notes for ${activePhase?.label || 'this phase'}…`}
                                className="w-full h-full min-h-[100px] bg-transparent text-sm text-text-primary placeholder:text-text-disabled outline-none resize-none leading-relaxed"
                            />
                        </div>
                    </div>
                </div>

                {/* RIGHT: chat rail */}
                <aside className="w-[360px] xl:w-[400px] flex-shrink-0 flex flex-col border-l border-border-default bg-surface-1 min-h-0">
                    <div className="px-3 py-2 border-b border-border-default flex items-center gap-2 flex-shrink-0">
                        <span className="text-base">{persona?.icon || '🤖'}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-text-primary truncate">{personaName}</p>
                            <p className="text-[10px] text-text-disabled">
                                Interviewer · {interviewSession?.category?.replace('_', ' ')}
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} />
                        ))}
                        {streamingMsg && (
                            <MessageBubble message={{ role: 'assistant', content: streamingMsg }} />
                        )}
                        {isTyping && !streamingMsg && <TypingIndicator />}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="px-3 py-2 border-t border-border-default bg-surface-1/50 flex-shrink-0">
                        <div className="flex gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        sendMessage()
                                    }
                                }}
                                placeholder="Type your response… (Enter to send, Shift+Enter for new line)"
                                rows={2}
                                disabled={!connected}
                                className="flex-1 bg-surface-3 border border-border-strong rounded-xl text-xs text-text-primary placeholder:text-text-disabled px-3 py-2 outline-none resize-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 disabled:opacity-50"
                            />
                            <Button
                                variant="primary"
                                size="md"
                                disabled={!input.trim() || !connected}
                                onClick={sendMessage}
                                className="self-end"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>

            {/* End-confirmation modal */}
            <AnimatePresence>
                {showEndConfirm && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowEndConfirm(false)}
                        />
                        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-surface-2 border border-border-strong rounded-2xl p-6 w-full max-w-sm"
                            >
                                <div className="text-3xl mb-3 text-center">🏁</div>
                                <h3 className="text-base font-bold text-text-primary text-center mb-2">
                                    End this interview?
                                </h3>
                                <p className="text-sm text-text-tertiary text-center mb-5">
                                    The AI will generate a detailed debrief with scores and feedback.
                                </p>
                                <div className="flex gap-3">
                                    <Button
                                        variant="ghost"
                                        size="md"
                                        fullWidth
                                        onClick={() => setShowEndConfirm(false)}
                                    >
                                        Continue
                                    </Button>
                                    <Button variant="primary" size="md" fullWidth onClick={confirmEnd}>
                                        End &amp; Get Debrief
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
