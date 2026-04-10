import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useProblems } from '@hooks/useProblems'
import {
    useMySessions, useStartSim, useUseHint,
    useCompleteSession, useAbandonSession
} from '@hooks/useSim'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatDuration, formatShortDate } from '@utils/formatters'
import { CONFIDENCE_LEVELS, SOURCE_LABELS } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const TIME_OPTIONS = [
    { label: '15 min', secs: 900 },
    { label: '20 min', secs: 1200 },
    { label: '30 min', secs: 1800 },
    { label: '45 min', secs: 2700 },
    { label: '60 min', secs: 3600 },
]

// ── Countdown timer hook ───────────────────────────────
function useCountdown(totalSecs, running) {
    const [remaining, setRemaining] = useState(totalSecs)
    const intervalRef = useRef(null)

    useEffect(() => {
        setRemaining(totalSecs)
    }, [totalSecs])

    useEffect(() => {
        if (!running) {
            clearInterval(intervalRef.current)
            return
        }
        intervalRef.current = setInterval(() => {
            setRemaining(prev => Math.max(0, prev - 1))
        }, 1000)
        return () => clearInterval(intervalRef.current)
    }, [running])

    const elapsed = totalSecs - remaining

    function formatTime(secs) {
        const m = Math.floor(secs / 60).toString().padStart(2, '0')
        const s = (secs % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }

    const pct = ((totalSecs - remaining) / totalSecs) * 100
    const isLow = remaining <= 300
    const isCritical = remaining <= 60

    return { remaining, elapsed, formatted: formatTime(remaining), pct, isLow, isCritical }
}

// ── Checklist item ─────────────────────────────────────
function ChecklistItem({ label }) {
    const [checked, setChecked] = useState(false)
    return (
        <button
            onClick={() => setChecked(v => !v)}
            className="w-full flex items-center gap-2.5 py-1.5 text-left group"
        >
            <div className={cn(
                'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                'transition-all duration-150',
                checked
                    ? 'bg-success border-success'
                    : 'border-border-strong group-hover:border-brand-400'
            )}>
                {checked && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                        stroke="white" strokeWidth="3.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </div>
            <span className={cn(
                'text-xs transition-colors',
                checked ? 'text-text-disabled line-through' : 'text-text-secondary'
            )}>
                {label}
            </span>
        </button>
    )
}

// ══════════════════════════════════════════════════════
// SCREEN 1 — Setup
// ══════════════════════════════════════════════════════
function SetupScreen({ onStart }) {
    const [mode, setMode] = useState('random')
    const [timeIdx, setTimeIdx] = useState(2)
    const [picked, setPicked] = useState(null)
    const [filter, setFilter] = useState('')

    const { data, isLoading } = useProblems({ limit: '200' })
    const { data: sessions } = useMySessions()
    const startSim = useStartSim()

    const problems = data?.problems || []
    const unsolvedProblems = problems.filter(p => !p.isSolvedByMe)

    const filtered = filter
        ? unsolvedProblems.filter(p =>
            p.title.toLowerCase().includes(filter.toLowerCase()) ||
            p.tags.some(t => t.toLowerCase().includes(filter.toLowerCase()))
        )
        : unsolvedProblems

    const completedSessions = sessions?.filter(s => s.completed) || []
    const avgScore = completedSessions.length
        ? (completedSessions.reduce((sum, s) => sum + (s.overallScore || 0), 0)
            / completedSessions.length).toFixed(1)
        : null

    async function handleStart() {
        let problemId
        if (mode === 'random') {
            if (unsolvedProblems.length === 0) return
            problemId = unsolvedProblems[
                Math.floor(Math.random() * unsolvedProblems.length)
            ].id
        } else {
            if (!picked) return
            problemId = picked
        }
        const res = await startSim.mutateAsync({
            problemId,
            timeLimitSecs: TIME_OPTIONS[timeIdx].secs,
        })
        onStart(res.data.data)
    }

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/30
                          flex items-center justify-center text-xl flex-shrink-0">
                        ⏱
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-text-primary">
                            Interview Simulation
                        </h1>
                        <p className="text-sm text-text-tertiary">
                            Replicate real interview conditions — timed, focused, no distractions
                        </p>
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Config panel */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Time limit */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>⏰</span> Time Limit
                        </h2>
                        <div className="flex gap-2 flex-wrap">
                            {TIME_OPTIONS.map((opt, i) => (
                                <button
                                    key={opt.secs}
                                    onClick={() => setTimeIdx(i)}
                                    className={cn(
                                        'px-4 py-2 rounded-xl border text-sm font-semibold transition-all',
                                        timeIdx === i
                                            ? 'bg-warning/15 border-warning/40 text-warning scale-105'
                                            : 'bg-surface-3 border-border-default text-text-secondary hover:border-border-strong'
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>

                    {/* Problem selection */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>📋</span> Problem
                        </h2>

                        {/* Mode toggle */}
                        <div className="flex gap-2 mb-4">
                            {[
                                { id: 'random', label: '🎲 Random', desc: 'Surprise me' },
                                { id: 'pick', label: '🎯 Pick one', desc: 'Choose myself' },
                            ].map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setMode(m.id)}
                                    className={cn(
                                        'flex-1 flex flex-col items-center gap-0.5 py-3 rounded-xl border',
                                        'text-xs font-semibold transition-all',
                                        mode === m.id
                                            ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                            : 'bg-surface-3 border-border-default text-text-secondary hover:border-border-strong'
                                    )}
                                >
                                    <span className="text-base">{m.label.split(' ')[0]}</span>
                                    <span>{m.label.split(' ').slice(1).join(' ')}</span>
                                    <span className="text-text-disabled font-normal">{m.desc}</span>
                                </button>
                            ))}
                        </div>

                        {mode === 'random' && (
                            <div className="bg-surface-2 border border-border-default rounded-xl p-4 text-center">
                                <div className="text-3xl mb-2">🎲</div>
                                <p className="text-sm font-semibold text-text-primary">
                                    A random unsolved problem will be selected
                                </p>
                                <p className="text-xs text-text-tertiary mt-1">
                                    {unsolvedProblems.length} unsolved problems available
                                </p>
                            </div>
                        )}

                        {mode === 'pick' && (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={filter}
                                    onChange={e => setFilter(e.target.value)}
                                    placeholder="Search problems…"
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                             text-sm text-text-primary placeholder:text-text-tertiary
                             px-3.5 py-2.5 outline-none
                             focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                                <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
                                    {isLoading ? (
                                        <div className="flex justify-center py-8"><Spinner size="md" /></div>
                                    ) : filtered.length === 0 ? (
                                        <p className="text-sm text-text-tertiary text-center py-6">
                                            No unsolved problems found
                                        </p>
                                    ) : (
                                        filtered.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => setPicked(p.id)}
                                                className={cn(
                                                    'w-full flex items-center gap-3 p-3 rounded-xl border',
                                                    'text-left transition-all',
                                                    picked === p.id
                                                        ? 'bg-brand-400/12 border-brand-400/35 text-brand-300'
                                                        : 'bg-surface-2 border-border-default hover:border-brand-400/25'
                                                )}
                                            >
                                                <div className={cn(
                                                    'w-5 h-5 rounded-full border-2 flex items-center',
                                                    'justify-center flex-shrink-0 transition-all',
                                                    picked === p.id
                                                        ? 'border-brand-400 bg-brand-400'
                                                        : 'border-border-strong'
                                                )}>
                                                    {picked === p.id && (
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                                            stroke="white" strokeWidth="3"
                                                            strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-text-primary truncate">
                                                        {p.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <Badge variant={DIFF_VARIANT[p.difficulty] || 'brand'} size="xs">
                                                            {p.difficulty.charAt(0) + p.difficulty.slice(1).toLowerCase()}
                                                        </Badge>
                                                        <span className="text-[11px] text-text-tertiary">
                                                            {SOURCE_LABELS[p.source] || p.source}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>

                    {/* Start button */}
                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        loading={startSim.isPending}
                        disabled={
                            startSim.isPending ||
                            (mode === 'pick' && !picked) ||
                            (mode === 'random' && unsolvedProblems.length === 0)
                        }
                        onClick={handleStart}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Start Simulation — {TIME_OPTIONS[timeIdx].label}
                    </Button>
                </div>

                {/* Stats sidebar */}
                <div className="space-y-4">
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
                            Your Stats
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-text-tertiary">Sessions</span>
                                <span className="text-sm font-bold text-text-primary">
                                    {sessions?.length || 0}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-text-tertiary">Completed</span>
                                <span className="text-sm font-bold text-success">
                                    {completedSessions.length}
                                </span>
                            </div>
                            {avgScore && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-text-tertiary">Avg Score</span>
                                    <span className="text-sm font-bold text-brand-300">{avgScore}/5</span>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Tips */}
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                            Tips
                        </h3>
                        <div className="space-y-2.5 text-xs text-text-tertiary">
                            {[
                                '🗣 Think out loud as you solve',
                                '📝 Identify the pattern first',
                                '🐌 State brute force before optimizing',
                                '📊 Always analyze complexity',
                                '🧪 Walk through an example',
                            ].map((tip, i) => (
                                <p key={i} className="leading-relaxed">{tip}</p>
                            ))}
                        </div>
                    </motion.div>

                    {/* Recent sessions */}
                    {sessions && sessions.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                                Recent
                            </h3>
                            <div className="space-y-2">
                                {sessions.slice(0, 4).map(s => (
                                    <div key={s.id} className="flex items-center gap-2">
                                        <div className={cn(
                                            'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                            s.completed ? 'bg-success' : 'bg-text-disabled'
                                        )} />
                                        <span className="text-xs text-text-secondary truncate flex-1">
                                            {s.problem?.title || 'Unknown'}
                                        </span>
                                        {s.overallScore > 0 && (
                                            <span className="text-xs font-bold text-brand-300 flex-shrink-0">
                                                {s.overallScore}/5
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// SCREEN 2 — Active Simulation
// ══════════════════════════════════════════════════════
function ActiveSimScreen({ session, problem, onComplete, onAbandon }) {
    const [timerRunning, setTimerRunning] = useState(true)
    const [hintRevealed, setHintRevealed] = useState(false)
    const [showAbandon, setShowAbandon] = useState(false)

    const useHintMutation = useUseHint()
    const abandonMutation = useAbandonSession()

    const { remaining, elapsed, formatted, pct, isLow, isCritical } =
        useCountdown(session.timeLimitSecs, timerRunning)

    useEffect(() => {
        if (remaining === 0) onComplete(elapsed)
    }, [remaining])

    function handleUseHint() {
        if (hintRevealed) return
        setHintRevealed(true)
        useHintMutation.mutate({ id: session.id, hintUsedAtSecs: elapsed })
    }

    async function handleAbandon() {
        setTimerRunning(false)
        await abandonMutation.mutateAsync({ id: session.id, timeUsedSecs: elapsed })
        onAbandon()
    }

    const circumference = 2 * Math.PI * 52
    const strokeDash = circumference - (pct / 100) * circumference

    return (
        <div className="p-6 max-w-[800px] mx-auto">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
                    <span className="text-sm font-semibold text-success">Live Simulation</span>
                </div>
                <button
                    onClick={() => setShowAbandon(true)}
                    className="text-xs text-text-tertiary hover:text-danger transition-colors
                     flex items-center gap-1.5"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Abandon
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Problem panel */}
                <div className="lg:col-span-2 space-y-4">
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                            <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="sm">
                                {problem.difficulty.charAt(0) + problem.difficulty.slice(1).toLowerCase()}
                            </Badge>
                            <span className="text-sm text-text-tertiary">
                                {SOURCE_LABELS[problem.source] || problem.source}
                            </span>
                        </div>
                        <h2 className="text-xl font-extrabold text-text-primary mb-3">
                            {problem.title}
                        </h2>
                        {problem.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {problem.tags.map(t => (
                                    <span key={t}
                                        className="text-xs bg-surface-3 border border-border-subtle
                                   rounded-lg px-2 py-0.5 text-text-tertiary">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        )}
                        {problem.companyTags?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {problem.companyTags.map(c => (
                                    <span key={c}
                                        className="text-xs bg-warning/8 border border-warning/20
                                   rounded-lg px-2 py-0.5 text-warning font-medium">
                                        🏢 {c}
                                    </span>
                                ))}
                            </div>
                        )}
                        {problem.sourceUrl && (
                            <a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="primary" size="md">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                    Solve on {SOURCE_LABELS[problem.source] || problem.source}
                                </Button>
                            </a>
                        )}
                    </motion.div>

                    {/* Real world context */}
                    {problem.realWorldContext && (
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                            <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-2">
                                🌍 Context
                            </p>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                {problem.realWorldContext}
                            </p>
                        </div>
                    )}

                    {/* Follow-ups */}
                    {problem.followUps?.length > 0 && (
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                            <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                                🧠 Follow-up Questions ({problem.followUps.length})
                            </p>
                            <div className="space-y-2">
                                {problem.followUps.map((fq, i) => (
                                    <div key={fq.id} className="flex items-start gap-2">
                                        <span className="text-xs text-text-disabled flex-shrink-0 mt-0.5">
                                            {i + 1}.
                                        </span>
                                        <p className="text-sm text-text-secondary">{fq.question}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Hint */}
                    {!hintRevealed ? (
                        <button
                            onClick={handleUseHint}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                         border border-dashed border-warning/30 text-warning/70
                         hover:border-warning/60 hover:text-warning
                         text-sm font-semibold transition-all"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            Use a hint (will be recorded)
                        </button>
                    ) : (
                        <div className="bg-warning/5 border border-warning/25 rounded-2xl p-4">
                            <p className="text-xs font-bold text-warning mb-3 flex items-center gap-1.5">
                                💡 Hints — used at {formatDuration(elapsed)}
                            </p>
                            {problem.followUps?.filter(fq => fq.hint).length > 0 ? (
                                problem.followUps.filter(fq => fq.hint).map(fq => (
                                    <div key={fq.id} className="bg-surface-2 rounded-xl p-3 mb-2">
                                        <p className="text-xs font-semibold text-text-secondary mb-1">
                                            {fq.question}
                                        </p>
                                        <p className="text-xs text-text-tertiary">{fq.hint}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-text-secondary">
                                    No hints available. Try breaking it down step by step.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Timer sidebar */}
                <div className="flex flex-col gap-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6
                       flex flex-col items-center gap-4"
                    >
                        {/* Circular timer */}
                        <div className="relative w-[120px] h-[120px]">
                            <svg width="120" height="120" className="-rotate-90">
                                <circle cx="60" cy="60" r="52" fill="none"
                                    stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                                <circle
                                    cx="60" cy="60" r="52" fill="none"
                                    stroke={isCritical ? '#ef4444' : isLow ? '#eab308' : '#7c6ff7'}
                                    strokeWidth="8" strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeDash}
                                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={cn(
                                    'text-2xl font-extrabold font-mono tabular-nums',
                                    isCritical ? 'text-danger' : isLow ? 'text-warning' : 'text-text-primary'
                                )}>
                                    {formatted}
                                </span>
                                <span className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                    remaining
                                </span>
                            </div>
                        </div>

                        <div className="text-center">
                            <p className="text-xs text-text-tertiary">Elapsed</p>
                            <p className="text-sm font-bold text-text-secondary font-mono">
                                {formatDuration(elapsed)}
                            </p>
                        </div>

                        {/* Pause/resume */}
                        <button
                            onClick={() => setTimerRunning(v => !v)}
                            className={cn(
                                'w-full flex items-center justify-center gap-2 py-2 rounded-xl',
                                'border text-xs font-semibold transition-all',
                                timerRunning
                                    ? 'border-border-default text-text-tertiary hover:border-border-strong'
                                    : 'border-warning/40 text-warning bg-warning/8'
                            )}
                        >
                            {timerRunning ? (
                                <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="6" y="4" width="4" height="16" />
                                        <rect x="14" y="4" width="4" height="16" />
                                    </svg>
                                    Pause
                                </>
                            ) : (
                                <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                    Resume
                                </>
                            )}
                        </button>

                        <Button variant="primary" size="md" fullWidth
                            onClick={() => onComplete(elapsed)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            I'm Done
                        </Button>
                    </motion.div>

                    {/* Checklist */}
                    <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                        <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                            Checklist
                        </p>
                        {[
                            'Understood the problem?',
                            'Stated brute force?',
                            'Optimized the approach?',
                            'Analyzed complexity?',
                            'Tested with examples?',
                        ].map((item, i) => (
                            <ChecklistItem key={i} label={item} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Abandon modal */}
            <AnimatePresence>
                {showAbandon && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowAbandon(false)}
                        />
                        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -12 }}
                                className="bg-surface-2 border border-border-strong rounded-2xl p-6
                           w-full max-w-sm shadow-xl"
                            >
                                <div className="text-3xl mb-3 text-center">🚪</div>
                                <h3 className="text-base font-bold text-text-primary text-center mb-2">
                                    Abandon simulation?
                                </h3>
                                <p className="text-sm text-text-tertiary text-center mb-5">
                                    Your progress will be saved but the session won't count as completed.
                                </p>
                                <div className="flex gap-3">
                                    <Button variant="ghost" size="md" fullWidth
                                        onClick={() => setShowAbandon(false)}>
                                        Keep Going
                                    </Button>
                                    <Button variant="danger" size="md" fullWidth
                                        loading={abandonMutation.isPending}
                                        onClick={handleAbandon}>
                                        Abandon
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
// SCREEN 3 — Post-Sim Assessment
// ══════════════════════════════════════════════════════
function AssessmentScreen({ timeUsed, onSubmit, isSubmitting }) {
    const [scores, setScores] = useState({
        approachScore: 0,
        communicationScore: 0,
        overallScore: 0,
    })
    const [whatWentWell, setWhatWentWell] = useState('')
    const [whatToImprove, setWhatToImprove] = useState('')

    function setScore(key, val) {
        setScores(prev => ({ ...prev, [key]: prev[key] === val ? 0 : val }))
    }

    const scoreFields = [
        {
            key: 'approachScore',
            label: 'Approach Quality',
            desc: 'Did you identify the right pattern and optimize correctly?',
            icon: '🧩',
        },
        {
            key: 'communicationScore',
            label: 'Communication',
            desc: 'Did you think out loud and explain your reasoning clearly?',
            icon: '🗣',
        },
        {
            key: 'overallScore',
            label: 'Overall Performance',
            desc: 'How would you rate this session overall?',
            icon: '⭐',
        },
    ]

    return (
        <div className="p-6 max-w-[640px] mx-auto">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-8"
            >
                <div className="text-5xl mb-3">🏁</div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">Time's up!</h1>
                <p className="text-sm text-text-tertiary">
                    You used {formatDuration(timeUsed)} of your session. Rate your performance honestly.
                </p>
            </motion.div>

            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-6">
                {scoreFields.map((field, fi) => (
                    <motion.div
                        key={field.key}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: fi * 0.06 }}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span>{field.icon}</span>
                            <h3 className="text-sm font-bold text-text-primary">{field.label}</h3>
                        </div>
                        <p className="text-xs text-text-tertiary mb-3">{field.desc}</p>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(v => {
                                const conf = CONFIDENCE_LEVELS.find(c => c.value === v)
                                return (
                                    <button
                                        key={v}
                                        onClick={() => setScore(field.key, v)}
                                        className={cn(
                                            'flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border',
                                            'transition-all duration-150',
                                            scores[field.key] === v
                                                ? 'bg-brand-400/15 border-brand-400/40 scale-105'
                                                : 'bg-surface-3 border-border-default hover:border-border-strong'
                                        )}
                                    >
                                        <span className="text-lg">{conf?.emoji}</span>
                                        <span className="text-[10px] text-text-disabled">{v}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </motion.div>
                ))}

                {/* Text reflections */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                >
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-1.5">
                            ✅ What went well?
                            <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>
                        </label>
                        <textarea
                            rows={2}
                            value={whatWentWell}
                            onChange={e => setWhatWentWell(e.target.value)}
                            placeholder="e.g. I quickly identified the sliding window pattern…"
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                         text-sm text-text-primary placeholder:text-text-tertiary
                         px-3.5 py-2.5 outline-none resize-none
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-primary mb-1.5">
                            🔧 What to improve?
                            <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>
                        </label>
                        <textarea
                            rows={2}
                            value={whatToImprove}
                            onChange={e => setWhatToImprove(e.target.value)}
                            placeholder="e.g. I spent too long on brute force without moving on…"
                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                         text-sm text-text-primary placeholder:text-text-tertiary
                         px-3.5 py-2.5 outline-none resize-none
                         focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />
                    </div>
                </motion.div>

                <Button
                    variant="primary" size="lg" fullWidth
                    loading={isSubmitting}
                    onClick={() => onSubmit({
                        timeUsedSecs: timeUsed,
                        approachScore: scores.approachScore || null,
                        communicationScore: scores.communicationScore || null,
                        overallScore: scores.overallScore || null,
                        whatWentWell: whatWentWell || null,
                        whatToImprove: whatToImprove || null,
                    })}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Save Session
                </Button>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// SCREEN 4 — Results
// ══════════════════════════════════════════════════════
function ResultsScreen({ session, problem, onNewSim }) {
    const navigate = useNavigate()
    const avgScore = session.overallScore || 0

    const emoji =
        avgScore >= 4 ? '🔥' :
            avgScore >= 3 ? '💪' :
                avgScore >= 2 ? '📈' : '🌱'

    return (
        <div className="p-6 max-w-[640px] mx-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center mb-8"
            >
                <div className="text-6xl mb-3">{emoji}</div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Session Complete!
                </h1>
                <p className="text-sm text-text-tertiary">
                    Great work pushing through. Here's your summary.
                </p>
            </motion.div>

            {/* Summary card */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-4"
            >
                {/* Problem */}
                <div className="flex items-center gap-3 pb-4 border-b border-border-default mb-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-disabled uppercase tracking-widest mb-1">
                            Problem
                        </p>
                        <p className="text-sm font-bold text-text-primary truncate">
                            {problem?.title}
                        </p>
                    </div>
                    {problem?.difficulty && (
                        <Badge variant={DIFF_VARIANT[problem.difficulty] || 'brand'} size="sm">
                            {problem.difficulty.charAt(0) + problem.difficulty.slice(1).toLowerCase()}
                        </Badge>
                    )}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                        { label: 'Time Used', value: formatDuration(session.timeUsedSecs) },
                        { label: 'Time Limit', value: formatDuration(session.timeLimitSecs) },
                        { label: 'Hints', value: session.hintUsed ? '💡 Used' : '✅ None' },
                    ].map(s => (
                        <div key={s.label}
                            className="bg-surface-2 border border-border-default rounded-xl p-3 text-center">
                            <p className="text-base font-extrabold text-text-primary">{s.value}</p>
                            <p className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                {s.label}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Scores */}
                {(session.approachScore || session.communicationScore || session.overallScore) && (
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        {[
                            { label: 'Approach', value: session.approachScore, icon: '🧩' },
                            { label: 'Communication', value: session.communicationScore, icon: '🗣' },
                            { label: 'Overall', value: session.overallScore, icon: '⭐' },
                        ].map(s => {
                            const conf = CONFIDENCE_LEVELS.find(c => c.value === s.value)
                            return (
                                <div key={s.label}
                                    className="bg-surface-2 border border-border-default rounded-xl p-3 text-center">
                                    <p className="text-xl mb-1">{conf?.emoji || '—'}</p>
                                    <p className={cn('text-xs font-bold', conf?.color || 'text-text-disabled')}>
                                        {s.value ? `${s.value}/5` : '—'}
                                    </p>
                                    <p className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                        {s.label}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Reflections */}
                {session.whatWentWell && (
                    <div className="bg-success/5 border border-success/20 rounded-xl p-3.5 mb-3">
                        <p className="text-xs font-bold text-success mb-1">✅ What went well</p>
                        <p className="text-sm text-text-secondary">{session.whatWentWell}</p>
                    </div>
                )}
                {session.whatToImprove && (
                    <div className="bg-warning/5 border border-warning/20 rounded-xl p-3.5">
                        <p className="text-xs font-bold text-warning mb-1">🔧 What to improve</p>
                        <p className="text-sm text-text-secondary">{session.whatToImprove}</p>
                    </div>
                )}
            </motion.div>

            {/* Actions */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col sm:flex-row gap-3"
            >
                {!problem?.isSolvedByMe && (
                    <Button
                        variant="primary" size="md" fullWidth
                        onClick={() => navigate(`/problems/${session.problemId}/submit`)}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        Submit Solution
                    </Button>
                )}
                <Button variant="secondary" size="md" fullWidth onClick={onNewSim}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                    </svg>
                    New Simulation
                </Button>
                <Button variant="ghost" size="md" fullWidth
                    onClick={() => navigate('/problems')}>
                    Problems
                </Button>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// ROOT — InterviewSimPage
// ══════════════════════════════════════════════════════
export default function InterviewSimPage() {
    const [screen, setScreen] = useState('setup')
    const [simData, setSimData] = useState(null)   // { session, problem }
    const [timeUsed, setTimeUsed] = useState(0)
    const [completed, setCompleted] = useState(null)   // final completed session

    const completeSession = useCompleteSession()

    function handleStart(data) {
        setSimData(data)
        setScreen('active')
    }

    function handleComplete(elapsed) {
        setTimeUsed(elapsed)
        setScreen('assessment')
    }

    function handleAbandon() {
        setSimData(null)
        setScreen('setup')
    }

    async function handleAssessmentSubmit(assessmentData) {
        const res = await completeSession.mutateAsync({
            id: simData.session.id,
            data: assessmentData,
        })
        setCompleted(res.data.data)
        setScreen('results')
    }

    function handleNewSim() {
        setSimData(null)
        setTimeUsed(0)
        setCompleted(null)
        setScreen('setup')
    }

    return (
        <div className="min-h-screen">
            <AnimatePresence mode="wait">
                {screen === 'setup' && (
                    <motion.div key="setup"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}>
                        <SetupScreen onStart={handleStart} />
                    </motion.div>
                )}

                {screen === 'active' && simData && (
                    <motion.div key="active"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}>
                        <ActiveSimScreen
                            session={simData.session}
                            problem={simData.problem}
                            onComplete={handleComplete}
                            onAbandon={handleAbandon}
                        />
                    </motion.div>
                )}

                {screen === 'assessment' && (
                    <motion.div key="assessment"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}>
                        <AssessmentScreen
                            timeUsed={timeUsed}
                            onSubmit={handleAssessmentSubmit}
                            isSubmitting={completeSession.isPending}
                        />
                    </motion.div>
                )}

                {screen === 'results' && completed && (
                    <motion.div key="results"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}>
                        <ResultsScreen
                            session={completed}
                            problem={simData?.problem}
                            onNewSim={handleNewSim}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}