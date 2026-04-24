import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblems } from '@hooks/useProblems'
import useAuthStore from '@store/useAuthStore'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES } from '@utils/constants'
import { formatDuration } from '@utils/formatters'
import api from '@services/api'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'

const INTERVIEW_STYLES = [
    { id: 'ALGORITHM_FOCUSED', label: 'Algorithm-Focused', icon: '🎯', desc: 'Structured, rubric-based — most tech companies', examples: 'Google, Meta, Apple, Stripe' },
    { id: 'SYSTEM_FOCUSED', label: 'System-Focused', icon: '🏗️', desc: 'Architecture, scale, reliability', examples: 'AWS, Cloudflare, Databricks' },
    { id: 'VALUES_DRIVEN', label: 'Values-Driven', icon: '🗣️', desc: 'Behavioral-heavy, culture fit', examples: 'Amazon, mission-driven orgs' },
    { id: 'PRAGMATIC_STARTUP', label: 'Startup / Pragmatic', icon: '🚀', desc: 'Ship fast, breadth over depth', examples: 'Startups, small teams, agencies' },
    { id: 'COLLABORATIVE', label: 'Collaborative', icon: '🤝', desc: 'Pair programming feel, testing mindset', examples: 'Microsoft, Thoughtworks' },
    { id: 'DOMAIN_SPECIFIC', label: 'Domain-Specific', icon: '🏢', desc: 'Industry knowledge + tech skills', examples: 'Banks, healthcare, fintech' },
    { id: 'PRODUCT_ORIENTED', label: 'Product-Oriented', icon: '📱', desc: '"Why" matters more than "how"', examples: 'Spotify, Pinterest, Notion' },
    { id: 'HIGH_PRESSURE', label: 'High-Pressure', icon: '⚡', desc: 'Fast-paced, no hints, mathematical rigor', examples: 'Trading firms, competitive roles' },
]

const DURATIONS = [
    { mins: 15, label: '15 min', desc: 'Quick practice' },
    { mins: 30, label: '30 min', desc: 'Standard' },
    { mins: 45, label: '45 min', desc: 'Full interview' },
    { mins: 60, label: '60 min', desc: 'Extended' },
]

function getWsUrl() {
    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl.includes('railway.app')) {
        return apiUrl.replace('https://', 'wss://').replace('/api', '') + '/ws/interview'
    }
    return 'ws://localhost:8080/ws/interview'
}

// ══════════════════════════════════════════════════════
// SETUP SCREEN
// ══════════════════════════════════════════════════════
function SetupScreen({ onStart }) {
    const { user } = useAuthStore()
    const [company, setCompany] = useState('Google')
    const [category, setCategory] = useState('CODING')
    const [duration, setDuration] = useState(45)
    const [problemId, setProblemId] = useState(null)
    const [filter, setFilter] = useState('')
    const [loading, setLoading] = useState(false)

    const { data: problemsData } = useProblems({ limit: '200' })
    const problems = (problemsData?.problems || []).filter(p =>
        !category || p.category === category
    )

    const filtered = filter
        ? problems.filter(p =>
            p.title.toLowerCase().includes(filter.toLowerCase())
        )
        : problems

    const selectedProblem = problems.find(p => p.id === problemId)
    const persona = INTERVIEW_STYLES.find(s => s.id === company)

    async function handleStart() {
        setLoading(true)
        try {
            const res = await api.post('/interview-v2/start', {
                problemId: problemId || undefined,
                company,
                category,
                duration: duration * 60,
            })
            onStart(res.data.data)
        } catch (err) {
            console.error('Failed to start interview:', err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-6 max-w-[750px] mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-blue-500
                          flex items-center justify-center text-xl flex-shrink-0 shadow-glow-sm">
                        💬
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-text-primary">
                            AI Mock Interview
                        </h1>
                        <p className="text-sm text-text-tertiary">
                            Practice with a GPT-4o powered interviewer — real conversation, real feedback
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Interview Style */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-4"
            >
                <h2 className="text-sm font-bold text-text-primary mb-1">
                    Interview Style
                </h2>
                <p className="text-xs text-text-tertiary mb-3">
                    Each style simulates a different interview culture — pick what matches where you're applying
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {INTERVIEW_STYLES.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setCompany(s.id)}
                            className={cn(
                                'flex items-start gap-3 p-3 rounded-xl border text-left',
                                'transition-all duration-150',
                                company === s.id
                                    ? 'bg-brand-400/10 border-brand-400/35'
                                    : 'bg-surface-2 border-border-default hover:border-border-strong'
                            )}
                        >
                            <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
                            <div className="min-w-0">
                                <span className={cn(
                                    'text-xs font-bold block',
                                    company === s.id ? 'text-brand-300' : 'text-text-primary'
                                )}>
                                    {s.label}
                                </span>
                                <span className="text-[10px] text-text-tertiary block leading-relaxed">
                                    {s.desc}
                                </span>
                                <span className="text-[9px] text-text-disabled block mt-0.5">
                                    e.g. {s.examples}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Or type a specific company */}
                <div>
                    <p className="text-[10px] text-text-disabled mb-1.5">
                        Or type a specific company — we'll match the closest interview style
                    </p>
                    <input
                        type="text"
                        placeholder="e.g. Google, Goldman Sachs, my startup..."
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                 text-sm text-text-primary placeholder:text-text-tertiary
                 px-3 py-2 outline-none
                 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        onChange={e => {
                            const val = e.target.value.trim()
                            if (val) setCompany(val)
                        }}
                    />
                </div>
            </motion.div>

            {/* Category + Duration — side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Category */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5"
                >
                    <h2 className="text-sm font-bold text-text-primary mb-3">
                        Interview type
                    </h2>
                    <div className="space-y-1.5">
                        {PROBLEM_CATEGORIES.filter(c =>
                            ['CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'CS_FUNDAMENTALS', 'SQL'].includes(c.id)
                        ).map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => { setCategory(cat.id); setProblemId(null) }}
                                className={cn(
                                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border',
                                    'text-left transition-all duration-150',
                                    category === cat.id
                                        ? `${cat.bg} ${cat.color}`
                                        : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                <span className="text-base">{cat.icon}</span>
                                <span className="text-xs font-semibold">{cat.label}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Duration */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5"
                >
                    <h2 className="text-sm font-bold text-text-primary mb-3">
                        Duration
                    </h2>
                    <div className="space-y-1.5">
                        {DURATIONS.map(d => (
                            <button
                                key={d.mins}
                                onClick={() => setDuration(d.mins)}
                                className={cn(
                                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border',
                                    'text-left transition-all duration-150',
                                    duration === d.mins
                                        ? 'bg-warning/12 border-warning/35 text-warning'
                                        : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                <span className="text-xs font-bold">{d.label}</span>
                                <span className="text-[10px] text-text-disabled">{d.desc}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Problem selection (optional) */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-4"
            >
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-text-primary">
                        Problem
                        <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>
                    </h2>
                    {problemId && (
                        <button
                            onClick={() => setProblemId(null)}
                            className="text-[10px] text-danger hover:text-danger/80 font-semibold transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {selectedProblem ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-400/8
                          border border-brand-400/25">
                        <span className="text-lg">📋</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">
                                {selectedProblem.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <Badge
                                    variant={
                                        selectedProblem.difficulty === 'EASY' ? 'easy' :
                                            selectedProblem.difficulty === 'HARD' ? 'hard' : 'medium'
                                    }
                                    size="xs"
                                >
                                    {selectedProblem.difficulty}
                                </Badge>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <input
                            type="text"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder="Search problems or leave empty for open-ended interview…"
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                         text-sm text-text-primary placeholder:text-text-tertiary
                         px-3.5 py-2.5 outline-none mb-3
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                        {filtered.length > 0 && filter && (
                            <div className="max-h-[200px] overflow-y-auto space-y-1">
                                {filtered.slice(0, 6).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setProblemId(p.id); setFilter('') }}
                                        className="w-full flex items-center gap-3 p-2.5 rounded-xl border
                               bg-surface-2 border-border-default text-left
                               hover:border-brand-400/30 transition-all"
                                    >
                                        <span className="text-sm font-semibold text-text-primary truncate flex-1">
                                            {p.title}
                                        </span>
                                        <Badge
                                            variant={
                                                p.difficulty === 'EASY' ? 'easy' :
                                                    p.difficulty === 'HARD' ? 'hard' : 'medium'
                                            }
                                            size="xs"
                                        >
                                            {p.difficulty}
                                        </Badge>
                                    </button>
                                ))}
                            </div>
                        )}
                        {!filter && (
                            <p className="text-xs text-text-disabled text-center py-2">
                                No problem selected — the interviewer will ask general questions for the category
                            </p>
                        )}
                    </>
                )}
            </motion.div>

            {/* Preview + Start */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="bg-surface-1 border border-brand-400/20 rounded-2xl p-5"
            >
                {/* Session preview */}
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-border-default">
                    <Avatar
                        name={persona?.label || 'Interviewer'}
                        color="#7c6ff7"
                        size="md"
                    />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-text-primary">
                            {INTERVIEW_STYLES.find(s => s.id === company)?.label || company} Interview
                        </p>
                        <p className="text-xs text-text-tertiary">
                            {PROBLEM_CATEGORIES.find(c => c.id === category)?.label} · {duration} minutes
                            {selectedProblem ? ` · ${selectedProblem.title}` : ' · Open-ended'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-warning">{duration} min</p>
                        <p className="text-[10px] text-text-disabled">GPT-4o</p>
                    </div>
                </div>

                {/* What to expect */}
                <div className="mb-5">
                    <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-2">
                        What to expect
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { icon: '🗣', text: 'Natural conversation' },
                            { icon: '🧠', text: 'Adaptive follow-ups' },
                            { icon: '💻', text: 'Code + diagram workspace' },
                            { icon: '📊', text: 'Detailed debrief at end' },
                        ].map(item => (
                            <div key={item.text}
                                className="flex items-center gap-2 text-xs text-text-tertiary
                              bg-surface-2 rounded-lg px-3 py-2">
                                <span>{item.icon}</span>
                                {item.text}
                            </div>
                        ))}
                    </div>
                </div>

                <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={loading}
                    onClick={handleStart}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start Interview
                </Button>
            </motion.div>
        </div>
    )
}

// ── Timer component ────────────────────────────────────
function InterviewTimer({ startedAt, duration, phases, currentPhase, onPhaseChange }) {
    const [elapsed, setElapsed] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
        }, 1000)
        return () => clearInterval(interval)
    }, [startedAt])

    const remaining = Math.max(0, duration - elapsed)
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
    const secs = (remaining % 60).toString().padStart(2, '0')
    const pct = Math.min((elapsed / duration) * 100, 100)
    const isLow = remaining <= 300
    const isCritical = remaining <= 60

    // Find current phase based on elapsed time
    let cumulativeTime = 0
    let activePhaseIdx = 0
    for (let i = 0; i < phases.length; i++) {
        cumulativeTime += phases[i].duration
        if (elapsed < cumulativeTime) { activePhaseIdx = i; break }
        if (i === phases.length - 1) activePhaseIdx = i
    }

    return (
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-1 border-b border-border-default">
            {/* Timer */}
            <div className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold',
                isCritical ? 'bg-danger/15 text-danger animate-pulse' :
                    isLow ? 'bg-warning/15 text-warning' :
                        'bg-surface-3 text-text-primary'
            )}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                {mins}:{secs}
            </div>

            {/* Phase indicators */}
            <div className="flex-1 flex items-center gap-1">
                {phases.map((phase, i) => (
                    <button
                        key={phase.name}
                        onClick={() => onPhaseChange?.(phase.name)}
                        className={cn(
                            'flex-1 h-1.5 rounded-full transition-all',
                            i < activePhaseIdx ? 'bg-success' :
                                i === activePhaseIdx ? (isCritical ? 'bg-danger' : isLow ? 'bg-warning' : 'bg-brand-400') :
                                    'bg-surface-4'
                        )}
                        title={`${phase.name} (${Math.round(phase.duration / 60)}min)`}
                    />
                ))}
            </div>

            {/* Current phase label */}
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                {phases[activePhaseIdx]?.name || 'Interview'}
            </span>

            {/* Progress % */}
            <span className="text-[10px] font-mono text-text-disabled">
                {Math.round(pct)}%
            </span>
        </div>
    )
}

// ── Message bubble ─────────────────────────────────────
function MessageBubble({ message }) {
    const isUser = message.role === 'user'
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'flex gap-3 max-w-[85%]',
                isUser ? 'ml-auto flex-row-reverse' : ''
            )}
        >
            <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-1',
                isUser ? 'bg-brand-400/20 text-brand-300' : 'bg-surface-4 text-text-secondary'
            )}>
                {isUser ? '👤' : '🤖'}
            </div>
            <div className={cn(
                'px-4 py-3 rounded-2xl text-sm leading-relaxed',
                isUser
                    ? 'bg-brand-400/12 border border-brand-400/20 text-text-primary rounded-tr-md'
                    : 'bg-surface-2 border border-border-default text-text-secondary rounded-tl-md'
            )}>
                {message.content}
            </div>
        </motion.div>
    )
}

// ── Typing indicator ───────────────────────────────────
function TypingIndicator() {
    return (
        <div className="flex gap-3 max-w-[85%]">
            <div className="w-7 h-7 rounded-full bg-surface-4 flex items-center justify-center text-xs flex-shrink-0">
                🤖
            </div>
            <div className="bg-surface-2 border border-border-default rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                        <motion.div
                            key={i}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                            className="w-2 h-2 rounded-full bg-text-disabled"
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Workspace tabs ─────────────────────────────────────
function WorkspacePanel({ category, workspace, onWorkspaceChange }) {
    const [activeTab, setActiveTab] = useState('thinking')

    const tabs = {
        CODING: ['thinking', 'code', 'scratchpad'],
        SYSTEM_DESIGN: ['thinking', 'diagram', 'notes'],
        BEHAVIORAL: ['thinking', 'response'],
        CS_FUNDAMENTALS: ['thinking', 'notes', 'diagram'],
        SQL: ['thinking', 'code', 'scratchpad'],
        HR: ['thinking', 'response'],
    }

    const availableTabs = tabs[category] || tabs.CODING

    const tabConfig = {
        thinking: { label: 'Thinking', icon: '🧠' },
        code: { label: 'Code', icon: '💻' },
        diagram: { label: 'Diagram', icon: '📐' },
        notes: { label: 'Notes', icon: '📝' },
        response: { label: 'Response', icon: '✍️' },
        scratchpad: { label: 'Scratchpad', icon: '📋' },
    }

    function updateWorkspace(field, value) {
        onWorkspaceChange({ ...workspace, [field]: value })
    }

    return (
        <div className="flex flex-col h-full">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border-default bg-surface-1/50">
                {availableTabs.map(tab => {
                    const config = tabConfig[tab]
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                activeTab === tab
                                    ? 'bg-brand-400/15 text-brand-300'
                                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3'
                            )}
                        >
                            <span className="text-xs">{config.icon}</span>
                            {config.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden" style={{ position: 'relative' }}>
                {activeTab === 'diagram' ? (
                    <div style={{ position: 'absolute', inset: 0 }}>
                        <ExcalidrawEditor
                            onChange={val => updateWorkspace('diagram', val)}
                            initialData={workspace.diagram}
                        />
                    </div>
                ) : (
                    <textarea
                        value={workspace[activeTab] || ''}
                        onChange={e => updateWorkspace(activeTab, e.target.value)}
                        placeholder={
                            activeTab === 'thinking' ? 'Write your approach and thought process here...' :
                                activeTab === 'code' ? '// Write your code here...' :
                                    activeTab === 'response' ? 'Write your structured response here...' :
                                        activeTab === 'scratchpad' ? 'Rough calculations, notes...' :
                                            'Your notes...'
                        }
                        className={cn(
                            'w-full h-full bg-surface-0 text-sm text-text-primary',
                            'placeholder:text-text-disabled px-4 py-3 outline-none resize-none',
                            activeTab === 'code' || activeTab === 'scratchpad'
                                ? 'font-mono text-xs leading-relaxed'
                                : 'leading-relaxed'
                        )}
                    />
                )}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// CHAT SCREEN — Full implementation
// ══════════════════════════════════════════════════════
function ChatScreen({ sessionData, onEnd, onDebrief }) {
    const { user } = useAuthStore()
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [connected, setConnected] = useState(false)
    const [streamingMsg, setStreamingMsg] = useState('')
    const [workspace, setWorkspace] = useState({})
    const [showEndConfirm, setShowEndConfirm] = useState(false)

    const wsRef = useRef(null)
    const chatEndRef = useRef(null)
    const inputRef = useRef(null)

    const session = sessionData.session
    const persona = sessionData.persona
    const phases = session.phases || sessionData.phaseConfig?.phases || []

    // ── WebSocket connection ─────────────────────────
    useEffect(() => {
        const token = localStorage.getItem('token')
        const wsUrl = `${getWsUrl()}?token=${token}&sessionId=${session.id}`

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
            setConnected(true)
        }

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)

            switch (msg.type) {
                case 'connected':
                    // Send initial greeting request
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            type: 'chat',
                            data: {
                                content: 'Hi, I\'m ready to start the interview.',
                                currentPhase: phases[0]?.name,
                            },
                        }))
                    }, 500)
                    break

                case 'ai_typing':
                    setIsTyping(msg.data.typing)
                    if (msg.data.typing) setStreamingMsg('')
                    break

                case 'ai_chunk':
                    setStreamingMsg(prev => prev + msg.data.chunk)
                    break

                case 'ai_message':
                    setStreamingMsg('')
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: msg.data.content,
                    }])
                    break

                case 'message_received':
                    setMessages(prev => [...prev, {
                        role: 'user',
                        content: msg.data.content,
                    }])
                    break

                case 'interview_ended':
                    break

                case 'debrief_ready':
                    onDebrief(msg.data.debrief)
                    break

                case 'error':
                    console.error('[WS] Error:', msg.data.message)
                    break
            }
        }

        ws.onclose = (event) => {
            setConnected(false)
        }

        ws.onerror = (err) => {
            console.error('[WS] Error:', err)
        }

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close()
        }
    }, [session.id])

    // ── Auto-scroll ──────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingMsg])

    // ── Send message ─────────────────────────────────
    function sendMessage() {
        if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

        wsRef.current.send(JSON.stringify({
            type: 'chat',
            data: {
                content: input.trim(),
                workspaceSnapshot: workspace,
                currentPhase: phases[0]?.name,
            },
        }))

        setInput('')
        inputRef.current?.focus()
    }

    // ── End interview ────────────────────────────────
    function handleEnd() {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'end_interview' }))
        }
        setShowEndConfirm(false)
    }

    // ── Workspace auto-save ──────────────────────────
    const saveTimerRef = useRef(null)
    function handleWorkspaceChange(newWorkspace) {
        setWorkspace(newWorkspace)
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'workspace_update',
                    data: { workspace: newWorkspace },
                }))
            }
        }, 3000)
    }

    return (
        <div className="flex flex-col h-[calc(100vh-60px)]">
            {/* Timer bar */}
            <InterviewTimer
                startedAt={session.startedAt}
                duration={session.duration}
                phases={phases}
            />

            {/* Main content — chat + workspace */}
            <div className="flex-1 flex overflow-hidden">

                {/* Chat panel — left */}
                <div className="flex flex-col w-full lg:w-1/2 border-r border-border-default">
                    {/* Interviewer header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default bg-surface-1/50">
                        <Avatar name={persona?.name || 'AI'} color="#7c6ff7" size="sm" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-text-primary">{persona?.name}</p>
                            <p className="text-[10px] text-text-tertiary">{session.company} · {session.category?.replace('_', ' ')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {connected && (
                                <span className="flex items-center gap-1 text-[10px] text-success">
                                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
                                    Live
                                </span>
                            )}
                            <button
                                onClick={() => setShowEndConfirm(true)}
                                className="text-[10px] text-text-disabled hover:text-danger transition-colors
                           px-2 py-1 rounded-lg border border-border-default hover:border-danger/30"
                            >
                                End
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} />
                        ))}
                        {streamingMsg && (
                            <MessageBubble message={{ role: 'assistant', content: streamingMsg }} />
                        )}
                        {isTyping && !streamingMsg && <TypingIndicator />}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-4 py-3 border-t border-border-default bg-surface-1/50">
                        <div className="flex gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        sendMessage()
                                    }
                                }}
                                placeholder="Type your response... (Enter to send, Shift+Enter for new line)"
                                rows={2}
                                className="flex-1 bg-surface-3 border border-border-strong rounded-xl
                           text-sm text-text-primary placeholder:text-text-disabled
                           px-3.5 py-2.5 outline-none resize-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                            <Button
                                variant="primary"
                                size="md"
                                disabled={!input.trim() || !connected}
                                onClick={sendMessage}
                                className="self-end"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Workspace panel — right (hidden on mobile) */}
                <div className="hidden lg:flex flex-col w-1/2">
                    <WorkspacePanel
                        category={session.category}
                        workspace={workspace}
                        onWorkspaceChange={handleWorkspaceChange}
                    />
                </div>
            </div>

            {/* End confirmation modal */}
            <AnimatePresence>
                {showEndConfirm && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
                                    <Button variant="ghost" size="md" fullWidth
                                        onClick={() => setShowEndConfirm(false)}>
                                        Continue
                                    </Button>
                                    <Button variant="primary" size="md" fullWidth onClick={handleEnd}>
                                        End & Get Debrief
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

// ══════════════════════════════════════════════════════
// DEBRIEF SCREEN
// ══════════════════════════════════════════════════════
function DebriefScreen({ debrief, sessionData, onNewInterview }) {
    const navigate = useNavigate()

    const verdictColors = {
        'Strong Hire': 'text-success',
        'Hire': 'text-success',
        'Lean Hire': 'text-brand-300',
        'Lean No Hire': 'text-warning',
        'No Hire': 'text-danger',
    }

    const verdictEmoji = {
        'Strong Hire': '🏆',
        'Hire': '✅',
        'Lean Hire': '🤔',
        'Lean No Hire': '📈',
        'No Hire': '💪',
    }

    return (
        <div className="p-6 max-w-[750px] mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center mb-8"
            >
                <div className="text-5xl mb-3">{verdictEmoji[debrief.verdict] || '📊'}</div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Interview Complete
                </h1>
                <p className={cn(
                    'text-lg font-bold',
                    verdictColors[debrief.verdict] || 'text-text-primary'
                )}>
                    {debrief.verdict}
                </p>
            </motion.div>

            {/* Overall score */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6 text-center"
            >
                <div className="text-4xl font-extrabold font-mono text-brand-300 mb-1">
                    {debrief.overallScore}/10
                </div>
                <p className="text-xs text-text-disabled uppercase tracking-wider">Overall Score</p>
            </motion.div>

            {/* Dimension scores */}
            {debrief.dimensions && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4">Dimension Scores</h3>
                    <div className="space-y-3">
                        {Object.entries(debrief.dimensions).map(([key, dim]) => (
                            <div key={key}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-text-secondary capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                    <span className="text-xs font-bold text-text-primary">{dim.score}/10</span>
                                </div>
                                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-1">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${dim.score * 10}%` }}
                                        transition={{ duration: 0.7, delay: 0.2 }}
                                        className={cn(
                                            'h-full rounded-full',
                                            dim.score >= 7 ? 'bg-success' :
                                                dim.score >= 5 ? 'bg-warning' : 'bg-danger'
                                        )}
                                    />
                                </div>
                                <p className="text-[11px] text-text-tertiary">{dim.feedback}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Strengths + Improvements */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {debrief.strengths?.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-success/5 border border-success/20 rounded-2xl p-5"
                    >
                        <h3 className="text-xs font-bold text-success uppercase tracking-widest mb-3">
                            ✅ Strengths
                        </h3>
                        <div className="space-y-2">
                            {debrief.strengths.map((s, i) => (
                                <p key={i} className="text-xs text-text-secondary flex items-start gap-2">
                                    <span className="text-success flex-shrink-0 mt-0.5">→</span> {s}
                                </p>
                            ))}
                        </div>
                    </motion.div>
                )}
                {debrief.improvements?.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-warning/5 border border-warning/20 rounded-2xl p-5"
                    >
                        <h3 className="text-xs font-bold text-warning uppercase tracking-widest mb-3">
                            🔧 Areas to Improve
                        </h3>
                        <div className="space-y-2">
                            {debrief.improvements.map((s, i) => (
                                <p key={i} className="text-xs text-text-secondary flex items-start gap-2">
                                    <span className="text-warning flex-shrink-0 mt-0.5">→</span> {s}
                                </p>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Next steps */}
            {debrief.nextSteps && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5 mb-6"
                >
                    <h3 className="text-xs font-bold text-brand-300 uppercase tracking-widest mb-2">
                        🎯 Next Steps
                    </h3>
                    <p className="text-sm text-text-secondary leading-relaxed">{debrief.nextSteps}</p>
                </motion.div>
            )}

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
                <Button variant="primary" size="md" onClick={onNewInterview}>
                    New Interview
                </Button>
                <Button variant="ghost" size="md" onClick={() => navigate('/')}>
                    Back to Dashboard
                </Button>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════
export default function MockInterviewPage() {
    const [screen, setScreen] = useState('setup')
    const [sessionData, setSessionData] = useState(null)
    const [debrief, setDebrief] = useState(null)

    function handleStart(data) {
        setSessionData(data)
        setScreen('chat')
    }

    function handleDebrief(debriefData) {
        setDebrief(debriefData)
        setScreen('debrief')
    }

    function handleEnd() {
        // If no debrief received via WebSocket, go back to setup
        if (!debrief) {
            setScreen('setup')
            setSessionData(null)
        }
    }

    function handleNewInterview() {
        setScreen('setup')
        setSessionData(null)
        setDebrief(null)
    }

    return (
        <AnimatePresence mode="wait">
            {screen === 'setup' && (
                <motion.div key="setup"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <SetupScreen onStart={handleStart} />
                </motion.div>
            )}
            {screen === 'chat' && sessionData && (
                <motion.div key="chat"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ChatScreen
                        sessionData={sessionData}
                        onEnd={handleEnd}
                        onDebrief={handleDebrief}
                    />
                </motion.div>
            )}
            {screen === 'debrief' && debrief && (
                <motion.div key="debrief"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <DebriefScreen
                        debrief={debrief}
                        sessionData={sessionData}
                        onNewInterview={handleNewInterview}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}