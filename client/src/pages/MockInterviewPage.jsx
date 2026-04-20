import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblems } from '@hooks/useProblems'
import { useAuthStore } from '@store/useAuthStore'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES } from '@utils/constants'
import { formatDuration } from '@utils/formatters'
import api from '@services/api'

const COMPANIES = [
    { id: 'Google', label: 'Google', icon: '🔵', level: 'L3-L7' },
    { id: 'Meta', label: 'Meta', icon: '🔷', level: 'E3-E7' },
    { id: 'Amazon', label: 'Amazon', icon: '🟠', level: 'SDE 1-3' },
    { id: 'Microsoft', label: 'Microsoft', icon: '🟦', level: 'SDE-Principal' },
    { id: 'Startup', label: 'Startup', icon: '🚀', level: 'Senior+' },
]

const DURATIONS = [
    { mins: 15, label: '15 min', desc: 'Quick practice' },
    { mins: 30, label: '30 min', desc: 'Standard' },
    { mins: 45, label: '45 min', desc: 'Full interview' },
    { mins: 60, label: '60 min', desc: 'Extended' },
]

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
    const persona = COMPANIES.find(c => c.id === company)

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

            {/* Company */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-4"
            >
                <h2 className="text-sm font-bold text-text-primary mb-3">
                    Who's interviewing you?
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {COMPANIES.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setCompany(c.id)}
                            className={cn(
                                'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border',
                                'transition-all duration-150 text-center',
                                company === c.id
                                    ? 'bg-brand-400/12 border-brand-400/40 scale-[1.02]'
                                    : 'bg-surface-2 border-border-default hover:border-border-strong'
                            )}
                        >
                            <span className="text-xl">{c.icon}</span>
                            <span className={cn(
                                'text-xs font-bold',
                                company === c.id ? 'text-brand-300' : 'text-text-primary'
                            )}>
                                {c.label}
                            </span>
                            <span className="text-[9px] text-text-disabled">{c.level}</span>
                        </button>
                    ))}
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
                            {persona?.label} Interview
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

// ══════════════════════════════════════════════════════
// CHAT SCREEN (placeholder — full implementation in next conversation)
// ══════════════════════════════════════════════════════
function ChatScreen({ sessionData, onEnd }) {
    return (
        <div className="p-6 max-w-[900px] mx-auto">
            <div className="bg-surface-1 border border-border-default rounded-2xl p-8 text-center">
                <div className="text-4xl mb-4">💬</div>
                <h2 className="text-xl font-bold text-text-primary mb-2">
                    Interview Started
                </h2>
                <p className="text-sm text-text-tertiary mb-4">
                    Session: {sessionData.session.id}
                </p>
                <p className="text-xs text-text-disabled mb-6">
                    The full chat interface with WebSocket streaming, workspace tabs (Code, Diagram, Notes),
                    and phase-aware timer will be built in the next development phase.
                </p>
                <Button variant="danger" size="md" onClick={onEnd}>
                    End Interview (Placeholder)
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

    function handleStart(data) {
        setSessionData(data)
        setScreen('chat')
    }

    function handleEnd() {
        setScreen('setup')
        setSessionData(null)
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
                    <ChatScreen sessionData={sessionData} onEnd={handleEnd} />
                </motion.div>
            )}
        </AnimatePresence>
    )
}