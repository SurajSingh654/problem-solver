import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    useGenerateQuiz, useSubmitQuiz, useQuizHistory,
    useQuizAnalysis, useSaveQuizFeedback,
} from '@hooks/useQuiz'
import { useAIStatus } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatRelativeDate } from '@utils/formatters'
import { QUIZ_SUGGESTED_SUBJECTS } from '@utils/constants'

// ── Markdown-lite renderer for code blocks ─────────────
function FormattedText({ text }) {
    if (!text) return null
    const parts = text.split(/(```[\s\S]*?```)/g)
    return (
        <span>
            {parts.map((part, i) => {
                if (part.startsWith('```')) {
                    const lines = part.slice(3, -3).split('\n')
                    const lang = lines[0].trim()
                    const code = lines.slice(lang ? 1 : 0).join('\n').trim()
                    return (
                        <pre key={i}
                            className="bg-surface-0 border border-border-default rounded-lg
                            px-3 py-2 mt-2 mb-2 font-mono text-xs leading-relaxed
                            text-text-secondary overflow-x-auto">
                            <code>{code}</code>
                        </pre>
                    )
                }
                const inlineParts = part.split(/(`[^`]+`)/g)
                return (
                    <span key={i}>
                        {inlineParts.map((ip, j) => {
                            if (ip.startsWith('`') && ip.endsWith('`')) {
                                return (
                                    <code key={j}
                                        className="bg-brand-400/10 text-brand-300 px-1.5 py-0.5
                                   rounded text-xs font-mono border border-brand-400/20">
                                        {ip.slice(1, -1)}
                                    </code>
                                )
                            }
                            // Handle **bold**
                            const boldParts = ip.split(/(\*\*[^*]+\*\*)/g)
                            return (
                                <span key={j}>
                                    {boldParts.map((bp, k) => {
                                        if (bp.startsWith('**') && bp.endsWith('**')) {
                                            return (
                                                <strong key={k} className="font-bold text-text-primary">
                                                    {bp.slice(2, -2)}
                                                </strong>
                                            )
                                        }
                                        return <span key={k}>{bp}</span>
                                    })}
                                </span>
                            )
                        })}
                    </span>
                )
            })}
        </span>
    )
}

// ── Scratchpad ─────────────────────────────────────────
function Scratchpad({ visible }) {
    const [content, setContent] = useState('')
    if (!visible) return null
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
        >
            <div className="bg-surface-0 border border-border-default rounded-xl p-3 mt-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-disabled uppercase tracking-widest
                           flex items-center gap-1.5">
                        <span>📝</span> Scratchpad
                    </span>
                    <button
                        onClick={() => setContent('')}
                        className="text-[10px] text-text-disabled hover:text-text-tertiary transition-colors"
                    >
                        Clear
                    </button>
                </div>
                <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Work out your answer here... rough calculations, notes, etc."
                    rows={4}
                    className="w-full bg-surface-2 border border-border-subtle rounded-lg
                     text-sm font-mono text-text-secondary placeholder:text-text-disabled
                     px-3 py-2 outline-none resize-y
                     focus:border-brand-400/40 transition-all"
                />
            </div>
        </motion.div>
    )
}

// ── Timer ──────────────────────────────────────────────
function QuizTimer({ totalSecs, running, onTimeUp }) {
    const [remaining, setRemaining] = useState(totalSecs)
    useEffect(() => { setRemaining(totalSecs) }, [totalSecs])
    useEffect(() => {
        if (!running || !totalSecs) return
        const interval = setInterval(() => {
            setRemaining(prev => {
                if (prev <= 1) { clearInterval(interval); onTimeUp?.(); return 0 }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(interval)
    }, [running, totalSecs])
    if (!totalSecs) return null
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
    const secs = (remaining % 60).toString().padStart(2, '0')
    const isLow = remaining <= 60
    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-bold',
            isLow
                ? 'bg-danger/10 border-danger/30 text-danger animate-pulse'
                : 'bg-surface-2 border-border-default text-text-primary'
        )}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
            {mins}:{secs}
        </div>
    )
}

// ══════════════════════════════════════════════════════
// SCREEN 1 — Setup
// ══════════════════════════════════════════════════════
function SetupScreen({ onStart }) {
    const [subject, setSubject] = useState('')
    const [difficulty, setDifficulty] = useState('MEDIUM')
    const [count, setCount] = useState(10)
    const [context, setContext] = useState('')
    const [timerMins, setTimerMins] = useState(0)
    const generateQuiz = useGenerateQuiz()
    const { data: aiStatus } = useAIStatus()
    const { data: historyData } = useQuizHistory()
    const pastQuizzes = historyData?.quizzes || []

    const recentSubjects = useMemo(() => {
        if (!pastQuizzes.length) return []
        const seen = new Set()
        return pastQuizzes
            .filter(a => { if (seen.has(a.subject)) return false; seen.add(a.subject); return true })
            .slice(0, 6)
            .map(a => ({ subject: a.subject, bestScore: a.score, difficulty: a.difficulty }))
    }, [pastQuizzes])

    async function handleGenerate() {
        if (!subject.trim()) return
        try {
            const res = await generateQuiz.mutateAsync({
                subject: subject.trim(),
                difficulty,
                count,   // Bug 1 fix: send 'count' — server now reads this correctly
                context: context.trim() || undefined,
            })
            onStart({
                ...res.data.data.quiz,
                subject: subject.trim(),
                difficulty,
                timerSecs: timerMins > 0 ? timerMins * 60 : null,
            })
        } catch { }
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-brand-400/15 border border-brand-400/25
                          flex items-center justify-center text-xl flex-shrink-0">
                        🧠
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-text-primary">Quiz</h1>
                        <p className="text-sm text-text-tertiary">
                            Test your knowledge on any subject — AI generates questions instantly
                        </p>
                    </div>
                </div>
            </motion.div>

            {aiStatus && !aiStatus.enabled && (
                <div className="bg-warning/8 border border-warning/25 rounded-xl p-4 mb-6
                        flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <p className="text-sm text-text-secondary">
                        AI features are not enabled. Ask your admin to set
                        <code className="text-brand-300 bg-brand-400/10 px-1.5 rounded text-xs mx-1">
                            AI_ENABLED=true
                        </code>
                    </p>
                </div>
            )}

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-6"
            >
                {/* Subject */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        What do you want to practice?
                    </label>
                    <input
                        type="text"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="e.g. TCP/IP, React Hooks, Binary Trees, Physics..."
                        autoFocus
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                       text-sm text-text-primary placeholder:text-text-tertiary
                       px-4 py-3 outline-none
                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                       transition-all duration-150"
                        onKeyDown={e => { if (e.key === 'Enter' && subject.trim()) handleGenerate() }}
                    />
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {QUIZ_SUGGESTED_SUBJECTS.slice(0, 12).map(s => (
                            <button
                                key={s.label}
                                type="button"
                                onClick={() => setSubject(s.label)}
                                className={cn(
                                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border',
                                    'text-[11px] font-semibold transition-all',
                                    subject === s.label
                                        ? 'bg-brand-400/15 border-brand-400/35 text-brand-300'
                                        : 'bg-surface-2 border-border-default text-text-disabled hover:text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                <span>{s.icon}</span>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Difficulty */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Difficulty
                    </label>
                    <div className="flex gap-2">
                        {[
                            { id: 'EASY', label: 'Easy', desc: 'Fundamentals', color: 'success' },
                            { id: 'MEDIUM', label: 'Medium', desc: 'Applied knowledge', color: 'warning' },
                            { id: 'HARD', label: 'Hard', desc: 'Deep expertise', color: 'danger' },
                        ].map(d => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => setDifficulty(d.id)}
                                className={cn(
                                    'flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border',
                                    'text-xs font-semibold transition-all duration-150',
                                    difficulty === d.id
                                        ? `bg-${d.color}/12 border-${d.color}/35 text-${d.color}`
                                        : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                <span className="font-bold">{d.label}</span>
                                <span className="text-[10px] opacity-60">{d.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Question count */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Questions
                    </label>
                    <div className="flex gap-2">
                        {[5, 10, 15, 20].map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setCount(n)}
                                className={cn(
                                    'flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all',
                                    count === n
                                        ? 'bg-brand-400/15 border-brand-400/35 text-brand-300'
                                        : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Timer */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Timer
                        <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>
                    </label>
                    <div className="flex gap-2">
                        {[
                            { mins: 0, label: 'No limit' },
                            { mins: 5, label: '5 min' },
                            { mins: 10, label: '10 min' },
                            { mins: 15, label: '15 min' },
                            { mins: 20, label: '20 min' },
                            { mins: 30, label: '30 min' },
                        ].map(t => (
                            <button
                                key={t.mins}
                                type="button"
                                onClick={() => setTimerMins(t.mins)}
                                className={cn(
                                    'flex-1 py-2 rounded-xl border text-xs font-semibold transition-all',
                                    timerMins === t.mins
                                        ? 'bg-warning/12 border-warning/35 text-warning'
                                        : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Context */}
                <details className="group">
                    <summary className="text-xs text-text-tertiary cursor-pointer
                              hover:text-text-secondary transition-colors
                              flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"
                            className="transition-transform group-open:rotate-90">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        Add specific focus (optional)
                    </summary>
                    <textarea
                        rows={2}
                        value={context}
                        onChange={e => setContext(e.target.value)}
                        placeholder="e.g. Focus on TCP handshake and congestion control..."
                        className="w-full mt-2 bg-surface-3 border border-border-strong rounded-xl
                       text-sm text-text-primary placeholder:text-text-tertiary
                       px-3.5 py-2.5 outline-none resize-none
                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                    />
                </details>

                <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={generateQuiz.isPending}
                    disabled={!subject.trim() || generateQuiz.isPending}
                    onClick={handleGenerate}
                >
                    {generateQuiz.isPending ? (
                        'AI is generating questions...'
                    ) : (
                        <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                            Generate Quiz — {count} questions
                            {timerMins > 0 && ` · ${timerMins} min`}
                        </>
                    )}
                </Button>
            </motion.div>

            {/* Recently practiced */}
            {recentSubjects.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mt-6"
                >
                    <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                        <span>🕐</span> Recently Practiced
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {recentSubjects.map((rs, i) => (
                            <button
                                key={i}
                                onClick={() => { setSubject(rs.subject); setDifficulty(rs.difficulty) }}
                                className="flex items-center justify-between p-3 rounded-xl border
                           bg-surface-1 border-border-default
                           hover:border-brand-400/30 transition-all text-left"
                            >
                                <span className="text-xs font-semibold text-text-primary truncate">
                                    {rs.subject}
                                </span>
                                <span className={cn(
                                    'text-[10px] font-bold px-1.5 py-px rounded-full',
                                    rs.bestScore >= 80 ? 'bg-success/12 text-success' :
                                        rs.bestScore >= 60 ? 'bg-warning/12 text-warning' :
                                            'bg-danger/12 text-danger'
                                )}>
                                    {rs.bestScore}%
                                </span>
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}
            <QuizHistory />
        </div>
    )
}

// ── Quiz history ───────────────────────────────────────
function QuizHistory() {
    const { data: historyData, isLoading } = useQuizHistory()
    const quizzes = historyData?.quizzes || []
    if (isLoading || !quizzes.length) return null
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6"
        >
            <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <span>📊</span> Past Quizzes
            </h2>
            <div className="space-y-2">
                {quizzes.slice(0, 8).map((a, i) => (
                    <motion.div
                        key={a.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 p-3 rounded-xl border
                       bg-surface-1 border-border-default"
                    >
                        <div className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            'text-sm font-extrabold font-mono flex-shrink-0',
                            a.score >= 80 ? 'bg-success/12 text-success' :
                                a.score >= 60 ? 'bg-warning/12 text-warning' :
                                    'bg-danger/12 text-danger'
                        )}>
                            {a.score}%
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">
                                {a.subject}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <Badge
                                    variant={a.difficulty === 'EASY' ? 'easy' : a.difficulty === 'HARD' ? 'hard' : 'medium'}
                                    size="xs"
                                >
                                    {a.difficulty}
                                </Badge>
                                <span className="text-[11px] text-text-disabled">
                                    {a.score}% · {formatRelativeDate(a.completedAt)}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// SCREEN 2 — Active Quiz
// ══════════════════════════════════════════════════════
function ActiveQuizScreen({ quizData, onComplete }) {
    const [currentQ, setCurrentQ] = useState(0)
    // Bug 2 fix: answers keyed by question index, value is the letter ("A","B","C","D")
    // This is the raw selection state — we convert to { [questionId]: letter } on submit
    const [answers, setAnswers] = useState({})
    const [showScratch, setShowScratch] = useState(false)
    const [startTime] = useState(Date.now())
    const [timerRunning, setTimerRunning] = useState(true)

    const questions = quizData.questions || []
    const total = questions.length
    const question = questions[currentQ]
    const answered = Object.keys(answers).length
    const progress = (answered / total) * 100

    function handleSelect(optionLetter) {
        setAnswers(prev => ({ ...prev, [currentQ]: optionLetter }))
    }

    function goTo(index) {
        setCurrentQ(index)
        setShowScratch(false)
    }

    function handleSubmit() {
        const timeUsed = Math.round((Date.now() - startTime) / 1000)

        // Bug 2 fix: build answers keyed by question ID (what server expects)
        // questions[i].id is the numeric ID from AI (1, 2, 3...)
        // answers[i] is the letter the user selected ("A", "B", "C", "D")
        const answersById = {}
        questions.forEach((q, i) => {
            if (answers[i] !== undefined) {
                answersById[q.id] = answers[i]
            }
        })

        onComplete({ answersById, timeUsedSecs: timeUsed })
    }

    function handleTimeUp() {
        setTimerRunning(false)
        handleSubmit()
    }

    if (!question) return null

    return (
        <div className="p-6 max-w-[750px] mx-auto">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <span className="text-xs font-semibold text-text-tertiary">
                        {quizData.subject}
                    </span>
                    <span className="text-xs text-text-disabled mx-2">·</span>
                    <span className="text-xs text-text-disabled">
                        {answered}/{total} answered
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {quizData.timerSecs && (
                        <QuizTimer
                            totalSecs={quizData.timerSecs}
                            running={timerRunning}
                            onTimeUp={handleTimeUp}
                        />
                    )}
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={answered === 0}
                        onClick={handleSubmit}
                    >
                        Submit ({answered}/{total})
                    </Button>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-6">
                <motion.div
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                    className="h-full bg-brand-400 rounded-full"
                />
            </div>

            {/* Question navigation dots */}
            <div className="flex flex-wrap gap-1.5 mb-5">
                {questions.map((_, i) => {
                    const isAnswered = answers[i] !== undefined
                    const isCurrent = i === currentQ
                    return (
                        <button
                            key={i}
                            onClick={() => goTo(i)}
                            className={cn(
                                'w-8 h-8 rounded-lg text-xs font-bold transition-all',
                                'border flex items-center justify-center',
                                isCurrent
                                    ? 'bg-brand-400 border-brand-400 text-white scale-110'
                                    : isAnswered
                                        ? 'bg-brand-400/15 border-brand-400/30 text-brand-300'
                                        : 'bg-surface-2 border-border-default text-text-disabled hover:border-border-strong'
                            )}
                        >
                            {i + 1}
                        </button>
                    )
                })}
            </div>

            {/* Question card */}
            <motion.div
                key={currentQ}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6"
            >
                <div className="flex items-center gap-2 mb-4">
                    <Badge
                        variant={question.difficulty === 'EASY' ? 'easy' : question.difficulty === 'HARD' ? 'hard' : 'medium'}
                        size="xs"
                    >
                        {question.difficulty || 'MEDIUM'}
                    </Badge>
                    <span className="text-[11px] text-text-disabled font-mono">
                        Q{currentQ + 1} of {total}
                    </span>
                </div>

                <div className="text-base font-semibold text-text-primary leading-relaxed mb-6">
                    <FormattedText text={question.question} />
                </div>

                {/* Options */}
                <div className="space-y-2.5">
                    {Object.entries(question.options).map(([key, value]) => {
                        const isSelected = answers[currentQ] === key
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => handleSelect(key)}
                                className={cn(
                                    'w-full flex items-start gap-3 p-4 rounded-xl border',
                                    'text-left transition-all duration-150',
                                    isSelected
                                        ? 'bg-brand-400/8 border-brand-400/50'
                                        : 'bg-surface-2 border-border-default hover:border-brand-400/30 hover:bg-brand-400/3',
                                )}
                            >
                                <div className={cn(
                                    'w-7 h-7 rounded-lg flex items-center justify-center',
                                    'text-xs font-bold flex-shrink-0 border mt-0.5',
                                    isSelected
                                        ? 'bg-brand-400/20 border-brand-400/50 text-brand-300'
                                        : 'bg-surface-3 border-border-default text-text-disabled'
                                )}>
                                    {key}
                                </div>
                                <div className="text-sm leading-relaxed pt-0.5 text-text-secondary flex-1">
                                    <FormattedText text={value} />
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Scratchpad */}
                <div className="mt-4 flex items-center gap-3">
                    <button
                        onClick={() => setShowScratch(v => !v)}
                        className={cn(
                            'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5',
                            'rounded-lg border transition-all',
                            showScratch
                                ? 'bg-brand-400/12 border-brand-400/30 text-brand-300'
                                : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong'
                        )}
                    >
                        <span>📝</span>
                        {showScratch ? 'Hide Scratchpad' : 'Scratchpad'}
                    </button>
                </div>
                <Scratchpad visible={showScratch} />

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6 pt-5 border-t border-border-default">
                    <Button variant="ghost" size="sm" disabled={currentQ === 0} onClick={() => goTo(currentQ - 1)}>
                        ← Previous
                    </Button>
                    <span className="text-xs text-text-disabled font-mono">
                        {currentQ + 1} / {total}
                    </span>
                    {currentQ < total - 1 ? (
                        <Button variant="secondary" size="sm" onClick={() => goTo(currentQ + 1)}>
                            Next →
                        </Button>
                    ) : (
                        <Button variant="primary" size="sm" disabled={answered === 0} onClick={handleSubmit}>
                            Submit Quiz
                        </Button>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// SCREEN 3 — Results
// ══════════════════════════════════════════════════════
function ResultsScreen({ quizData, gradedAnswers, timeUsed, quizId, onNewQuiz }) {
    const navigate = useNavigate()
    const saveQuizFeedback = useSaveQuizFeedback()

    // Bug 3 fix: fetch analysis via dedicated endpoint, poll until ready
    const [analysisEnabled, setAnalysisEnabled] = useState(true)
    const { data: analysisData } = useQuizAnalysis(quizId, analysisEnabled)

    // Stop polling once we have the analysis
    useEffect(() => {
        if (analysisData?.ready) {
            setAnalysisEnabled(false)
        }
    }, [analysisData])

    const analysis = analysisData?.analysis || null

    const [flagged, setFlagged] = useState({})
    const [feedback, setFeedback] = useState('')
    const [feedbackSent, setFeedbackSent] = useState(false)

    // Bug 2 fix: use server-graded answers, not client-computed
    const questions = quizData.questions || []
    const score = gradedAnswers.filter(a => a.isCorrect).length
    const total = gradedAnswers.length
    const pct = total > 0 ? Math.round((score / total) * 100) : 0

    const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🔥' : pct >= 50 ? '💪' : pct >= 30 ? '📈' : '🌱'
    const label = pct >= 90 ? 'Outstanding!' : pct >= 70 ? 'Great job!' : pct >= 50 ? 'Good effort!' : pct >= 30 ? 'Keep practicing!' : 'Room to grow!'

    function toggleFlag(i) {
        setFlagged(prev => {
            const next = { ...prev }
            if (next[i]) delete next[i]
            else next[i] = 'wrongly framed'
            return next
        })
    }

    // Bug 4 fix: actually send feedback to server
    async function handleSubmitFeedback() {
        if (!quizId) return
        try {
            await saveQuizFeedback.mutateAsync({
                quizId,
                feedback: feedback.trim() || null,
                flaggedQuestions: Object.keys(flagged).map(k => ({
                    questionIndex: parseInt(k),
                    reason: flagged[k],
                })),
            })
            setFeedbackSent(true)
        } catch {
            // silent — feedback is best-effort
            setFeedbackSent(true)
        }
    }

    return (
        <div className="p-6 max-w-[750px] mx-auto">
            {/* Score header */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center mb-8"
            >
                <div className="text-6xl mb-3">{emoji}</div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">{label}</h1>
                <p className="text-sm text-text-tertiary">
                    {quizData.subject} · {quizData.difficulty}
                </p>
            </motion.div>

            {/* Score card */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
            >
                <div className="grid grid-cols-3 gap-4 mb-5">
                    {[
                        { label: 'Score', value: `${score}/${total}`, color: 'text-brand-300' },
                        {
                            label: 'Accuracy', value: `${pct}%`,
                            color: pct >= 70 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'
                        },
                        {
                            label: 'Time', value: timeUsed
                                ? `${Math.floor(timeUsed / 60)}m ${timeUsed % 60}s` : '—',
                            color: 'text-info'
                        },
                    ].map(s => (
                        <div key={s.label} className="text-center">
                            <div className={cn('text-2xl font-extrabold font-mono', s.color)}>
                                {s.value}
                            </div>
                            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                                {s.label}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="h-3 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                        className={cn(
                            'h-full rounded-full',
                            pct >= 70 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger'
                        )}
                    />
                </div>
            </motion.div>

            {/* AI Analysis — Bug 3 fix: auto-loads via polling, no manual trigger */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5 mb-6"
            >
                <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl">🤖</span>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary">AI Analysis</h3>
                        <p className="text-xs text-text-tertiary">
                            Personalized study advice based on your mistakes
                        </p>
                    </div>
                    {!analysis && (
                        <div className="ml-auto flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full border-2 border-brand-400
                                border-t-transparent animate-spin" />
                            <span className="text-xs text-text-disabled">Analyzing...</span>
                        </div>
                    )}
                </div>

                {analysis ? (
                    <div className="space-y-3">
                        <p className="text-sm text-text-secondary leading-relaxed">
                            {analysis.summary}
                        </p>
                        {analysis.weakTopics?.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-warning uppercase tracking-widest mb-2">
                                    Weak Areas
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {analysis.weakTopics.map((t, i) => (
                                        <span key={i}
                                            className="text-xs bg-warning/10 text-warning border border-warning/25
                                   rounded-full px-2.5 py-0.5 font-medium">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {analysis.studyAdvice?.length > 0 && (
                            <div className="space-y-1.5">
                                {analysis.studyAdvice.map((a, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                                        <span className="text-brand-400 flex-shrink-0 mt-0.5">→</span>
                                        <span>{a}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {analysis.encouragement && (
                            <p className="text-sm text-success font-medium italic">
                                {analysis.encouragement}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-text-disabled">
                        Analysis typically ready within a few seconds after submission...
                    </p>
                )}
            </motion.div>

            {/* Question review */}
            <div className="mb-6">
                <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <span>📋</span> Question Review
                </h2>
                <div className="space-y-3">
                    {gradedAnswers.map((answer, i) => {
                        const isCorrect = answer.isCorrect
                        const isFlagged = !!flagged[i]
                        return (
                            <div
                                key={i}
                                className={cn(
                                    'rounded-xl border overflow-hidden',
                                    isCorrect ? 'border-success/20 bg-success/3' : 'border-danger/20 bg-danger/3'
                                )}
                            >
                                <div className="p-4">
                                    <div className="flex items-start gap-3 mb-3">
                                        <span className={cn(
                                            'w-6 h-6 rounded-full flex items-center justify-center',
                                            'text-xs font-bold flex-shrink-0',
                                            isCorrect ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                                        )}>
                                            {isCorrect ? '✓' : '✗'}
                                        </span>
                                        <div className="flex-1 text-sm font-semibold text-text-primary leading-relaxed">
                                            <FormattedText text={answer.question} />
                                        </div>
                                    </div>

                                    {/* Options with results */}
                                    <div className="space-y-1.5 ml-9">
                                        {answer.options && Object.entries(answer.options).map(([key, value]) => {
                                            const isUserAnswer = answer.userAnswer === key
                                            const isCorrectOpt = key === answer.correctAnswer
                                            return (
                                                <div key={key} className={cn(
                                                    'text-xs px-3 py-2 rounded-lg flex items-start gap-2',
                                                    isCorrectOpt
                                                        ? 'bg-success/10 text-success font-semibold'
                                                        : isUserAnswer
                                                            ? 'bg-danger/10 text-danger line-through'
                                                            : 'text-text-tertiary'
                                                )}>
                                                    <span className="font-bold flex-shrink-0 mt-px">{key}.</span>
                                                    <FormattedText text={value} />
                                                    {isCorrectOpt && <span className="ml-auto flex-shrink-0 text-success">✓</span>}
                                                    {isUserAnswer && !isCorrectOpt && <span className="ml-auto flex-shrink-0 text-danger">✗</span>}
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Explanation — Bug 2 fix: now includes explanation from server */}
                                    {answer.explanation && (
                                        <div className="ml-9 mt-3 p-3 bg-info/5 border border-info/15 rounded-lg">
                                            <p className="text-xs text-text-secondary leading-relaxed">
                                                <span className="font-bold text-info">💡 </span>
                                                <FormattedText text={answer.explanation} />
                                            </p>
                                        </div>
                                    )}

                                    {/* Flag */}
                                    <div className="ml-9 mt-2">
                                        <button
                                            onClick={() => toggleFlag(i)}
                                            className={cn(
                                                'text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all',
                                                'flex items-center gap-1',
                                                isFlagged
                                                    ? 'bg-danger/10 border-danger/25 text-danger'
                                                    : 'bg-surface-2 border-border-default text-text-disabled hover:text-text-tertiary'
                                            )}
                                        >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2.5"
                                                strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                                                <line x1="4" y1="22" x2="4" y2="15" />
                                            </svg>
                                            {isFlagged ? 'Flagged as wrong' : 'Flag this question'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Feedback — Bug 4 fix: now actually sends to server */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
            >
                <h3 className="text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
                    <span>💬</span> Feedback
                </h3>
                <p className="text-xs text-text-tertiary mb-3">
                    Your feedback improves future quizzes — AI learns from it.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {[
                        'Questions were too hard',
                        'Questions were too easy',
                        'Questions were too long',
                        'Options were ambiguous',
                        'Great quiz!',
                        'Need more practical questions',
                    ].map(chip => (
                        <button
                            key={chip}
                            type="button"
                            onClick={() => setFeedback(prev =>
                                prev.includes(chip) ? prev.replace(chip + '. ', '') : prev + chip + '. '
                            )}
                            className={cn(
                                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all',
                                feedback.includes(chip)
                                    ? 'bg-brand-400/15 border-brand-400/35 text-brand-300'
                                    : 'bg-surface-2 border-border-default text-text-disabled hover:text-text-tertiary'
                            )}
                        >
                            {chip}
                        </button>
                    ))}
                </div>
                <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="Any other feedback? e.g. 'Include more code-based questions next time'"
                    rows={2}
                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                     text-sm text-text-primary placeholder:text-text-tertiary
                     px-3.5 py-2.5 outline-none resize-none
                     focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 mb-3"
                />
                {Object.keys(flagged).length > 0 && (
                    <div className="bg-danger/5 border border-danger/15 rounded-lg p-3 mb-3">
                        <p className="text-xs font-bold text-danger mb-1">
                            {Object.keys(flagged).length} question(s) flagged
                        </p>
                        <p className="text-[11px] text-text-tertiary">
                            Questions {Object.keys(flagged).map(k => `#${parseInt(k) + 1}`).join(', ')} marked as problematic.
                        </p>
                    </div>
                )}
                {!feedbackSent ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={saveQuizFeedback.isPending}
                        disabled={!feedback.trim() && Object.keys(flagged).length === 0}
                        onClick={handleSubmitFeedback}
                    >
                        Submit Feedback
                    </Button>
                ) : (
                    <p className="text-xs text-success font-semibold flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Feedback saved — future quizzes will be improved!
                    </p>
                )}
            </motion.div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
                <Button variant="primary" size="md" onClick={onNewQuiz}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                    </svg>
                    Take Another Quiz
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
export default function QuizPage() {
    const [screen, setScreen] = useState('setup')
    const [quizData, setQuizData] = useState(null)
    // Bug 2 fix: store server-graded answers, not client-computed
    const [gradedAnswers, setGradedAnswers] = useState([])
    const [timeUsed, setTimeUsed] = useState(0)
    const [quizId, setQuizId] = useState(null)

    const submitQuiz = useSubmitQuiz()

    function handleStart(data) {
        setQuizData(data)
        setScreen('active')
    }

    async function handleComplete(result) {
        setTimeUsed(result.timeUsedSecs)
        try {
            // Bug 2 fix: send answersById (keyed by question ID) to server
            const res = await submitQuiz.mutateAsync({
                quizId: quizData.id,
                answers: result.answersById,
                timeSpent: result.timeUsedSecs,
            })
            // Use server-graded results — these have correct answers + explanations
            const serverGraded = res.data.data.result?.graded || []
            setGradedAnswers(serverGraded)
            setQuizId(res.data.data.result?.quizId || quizData.id)
        } catch {
            // If submit fails, set empty graded answers so results screen still renders
            setGradedAnswers([])
            setQuizId(quizData.id)
        }
        setScreen('results')
    }

    function handleNewQuiz() {
        setScreen('setup')
        setQuizData(null)
        setGradedAnswers([])
        setTimeUsed(0)
        setQuizId(null)
    }

    return (
        <AnimatePresence mode="wait">
            {screen === 'setup' && (
                <motion.div key="setup"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <SetupScreen onStart={handleStart} />
                </motion.div>
            )}
            {screen === 'active' && quizData && (
                <motion.div key="active"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ActiveQuizScreen quizData={quizData} onComplete={handleComplete} />
                </motion.div>
            )}
            {screen === 'results' && quizData && (
                <motion.div key="results"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ResultsScreen
                        quizData={quizData}
                        gradedAnswers={gradedAnswers}
                        timeUsed={timeUsed}
                        quizId={quizId}
                        onNewQuiz={handleNewQuiz}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}