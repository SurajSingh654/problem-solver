// ============================================================================
// SolutionHistoryPage — chronological log of a solution's attempts + A/B diff
// ============================================================================
import { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts'
import { useSolutionAttempts } from '@hooks/useSolutionAttempts'
import { AttemptTimeline } from '@components/features/solutions/AttemptTimeline'
import { AttemptDiff } from '@components/features/solutions/AttemptDiff'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { PageSpinner } from '@components/ui/Spinner'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

export default function SolutionHistoryPage() {
    const { solutionId } = useParams()
    const navigate = useNavigate()
    const { data, isLoading } = useSolutionAttempts(solutionId)

    // Default picker: latest (A) vs previous (B). If only one attempt, B unset.
    const [selectedA, setSelectedA] = useState(null)
    const [selectedB, setSelectedB] = useState(null)

    useEffect(() => {
        if (!data?.attempts?.length) return
        const [latest, previous] = data.attempts  // newest-first from server
        setSelectedA(latest?.id ?? null)
        setSelectedB(previous?.id ?? null)
    }, [data?.attempts])

    const byId = useMemo(() => {
        const map = {}
        for (const a of data?.attempts ?? []) map[a.id] = a
        return map
    }, [data?.attempts])

    // Confidence trajectory — oldest → newest for the chart
    const chartData = useMemo(() => {
        if (!data?.attempts) return []
        return [...data.attempts]
            .sort((x, y) => x.attemptNumber - y.attemptNumber)
            .map(a => ({
                attempt: `#${a.attemptNumber}`,
                confidence: a.confidence,
                aiScore: a.aiFeedbackSnapshot?.overallScore ?? null,
            }))
    }, [data?.attempts])

    if (isLoading) return <PageSpinner />
    if (!data) return null

    const { solution, attempts, attemptCount } = data

    return (
        <div className="p-6 max-w-[1000px] mx-auto space-y-6">
            <button
                type="button"
                onClick={() => navigate(`/problems/${solution.problemId}`)}
                className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to problem
            </button>

            {/* Header */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'} size="xs">
                        {solution.problem?.difficulty}
                    </Badge>
                    <span className="text-[10px] font-bold text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-2 py-px">
                        {solution.problem?.category}
                    </span>
                    <span className="text-[10px] font-bold text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-2 py-px">
                        problem v{solution.problem?.version ?? 1}
                    </span>
                </div>
                <h1 className="text-xl font-extrabold text-text-primary mb-0.5">
                    {solution.problem?.title}
                </h1>
                <p className="text-xs text-text-tertiary">
                    {attemptCount} attempt{attemptCount === 1 ? '' : 's'} recorded
                </p>
            </div>

            {/* Confidence trajectory chart — only interesting with 2+ attempts */}
            {chartData.length >= 2 && (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
                        Confidence trajectory
                    </p>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 6, left: -12 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-subtle" />
                                <XAxis dataKey="attempt" fontSize={10} stroke="currentColor" className="text-text-tertiary" />
                                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} fontSize={10} stroke="currentColor" className="text-text-tertiary" />
                                <Tooltip
                                    contentStyle={{
                                        fontSize: '11px',
                                        background: 'rgb(var(--surface-2))',
                                        border: '1px solid rgb(var(--border-default))',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Line type="monotone" dataKey="confidence" stroke="#7c6ff7" strokeWidth={2} dot={{ r: 3 }} name="Confidence" />
                                {chartData.some(d => d.aiScore != null) && (
                                    <Line type="monotone" dataKey="aiScore" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="AI score (/10)" />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Timeline + Diff */}
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Attempts
                    </p>
                    <AttemptTimeline
                        attempts={attempts}
                        selectedAId={selectedA}
                        selectedBId={selectedB}
                        onSelectA={setSelectedA}
                        onSelectB={setSelectedB}
                    />
                </div>
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Diff
                    </p>
                    <AttemptDiff before={byId[selectedB]} after={byId[selectedA]} />
                </div>
            </div>

            <div className="flex justify-end">
                <Button
                    variant="secondary"
                    size="md"
                    onClick={() => navigate(`/problems/${solution.problemId}/solve`)}
                >
                    Edit latest attempt
                </Button>
            </div>
        </div>
    )
}
