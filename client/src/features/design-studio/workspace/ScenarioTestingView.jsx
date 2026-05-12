import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import {
    useSubmitScenarioResponse,
    useEvaluateScenario,
    useRequestEvaluation,
} from '@hooks/useDesignStudio'
import { toast } from '@store/useUIStore'

// ══════════════════════════════════════════════════════════════════════════
// CHUNK 2: SCENARIO TESTING UI
// ══════════════════════════════════════════════════════════════════════════
export default function ScenarioTestingView({ session, sessionId, onEvaluationReady, isReadOnly = false }) {
    const submitResponse = useSubmitScenarioResponse()
    const evaluateScenario = useEvaluateScenario()
    const requestEvaluation = useRequestEvaluation()
    const [responses, setResponses] = useState({})

    const scenarios = session.scenarios || []
    const evaluatedCount = scenarios.filter(s => s.status === 'evaluated').length
    // eslint-disable-next-line no-unused-vars
    const answeredCount = scenarios.filter(s => s.status === 'answered' || s.status === 'evaluated').length
    const allEvaluated = scenarios.length > 0 && evaluatedCount === scenarios.length

    const verdictConfig = {
        PASS: { label: 'PASS', color: 'text-success-fg bg-success-soft border-success-line', icon: '✅' },
        PARTIAL: { label: 'PARTIAL', color: 'text-warning-fg bg-warning-soft border-warning-line', icon: '⚠️' },
        FAIL: { label: 'FAIL', color: 'text-danger-fg bg-danger-soft border-danger-line', icon: '❌' },
    }

    async function handleSubmitResponse(scenarioId) {
        const response = responses[scenarioId]
        if (!response || response.trim().length < 10) {
            toast.error('Write at least 10 characters')
            return
        }
        try {
            await submitResponse.mutateAsync({ sessionId, scenarioId, response: response.trim() })
            toast.success('Response saved')
        } catch { /* handled */ }
    }

    async function handleEvaluate(scenarioId) {
        try {
            await evaluateScenario.mutateAsync({ sessionId, scenarioId })
        } catch { /* handled */ }
    }

    async function handleRequestFinalEval() {
        try {
            await requestEvaluation.mutateAsync(sessionId)
            onEvaluationReady?.()
        } catch { /* handled */ }
    }

    return (
        <div className="p-6 max-w-[800px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                        <span>🧪</span> Scenario Testing
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1">
                        AI generated {scenarios.length} scenarios based on YOUR design.
                        Trace through your architecture for each one.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-text-disabled">
                        {evaluatedCount}/{scenarios.length} evaluated
                    </span>
                    {allEvaluated && !isReadOnly && (
                        <Button variant="primary" size="sm" loading={requestEvaluation.isPending}
                            onClick={handleRequestFinalEval}>
                            Get Final Evaluation →
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                    animate={{ width: `${scenarios.length > 0 ? (evaluatedCount / scenarios.length) * 100 : 0}%` }}
                    transition={{ duration: 0.4 }}
                    className="h-full bg-brand-400 rounded-full"
                />
            </div>

            {/* Scenarios */}
            <div className="space-y-4">
                {scenarios.map((scenario, i) => {
                    const verdict = scenario.aiVerdict
                    const verdictInfo = verdict ? verdictConfig[verdict.verdict] || verdictConfig.PARTIAL : null
                    const isAnswered = scenario.status === 'answered' || scenario.status === 'evaluated'
                    const isEvaluated = scenario.status === 'evaluated'

                    return (
                        <motion.div
                            key={scenario.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className={cn(
                                'bg-surface-1 border rounded-2xl overflow-hidden',
                                isEvaluated
                                    ? verdict?.verdict === 'PASS' ? 'border-success-line' : verdict?.verdict === 'FAIL' ? 'border-danger-line' : 'border-warning-line'
                                    : 'border-border-default'
                            )}
                        >
                            {/* Scenario header */}
                            <div className="p-5">
                                <div className="flex items-start gap-3">
                                    <span className="text-lg flex-shrink-0 mt-0.5">
                                        {isEvaluated ? verdictInfo?.icon : '🎯'}
                                    </span>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                                Scenario {i + 1}
                                            </span>
                                            {scenario.category && (
                                                <span className="text-[10px] text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-2 py-px">
                                                    {scenario.category}
                                                </span>
                                            )}
                                            {scenario.difficulty && (
                                                <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border',
                                                    scenario.difficulty === 'easy' ? 'text-success-fg bg-success-soft border-success-line'
                                                        : scenario.difficulty === 'hard' ? 'text-danger-fg bg-danger-soft border-danger-line'
                                                            : 'text-warning-fg bg-warning-soft border-warning-line')}>
                                                    {scenario.difficulty}
                                                </span>
                                            )}
                                            {verdictInfo && (
                                                <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border', verdictInfo.color)}>
                                                    {verdictInfo.label}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-text-primary leading-relaxed">
                                            {scenario.scenario}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Response area */}
                            <div className="px-5 pb-5 space-y-3">
                                {!isEvaluated && !isReadOnly && (
                                    <>
                                        <textarea
                                            rows={4}
                                            value={responses[scenario.id] || scenario.userResponse || ''}
                                            onChange={e => setResponses(prev => ({ ...prev, [scenario.id]: e.target.value }))}
                                            disabled={isAnswered && !isEvaluated}
                                            placeholder="Trace through your architecture: which components handle this? What's the request path? What could fail?"
                                            className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary
                                                       placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed
                                                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 disabled:opacity-60"
                                        />
                                        <div className="flex items-center gap-2">
                                            {!isAnswered && (
                                                <Button size="sm" variant="secondary"
                                                    loading={submitResponse.isPending}
                                                    onClick={() => handleSubmitResponse(scenario.id)}>
                                                    Save Response
                                                </Button>
                                            )}
                                            {isAnswered && !isEvaluated && (
                                                <Button size="sm" variant="primary"
                                                    loading={evaluateScenario.isPending}
                                                    onClick={() => handleEvaluate(scenario.id)}>
                                                    🤖 Evaluate
                                                </Button>
                                            )}
                                        </div>
                                    </>
                                )}
                                {!isEvaluated && isReadOnly && scenario.userResponse && (
                                    <div className="bg-surface-2 border border-border-subtle rounded-xl p-3">
                                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">Your Response</p>
                                        <p className="text-xs text-text-secondary leading-relaxed">{scenario.userResponse}</p>
                                    </div>
                                )}

                                {/* Verdict display */}
                                {isEvaluated && verdict && (
                                    <div className={cn('rounded-xl p-4 space-y-3',
                                        verdict.verdict === 'PASS' ? 'bg-success-soft border border-success-line'
                                            : verdict.verdict === 'FAIL' ? 'bg-danger-soft border border-danger-line'
                                                : 'bg-warning-soft border border-warning-line')}>
                                        {/* User's response */}
                                        <div>
                                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">Your Response</p>
                                            <p className="text-xs text-text-secondary leading-relaxed">{scenario.userResponse}</p>
                                        </div>
                                        {/* AI explanation */}
                                        <div className="pt-3 border-t border-border-subtle">
                                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">AI Analysis</p>
                                            <p className="text-xs text-text-secondary leading-relaxed">{verdict.explanation}</p>
                                        </div>
                                        {/* Missed points */}
                                        {verdict.missedPoints?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-danger-fg uppercase tracking-widest mb-1">Missed</p>
                                                <ul className="space-y-1">
                                                    {verdict.missedPoints.map((point, j) => (
                                                        <li key={j} className="text-xs text-text-tertiary flex items-start gap-2">
                                                            <span className="text-danger-fg flex-shrink-0">•</span>{point}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {/* Suggestions */}
                                        {verdict.suggestions?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest mb-1">Suggestions</p>
                                                <ul className="space-y-1">
                                                    {verdict.suggestions.map((sug, j) => (
                                                        <li key={j} className="text-xs text-text-tertiary flex items-start gap-2">
                                                            <span className="text-brand-fg-soft flex-shrink-0">→</span>{sug}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}
