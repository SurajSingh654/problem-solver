// ============================================================================
// RecallTrendChart — weekly recall-rate + avg-confidence over last 12 weeks
// ============================================================================
//
// Two lines on a single axis frame:
//   - Recall rate (0-100%) on the left Y-axis, indigo.
//   - Average confidence (1-5) on the right Y-axis, emerald.
//
// Rendered inside a responsive container so it fits the ReviewQueuePage card
// without a fixed width. Empty-state is rendered by the parent — this
// component assumes non-empty `data`.
// ============================================================================
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts'

function formatWeek(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function RecallTrendChart({ data }) {
    const chartData = data.map(d => ({
        week: formatWeek(d.weekStart),
        recallPct: Math.round(d.recallRate * 100),
        confidence: +d.avgConfidence.toFixed(2),
    }))

    return (
        <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
                    <XAxis
                        dataKey="week"
                        fontSize={10}
                        tick={{ fill: 'currentColor' }}
                        className="text-text-tertiary"
                    />
                    <YAxis
                        yAxisId="left"
                        domain={[0, 100]}
                        tickFormatter={v => `${v}%`}
                        fontSize={10}
                        tick={{ fill: 'currentColor' }}
                        className="text-text-tertiary"
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[1, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        fontSize={10}
                        tick={{ fill: 'currentColor' }}
                        className="text-text-tertiary"
                    />
                    <Tooltip
                        contentStyle={{
                            fontSize: '11px',
                            background: 'rgb(var(--surface-2))',
                            border: '1px solid rgb(var(--border-default))',
                            borderRadius: '8px',
                        }}
                        formatter={(v, name) =>
                            name === 'recallPct' ? [`${v}%`, 'Recall rate'] : [v, 'Avg confidence']
                        }
                    />
                    <Legend
                        wrapperStyle={{ fontSize: '11px' }}
                        formatter={v => (v === 'recallPct' ? 'Recall rate' : 'Avg confidence')}
                    />
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="recallPct"
                        stroke="#7c6ff7"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                    />
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="confidence"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
