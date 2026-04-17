import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    useGenerateQuiz, useSubmitQuiz, useAnalyzeQuiz,
    useMyQuizAttempts
} from '@hooks/useQuiz'
import { useAIStatus } from '@hooks/useAI'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatRelativeDate } from '@utils/formatters'
import { QUIZ_SUGGESTED_SUBJECTS } from '@utils/constants'

// ══════════════════════════════════════════════════════
// SCREEN 1 — Setup
// ══════════════════════════════════════════════════════
function SetupScreen({ onStart }) {
    const [subject, setSubject] = useState('')
    const [difficulty, setDifficulty] = useState('MEDIUM')
    const [count, setCount] = useState(10)
    const [context, setContext] = useState('')

    const generateQuiz = useGenerateQuiz()
    const { data: aiStatus } = useAIStatus()
    const { data: attempts } = useMyQuizAttempts()

    // Recent subjects for quick re-take
    const recentSubjects = useMemo(() => {
        if (!attempts?.length) return []
        const seen = new Set()
        return attempts
            .filter(a => {
                if (seen.has(a.subject)) return false
                seen.add(a.subject)
                return true
            })
            .slice(0, 6)
            .map(a => ({
                subject: a.subject,
                bestScore: a.percentage,
                difficulty: a.difficulty,
            }))
    }, [attempts])

    async function handleGenerate() {
        if (!subject.trim()) return
        try {
            const res = await generateQuiz.mutateAsync({
                subject: subject.trim(),
                difficulty,
                count,
                context: context.trim() || undefined,
            })
            onStart({
                ...res.data.data,
                subject: subject.trim(),
                difficulty,
            })
        } catch {
            // error handled by hook
        }
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            {/* Header */}
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
                        <h1 className="text-2xl font-extrabold text-text-primary">
                            Quiz
                        </h1>
                        <p className="text-sm text-text-tertiary">
                            Test your knowledge on any subject — AI generates questions instantly
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* AI status warning */}
            {aiStatus && !aiStatus.enabled && (
                <div className="bg-warning/8 border border-warning/25 rounded-xl p-4 mb-6
                        flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <p className="text-sm text-text-secondary">
                        AI features are not enabled. Ask your admin to set
                        <code className="text-brand-300 bg-brand-400/10 px-1.5 rounded text-xs mx-1">
                            AI_ENABLED=true
                        </code>
                        in the server environment.
                    </p>
                </div>
            )}

            {/* Setup form */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-6"
            >
                {/* Subject input */}
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
                        onKeyDown={e => {
                            if (e.key === 'Enter' && subject.trim()) handleGenerate()
                        }}
                    />

                    {/* Suggested subjects */}
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
                        Number of questions
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

                {/* Optional context */}
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

                {/* Generate button */}
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
                        </>
                    )}
                </Button>
            </motion.div>

            {/* Recent subjects */}
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

            {/* Past attempts */}
            <QuizHistory />
        </div>
    )
}

// ── Quiz history ───────────────────────────────────────
function QuizHistory() {
    const { data: attempts, isLoading } = useMyQuizAttempts()

    if (isLoading || !attempts?.length) return null

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
                {attempts.slice(0, 8).map((a, i) => (
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
                            a.percentage >= 80 ? 'bg-success/12 text-success' :
                                a.percentage >= 60 ? 'bg-warning/12 text-warning' :
                                    'bg-danger/12 text-danger'
                        )}>
                            {a.percentage}%
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">
                                {a.subject}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <Badge
                                    variant={
                                        a.difficulty === 'EASY' ? 'easy' :
                                            a.difficulty === 'HARD' ? 'hard' : 'medium'
                                    }
                                    size="xs"
                                >
                                    {a.difficulty}
                                </Badge>
                                <span className="text-[11px] text-text-disabled">
                                    {a.score}/{a.total} · {formatRelativeDate(a.completedAt)}
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
    const [answers, setAnswers] = useState([])
    const [selected, setSelected] = useState(null)
    const [confirmed, setConfirmed] = useState(false)
    const [startTime] = useState(Date.now())

    const questions = quizData.questions || []
    const question = questions[currentQ]
    const total = questions.length
    const progress = ((currentQ + (confirmed ? 1 : 0)) / total) * 100

    function handleSelect(optionIndex) {
        if (confirmed) return
        setSelected(optionIndex)
    }

    function handleConfirm() {
        if (selected === null) return
        const isCorrect = selected === question.correctIndex
        setConfirmed(true)
        setAnswers(prev => [...prev, { selected, correct: isCorrect }])
    }

    function handleNext() {
        if (currentQ < total - 1) {
            setCurrentQ(prev => prev + 1)
            setSelected(null)
            setConfirmed(false)
        } else {
            // Quiz complete
            const timeUsed = Math.round((Date.now() - startTime) / 1000)
            onComplete({
                answers: [...answers],
                timeUsedSecs: timeUsed,
            })
        }
    }

    if (!question) return null

    const isLast = currentQ === total - 1

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            {/* Progress bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-text-tertiary">
                        Question {currentQ + 1} of {total}
                    </span>
                    <span className="text-xs font-bold text-text-primary">
                        {quizData.subject}
                    </span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full bg-brand-400 rounded-full"
                    />
                </div>
            </div>

            {/* Question card */}
            <motion.div
                key={currentQ}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6"
            >
                {/* Difficulty badge */}
                <div className="flex items-center gap-2 mb-4">
                    <Badge
                        variant={
                            question.difficulty === 'EASY' ? 'easy' :
                                question.difficulty === 'HARD' ? 'hard' : 'medium'
                        }
                        size="xs"
                    >
                        {question.difficulty}
                    </Badge>
                    <span className="text-[11px] text-text-disabled font-mono">
                        Q{currentQ + 1}
                    </span>
                </div>

                {/* Question text */}
                <h2 className="text-base font-bold text-text-primary leading-relaxed mb-6">
                    {question.question}
                </h2>

                {/* Options */}
                <div className="space-y-2.5">
                    {question.options.map((option, i) => {
                        const isSelected = selected === i
                        const isCorrect = i === question.correctIndex
                        const showResult = confirmed

                        let borderClass = 'border-border-default'
                        let bgClass = 'bg-surface-2'

                        if (showResult && isCorrect) {
                            borderClass = 'border-success/50'
                            bgClass = 'bg-success/8'
                        } else if (showResult && isSelected && !isCorrect) {
                            borderClass = 'border-danger/50'
                            bgClass = 'bg-danger/8'
                        } else if (isSelected && !showResult) {
                            borderClass = 'border-brand-400/50'
                            bgClass = 'bg-brand-400/8'
                        }

                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => handleSelect(i)}
                                disabled={confirmed}
                                className={cn(
                                    'w-full flex items-start gap-3 p-4 rounded-xl border',
                                    'text-left transition-all duration-150',
                                    bgClass, borderClass,
                                    !confirmed && 'hover:border-brand-400/40 hover:bg-brand-400/5 cursor-pointer',
                                    confirmed && 'cursor-default'
                                )}
                            >
                                {/* Option letter */}
                                <div className={cn(
                                    'w-7 h-7 rounded-lg flex items-center justify-center',
                                    'text-xs font-bold flex-shrink-0 border',
                                    showResult && isCorrect
                                        ? 'bg-success/20 border-success/40 text-success'
                                        : showResult && isSelected && !isCorrect
                                            ? 'bg-danger/20 border-danger/40 text-danger'
                                            : isSelected
                                                ? 'bg-brand-400/20 border-brand-400/40 text-brand-300'
                                                : 'bg-surface-3 border-border-default text-text-disabled'
                                )}>
                                    {String.fromCharCode(65 + i)}
                                </div>

                                {/* Option text */}
                                <span className={cn(
                                    'text-sm leading-relaxed pt-0.5',
                                    showResult && isCorrect
                                        ? 'text-success font-semibold'
                                        : showResult && isSelected && !isCorrect
                                            ? 'text-danger'
                                            : 'text-text-secondary'
                                )}>
                                    {option}
                                </span>

                                {/* Result icon */}
                                {showResult && isCorrect && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                        stroke="#22c55e" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        className="ml-auto flex-shrink-0 mt-1">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                                {showResult && isSelected && !isCorrect && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                        stroke="#ef4444" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        className="ml-auto flex-shrink-0 mt-1">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Explanation — shown after confirming */}
                <AnimatePresence>
                    {confirmed && question.explanation && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-5 p-4 bg-info/5 border border-info/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <span>💡</span>
                                    <span className="text-xs font-bold text-info uppercase tracking-widest">
                                        Explanation
                                    </span>
                                </div>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                    {question.explanation}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex items-center justify-between mt-6 pt-5
                        border-t border-border-default">
                    <span className="text-xs text-text-disabled">
                        {answers.filter(a => a.correct).length} / {currentQ + (confirmed ? 1 : 0)} correct
                    </span>

                    {!confirmed ? (
                        <Button
                            variant="primary"
                            size="md"
                            disabled={selected === null}
                            onClick={handleConfirm}
                        >
                            Confirm Answer
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={handleNext}
                        >
                            {isLast ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    See Results
                                </>
                            ) : (
                                <>
                                    Next Question
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                        <polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </>
                            )}
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
function ResultsScreen({ quizData, answers, timeUsed, attemptId, onNewQuiz }) {
    const navigate = useNavigate()
    const analyzeQuiz = useAnalyzeQuiz()
    const [analysis, setAnalysis] = useState(null)

    const questions = quizData.questions || []
    const score = answers.filter(a => a.correct).length
    const total = questions.length
    const pct = Math.round((score / total) * 100)

    const emoji =
        pct >= 90 ? '🏆' :
            pct >= 70 ? '🔥' :
                pct >= 50 ? '💪' :
                    pct >= 30 ? '📈' : '🌱'

    const label =
        pct >= 90 ? 'Outstanding!' :
            pct >= 70 ? 'Great job!' :
                pct >= 50 ? 'Good effort!' :
                    pct >= 30 ? 'Keep practicing!' : 'Room to grow!'

    async function handleAnalyze() {
        if (!attemptId) return
        try {
            const res = await analyzeQuiz.mutateAsync(attemptId)
            setAnalysis(res.data.data)
        } catch { }
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            {/* Score header */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center mb-8"
            >
                <div className="text-6xl mb-3">{emoji}</div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    {label}
                </h1>
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
                            label: 'Time', value: timeUsed ? `${Math.floor(timeUsed / 60)}m ${timeUsed % 60}s` : '—',
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

                {/* Progress bar */}
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

            {/* AI Analysis */}
            {attemptId && !analysis && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5 mb-6"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🤖</span>
                            <div>
                                <p className="text-sm font-bold text-text-primary">AI Analysis</p>
                                <p className="text-xs text-text-tertiary">
                                    Get personalized study advice based on your mistakes
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            loading={analyzeQuiz.isPending}
                            onClick={handleAnalyze}
                        >
                            {analyzeQuiz.isPending ? 'Analyzing...' : 'Analyze'}
                        </Button>
                    </div>
                </motion.div>
            )}

            {/* Analysis results */}
            {analysis && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-5 mb-6 space-y-4"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xl">🤖</span>
                        <h3 className="text-sm font-bold text-text-primary">AI Analysis</h3>
                    </div>

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
                        <div>
                            <p className="text-xs font-bold text-brand-300 uppercase tracking-widest mb-2">
                                Study Advice
                            </p>
                            <div className="space-y-1.5">
                                {analysis.studyAdvice.map((a, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                                        <span className="text-brand-400 flex-shrink-0 mt-0.5">→</span>
                                        <span>{a}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {analysis.encouragement && (
                        <p className="text-sm text-success font-medium italic">
                            {analysis.encouragement}
                        </p>
                    )}
                </motion.div>
            )}

            {/* Question review */}
            <div className="mb-6">
                <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <span>📋</span> Question Review
                </h2>
                <div className="space-y-2">
                    {questions.map((q, i) => {
                        const answer = answers[i]
                        const isCorrect = answer?.correct
                        return (
                            <details
                                key={i}
                                className={cn(
                                    'group rounded-xl border overflow-hidden',
                                    isCorrect
                                        ? 'border-success/20 bg-success/3'
                                        : 'border-danger/20 bg-danger/3'
                                )}
                            >
                                <summary className="flex items-center gap-3 p-3.5 cursor-pointer
                                    hover:bg-surface-3/30 transition-colors">
                                    <span className={cn(
                                        'w-6 h-6 rounded-full flex items-center justify-center',
                                        'text-xs font-bold flex-shrink-0',
                                        isCorrect
                                            ? 'bg-success/15 text-success'
                                            : 'bg-danger/15 text-danger'
                                    )}>
                                        {isCorrect ? '✓' : '✗'}
                                    </span>
                                    <span className="text-sm text-text-primary flex-1 truncate">
                                        {q.question}
                                    </span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round"
                                        className="text-text-disabled transition-transform
                                  group-open:rotate-90 flex-shrink-0">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </summary>
                                <div className="px-4 pb-4 pt-1 space-y-2">
                                    {q.options.map((opt, oi) => (
                                        <div key={oi} className={cn(
                                            'text-xs px-3 py-1.5 rounded-lg',
                                            oi === q.correctIndex
                                                ? 'bg-success/10 text-success font-semibold'
                                                : oi === answer?.selected && !isCorrect
                                                    ? 'bg-danger/10 text-danger line-through'
                                                    : 'text-text-tertiary'
                                        )}>
                                            {String.fromCharCode(65 + oi)}. {opt}
                                        </div>
                                    ))}
                                    {q.explanation && (
                                        <p className="text-xs text-text-tertiary leading-relaxed mt-2
                                  border-l-2 border-info/30 pl-3 italic">
                                            {q.explanation}
                                        </p>
                                    )}
                                </div>
                            </details>
                        )
                    })}
                </div>
            </div>

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
                <Button variant="ghost" size="md"
                    onClick={() => navigate('/')}>
                    Back to Dashboard
                </Button>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// ROOT — QuizPage
// ══════════════════════════════════════════════════════
export default function QuizPage() {
    const [screen, setScreen] = useState('setup')
    const [quizData, setQuizData] = useState(null)
    const [answers, setAnswers] = useState([])
    const [timeUsed, setTimeUsed] = useState(0)
    const [attemptId, setAttemptId] = useState(null)

    const submitQuiz = useSubmitQuiz()

    function handleStart(data) {
        setQuizData(data)
        setScreen('active')
    }

    async function handleComplete(result) {
        setAnswers(result.answers)
        setTimeUsed(result.timeUsedSecs)

        // Submit to server
        try {
            const res = await submitQuiz.mutateAsync({
                subject: quizData.subject,
                difficulty: quizData.difficulty,
                questions: quizData.questions,
                answers: result.answers,
                timeUsedSecs: result.timeUsedSecs,
            })
            setAttemptId(res.data.data.id)
        } catch { }

        setScreen('results')
    }

    function handleNewQuiz() {
        setScreen('setup')
        setQuizData(null)
        setAnswers([])
        setTimeUsed(0)
        setAttemptId(null)
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
                        answers={answers}
                        timeUsed={timeUsed}
                        attemptId={attemptId}
                        onNewQuiz={handleNewQuiz}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}