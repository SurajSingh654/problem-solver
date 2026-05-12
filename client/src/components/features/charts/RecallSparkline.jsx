// ============================================================================
// RecallSparkline — compact recall-rate-only line for Dashboard mini-tile.
// No axes, no legend; just trajectory.
// ============================================================================
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

export function RecallSparkline({ data }) {
    const chartData = data.map(d => ({
        recallPct: Math.round(d.recallRate * 100),
    }))
    return (
        <div className="h-14">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 0, bottom: 2, left: 0 }}>
                    <Tooltip
                        contentStyle={{
                            fontSize: '10px',
                            background: 'rgb(var(--surface-2))',
                            border: '1px solid rgb(var(--border-default))',
                            borderRadius: '6px',
                            padding: '4px 6px',
                        }}
                        formatter={v => [`${v}%`, 'Recall']}
                        labelFormatter={() => ''}
                    />
                    <Line
                        type="monotone"
                        dataKey="recallPct"
                        stroke="#7c6ff7"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
