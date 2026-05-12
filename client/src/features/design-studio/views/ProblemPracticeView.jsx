import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    useDesignSessions,
    useCreateDesignSession,
} from '@hooks/useDesignStudio'
import { STATUS_CONFIG, formatTime } from '../constants/phases'

// ══════════════════════════════════════════════════════════════════════════
// PROBLEM-LINKED PRACTICE VIEW
// ══════════════════════════════════════════════════════════════════════════
// Shown when the page is opened with ?problemId=xxx. Pulls the problem,
// lists up to 5 past attempts on it, and offers a one-click "start new
// session" that prefills title + designType from the problem.
export default function ProblemPracticeView({ problemId, onSelectSession, onStartSession, onBack }) {
    const { data: problem, isLoading: problemLoading, error: problemError } = useProblem(problemId)
    const { data: sessionsData, isLoading: sessionsLoading } = useDesignSessions({ problemId })
    const createSession = useCreateDesignSession()

    const pastSessions = (sessionsData?.sessions || []).slice(0, 5)
    const designType =
        problem?.category === 'LOW_LEVEL_DESIGN' ? 'LOW_LEVEL_DESIGN' : 'SYSTEM_DESIGN'
    const [difficulty, setDifficulty] = useState(null)
    // Initialize difficulty from the problem once loaded (default MEDIUM if missing).
    useEffect(() => {
        if (problem && !difficulty) setDifficulty(problem.difficulty || 'MEDIUM')
    }, [problem, difficulty])

    async function handleStart() {
        if (!problem) return
        try {
            const res = await createSession.mutateAsync({
                designType,
                title: problem.title,
                difficulty: difficulty || 'MEDIUM',
                problemId,
            })
            onStartSession(res.data.data.session.id)
        } catch { /* handled by hook */ }
    }

    if (problemLoading) {
        return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
    }
    if (problemError || !problem) {
        return (
            <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3">⚠️</div>
                <p className="text-sm font-semibold text-text-primary mb-1">Problem not found</p>
                <p className="text-xs text-text-tertiary mb-4">
                    This problem is not accessible or has been removed.
                </p>
                <Button variant="secondary" size="md" onClick={onBack}>Back to Design Studio</Button>
            </div>
        )
    }
    // Guard: page only makes sense for SD/LLD problems
    if (problem.category !== 'SYSTEM_DESIGN' && problem.category !== 'LOW_LEVEL_DESIGN') {
        return (
            <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3">🤔</div>
                <p className="text-sm font-semibold text-text-primary mb-1">Not a design problem</p>
                <p className="text-xs text-text-tertiary mb-4">
                    Design Studio is for System Design and Low-Level Design practice.
                    Open this problem via the Problems page instead.
                </p>
                <Button variant="secondary" size="md" onClick={onBack}>Back to Design Studio</Button>
            </div>
        )
    }

    const statusConfig = STATUS_CONFIG

    return (
        <div className="space-y-6">
            {/* Back link */}
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
                All sessions
            </button>

            {/* Problem header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl flex-shrink-0 mt-0.5">
                        {designType === 'SYSTEM_DESIGN' ? '🏗️' : '🔧'}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                {designType === 'SYSTEM_DESIGN' ? 'System Design' : 'Low-Level Design'}
                            </span>
                            <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border',
                                problem.difficulty === 'EASY' ? 'text-success-fg bg-success-soft border-success-line'
                                    : problem.difficulty === 'HARD' ? 'text-danger-fg bg-danger-soft border-danger-line'
                                        : 'text-warning-fg bg-warning-soft border-warning-line')}>
                                {problem.difficulty}
                            </span>
                        </div>
                        <h2 className="text-lg font-extrabold text-text-primary">{problem.title}</h2>
                        {problem.description && (
                            <p className="text-xs text-text-tertiary mt-2 leading-relaxed line-clamp-3">
                                {problem.description}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Past attempts */}
            {!sessionsLoading && pastSessions.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest">
                            Your attempts on this problem ({pastSessions.length}{sessionsData?.pagination?.total > 5 ? ` of ${sessionsData.pagination.total}` : ''})
                        </h3>
                    </div>
                    <div className="space-y-2">
                        {pastSessions.map((s, i) => {
                            const status = statusConfig[s.status] || statusConfig.IN_PROGRESS
                            return (
                                <motion.div
                                    key={s.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    onClick={() => onSelectSession(s.id)}
                                    className="bg-surface-1 border border-border-default rounded-xl p-3
                                               hover:border-brand-line transition-all cursor-pointer
                                               flex items-center justify-between gap-3"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border flex-shrink-0', status.color)}>
                                            {status.label}
                                        </span>
                                        <span className="text-[10px] text-text-disabled flex-shrink-0">
                                            {formatTime(s.totalTimeSpent)} spent
                                        </span>
                                        {s.evaluationScore && (
                                            <span className="text-xs font-bold text-brand-fg-soft flex-shrink-0">
                                                {s.evaluationScore}/10
                                            </span>
                                        )}
                                        <span className="text-[10px] text-text-disabled truncate">
                                            {new Date(s.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-disabled">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Start new session */}
            <div className="bg-brand-soft border border-brand-line rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">➕</span>
                    <h3 className="text-sm font-bold text-text-primary">Start a new practice session</h3>
                </div>
                <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
                    {pastSessions.length > 0
                        ? 'Try a fresh attempt. Each session is independent — rework the design from scratch with different trade-offs or at a different scale.'
                        : 'Walk through all phases with AI coaching, validate with scenarios, and get a scored evaluation.'}
                </p>
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">Difficulty:</span>
                    {['EASY', 'MEDIUM', 'HARD'].map(d => (
                        <button key={d} type="button" onClick={() => setDifficulty(d)}
                            className={cn('text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all',
                                difficulty === d
                                    ? d === 'EASY' ? 'bg-success-soft border-success-line text-success-fg'
                                        : d === 'MEDIUM' ? 'bg-warning-soft border-warning-line text-warning-fg'
                                            : 'bg-danger-soft border-danger-line text-danger-fg'
                                    : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong')}>
                            {d}
                        </button>
                    ))}
                </div>
                <Button variant="primary" size="md" fullWidth
                    loading={createSession.isPending}
                    onClick={handleStart}>
                    Start Practice Session →
                </Button>
            </div>
        </div>
    )
}
